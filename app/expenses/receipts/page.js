'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const money = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

export default function ReceiptsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [q, setQ] = useState('');
  const [m, setM] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/office-expenses?year=${year}`);
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      setDocs(data.docs || []);
    } catch {}
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch('/api/expenses/scan-and-import-gmail', { method: 'POST' });
      const data = await res.json();
      setResult(data);
      await load();
    } catch { setResult({ error: 'שגיאת רשת' }); }
    setSyncing(false);
  };

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return docs.filter(d => {
      if (m !== 'all' && Number(d.expense_month_num) !== Number(m)) return false;
      if (!query) return true;
      return [d.vendor, d.file_name, d.description, d.expense_item].filter(Boolean).join(' ').toLowerCase().includes(query);
    }).sort((a, b) => String(b.doc_date || '').localeCompare(String(a.doc_date || '')));
  }, [docs, q, m]);

  const total = rows.reduce((s, d) => s + Number(d.amount || 0), 0);
  const linked = rows.filter(d => d.file_url).length;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-16">
      <header className="bg-slate-900 text-white sticky top-12 z-30">
        <div className="max-w-[1500px] mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link href="/expenses" className="text-slate-400 hover:text-white text-sm">← חזרה להוצאות</Link>
          <h1 className="text-xl font-bold">📎 קבלות וחשבוניות</h1>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm border-0">
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex-1" />
          <button onClick={sync} disabled={syncing} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm">
            {syncing ? '⏳ מסנכרן…' : '📧 סרוק וייבא'}
          </button>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-5 py-6 space-y-5">
        {result && (
          <div className={`rounded-2xl p-4 border ${result.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            {result.error ? result.error : `נסרקו ${result.scanned || 0}. יובאו ${result.imported?.length || 0}. דולגו ${result.skipped?.length || 0}.`}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card title="מסמכים" value={rows.length} />
          <Card title="סה״כ" value={`₪${money(total)}`} />
          <Card title="עם קישור" value={linked} />
        </div>

        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש ספק / נושא / הערה" className="border rounded-xl px-3 py-2 text-sm w-72" />
            <select value={m} onChange={e => setM(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל החודשים</option>
              {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </div>

          {loading ? <div className="py-12 text-center text-slate-400">טוען…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="text-right p-2 border-b">תאריך</th>
                    <th className="text-right p-2 border-b">ספק</th>
                    <th className="text-right p-2 border-b">נושא</th>
                    <th className="text-right p-2 border-b">חודש</th>
                    <th className="text-left p-2 border-b">סכום</th>
                    <th className="text-right p-2 border-b">קובץ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="p-2 border-b whitespace-nowrap">{d.doc_date || '—'}</td>
                      <td className="p-2 border-b font-medium">{d.vendor || '—'}</td>
                      <td className="p-2 border-b"><div>{d.expense_item || d.file_name || '—'}</div><div className="text-xs text-slate-400 truncate max-w-[520px]">{d.description || ''}</div></td>
                      <td className="p-2 border-b whitespace-nowrap">{MONTHS[(d.expense_month_num || 1) - 1] || '—'}</td>
                      <td className="p-2 border-b text-left font-semibold whitespace-nowrap">₪{money(d.amount)}</td>
                      <td className="p-2 border-b whitespace-nowrap">{d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">פתח</a> : <span className="text-red-500">חסר</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <div className="py-10 text-center text-slate-400">אין מסמכים להצגה.</div>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Card({ title, value }) {
  return <div className="rounded-2xl border bg-white border-slate-200 p-4"><div className="text-xs text-slate-500 mb-1">{title}</div><div className="text-2xl font-bold text-slate-800">{value}</div></div>;
}
