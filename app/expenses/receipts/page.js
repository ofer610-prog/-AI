'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const money = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

function driveFileId(url) {
  const s = String(url || '');
  let m = s.match(/\/file\/d\/([^/]+)/);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]id=([^&]+)/);
  return m?.[1] || null;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4">
      <div dir="rtl" className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-5">
        <div className="flex items-center mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="mr-auto text-slate-500 hover:text-black text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Fetches the file as a blob and shows it inline — avoids browser download-instead-of-preview
function InlinePreview({ docId }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const prevUrl = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBlobUrl(null);
    setError(null);

    fetch(`/api/expense-docs/preview?id=${encodeURIComponent(docId)}`)
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `שגיאה ${res.status}`);
        }
        return res.blob();
      })
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        prevUrl.current = url;
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(e => {
        if (!cancelled) { setError(e.message); setLoading(false); }
      });

    return () => {
      cancelled = true;
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    };
  }, [docId]);

  if (loading) return <div className="h-[60vh] flex items-center justify-center text-slate-400">טוען קובץ…</div>;
  if (error) return <div className="h-40 flex items-center justify-center text-red-600">⚠️ {error}</div>;
  return <iframe src={blobUrl} className="w-full h-[70vh] border rounded-xl bg-white" title="צפייה מהירה" />;
}

export default function ReceiptsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [docs, setDocs] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [q, setQ] = useState('');
  const [m, setM] = useState('all');
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState(null);
  const [connectStatus, setConnectStatus] = useState(null);

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
      const res = await fetch(`/api/office-expenses?year=${year}`);
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      setDocs(data.docs || []);
      setEntries(data.entries || []);
    } catch {}
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true); setResult(null);
    try {
      const res = await fetch('/api/expenses/scan-and-import-gmail', { method: 'POST' });
      const data = await res.json();
      setResult(data); await load();
    } catch { setResult({ error: 'שגיאת רשת' }); }
    setSyncing(false);
  };

  const topics = useMemo(() => [...new Set(entries.map(e => e.item_name).filter(Boolean))].sort(), [entries]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return docs.filter(d => {
      if (m !== 'all' && Number(d.expense_month_num) !== Number(m)) return false;
      if (!query) return true;
      return [d.vendor, d.file_name, d.description, d.expense_item, d.status].filter(Boolean).join(' ').toLowerCase().includes(query);
    }).sort((a, b) =>
      a.status === 'needs_review' ? -1 : b.status === 'needs_review' ? 1
        : String(b.doc_date || '').localeCompare(String(a.doc_date || ''))
    );
  }, [docs, q, m]);

  const pending = rows.filter(d => d.status === 'needs_review').length;
  const total = rows.filter(d => d.status !== 'needs_review').reduce((s, d) => s + Number(d.amount || 0), 0);
  const linked = rows.filter(d => d.file_url).length;

  const rejectDoc = async (doc) => {
    if (!confirm('להסיר את החשבונית מהרשימה?')) return;
    await fetch('/api/expenses/review-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: doc.id, action: 'reject' }),
    });
    await load();
  };

  const approveDoc = async () => {
    if (!edit?.expense_item) { alert('יש לבחור תת נושא'); return; }
    await fetch('/api/expenses/review-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...edit, action: 'approve' }),
    });
    setEdit(null); await load();
  };

  const openFolder = async (doc) => {
    try {
      const res = await fetch(`/api/expense-docs/folder?id=${encodeURIComponent(doc.id)}`);
      const data = await res.json();
      if (data.folder_url) window.open(data.folder_url, '_blank', 'noopener,noreferrer');
      else alert(data.error || 'לא נמצאה תיקייה — החשבונית עדיין לא נשמרה בדרייב.');
    } catch { alert('לא ניתן לפתוח תיקייה'); }
  };

  const openTopicFolder = async (topic, year, month) => {
    const params = new URLSearchParams();
    if (year) params.set('year', year);
    if (month) params.set('month', month);
    if (topic) params.set('topic', topic);
    try {
      const res = await fetch(`/api/expense-docs/folder?${params}`);
      const data = await res.json();
      if (data.folder_url) window.open(data.folder_url, '_blank', 'noopener,noreferrer');
      else alert(data.error || 'לא נמצאה תיקייה בדרייב.');
    } catch { alert('לא ניתן לפתוח תיקייה'); }
  };

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
          {pending > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              ⚠️ {pending} ממתינים לסיווג
            </span>
          )}
          <button
            onClick={() => openTopicFolder(null, year, m !== 'all' ? m : null)}
            className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm"
            title="פתח תיקיית דרייב"
          >
            📁 {m !== 'all' ? `${MONTHS[Number(m) - 1]} ${year}` : `דרייב ${year}`}
          </button>
          <button onClick={sync} disabled={syncing} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm">
            {syncing ? '⏳ מסנכרן…' : '📧 סרוק וייבא'}
          </button>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-5 py-6 space-y-5">
        {connectStatus === 'ok' && (
          <div className="rounded-2xl p-4 border bg-emerald-50 border-emerald-200 text-emerald-800">
            ✅ Gmail חובר בהצלחה! לחץ <b>סרוק וייבא</b> כדי לייבא חשבוניות.
          </div>
        )}
        {connectStatus?.startsWith('error:') && (
          <div className="rounded-2xl p-4 border bg-red-50 border-red-200 text-red-700">
            ❌ שגיאה בחיבור Gmail: {connectStatus.replace('error:', '')}
            <a href="/api/auth/google/connect?return_to=/expenses/receipts&retry=1" className="mr-3 underline font-semibold">נסה שוב</a>
          </div>
        )}

        {pending > 0 && (
          <div className="rounded-2xl p-4 border bg-orange-100 border-orange-300 text-orange-900 font-bold">
            ⚠️ {pending} חשבוניות ממתינות לסיווג מנהל — הן לא נספרות כהוצאה עד אישור.
          </div>
        )}

        {result && (
          <div className={`rounded-2xl p-4 border ${result.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            {result.error
              ? result.error
              : `נסרקו ${result.scanned || 0}. יובאו ${result.imported?.length || 0}. ממתינות לסיווג ${result.pending_review?.length || 0}.`}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="מסמכים" value={rows.length} />
          <Card title="ממתינים" value={pending} warn={pending > 0} />
          <Card title="סה״כ מאושרות" value={`₪${money(total)}`} />
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
                    <th className="text-right p-2 border-b">סטטוס</th>
                    <th className="text-right p-2 border-b">תאריך</th>
                    <th className="text-right p-2 border-b">ספק</th>
                    <th className="text-right p-2 border-b">נושא</th>
                    <th className="text-left p-2 border-b">סכום</th>
                    <th className="text-right p-2 border-b">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(d => (
                    <tr key={d.id} className={d.status === 'needs_review' ? 'bg-orange-50 hover:bg-orange-100 border-r-4 border-r-orange-500' : 'hover:bg-slate-50'}>
                      <td className="p-2 border-b whitespace-nowrap">
                        {d.status === 'needs_review'
                          ? <span className="text-orange-700 font-bold text-xs">ממתין לסיווג</span>
                          : <span className="text-emerald-700 text-xs">מאושר</span>}
                      </td>
                      <td className="p-2 border-b whitespace-nowrap">{d.doc_date || '—'}</td>
                      <td className="p-2 border-b font-medium">{d.vendor || '—'}</td>
                      <td className="p-2 border-b">
                        <div>{d.expense_item || d.file_name || '—'}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[520px]">{d.description || ''}</div>
                      </td>
                      <td className="p-2 border-b text-left font-semibold whitespace-nowrap">₪{money(d.amount)}</td>
                      <td className="p-2 border-b whitespace-nowrap">
                        <div className="flex gap-1.5">
                          <button onClick={() => setPreview(d)} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs">צפייה</button>
                          {driveFileId(d.file_url) && (
                            <button onClick={() => openFolder(d)} className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs" title="פתח תיקיית הקובץ">📁</button>
                          )}
                          {d.expense_item && d.expense_year && d.expense_month_num && (
                            <button
                              onClick={() => openTopicFolder(d.expense_item, d.expense_year, d.expense_month_num)}
                              className="px-2 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs"
                              title={`פתח תיקייה: ${d.expense_item}`}
                            >{d.expense_item}</button>
                          )}
                          {d.status === 'needs_review' && (
                            <button
                              onClick={() => setEdit({ id: d.id, vendor: d.vendor || '', amount: d.amount || '', doc_date: d.doc_date || new Date().toISOString().slice(0, 10), expense_item: '', expense_section: 'office' })}
                              className="px-2 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-400 text-xs"
                            >סווג</button>
                          )}
                          <button onClick={() => rejectDoc(d)} className="px-2 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-xs">הסר</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <div className="py-10 text-center text-slate-400">אין מסמכים להצגה.</div>}
            </div>
          )}
        </section>
      </main>

      {preview && (
        <Modal title="צפייה מהירה" onClose={() => setPreview(null)}>
          <div className="space-y-3">
            <div className="font-bold text-sm truncate">{preview.vendor || preview.file_name}</div>
            <InlinePreview docId={preview.id} />
            <div className="flex gap-3 flex-wrap text-sm">
              <a href={`/api/expense-docs/preview?id=${encodeURIComponent(preview.id)}`} target="_blank" rel="noreferrer" className="text-sky-600 underline">פתח בכרטיסייה חדשה</a>
              {preview.file_url && <a href={preview.file_url} target="_blank" rel="noreferrer" className="text-sky-600 underline">פתח מקור</a>}
              {driveFileId(preview.file_url) && (
                <button onClick={() => openFolder(preview)} className="text-indigo-700 underline">פתח תיקייה בדרייב</button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {edit && (
        <Modal title="סיווג ואישור חשבונית" onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <label className="text-sm">
              תת נושא *
              <select value={edit.expense_item} onChange={e => setEdit({ ...edit, expense_item: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1">
                <option value="">בחר תת נושא</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm">
              ספק
              <input value={edit.vendor} onChange={e => setEdit({ ...edit, vendor: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1" />
            </label>
            <label className="text-sm">
              סכום
              <input type="number" value={edit.amount} onChange={e => setEdit({ ...edit, amount: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1" />
            </label>
            <label className="text-sm">
              תאריך
              <input type="date" value={edit.doc_date} onChange={e => setEdit({ ...edit, doc_date: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1" />
            </label>
            <button onClick={approveDoc} disabled={!edit.expense_item} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl px-4 py-2 font-bold">
              ✅ אשר ושמור
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Card({ title, value, warn }) {
  return (
    <div className={`rounded-2xl border bg-white ${warn ? 'border-orange-300' : 'border-slate-200'} p-4`}>
      <div className="text-xs text-slate-500 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${warn ? 'text-orange-600' : 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
