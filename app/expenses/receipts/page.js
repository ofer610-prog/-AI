'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const money = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

// Simple inline review modal
function ReviewModal({ item, expenseItems, onApprove, onReject, onClose }) {
  const [expenseItem, setExpenseItem] = useState(item.expense_item || '');
  const [vendor, setVendor] = useState(item.vendor || '');
  const [amount, setAmount] = useState(item.amount || '');
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    if (!expenseItem.trim()) return;
    setSaving(true);
    await onApprove(item.id, { expense_item: expenseItem.trim(), vendor: vendor.trim() || undefined, amount: amount || undefined });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-lg font-bold mb-1">סיווג חשבונית</h2>
        <p className="text-sm text-slate-500 mb-4 truncate">{item.subject || item.file_name}</p>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">שם הוצאה *</label>
            <input
              list="expense-items-list"
              value={expenseItem}
              onChange={e => setExpenseItem(e.target.value)}
              placeholder="לדוג׳ אחזקה, ביטוח, שכר דירה..."
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <datalist id="expense-items-list">
              {expenseItems.map(i => <option key={i} value={i} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">ספק</label>
              <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="שם הספק" className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">סכום (₪)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          {item.description && <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2 line-clamp-3">{item.description}</p>}
          {item.file_url && (
            <a href={item.file_url} target="_blank" rel="noreferrer" className="text-sky-600 text-xs hover:underline">📧 פתח מייל מקורי</a>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={handleApprove} disabled={!expenseItem.trim() || saving} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl py-2 text-sm font-semibold">
            {saving ? 'שומר…' : '✅ אשר וסווג'}
          </button>
          <button onClick={() => onReject(item.id)} className="bg-red-50 hover:bg-red-100 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold">
            🗑 דחה
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2 text-sm">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [docs, setDocs] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [q, setQ] = useState('');
  const [m, setM] = useState('all');
  const [reviewItem, setReviewItem] = useState(null);
  const [connectStatus, setConnectStatus] = useState(null); // 'ok' | 'error:...'

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('connected') === '1') {
      setConnectStatus('ok');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (p.get('gmail_error')) {
      setConnectStatus('error:' + p.get('gmail_error'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, revRes] = await Promise.all([
        fetch(`/api/office-expenses?year=${year}`),
        fetch('/api/expenses/review'),
      ]);
      if (expRes.status === 401) { window.location.href = '/login'; return; }
      const expData = await expRes.json();
      const revData = revRes.ok ? await revRes.json() : {};
      setDocs(expData.docs || []);
      setReviewItems(revData.items || []);
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

  const handleApprove = async (id, fields) => {
    await fetch('/api/expenses/review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'approve', ...fields }),
    });
    setReviewItem(null);
    await load();
  };

  const handleReject = async (id) => {
    await fetch('/api/expenses/review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'reject' }),
    });
    setReviewItem(null);
    await load();
  };

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return docs.filter(d => {
      if (m !== 'all' && Number(d.expense_month_num) !== Number(m)) return false;
      if (!query) return true;
      return [d.vendor, d.file_name, d.description, d.expense_item].filter(Boolean).join(' ').toLowerCase().includes(query);
    }).sort((a, b) => String(b.doc_date || '').localeCompare(String(a.doc_date || '')));
  }, [docs, q, m]);

  const expenseItems = [...new Set(docs.map(d => d.expense_item).filter(Boolean))];
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
          {reviewItems.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              ⚠️ {reviewItems.length} ממתינים לסיווג
            </span>
          )}
          <a href="/api/auth/google/connect?return_to=/expenses/receipts" className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl text-sm">
            🔐 חבר Google מחדש
          </a>
          <button onClick={sync} disabled={syncing} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm">
            {syncing ? '⏳ מסנכרן…' : '📧 סרוק וייבא'}
          </button>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-5 py-6 space-y-5">
        {connectStatus === 'ok' && (
          <div className="rounded-2xl p-4 border bg-emerald-50 border-emerald-200 text-emerald-800">
            ✅ Gmail חובר בהצלחה! עכשיו לחץ <b>סרוק וייבא</b> כדי לייבא חשבוניות.
          </div>
        )}
        {connectStatus?.startsWith('error:') && (
          <div className="rounded-2xl p-4 border bg-red-50 border-red-200 text-red-700">
            ❌ שגיאה בחיבור Gmail: {connectStatus.replace('error:', '')}
            <a href="/api/auth/google/connect?return_to=/expenses/receipts&retry=1" className="mr-3 underline font-semibold">נסה שוב</a>
          </div>
        )}

        {result && (
          <div className={`rounded-2xl p-4 border ${result.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            {result.error
              ? result.error
              : `נסרקו ${result.scanned || 0}. יובאו ${result.imported?.filter(i => !i.needs_review).length || 0}. ממתינים לסיווג: ${result.imported?.filter(i => i.needs_review).length || 0}. דולגו ${result.skipped?.length || 0}.`}
            {result.driveWarnings?.length ? <div className="mt-2 text-sm">חלק מהקבצים לא נשמרו בדרייב — כנראה שצריך לחבר Google מחדש.</div> : null}
          </div>
        )}

        {/* Review queue */}
        {reviewItems.length > 0 && (
          <section className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
            <h2 className="font-bold text-amber-900 mb-3">⚠️ {reviewItems.length} חשבוניות ממתינות לסיווג</h2>
            <div className="space-y-2">
              {reviewItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl border border-amber-100 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.vendor || item.description || 'לא ידוע'}</div>
                    <div className="text-xs text-slate-500 truncate">{item.description?.slice(0, 80)}</div>
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">{item.amount ? `₪${money(item.amount)}` : '—'}</div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">{item.doc_date || '—'}</div>
                  {item.file_url && <a href={item.file_url} target="_blank" rel="noreferrer" className="text-sky-500 text-xs hover:underline whitespace-nowrap">📧 מייל</a>}
                  <button onClick={() => setReviewItem(item)} className="bg-amber-500 hover:bg-amber-400 text-white rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap">
                    סווג
                  </button>
                </div>
              ))}
            </div>
          </section>
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

      {reviewItem && (
        <ReviewModal
          item={reviewItem}
          expenseItems={expenseItems}
          onApprove={handleApprove}
          onReject={handleReject}
          onClose={() => setReviewItem(null)}
        />
      )}
    </div>
  );
}

function Card({ title, value }) {
  return <div className="rounded-2xl border bg-white border-slate-200 p-4"><div className="text-xs text-slate-500 mb-1">{title}</div><div className="text-2xl font-bold text-slate-800">{value}</div></div>;
}
