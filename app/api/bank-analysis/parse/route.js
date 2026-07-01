import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const HEADER_KEYS = {
  date: ['תאריך'],
  action: ['הפעולה', 'פעולה', 'תיאור פעולה'],
  details: ['פרטים', 'תיאור', 'פרטי פעולה'],
  ref: ['אסמכתא'],
  debit: ['חובה'],
  credit: ['זכות'],
  valueDate: ['תאריך ערך'],
  beneficiary: ['לטובת'],
  purpose: ['עבור'],
};

const CLIENT_RECEIPT_TERMS = [
  'זיכוי', 'הפקדה', 'העברה', 'מהמזרחי', 'מלאומי', 'מפועלים', 'מבצע:',
  'דמי טיפול', 'שכר טרחה', 'שכ"ט', 'שכט', 'תשלום עבור', 'לטובת תום הליך', 'חוזה'
];

const NON_CLIENT_CREDIT_TERMS = [
  'משהב"ט', 'משהב״ט', 'מ.משהבט', 'משהבט', 'תגמול', 'תגמולים',
  'מס ההכנסה', 'מס הכנסה', 'ביטוח לאומי', 'קצבה', 'החזר מס', 'ריבית', 'זיכוי כרטיס'
];

const NON_DEDUCTIBLE_DEBIT_TERMS = [
  'משכנתא', 'הלוואה', 'משיכת מזומן', 'העברה עצמית', 'לחשבון שלי',
  'פועלים-משכנתא', 'תשלום הלוואה', 'חסכון', 'פיקדון'
];

const DEDUCTIBLE_HINT_TERMS = [
  'ישראכרט', 'כרטיסי אשראי', 'הוראת-קבע', 'בזק', 'הוט', 'סלקום', 'פרטנר',
  'פלאפון', 'חשמל', 'מים', 'ארנונה', 'דלק', 'פנגו', 'כביש 6', 'חניון',
  'הראל', 'ביטוח', 'משרד המשפטים', 'טאבו', 'רשם', 'גז', 'מילגם', 'google',
  'openai', 'anthropic', 'vercel', 'github', 'microsoft'
];

function asText(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function toNum(v) {
  const s = asText(v).replace(/[₪,\s]/g, '').replace(/[()]/g, '').replace(/^-/g, '');
  if (!s || /^[-–—]+$/.test(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeExcelSerial(v) {
  const n = Number(asText(v));
  return Number.isFinite(n) && n > 25000 && n < 70000;
}

function excelSerialToDate(v) {
  const d = XLSX.SSF.parse_date_code(Number(v));
  if (!d) return asText(v);
  return `${String(d.d).padStart(2, '0')}.${String(d.m).padStart(2, '0')}.${d.y}`;
}

function normalizeDateCell(v) {
  if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}.${String(v.getMonth() + 1).padStart(2, '0')}.${v.getFullYear()}`;
  if (looksLikeExcelSerial(v)) return excelSerialToDate(v);
  return asText(v);
}

function includesAny(text, terms) {
  const t = asText(text).toLowerCase();
  return terms.some(x => t.includes(String(x).toLowerCase()));
}

function findHeaderIndex(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 50); i++) {
    const row = (matrix[i] || []).map(asText);
    const joined = row.join('|');
    if (joined.includes('תאריך') && joined.includes('חובה') && joined.includes('זכות')) return i;
  }
  return -1;
}

function mapColumns(headerRow) {
  const headers = headerRow.map(asText);
  const out = {};
  for (const [key, names] of Object.entries(HEADER_KEYS)) {
    out[key] = headers.findIndex(h => names.some(n => h === n || h.includes(n)));
  }
  return out;
}

function get(row, idx) {
  return idx >= 0 && idx < row.length ? row[idx] : '';
}

function cleanAmount(raw, oppositeRaw, oppositeAmount) {
  // בפועלים הערך 13 בעמודת חובה/זכות אינו סכום תנועה כאשר בצד השני יש סכום אמיתי.
  if (asText(raw) === '13' && oppositeAmount > 0) return 0;
  return toNum(raw);
}

function rowText(row, cols) {
  return [
    get(row, cols.action),
    get(row, cols.details),
    get(row, cols.beneficiary),
    get(row, cols.purpose),
    get(row, cols.ref),
  ].map(asText).filter(Boolean).join(' | ');
}

function isClientReceipt(txn) {
  if (!txn.credit || txn.debit) return false;
  const text = txn.text;
  if (includesAny(text, NON_CLIENT_CREDIT_TERMS)) return false;
  return includesAny(text, CLIENT_RECEIPT_TERMS);
}

function isDeductibleExpense(txn) {
  if (!txn.debit || txn.credit) return false;
  const text = txn.text;
  if (includesAny(text, NON_DEDUCTIBLE_DEBIT_TERMS)) return false;
  return includesAny(text, DEDUCTIBLE_HINT_TERMS) || txn.debit >= 1;
}

function buildAttention(txn, match, incomeTable) {
  const notes = [];
  if (txn.kind === 'client_receipt') {
    notes.push(incomeTable ? 'תקבול לקוח — לבדוק התאמה לחשבונית מס' : 'תקבול לקוח — מקור חשבוניות מס/הכנסות עדיין לא מחובר במלואו');
    if (/דמי טיפול|שכר טרחה|שכ"ט|שכט/i.test(txn.text)) notes.push('נראה כמו שכר טרחה');
  }
  if (txn.kind === 'deductible_expense') notes.push('חיוב הוצאה — לבדוק התאמה לחשבונית הוצאה מוכרת במס');
  if (!match) notes.push('לא נמצאה חשבונית תואמת במערכת');
  if (match && match.amountDiff > 1) notes.push(`פער סכום: ₪${match.amountDiff.toLocaleString('he-IL')}`);
  if (match && match.dateDiff > 7) notes.push(`פער תאריך: ${match.dateDiff} ימים`);
  if (match && match.score < 75) notes.push('התאמה אפשרית בלבד — לאשר ידנית');
  return notes;
}

function parseMatrix(matrix, bank) {
  const rows = (matrix || []).filter(r => Array.isArray(r) && r.some(c => asText(c)));
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return { rows: [], ignored_count: rows.length, parse_warning: 'לא נמצאה שורת כותרות עם תאריך/חובה/זכות' };

  const cols = mapColumns(rows[headerIndex]);
  const parsed = [];
  let ignored = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawDebit = get(row, cols.debit);
    const rawCredit = get(row, cols.credit);
    let debit = toNum(rawDebit);
    let credit = toNum(rawCredit);
    debit = cleanAmount(rawDebit, rawCredit, credit);
    credit = cleanAmount(rawCredit, rawDebit, debit);

    // עובדים רק לפי עמודות חובה/זכות מפורשות. אין ניחוש מתוך יתרה או מספרים אחרים בשורה.
    if (!debit && !credit) { ignored++; continue; }
    if (debit && credit) { ignored++; continue; }

    const text = rowText(row, cols);
    const txn = {
      id: `${bank}-${i}-${normalizeDateCell(get(row, cols.date))}-${text}`,
      bank,
      row_number: i + 1,
      date: normalizeDateCell(get(row, cols.date)),
      value_date: normalizeDateCell(get(row, cols.valueDate)),
      desc: text || '—',
      raw_text: row.map(asText).filter(Boolean).join(' | '),
      debit,
      credit,
      category: '',
      kind: '',
    };

    if (isClientReceipt(txn)) {
      txn.kind = 'client_receipt';
      txn.category = 'תקבול לקוח';
      parsed.push(txn);
    } else if (isDeductibleExpense(txn)) {
      txn.kind = 'deductible_expense';
      txn.category = 'הוצאה מוכרת במס לבדיקה';
      parsed.push(txn);
    } else {
      ignored++;
    }
  }

  return { rows: parsed, ignored_count: ignored, parse_warning: null };
}

async function fileToParsed(file, bank) {
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase();
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  if (['xls', 'xlsx'].includes(ext)) {
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    return parseMatrix(matrix, bank);
  }
  if (ext === 'pdf') {
    const mod = await import('pdf-parse');
    const pdf = mod.default || mod;
    const data = await pdf(buf);
    const lines = String(data.text || '').split(/\r?\n/).map(l => l.split(/\t|,|;/));
    return parseMatrix(lines, bank);
  }
  const lines = buf.toString('utf8').split(/\r?\n/).map(l => l.split(/\t|,|;/));
  return parseMatrix(lines, bank);
}

function normalizeDate(s) {
  const str = normalizeDateCell(s);
  let m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return new Date(Number(m[3].length === 2 ? '20' + m[3] : m[3]), Number(m[2]) - 1, Number(m[1]));
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  const da = normalizeDate(a);
  const db = normalizeDate(b);
  if (!da || !db) return 99999;
  return Math.abs(Math.round((da - db) / 86400000));
}

function textScore(a, b) {
  const aa = asText(a).toLowerCase();
  const bb = asText(b).toLowerCase();
  if (!aa || !bb) return 0;
  const words = aa.split(/\s+/).filter(w => w.length >= 3);
  return words.reduce((n, w) => n + (bb.includes(w) ? 1 : 0), 0);
}

function bestMatch(txn, invoices, kind) {
  const amount = kind === 'expense' ? txn.debit : txn.credit;
  if (!amount) return null;
  let best = null;
  for (const inv of invoices || []) {
    const invAmount = Math.abs(Number(inv.amount || inv.total || inv.total_amount || 0));
    if (!invAmount) continue;
    const amountDiff = Math.abs(invAmount - amount);
    const dateDiff = daysBetween(txn.date, inv.doc_date || inv.date || inv.invoice_date || inv.created_at);
    const vendorScore = textScore(txn.desc, [inv.vendor, inv.client_name, inv.customer_name, inv.description, inv.file_name, inv.notes].filter(Boolean).join(' '));
    let score = 0;
    if (amountDiff <= 1) score += 65;
    else if (amountDiff <= 5) score += 40;
    else if (amountDiff <= 20) score += 20;
    if (dateDiff <= 3) score += 20;
    else if (dateDiff <= 10) score += 10;
    score += Math.min(vendorScore * 5, 20);
    if (score >= 45 && (!best || score > best.score)) best = { score, amountDiff, dateDiff, invoice: inv };
  }
  return best;
}

async function fetchIncomeCandidates(sb, organizationId, year) {
  const tables = ['income_documents', 'income_invoices', 'invoices', 'revenues', 'finance_income'];
  for (const table of tables) {
    const { data, error } = await sb.from(table).select('*').eq('organization_id', organizationId).limit(1000);
    if (!error && Array.isArray(data)) return { table, data: data.filter(x => asText(x.doc_date || x.date || x.invoice_date || x.created_at).includes(String(year))) };
  }
  return { table: null, data: [] };
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  const bank = asText(form.get('bank') || 'generic');
  const year = Number(form.get('year')) || new Date().getFullYear();
  if (!file || typeof file.arrayBuffer !== 'function') return Response.json({ error: 'לא צורף קובץ' }, { status: 400 });

  const parsed = await fileToParsed(file, bank);
  const sb = createServiceClient();

  const { data: expenses } = await sb.from('expense_documents')
    .select('id,vendor,amount,doc_date,description,file_name,status,file_url,gmail_message_id')
    .eq('organization_id', profile.organization_id)
    .neq('status', 'removed')
    .limit(3000);

  const income = await fetchIncomeCandidates(sb, profile.organization_id, year);

  const analyzed = parsed.rows.map(txn => {
    const expenseMatch = txn.kind === 'deductible_expense' ? bestMatch(txn, expenses || [], 'expense') : null;
    const incomeMatch = txn.kind === 'client_receipt' ? bestMatch(txn, income.data || [], 'income') : null;
    const match = expenseMatch || incomeMatch;
    const attention_notes = buildAttention(txn, match, income.table);
    return {
      ...txn,
      match_type: expenseMatch ? 'expense' : incomeMatch ? 'income' : null,
      match_status: match ? (match.amountDiff <= 1 && match.dateDiff <= 7 && match.score >= 75 ? 'matched' : 'possible_gap') : 'missing_invoice',
      needs_attention: true,
      attention_notes,
      match,
    };
  });

  return Response.json({
    ok: true,
    bank,
    year,
    file_name: file.name,
    mode: 'client_receipts_and_deductible_expenses_only',
    rows: analyzed,
    ignored_count: parsed.ignored_count,
    parse_warning: parsed.parse_warning,
    expenses_count: (expenses || []).length,
    income_count: income.data.length,
    income_table: income.table,
    summary: {
      rows: analyzed.length,
      client_receipts: analyzed.filter(r => r.kind === 'client_receipt').length,
      deductible_expenses: analyzed.filter(r => r.kind === 'deductible_expense').length,
      matched: analyzed.filter(r => r.match_status === 'matched').length,
      possible_gap: analyzed.filter(r => r.match_status === 'possible_gap').length,
      missing_invoice: analyzed.filter(r => r.match_status === 'missing_invoice').length,
      ignored_count: parsed.ignored_count,
      debit_total: analyzed.reduce((s, r) => s + Number(r.debit || 0), 0),
      credit_total: analyzed.reduce((s, r) => s + Number(r.credit || 0), 0),
    }
  });
}
