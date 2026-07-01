import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const RULES = [
  { cat: 'שכר טרחה / הכנסות', terms: ['שכר טרחה', 'דמי טיפול', 'עבור שירות', 'תשלום עבור', 'שכ"ט', 'שכט'] },
  { cat: 'אגרות ורשויות', terms: ['משרד המשפטים', 'טאבו', 'רשם', 'עיריית', 'ועדה', 'מנהל מקרקעי', 'רמי', 'רמ״י'] },
  { cat: 'תקשורת', terms: ['בזק', 'פרטנר', 'סלקום', 'פלאפון', 'הוט', 'אינטרנט'] },
  { cat: 'תוכנה ושירותים דיגיטליים', terms: ['google', 'openai', 'anthropic', 'microsoft', 'vercel', 'github', 'chatgpt', 'claude'] },
  { cat: 'רכב ודלק', terms: ['דלק', 'פז', 'סונול', 'טן', 'כביש 6', 'חניון', 'פנגו', 'מילגם'] },
  { cat: 'ביטוח', terms: ['ביטוח', 'הראל', 'מגדל', 'כלל', 'מנורה', 'איילון'] },
  { cat: 'שכר ומשכורות', terms: ['משכורת', 'שכר עובדים', 'ביטוח לאומי', 'מס הכנסה', 'ניכויים'] },
  { cat: 'העברות בנקאיות', terms: ['העברה', 'מסב', 'הפקדה', 'שיק', 'צק', 'המחאה'] },
  { cat: 'שכירות ונכסים', terms: ['שכירות', 'ארנונה', 'ועד בית', 'חשמל', 'מים'] },
];

function splitLine(line) {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === sep && !q) { out.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim().replace(/^"|"$/g, ''));
  return out;
}

function toNum(v) {
  let s = String(v ?? '').trim();
  if (!s || /^[-–—]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[₪,\s]/g, '').replace(/[()]/g, '').replace(/^-/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function looksLikeExcelSerial(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && n > 25000 && n < 70000;
}

function excelSerialToDate(v) {
  const d = XLSX.SSF.parse_date_code(Number(v));
  if (!d) return String(v || '');
  return `${String(d.d).padStart(2, '0')}.${String(d.m).padStart(2, '0')}.${d.y}`;
}

function normalizeCell(v) {
  if (v == null) return '';
  if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}.${String(v.getMonth() + 1).padStart(2, '0')}.${v.getFullYear()}`;
  if (looksLikeExcelSerial(v)) return excelSerialToDate(v);
  return String(v).trim();
}

function detectCols(headers) {
  const h = headers.map(x => String(x || '').trim().toLowerCase());
  const find = (...keys) => h.findIndex(c => keys.some(k => c.includes(k)));
  return {
    date: find('תאריך', 'date'),
    desc: find('תיאור', 'פרטים', 'אסמכתא', 'details', 'description', 'שם פעולה', 'פעולה'),
    notes: find('הער', 'עבור', 'מוטב', 'מבצע', 'פרטי', 'reference', 'note', 'memo'),
    debit: find('חובה', 'חיוב', 'debit', 'withdrawal'),
    credit: find('זכות', 'זיכוי', 'credit', 'deposit'),
    balance: find('יתרה', 'balance'),
    amount: find('סכום', 'amount'),
  };
}

function category(desc) {
  const low = String(desc || '').toLowerCase();
  for (const r of RULES) if (r.terms.some(t => low.includes(t.toLowerCase()))) return r.cat;
  return 'לא מסווג';
}

function findDate(cells, cols) {
  const explicit = cols.date >= 0 ? normalizeCell(cells[cols.date]) : '';
  if (explicit) return explicit;
  for (const c of cells) {
    const s = normalizeCell(c);
    if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s)) return s;
  }
  return '';
}

function rowToTxn(cells, headers, cols, bank, i) {
  const get = idx => idx >= 0 && idx < cells.length ? normalizeCell(cells[idx]) : '';
  const date = findDate(cells, cols);

  const textCells = cells
    .map((c, idx) => ({ idx, value: normalizeCell(c) }))
    .filter(x => x.value && /[א-תa-zA-Z]/.test(x.value))
    .filter(x => ![cols.date, cols.debit, cols.credit, cols.balance, cols.amount].includes(x.idx));

  const baseDesc = get(cols.desc);
  const notes = get(cols.notes);
  const desc = [...new Set([baseDesc, notes, ...textCells.map(x => x.value)].filter(Boolean))].join(' | ');

  let debit = Math.abs(toNum(get(cols.debit)));
  let credit = Math.abs(toNum(get(cols.credit)));
  let balance = toNum(get(cols.balance));

  if (!debit && !credit && cols.amount >= 0) {
    const amt = toNum(get(cols.amount));
    if (amt < 0) debit = Math.abs(amt); else credit = Math.abs(amt);
  }

  // פועלים: לעיתים אין כותרות ברורות והסכומים נמצאים בסוף השורה: חובה, זכות, יתרה.
  if (!debit && !credit) {
    const numeric = cells
      .map((c, idx) => ({ idx, value: Math.abs(toNum(c)), raw: String(c ?? '').trim() }))
      .filter(x => x.value > 0)
      .filter(x => !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(normalizeCell(x.raw)))
      .filter(x => !looksLikeExcelSerial(x.raw))
      .filter(x => x.value < 1000000); // מסנן אסמכתאות גדולות כמו 99020330

    if (numeric.length >= 2) {
      const lastThree = numeric.slice(-3);
      const possibleDebit = lastThree[0]?.value || 0;
      const possibleCredit = lastThree[1]?.value || 0;
      const possibleBalance = lastThree[2]?.value || 0;
      const isCreditText = /זיכוי|הפקדה|זכות|הכנסה|מזכה/i.test(desc);
      if (possibleCredit && isCreditText) credit = possibleCredit;
      else if (possibleDebit && !isCreditText) debit = possibleDebit;
      else if (possibleCredit) credit = possibleCredit;
      if (!balance && possibleBalance) balance = possibleBalance;
    } else if (numeric.length === 1) {
      const amt = numeric[0].value;
      if (/זיכוי|הפקדה|זכות|הכנסה|מזכה/i.test(desc)) credit = amt;
      else debit = amt;
    }
  }

  if (!date && !desc && !debit && !credit) return null;
  return {
    id: `${bank}-${i}-${date}-${desc}`,
    bank,
    date,
    desc: desc || '—',
    notes,
    raw_text: cells.map(normalizeCell).filter(Boolean).join(' | '),
    debit,
    credit,
    balance,
    category: category(desc),
  };
}

function findHeaderIndex(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const joined = (matrix[i] || []).map(normalizeCell).join(' ');
    if (/תאריך|חובה|זכות|יתרה|סכום|פרטים|תיאור|פעולה|מוטב|מבצע/i.test(joined)) return i;
  }
  return 0;
}

function parseMatrix(matrix, bank) {
  const rows = (matrix || []).filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim()));
  if (rows.length < 2) return [];
  const headerIndex = findHeaderIndex(rows);
  const headers = rows[headerIndex].map(normalizeCell);
  const cols = detectCols(headers);
  const txns = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const txn = rowToTxn(rows[i], headers, cols, bank, i);
    if (txn) txns.push(txn);
  }
  return txns;
}

function parseTextStatement(text, bank) {
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  return parseMatrix(lines.map(splitLine), bank);
}

function normalizeDate(s) {
  const str = normalizeCell(s);
  if (!str) return null;
  let m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = Number(m[3].length === 2 ? '20' + m[3] : m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
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
  const aa = String(a || '').toLowerCase();
  const bb = String(b || '').toLowerCase();
  if (!aa || !bb) return 0;
  const words = aa.split(/\s+/).filter(w => w.length >= 3);
  let hits = 0;
  for (const w of words) if (bb.includes(w)) hits++;
  return hits;
}

function bestMatch(row, invoices, kind) {
  const amount = kind === 'expense' ? row.debit : row.credit;
  if (!amount) return null;
  let best = null;
  for (const inv of invoices) {
    const invAmount = Math.abs(Number(inv.amount || inv.total || inv.total_amount || 0));
    if (!invAmount) continue;
    const amountDiff = Math.abs(invAmount - amount);
    const dateDiff = daysBetween(row.date, inv.doc_date || inv.date || inv.invoice_date || inv.created_at);
    const vendorScore = textScore([row.desc, row.notes, row.raw_text].filter(Boolean).join(' '), [inv.vendor, inv.client_name, inv.customer_name, inv.description, inv.file_name, inv.notes].filter(Boolean).join(' '));
    let score = 0;
    if (amountDiff <= 1) score += 60;
    else if (amountDiff <= 5) score += 35;
    else if (amountDiff <= 20) score += 15;
    if (dateDiff <= 3) score += 25;
    else if (dateDiff <= 10) score += 12;
    score += Math.min(vendorScore * 5, 20);
    if (score >= 45 && (!best || score > best.score)) best = { score, amountDiff, dateDiff, invoice: inv };
  }
  return best;
}

function attentionFor(row, match, incomeTable) {
  const notes = [];
  if (!row.debit && !row.credit) notes.push('לא זוהה סכום חובה/זכות');
  if (!row.date) notes.push('לא זוהה תאריך פעולה');
  if (row.category === 'לא מסווג') notes.push('סיווג לא ודאי');
  if (row.credit && !incomeTable) notes.push('זו כנראה הכנסה/זכות, אבל מקור חשבוניות הכנסה עדיין לא מחובר');
  if (/דמי טיפול|שכר טרחה|שכ"ט|שכט/i.test(row.desc) && row.credit) notes.push('נראה כמו שכר טרחה — לאשר ידנית מול חשבונית הכנסה');
  if (!match) notes.push('לא נמצאה חשבונית תואמת במערכת');
  if (match && match.amountDiff > 1) notes.push(`פער סכום בין הבנק לחשבונית: ₪${match.amountDiff.toLocaleString('he-IL')}`);
  if (match && match.dateDiff > 7) notes.push(`פער תאריכים גדול: ${match.dateDiff} ימים`);
  if (match && match.score < 70) notes.push('ההתאמה לחשבונית אפשרית אך לא ודאית');
  return notes;
}

async function fileToRows(file, bank) {
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
    return parseTextStatement(data.text || '', bank);
  }
  return parseTextStatement(buf.toString('utf8'), bank);
}

async function fetchIncomeCandidates(sb, organizationId, year) {
  const tables = ['income_documents', 'income_invoices', 'invoices', 'revenues', 'finance_income'];
  for (const table of tables) {
    const { data, error } = await sb.from(table).select('*').eq('organization_id', organizationId).limit(1000);
    if (!error && Array.isArray(data)) {
      return { table, data: data.filter(x => String(x.doc_date || x.date || x.invoice_date || x.created_at || '').includes(String(year))) };
    }
  }
  return { table: null, data: [] };
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('file');
  const bank = String(form.get('bank') || 'generic');
  const year = Number(form.get('year')) || new Date().getFullYear();
  if (!file || typeof file.arrayBuffer !== 'function') return Response.json({ error: 'לא צורף קובץ' }, { status: 400 });

  const rows = await fileToRows(file, bank);
  const sb = createServiceClient();
  const { data: expenses } = await sb.from('expense_documents')
    .select('id,vendor,amount,doc_date,description,file_name,status,file_url,gmail_message_id')
    .eq('organization_id', profile.organization_id)
    .neq('status', 'removed')
    .limit(2000);

  const income = await fetchIncomeCandidates(sb, profile.organization_id, year);

  const analyzed = rows.map(row => {
    const expenseMatch = row.debit ? bestMatch(row, expenses || [], 'expense') : null;
    const incomeMatch = row.credit ? bestMatch(row, income.data || [], 'income') : null;
    const match = expenseMatch || incomeMatch;
    const attention_notes = attentionFor(row, match, income.table);
    return {
      ...row,
      match_type: expenseMatch ? 'expense' : incomeMatch ? 'income' : null,
      match_status: match ? (match.amountDiff <= 1 && match.dateDiff <= 7 && match.score >= 70 ? 'matched' : 'possible_gap') : 'missing_invoice',
      needs_attention: attention_notes.length > 0,
      attention_notes,
      match,
    };
  });

  return Response.json({
    ok: true,
    bank,
    year,
    file_name: file.name,
    rows: analyzed,
    expenses_count: (expenses || []).length,
    income_count: income.data.length,
    income_table: income.table,
    summary: {
      rows: analyzed.length,
      matched: analyzed.filter(r => r.match_status === 'matched').length,
      possible_gap: analyzed.filter(r => r.match_status === 'possible_gap').length,
      missing_invoice: analyzed.filter(r => r.match_status === 'missing_invoice').length,
      needs_attention: analyzed.filter(r => r.needs_attention).length,
      debit_total: analyzed.reduce((s, r) => s + Number(r.debit || 0), 0),
      credit_total: analyzed.reduce((s, r) => s + Number(r.credit || 0), 0),
    }
  });
}
