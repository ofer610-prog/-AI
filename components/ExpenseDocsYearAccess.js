'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

const year = () => new Date().getFullYear();
const money = (n) => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
const gmailUrl = (d) => d?.gmail_message_id ? `https://mail.google.com/mail/#all/${d.gmail_message_id}` : '';
function fileId(url) {
  const s = String(url || '');
  return (s.match(/\/file\/d\/([^/]+)/)?.[1]) || (s.match(/[?&]id=([^&]+)/)?.[1]) || '';
}
function viewUrl(d) {
  const id = fileId(d?.file_url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : `/api/expense-docs/preview?id=${encodeURIComponent(d.id)}`;
}

export default function ExpenseDocsYearAccess() {
  const pathname = usePathname() || '';
  const [docs, setDocs] = useState([]);
  const [open, setOpen] = useState(true);
  const [state, setState] = useState('idle');
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState(null);

  const show = pathname === '/expenses';

  async function loadDocs() {
    const res = await fetch(`/api/office-expenses?year=${year()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    setDocs(Array.isArray(data.docs) ? data.docs : []);
  }

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    async function run() {
      await loadDocs();
      setState('running');
      setMsg('בודק אם יש חשבוניות חדשות…');
      try {
        const res = await fetch('/api/expenses/scan-and-import-gmail', { method: 'POST', cache: 'no-store', keepalive: true });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setState(res.ok ? 'done' : 'error');
        setMsg(res.ok ? `הסריקה הסתיימה. יובאו ${data.imported?.length || 0}, ממתינות ${data.pending_review?.length || 0}.` : (data.error || 'שגיאת סריקה'));
        await loadDocs();
      } catch {
        if (!cancelled) { setState('error'); setMsg('שגיאת סריקה. החשבוניות הקיימות עדיין מוצגות.'); }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [show]);

  const rows = useMemo(() => [...docs]
    .filter(d => d && d.status !== 'removed')
    .sort((a, b) => String(b.doc_date || '').localeCompare(String(a.doc_date || ''))), [docs]);

  async function openFolder(doc) {
    const res = await fetch(`/api/expense-docs/folder?id=${encodeURIComponent(doc.id)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (data.folder_url) window.open(data.folder_url, '_blank', 'noopener,noreferrer');
    else alert(data.error || 'לא נמצאה תיקיית Drive לחשבונית הזאת');
  }

  if (!show) return null;

  const badge = state === 'running' ? 'bg-red-600 text-white' : state === 'error' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white';
  const label = state === 'running' ? '⏳ סורק…' : state === 'error' ? '⚠️ שגיאה' : '✅ הסתיים';

  return <div dir="rtl" className="max-w-[1500px] mx-auto px-5 pt-4">
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b bg-slate-50">
        <button onClick={() => setOpen(v => !v)} className="text-sm font-bold text-slate-700 hover:text-slate-900">{open ? '▾' : '▸'} כל חשבוניות השנה</button>
        <span className={`rounded-xl px-3 py-1 text-xs font-bold ${badge}`}>{label}</span>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
        <span className="mr-auto text-xs text-slate-400">{rows.length} חשבוניות מוצגות כאן לגישה מהירה</span>
      </div>
      {open && <div className="overflow-auto max-h-[70vh]"><table className="w-full text-xs min-w-[760px]"><thead className="bg-slate-100 text-slate-600 sticky top-0 z-10"><tr><th className="text-right p-2">תאריך</th><th className="text-right p-2">ספק</th><th className="text-right p-2">נושא / קובץ</th><th className="text-left p-2">סכום</th><th className="text-right p-2">פעולות</th></tr></thead><tbody>
        {rows.map(d => <tr key={d.id} className="hover:bg-slate-50"><td className="p-2 whitespace-nowrap">{d.doc_date || '—'}</td><td className="p-2 font-medium">{d.vendor || '—'}</td><td className="p-2 max-w-[520px] truncate">{d.expense_item || d.file_name || d.description || 'חשבונית'}</td><td className="p-2 text-left font-bold whitespace-nowrap">₪{money(d.amount)}</td><td className="p-2 whitespace-nowrap flex gap-2 flex-wrap"><button onClick={() => setPreview(d)} className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2 py-1">צפייה</button>{gmailUrl(d) && <a href={gmailUrl(d)} target="_blank" rel="noreferrer" className="rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 px-2 py-1">גוף המייל</a>}{d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 px-2 py-1">חשבונית מקור</a>}{fileId(d.file_url) && <button onClick={() => openFolder(d)} className="rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1">תיקייה</button>}</td></tr>)}
        {!rows.length && <tr><td colSpan="5" className="text-center text-slate-400 py-5">אין חשבוניות להצגה</td></tr>}
      </tbody></table></div>}
    </div>
    {preview && <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4" onClick={() => setPreview(null)}><div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl p-5" onClick={e => e.stopPropagation()}><div className="flex items-center mb-3"><h2 className="font-bold text-lg">צפייה בחשבונית</h2><button onClick={() => setPreview(null)} className="mr-auto text-slate-400 hover:text-slate-700">✕</button></div><iframe src={viewUrl(preview)} className="w-full h-[72vh] border rounded-xl bg-white" /><div className="flex flex-wrap gap-3 mt-3 text-sm"><a href={viewUrl(preview)} target="_blank" rel="noreferrer" className="underline text-sky-700">פתח צפייה בכרטיסייה חדשה</a>{gmailUrl(preview) && <a href={gmailUrl(preview)} target="_blank" rel="noreferrer" className="underline text-amber-700 font-semibold">פתח גוף המייל</a>}{preview.file_url && <a href={preview.file_url} target="_blank" rel="noreferrer" className="underline text-sky-700">פתח חשבונית מקור</a>}{fileId(preview.file_url) && <button onClick={() => openFolder(preview)} className="underline text-indigo-700">פתח תיקייה בדרייב</button>}</div></div></div>}
  </div>;
}
