import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, forbidden } from '@/lib/adminAuth';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// --- Hebrew bank statement parsers ---
// Israeli banks export עו"ש statements as CSV or Excel, each with a slightly
// different layout. We normalize everything to { date, description, reference, amount }
// where amount is positive for credits (זכות / income) and negative for debits (חובה).

function normHeader(s) {
  return String(s ?? '').replace(/[‎‏"'`\s]/g, '').toLowerCase();
}

// Detect which column maps to which field, given the raw header cells.
// Returns the *index* of each field (or -1).
function detectColumns(headers) {
  const n = headers.map((h) => normHeader(h));
  const find = (...keywords) => {
    for (const kw of keywords) {
      const i = n.findIndex((h) => h.includes(kw));
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    date:        find('תאריך', 'date'),
    description: find('פרטים', 'תיאור', 'description', 'תנועה', 'אסמכתאנוספת'),
    reference:   find('אסמכתא', 'מסמך', 'reference', 'ref'),
    credit:      find('זכות', 'credit', 'הכנסה', 'קרדיט'),
    debit:       find('חובה', 'debit', 'הוצאה', 'דביט'),
    amount:      find('סכום', 'amount'),
    balance:     find('יתרה', 'balance'),
  };
}

function parseAmount(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[₪,\s]/g, '').replace(/[^\d.\-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parseDate(v) {
  if (v == null || v === '') return null;
  // Excel serial date number
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  // DD/MM/YYYY or DD.MM.YYYY
  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const y = yyyy.length === 2 ? '20' + yyyy : yyyy;
    return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Map an array-of-arrays (rows of cells) into normalized transactions.
 * Works identically for CSV-split rows and XLSX sheet rows.
 */
function mapRows(allRows) {
  if (!allRows || allRows.length < 2) return [];

  // Find the header row: first row (within the first 15) that contains a
  // recognizable bank-column name.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, allRows.length); i++) {
    const joined = allRows[i].map((c) => normHeader(c)).join('|');
    if (/(תאריך|date)/.test(joined) && /(זכות|חובה|סכום|credit|debit|amount)/.test(joined)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const cols = detectColumns(allRows[headerIdx]);
  const get = (cells, idx) => (idx !== -1 && idx < cells.length ? cells[idx] : undefined);

  const rows = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cells = allRows[i];
    if (!cells || cells.every((c) => c == null || String(c).trim() === '')) continue;

    const date = parseDate(get(cells, cols.date));
    if (!date) continue; // skip totals / non-data rows

    const description = String(get(cells, cols.description) ?? '').trim();
    const reference = String(get(cells, cols.reference) ?? '').trim();

    let amount = null;
    if (cols.credit !== -1 || cols.debit !== -1) {
      const credit = parseAmount(get(cells, cols.credit));
      const debit = parseAmount(get(cells, cols.debit));
      if (credit != null && credit !== 0) amount = Math.abs(credit);
      else if (debit != null && debit !== 0) amount = -Math.abs(debit);
      else amount = 0;
    } else if (cols.amount !== -1) {
      amount = parseAmount(get(cells, cols.amount));
    }

    if (amount == null) continue;
    rows.push({ date, description, reference: reference || null, amount });
  }
  return rows;
}

// CSV text → array-of-arrays
function csvToRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const splitLine = (line) => {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if ((ch === ',' || ch === '\t' || ch === ';') && !inQuote) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  return lines.map(splitLine);
}

// XLSX/XLS buffer → array-of-arrays (first sheet)
function xlsxToRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return forbidden();

  const sb = createServiceClient();
  const orgId = profile.organization_id;
  if (!orgId) return Response.json({ error: 'לא נמצא ארגון' }, { status: 404 });

  let rows = [];
  const ct = request.headers.get('content-type') || '';

  try {
    if (ct.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file.arrayBuffer !== 'function') {
        return Response.json({ error: 'לא נבחר קובץ' }, { status: 400 });
      }
      const name = (file.name || '').toLowerCase();
      const buf = await file.arrayBuffer();

      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        rows = mapRows(xlsxToRows(Buffer.from(buf)));
      } else {
        // CSV/TXT — try UTF-8, fall back to Windows-1255 (common in IL bank exports)
        let csvText = new TextDecoder('utf-8').decode(buf);
        if (csvText.includes('�')) {
          csvText = new TextDecoder('windows-1255').decode(buf);
        }
        rows = mapRows(csvToRows(csvText));
      }
    } else {
      const body = await request.json().catch(() => null);
      if (body?.csv) rows = mapRows(csvToRows(body.csv));
      else return Response.json({ error: 'נדרש קובץ או שדה csv' }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: 'שגיאה בפענוח הקובץ: ' + e.message }, { status: 400 });
  }

  if (!rows.length) {
    return Response.json({
      error: 'לא נמצאו שורות תקינות. ודא שהקובץ הוא דף עו"ש (CSV או Excel) עם עמודות תאריך + זכות/חובה.',
    }, { status: 400 });
  }

  // Dedupe against existing (date + amount + description)
  const { data: existing } = await sb
    .from('bank_transactions')
    .select('date, amount, description')
    .eq('organization_id', orgId);
  const existingSet = new Set(
    (existing || []).map((r) => `${r.date}|${r.amount}|${r.description}`)
  );

  const toInsert = rows
    .filter((r) => !existingSet.has(`${r.date}|${r.amount}|${r.description}`))
    .map((r) => ({
      organization_id: orgId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      reference: r.reference,
      source: 'manual-import',
      alert_status: r.amount > 0 ? 'pending' : 'dismissed', // only credits (income) need invoice review
    }));

  let imported = 0;
  const errors = [];
  if (toInsert.length > 0) {
    const { error } = await sb.from('bank_transactions').insert(toInsert);
    if (error) {
      // alert_status column may not exist yet (migration pending)
      if (error.message?.includes('alert_status')) {
        const fallback = toInsert.map(({ alert_status, ...r }) => r);
        const { error: e2 } = await sb.from('bank_transactions').insert(fallback);
        if (e2) errors.push(e2.message);
        else imported = toInsert.length;
      } else {
        errors.push(error.message);
      }
    } else {
      imported = toInsert.length;
    }
  }

  const credits = rows.filter((r) => r.amount > 0).length;

  return Response.json({
    success: true,
    parsed: rows.length,
    credits,
    imported,
    skipped: rows.length - imported,
    errors: errors.length ? errors : undefined,
  });
}
