import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * Maps Hebrew category labels → office_expenses.section values.
 * Matches the categories defined on the client (CategoryPicker).
 */
const CATEGORY_TO_SECTION = {
  'רכב':    'vehicle',
  'תקשורת': 'telecom',
  'תוכנה':  'software',
  'שכירות': 'rent',
  'ביטוח':  'insurance',
  'ספריות': 'software',   // libraries → software bucket
  'אחר':    'general',
};

/**
 * Parse a DD/MM/YYYY (or YYYY-MM-DD) date string into { month, year }.
 * Falls back to today if the string cannot be parsed.
 */
function parseDate(dateStr) {
  if (!dateStr) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }

  // DD/MM/YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmyMatch) {
    return { month: parseInt(dmyMatch[2], 10), year: parseInt(dmyMatch[3], 10) };
  }

  // YYYY-MM-DD
  const ymdMatch = dateStr.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (ymdMatch) {
    return { month: parseInt(ymdMatch[2], 10), year: parseInt(ymdMatch[1], 10) };
  }

  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/**
 * POST /api/bank-import
 *
 * Body: { transactions: Transaction[], bank: string }
 *
 * Transaction shape (only categorized rows are processed):
 *   { date, description, credit, debit, balance, category }
 *
 * For each categorized transaction we upsert a row in `office_expenses`.
 * The conflict key is (organization_id, section, item_name, year, month).
 * When a duplicate exists we ADD the new amount to preserve existing data
 * (safe for multi-import scenarios).
 *
 * Returns: { imported: number, skipped: number }
 */
export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) {
    return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { transactions, bank } = body;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return Response.json({ error: 'transactions array is required' }, { status: 400 });
  }

  const sb = createServiceClient();
  const orgId = profile.organization_id;

  let imported = 0;
  let skipped  = 0;

  for (const tx of transactions) {
    // Only process categorized transactions
    if (!tx.category) {
      skipped++;
      continue;
    }

    const section = CATEGORY_TO_SECTION[tx.category] || 'general';
    const { month, year } = parseDate(tx.date);

    // Use debit as the expense amount; ignore credit-only transactions
    const amount = Number(tx.debit) || 0;
    if (amount === 0) {
      // Credit-only rows are skipped — not an expense
      skipped++;
      continue;
    }

    const itemName = tx.description
      ? tx.description.substring(0, 120)   // cap at column max
      : tx.category;

    const notes = [
      `ייבוא דף בנק`,
      bank && bank !== 'generic' ? `בנק: ${bank}` : null,
      tx.date ? `תאריך: ${tx.date}` : null,
    ].filter(Boolean).join(' | ');

    // Upsert: if an identical row exists (same org/section/item/year/month)
    // we update the amount by summing — avoids silent data loss on re-import.
    const { data: existing } = await sb
      .from('office_expenses')
      .select('id, amount')
      .eq('organization_id', orgId)
      .eq('section', section)
      .eq('item_name', itemName)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (existing) {
      const newAmount = Number(existing.amount || 0) + amount;
      const { error: updateErr } = await sb
        .from('office_expenses')
        .update({ amount: newAmount, notes })
        .eq('id', existing.id);

      if (updateErr) {
        console.error('[bank-import] update error:', updateErr.message);
        skipped++;
        continue;
      }
    } else {
      const { error: insertErr } = await sb
        .from('office_expenses')
        .insert({
          organization_id: orgId,
          section,
          item_name: itemName,
          month,
          year,
          amount,
          notes,
          is_recurring: false,
        });

      if (insertErr) {
        console.error('[bank-import] insert error:', insertErr.message);
        skipped++;
        continue;
      }
    }

    imported++;
  }

  return Response.json({ imported, skipped });
}
