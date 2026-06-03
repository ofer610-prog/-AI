import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// --- Hebrew bank CSV parsers ---
// All Israeli banks export slightly different CSV formats.
// We normalize everything to { date, description, reference, amount }
// where amount is positive for credits and negative for debits.

function normHeader(s) {
  return String(s ?? '').replace(/[‎‏"'`\s]/g, '').toLowerCase();
}

// Detect which column maps to which field
function detectColumns(headers) {
  const n = headers.map((h) => normHeader(h));
  const find = (...keywords) => {
    for (const kw of keywords) {
      const i = n.findIndex((h) => h.includes(kw));
      if (i !== -1) return headers[i];
    }
    return null;
  };
  return {
    date:        find('תאריך', 'date'),
    description: find('פרטים', 'תיאור', 'description', 'תנועה', 'אסמכתאנוספת'),
    reference:   find('אסמכתא', 'מסמך', 'reference', 'ref'),
    credit:      find('זכות', 'credit', 'הכנסה', 'קרדיט'),
    debit:       find('חובה', 'debit', 'הוצאה', 'דביט'),
    amount:      find('סכום', 'amount', 'תנועה'),
    balance:     find('יתרה', 'balance'),
  };
}

function parseAmount(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[₪,\s]/g, '').replace(/[^\d.\-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parseDate(v) {
  if (!v) return null;
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

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Find the header line (first line that has date-like or amount-like column names)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('תאריך') || lower.includes('date') || lower.includes('חובה') || lower.includes('זכות')) {
      headerIdx = i;
      break;
    }
  }

  const splitLine = (line) => {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if ((ch === ',' || ch === '\t') && !inQuote) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitLine(lines[headerIdx]);
  const mapping = detectColumns(headers);

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.every((c) => !c)) continue;

    const get = (col) => col ? cells[headers.indexOf(col)] : undefined;

    const dateStr = get(mapping.date);
    const date = parseDate(dateStr);
    if (!date) continue; // skip non-data rows

    const description = get(mapping.description) || '';
    const reference = get(mapping.reference) || '';

    let amount = null;
    if (mapping.credit || mapping.debit) {
      const credit = parseAmount(get(mapping.credit));
      const debit = parseAmount(get(mapping.debit));
      if (credit != null && credit !== 0) amount = Math.abs(credit);
      else if (debit != null && debit !== 0) amount = -Math.abs(debit);
      else amount = 0;
    } else if (mapping.amount) {
      amount = parseAmount(get(mapping.amount));
    }

    if (amount == null) continue;

    rows.push({ date, description, reference: reference || null, amount });
  }
  return rows;
}

export async function POST(request) {
  const sb = createServiceClient();

  const { data: org } = await sb
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'לא נמצא ארגון' }, { status: 404 });
  const orgId = org.id;

  let csvText;
  const ct = request.headers.get('content-type') || '';

  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ error: 'לא נבחר קובץ' }, { status: 400 });
    }
    const buf = await file.arrayBuffer();
    // Try UTF-8, then Windows-1255 (common in Israeli bank exports)
    csvText = new TextDecoder('utf-8').decode(buf);
    if (csvText.includes('�')) {
      csvText = new TextDecoder('windows-1255').decode(buf);
    }
  } else {
    const body = await request.json().catch(() => null);
    if (!body?.csv) return Response.json({ error: 'נדרש שדה csv' }, { status: 400 });
    csvText = body.csv;
  }

  const rows = parseCSV(csvText);
  if (!rows.length) {
    return Response.json({ error: 'לא נמצאו שורות תקינות בקובץ. ודא שזהו קובץ CSV של בנק ישראלי.' }, { status: 400 });
  }

  // Load existing (date + amount + description) to dedupe
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
      source: 'csv-import',
      alert_status: r.amount > 0 ? 'pending' : 'dismissed', // only credits need review
    }));

  let imported = 0;
  let errors = [];
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

  return Response.json({
    success: true,
    parsed: rows.length,
    imported,
    skipped: rows.length - imported,
    errors: errors.length ? errors : undefined,
  });
}
