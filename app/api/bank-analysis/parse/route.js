import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const RULES = [
  { cat: 'אגרות ורשויות', terms: ['משרד המשפטים', 'טאבו', 'רשם', 'עיריית', 'ועדה', 'מנהל מקרקעי', 'רמי', 'רמ״י'] },
  { cat: 'תקשורת', terms: ['בזק', 'פרטנר', 'סלקום', 'פלאפון', 'הוט', 'אינטרנט'] },
  { cat: 'תוכנה ושירותים דיגיטליים', terms: ['google', 'openai', 'anthropic', 'microsoft', 'vercel', 'github', 'chatgpt', 'claude'] },
  { cat: 'רכב ודלק', terms: ['דלק', 'פז', 'סונול', 'טן', 'כביש 6', 'חניון', 'פנגו', 'מילגם'] },
  { cat: 'ביטוח', terms: ['ביטוח', 'הראל', 'מגדל', 'כלל', 'מנורה', 'איילון'] },
  { cat: 'שכר ומשכורות', terms: ['משכורת', 'שכר', 'ביטוח לאומי', 'מס הכנסה', 'ניכויים'] },
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
  let s = String(v || '').trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[₪,\s]/g, '').replace(/[()]/g, '').replace(/^-/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function detectCols(headers) {
  const h = headers.map(x => String(x || '').trim().toLowerCase());
  const find = (...keys) => h.findIndex(c => keys.some(k => c.includes(k)));
  return {
    date: find('תאריך', 'date'),
    desc: find('תיאור', 'פרטים', 'אסמכתא', 'details', 'description', 'שם פעולה', 'פעולה'),
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

function parseTextStatement(text, bank) {
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const joined = splitLine(lines[i]).join(' ');
    if (/תאריך|חובה|זכות|יתרה|סכום|פרטים|תיאור|פעולה/i.test(joined)) { headerIndex = i; break; }
  }
  const headers = splitLine(lines[headerIndex]);
  const cols = detectCols(headers);
  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.length < 2) continue;
    const get = idx => idx >= 0 && idx < cells.length ? cells[idx] : '';
    const desc = get(cols.desc) || cells.find(c => /[א-תa-zA-Z]/.test(c)) || '';
    const date = get(cols.date) || '';
    let debit = Math.abs(toNum(get(cols.debit)));
    let credit = Math.abs(toNum(get(cols.credit)));
    if (!debit && !credit && cols.amount >= 0) {
      const amt = toNum(get(cols.amount));
      if (amt < 0) debit = Math.abs(amt); else credit = Math.abs(amt);
    }
    const balance = toNum(get(cols.balance));
    if (!date && !desc && !debit && !credit) continue;
    rows.push({ id: `${bank}-${i}-${date}-${desc}`, bank, date, desc, debit, credit, balance, category: category(desc) });
  }
  return rows;
}

function normalizeDate(s) {
  const str = String(s || '').trim();
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
    const vendorScore = textScore(row.desc, [inv.vendor, inv.client_name, inv.customer_name, inv.description, inv.file_name].filter(Boolean).join(' '));
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

async function fileToText(file) {
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase();
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  if (['xls', 'xlsx'].includes(ext)) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(ws);
  }
  if (ext === 'pdf') {
    const mod = await import('pdf-parse');
    const pdf = mod.default || mod;
    const data = await pdf(buf);
    return data.text || '';
  }
  return buf.toString('utf8');
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

  const text = await fileToText(file);
  const rows = parseTextStatement(text, bank);

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
    return {
      ...row,
      match_type: expenseMatch ? 'expense' : incomeMatch ? 'income' : null,
      match_status: match ? (match.amountDiff <= 1 && match.dateDiff <= 7 ? 'matched' : 'possible_gap') : 'missing_invoice',
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
      debit_total: analyzed.reduce((s, r) => s + Number(r.debit || 0), 0),
      credit_total: analyzed.reduce((s, r) => s + Number(r.credit || 0), 0),
    }
  });
}
