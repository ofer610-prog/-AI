import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Normalise a raw cell value to a JS Date string or null ──────────────────
function parseDate(raw) {
  if (!raw) return null;
  // Excel serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(raw).trim();
  // DD/MM/YYYY or DD/MM/YY
  const dmy = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Try native parse
  const dt = new Date(s);
  if (!isNaN(dt)) return dt.toISOString().slice(0,10);
  return null;
}

function parseAmount(raw) {
  if (!raw && raw !== 0) return null;
  if (typeof raw === 'number') return Math.abs(raw);
  const s = String(raw).replace(/[₪,\s]/g, '').replace('−','-').replace('–','-');
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.abs(n);
}

// ── Detect which column maps to what ─────────────────────────────────────────
function detectSchema(headers) {
  const h = headers.map(h => String(h || '').trim());
  const find = (...kws) => h.findIndex(x => kws.some(k => x.includes(k)));

  // Date
  const dateCol = find('תאריך','date','Date');
  // Vendor / description
  const vendorCol = find('שם בית עסק','תיאור פעולה','תיאור','ספק','Merchant','Vendor','Description','פירוט');
  // Amount — prefer "חובה" (debit) or "סכום חיוב"; fall back to generic "סכום"
  const debitCol  = find('חובה','סכום חיוב','חיוב','Debit','Amount');
  const creditCol = find('זכות','Credit');
  const amountCol = find('סכום','Amount','amount');

  return { dateCol, vendorCol, debitCol, creditCol, amountCol };
}

// ── Parse a sheet into normalised rows ───────────────────────────────────────
function parseSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rows.length < 2) return [];

  // Find the header row (first row with >= 2 non-empty cells)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i].filter(Boolean).length >= 2) { headerIdx = i; break; }
  }

  const headers = rows[headerIdx];
  const schema = detectSchema(headers);
  const result = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c)) continue; // skip blank rows

    let amount = null;
    if (schema.debitCol >= 0 && row[schema.debitCol]) {
      amount = parseAmount(row[schema.debitCol]);
    } else if (schema.amountCol >= 0 && row[schema.amountCol]) {
      amount = parseAmount(row[schema.amountCol]);
    }

    // Skip credit-only rows (זכות but no חובה)
    if (!amount || amount <= 0) continue;

    const date   = schema.dateCol >= 0 ? parseDate(row[schema.dateCol]) : null;
    const vendor = schema.vendorCol >= 0 ? String(row[schema.vendorCol] || '').trim() : '';

    // Skip clearly non-transaction rows
    if (!date && !vendor) continue;
    if (vendor.match(/^(סה"כ|סהכ|total|balance|יתרה)/i)) continue;

    result.push({
      charge_date: date || new Date().toISOString().slice(0, 10),
      amount,
      vendor: vendor || 'לא זוהה',
      raw_sms: `שורה ${i + 1}: ${row.filter(Boolean).join(' | ')}`.slice(0, 500),
    });
  }

  return result;
}

// ── Match a charge against existing expense docs ─────────────────────────────
async function matchDocs(sb, orgId, charge) {
  const d = new Date(charge.charge_date);
  const from = new Date(d); from.setDate(from.getDate() - 10);
  const to   = new Date(d); to.setDate(to.getDate() + 10);

  const { data } = await sb
    .from('expense_documents')
    .select('id, vendor, amount, doc_date, file_url')
    .eq('organization_id', orgId)
    .gte('doc_date', from.toISOString().slice(0, 10))
    .lte('doc_date', to.toISOString().slice(0, 10))
    .gte('amount', charge.amount * 0.93)
    .lte('amount', charge.amount * 1.07);

  return data || [];
}

// ── Deduplicate: skip if already in credit_charges within ±3 days / ±3% ─────
async function isDuplicate(sb, orgId, charge) {
  const d = new Date(charge.charge_date);
  const from = new Date(d); from.setDate(from.getDate() - 3);
  const to   = new Date(d); to.setDate(to.getDate() + 3);

  const { data } = await sb
    .from('credit_charges')
    .select('id')
    .eq('organization_id', orgId)
    .gte('charge_date', from.toISOString().slice(0, 10))
    .lte('charge_date', to.toISOString().slice(0, 10))
    .gte('amount', charge.amount * 0.97)
    .lte('amount', charge.amount * 1.03)
    .ilike('vendor', `%${charge.vendor.slice(0, 10)}%`)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!file) return Response.json({ error: 'קובץ לא נמצא' }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    return Response.json({ error: 'לא ניתן לקרוא את הקובץ. אנא השתמש ב-CSV או Excel' }, { status: 422 });
  }

  // Parse all sheets, merge
  const allRows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    allRows.push(...parseSheet(sheet));
  }

  if (!allRows.length) {
    return Response.json({
      error: 'לא נמצאו עסקאות בקובץ. ודא שהקובץ מכיל עמודות תאריך, שם בית עסק וסכום חיוב',
    }, { status: 422 });
  }

  const sb = createServiceClient();
  const orgId = profile.organization_id;

  const results = [];
  let importedCount = 0;
  let duplicateCount = 0;

  for (const charge of allRows) {
    const dup = await isDuplicate(sb, orgId, charge);
    if (dup) { duplicateCount++; results.push({ ...charge, status: 'duplicate', matched: false }); continue; }

    const docs = await matchDocs(sb, orgId, charge);
    const alertStatus = docs.length ? 'matched' : 'pending';

    await sb.from('credit_charges').insert({
      organization_id: orgId,
      charge_date:     charge.charge_date,
      amount:          charge.amount,
      vendor:          charge.vendor,
      raw_sms:         charge.raw_sms,
      matched_doc_id:  docs[0]?.id || null,
      alert_status:    alertStatus,
    });

    importedCount++;
    results.push({ ...charge, status: alertStatus, matched: docs.length > 0, matching_docs: docs });
  }

  const missing  = results.filter(r => r.status === 'pending');
  const matched  = results.filter(r => r.status === 'matched');

  return Response.json({
    ok: true,
    total:      allRows.length,
    imported:   importedCount,
    duplicates: duplicateCount,
    missing:    missing.length,
    matched:    matched.length,
    rows:       results,
  });
}
