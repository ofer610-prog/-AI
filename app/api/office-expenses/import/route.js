import * as XLSX from 'xlsx';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/office-expenses/import — import the firm's expense-tracking Excel.
 *
 * Expected layout (one sheet):
 *   Row: [item name, Jan, Feb, ..., Dec, year total, (note columns)]
 *   Section header rows ("עלויות משרדיות" / "עופר") switch the section.
 *   Subtotal rows (סכום ביניים / סהכ...) are skipped.
 *
 * multipart/form-data: file=<xlsx>, year=<2026>
 */

const SECTION_MARKERS = { 'עלויות משרדיות': 'office', 'עופר': 'personal' };
const SKIP_PREFIXES = ['סכום ביניים', 'סהכ', 'סה"כ', 'הוצאות בפועל'];

// Items that are known AI/digital tools → go in 'ai' section
const AI_ITEM_KEYWORDS = ['claude', 'chatgpt', 'gpt', 'openai', 'midjourney', 'בינה', 'ai', 'copilot', 'gemini', 'anthropic'];

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const orgId = profile.organization_id;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!file) return Response.json({ error: 'file required' }, { status: 400 });
  const year = Number(formData.get('year')) || new Date().getFullYear();

  let wb;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    wb = XLSX.read(buf, { type: 'buffer' });
  } catch {
    return Response.json({ error: 'קובץ אקסל לא תקין' }, { status: 400 });
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let section = 'office';
  let imported = 0;
  let skipped = 0;
  const upserts = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const name = String(row[0]).trim();
    if (!name) continue;

    // Section switch rows
    const marker = Object.keys(SECTION_MARKERS).find((m) => name === m || name.startsWith(m));
    if (marker && row.slice(1, 13).every((c) => c == null || c === '' || typeof c === 'string')) {
      section = SECTION_MARKERS[marker];
      continue;
    }
    if (SKIP_PREFIXES.some((p) => name.startsWith(p))) { skipped++; continue; }

    // Note: some rows carry a text note in the month columns (e.g. "בצדמבר") — only numbers count
    const noteCells = row.slice(14).filter((c) => typeof c === 'string' && c.trim());
    const textInMonths = row.slice(1, 13).filter((c) => typeof c === 'string' && c.trim());
    const notes = [...textInMonths, ...noteCells].join(' | ') || null;

    // Detect AI tools → assign to 'ai' section
    const nameLow = name.toLowerCase();
    const itemSection = AI_ITEM_KEYWORDS.some(k => nameLow.includes(k)) ? 'ai' : section;

    // Count months with amounts to detect recurring
    const monthAmounts = [];
    for (let m = 1; m <= 12; m++) {
      const v = row[m];
      if (typeof v === 'number' && !isNaN(v) && v !== 0) monthAmounts.push({ m, v });
    }
    const isRecurring = monthAmounts.length >= 3; // 3+ months = recurring

    let hadAmount = false;
    for (const { m, v } of monthAmounts) {
      hadAmount = true;
      upserts.push({
        organization_id: orgId, section: itemSection, item_name: name,
        year, month: m, amount: v, notes, sort_order: i, is_recurring: isRecurring,
      });
    }
    // Keep the item visible even if no amounts yet (placeholder row in month 1, amount 0)
    if (!hadAmount) {
      upserts.push({
        organization_id: orgId, section: itemSection, item_name: name,
        year, month: 1, amount: 0, notes, sort_order: i, is_recurring: false,
      });
    }
    imported++;
  }

  // Batch upsert
  for (let i = 0; i < upserts.length; i += 100) {
    const { error } = await service.from('office_expenses')
      .upsert(upserts.slice(i, i + 100), { onConflict: 'organization_id,section,item_name,year,month' });
    if (error) return Response.json({ error: error.message, imported: 0 }, { status: 500 });
  }

  return Response.json({ ok: true, items: imported, cells: upserts.length, skipped, year });
}
