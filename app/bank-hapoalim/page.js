'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const money = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

const RULES = [
  { cat: 'אגרות ורשויות', terms: ['משרד המשפטים', 'טאבו', 'רשם', 'עיריית', 'ועדה', 'מנהל מקרקעי', 'רמי'] },
  { cat: 'תקשורת', terms: ['בזק', 'פרטנר', 'סלקום', 'פלאפון', 'הוט', 'אינטרנט'] },
  { cat: 'תוכנה ושירותים דיגיטליים', terms: ['google', 'openai', 'anthropic', 'microsoft', 'vercel', 'github', 'cloud'] },
  { cat: 'רכב ודלק', terms: ['דלק', 'פז', 'סונול', 'טן', 'כביש 6', 'חניון', 'פנגו'] },
  { cat: 'ביטוח', terms: ['ביטוח', 'הראל', 'מגדל', 'כלל', 'מנורה', 'איילון'] },
  { cat: 'שכר ומשכורות', terms: ['משכורת', 'שכר', 'ביטוח לאומי', 'מס הכנסה', 'ניכויים'] },
  { cat: 'העברות בנקאיות', terms: ['העברה', 'מסב', 'הפקדה', 'שיק', 'צק'] },
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
  const s = String(v || '').replace(/[₪,\s]/g, '').replace(/[()]/g, '-');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function detectCols(headers) {
  const h = headers.map(x => String(x || '').trim().toLowerCase());
  const find = (...keys) => h.findIndex(c => keys.some(k => c.includes(k)));
  return {
    date: find('תאריך', 'date'),
    desc: find('תיאור', 'פרטים', 'אסמכתא', 'details', 'description'),
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

function parseBankText(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const joined = splitLine(lines[i]).join(' ');
    if (/תאריך|חובה|זכות|יתרה|סכום|פרטים|תיאור/i.test(joined)) { headerIndex = i; break; }
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
    let debit = toNum(get(cols.debit));
    let credit = toNum(get(cols.credit));
    if (!debit && !credit && cols.amount >= 0) {
      const amt = toNum(get(cols.amount));
      if (amt < 0) debit = Math.abs(amt); else credit = amt;
    }
    const balance = toNum(get(cols.balance));
    if (!date && !desc && !debit && !credit) continue;
    rows.push({ id: `${i}-${date}-${desc}`, date, desc, debit, credit, balance, category: category(desc) });
  }
  return rows;
}

function exportCsv(rows) {
  const lines = ['תאריך,תיאור,חובה,זכות,יתרה,סיווג'];
  rows.forEach(r => lines.push([r.date, `"${String(r.desc).replace(/"/g, '""')}"`, r.debit || '', r.credit || '', r.balance || '', r.category].join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ניתוח-עוש-פועלים.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function HapoalimBankPage() {
  const fileRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(() => ({
    debit: rows.reduce((s, r) => s + Number(r.debit || 0), 0),
    credit: rows.reduce((s, r) => s + Number(r.credit || 0), 0),
    uncategorized: rows.filter(r => r.category === 'לא מסווג').length,
  }), [rows]);

  const byCat = useMemo(() => {
    const m = new Map();
    rows.forEach(r => {
      const cur = m.get(r.category) || { debit: 0, credit: 0, count: 0 };
      cur.debit += Number(r.debit || 0); cur.credit += Number(r.credit || 0); cur.count += 1;
      m.set(r.category, cur);
    });
    return [...m.entries()].sort((a, b) => b[1].debit - a[1].debit);
  }, [rows]);

  const onFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseBankText(ev.target.result);
        if (!parsed.length) setError('לא נמצאו תנועות. מומלץ לייצא מפועלים כ־CSV או TXT ולנסות שוב.');
        setRows(parsed);
      } catch (err) {
        setError('שגיאה בקריאת הקובץ: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-slate-900">🏦 ניתוח עו״ש פועלים</h1>
            <p className="text-sm text-slate-500 mt-1">העלה קובץ תנועות מחשבון פועלים. המערכת תחשב חובה/זכות ותציע סיווג ראשוני.</p>
          </div>
          <Link href="/bank-import" className="text-sm px-3 py-2 rounded-xl bg-white border hover:bg-slate-50">ניתוח עו״ש כללי</Link>
        </div>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="text-sm font-bold text-slate-700 mb-1">קובץ פועלים</div>
              <button onClick={() => fileRef.current?.click()} className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                {fileName || 'בחר קובץ CSV / TXT'}
              </button>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
            </div>
            <div className="text-xs text-slate-500 max-w-xl">
              באתר פועלים יש לייצא תנועות עו״ש לתקופה הרצויה בפורמט CSV/TXT. אם הקובץ נפתח באקסל, שמור אותו כ־CSV UTF-8 ואז העלה לכאן.
            </div>
            {rows.length > 0 && <button onClick={() => exportCsv(rows)} className="mr-auto px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-bold">ייצוא ניתוח CSV</button>}
          </div>
          {error && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>}
        </section>

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">תנועות</div><div className="text-2xl font-black">{rows.length}</div></div>
              <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">סה״כ חובה</div><div className="text-2xl font-black text-red-600">₪{money(totals.debit)}</div></div>
              <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">סה״כ זכות</div><div className="text-2xl font-black text-emerald-600">₪{money(totals.credit)}</div></div>
              <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">לא מסווג</div><div className="text-2xl font-black text-amber-600">{totals.uncategorized}</div></div>
            </div>

            <section className="bg-white border rounded-2xl p-4">
              <h2 className="font-black text-slate-800 mb-3">סיכום לפי סיווג</h2>
              <div className="grid md:grid-cols-2 gap-2">
                {byCat.map(([cat, v]) => <div key={cat} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold">{cat} · {v.count}</span><span>חובה ₪{money(v.debit)} · זכות ₪{money(v.credit)}</span></div>)}
              </div>
            </section>

            <section className="bg-white border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600"><tr><th className="text-right p-3">תאריך</th><th className="text-right p-3">תיאור</th><th className="text-left p-3">חובה</th><th className="text-left p-3">זכות</th><th className="text-left p-3">יתרה</th><th className="text-right p-3">סיווג</th></tr></thead>
                  <tbody>{rows.map(r => <tr key={r.id} className="border-t hover:bg-slate-50"><td className="p-3 whitespace-nowrap">{r.date || '—'}</td><td className="p-3 max-w-xl">{r.desc}</td><td className="p-3 text-left text-red-600 font-bold">{r.debit ? '₪' + money(r.debit) : '—'}</td><td className="p-3 text-left text-emerald-600 font-bold">{r.credit ? '₪' + money(r.credit) : '—'}</td><td className="p-3 text-left text-slate-500">{r.balance ? '₪' + money(r.balance) : '—'}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${r.category === 'לא מסווג' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{r.category}</span></td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
