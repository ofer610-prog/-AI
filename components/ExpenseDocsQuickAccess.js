'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

function currentYear() {
  return new Date().getFullYear();
}

function money(n) {
  return Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
}

function gmailUrl(doc) {
  return doc?.gmail_message_id ? `https://mail.google.com/mail/#all/${doc.gmail_message_id}` : '';
}

function driveFileId(url) {
  const s = String(url || '');
  let m = s.match(/\/file\/d\/([^/]+)/);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]id=([^&]+)/);
  return m?.[1] || null;
}

function drivePreviewUrl(url) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : '';
}

function directViewUrl(doc) {
  const drivePreview = drivePreviewUrl(doc?.file_url);
  if (drivePreview) return drivePreview;
  return `/api/expense-docs/preview?id=${encodeURIComponent(doc.id)}`;
}

export default function ExpenseDocsQuickAccess() {
  const pathname = usePathname() || '';
  const [docs, setDocs] = useState([]);
  const [open, setOpen] = useState(true);
  const [scanState, setScanState] = useState('idle');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);

  const shouldShow = pathname === '/expenses';

  async function loadDocs() {
    const res = await fetch(`/api/office-expenses?year=${currentYear()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const next = Array.isArray(data.docs) ? data.docs : [];
    setDocs(next);
    return next;
  }

  useEffect(() => {
    if (!shouldShow) return;
    let cancelled = false;

    async function runBatches() {
      setScanState('running');
      setMessage('מתחיל סריקה מלאה בחבילות…');
      await loadDocs();

      let totalImported = 0;
      let totalPending = 0;
      let totalProcessed = 0;
      let lastError = '';
      const maxRounds = 12;

      for (let round = 1; round <= maxRounds; round++) {
        if (cancelled) return;
        setMessage(`סורק חשבוניות… חבילה ${round}/${maxRounds}`);
        try {
          const res = await fetch('/api/expenses/scan-and-import-gmail', { method: 'POST', cache: 'no-store' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false) {
            lastError = data.error || 'שגיאת סריקה';
            break;
          }

          const imported = data.imported?.length || 0;
          const pending = data.pending_review?.length || 0;
          const processed = Number(data.processed_now || imported + pending || 0);
          const suggestions = Number(data.suggestions || 0);

          totalImported += imported;
          totalPending += pending;
          totalProcessed += processed;
          await loadDocs();

          if (processed === 0 || suggestions === 0) break;
          if (!data.note && suggestions <= processed) break;
        } catch {
          lastError = 'שגיאת רשת בסריקה';
          break;
        }
      }

      if (cancelled) return;
      if (lastError) {
        setScanState('error');
        setMessage(`${lastError}. החשבוניות הקיימות עדיין מוצגות.`);
      } else {
        setScanState('done');
        setMessage(`הסריקה הסתיימה. עובדו ${totalProcessed}, יובאו ${totalImported}, ממתינות ${totalPending}.`);
      }
      await loadDocs();
    }

    runBatches();
    return () => { cancelled = true; };
  }, [shouldShow]);

  const visibleDocs = useMemo(() => {
    return [...docs]
      .filter(d => d && d.status !== 'removed')
      .sort((a, b) => String(b.doc_date || '').localeCompare(String(a.doc_date || '')));
  }, [docs]);

  async function openFolder(doc) {
    try {
      const res = await fetch(`/api/expense-docs/folder?id=${encodeURIComponent(doc.id)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (data.folder_url) window.open(data.folder_url, '_blank', 'noopener,noreferrer');
      else alert(data.error || 'לא נמצאה תיקיית Drive לחשבונית הזאת');
    } catch {
      alert('לא ניתן לפתוח תיקייה');
    }
  }

  if (!shouldShow) return null;

  const statusClass = scanState === 'running'
    ? 'bg-red-600 text-white'
    : scanState === 'error'
      ? 'bg-amber-500 text-white'
      : 'bg-emerald-600 text-white';

  return (
    <div dir="rtl" className="max-w-[1500px] mx-auto px-5 pt-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-3 border-b bg-slate-50">
          <button onClick={() => setOpen(v => !v)} className="text-sm font-bold text-slate-700 hover:text-slate-900">
            {open ? '▾' : '▸'} כל החשבוניות שנמצאו
          </button>
          <span className={`rounded-xl px-3 py-1 text-xs font-bold ${statusClass}`}>{scanState === 'running' ? '⏳ סורק…' : scanState === 'done' ? '✅ הסתיים' : scanState === 'error' ? '⚠️ שגיאה' : '✅ מוכן'}</span>
          {message && <span className="text-xs text-slate-500">{message}</span>}
          <span className="mr-auto text-xs text-slate-400">{visibleDocs.length} חשבוניות מוצגות כאן, כולל ישנות</span>
        </div>

        {open && (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-xs min-w-[760px]">
              <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
                <tr>
                  <th className="text-right p-2">תאריך</th>
                  <th className="text-right p-2">ספק</th>
                  <th className="text-right p-2">נושא / קובץ</th>
                  <th className="text-left p-2">סכום</th>
                  <th className="text-right p-2">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {visibleDocs.map(doc => (
                  <tr key={doc.id} className={doc.status === 'needs_review' ? 'bg-orange-50' : doc.status === 'duplicate_review' ? 'bg-purple-50' : 'hover:bg-slate-50'}>
                    <td className="p-2 whitespace-nowrap">{doc.doc_date || '—'}</td>
                    <td className="p-2 font-medium">{doc.vendor || '—'}</td>
                    <td className="p-2 max-w-[520px] truncate">{doc.expense_item || doc.file_name || doc.description || 'חשבונית'}</td>
                    <td className="p-2 text-left font-bold whitespace-nowrap">₪{money(doc.amount)}</td>
                    <td className="p-2 whitespace-nowrap flex gap-2 flex-wrap">
                      <button onClick={() => setPreview(doc)} className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2 py-1">צפייה ישירה</button>
                      {gmailUrl(doc) && <a href={gmailUrl(doc)} target="_blank" rel="noreferrer" className="rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 px-2 py-1">גוף המייל</a>}
                      {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 px-2 py-1">חשבונית מקור</a>}
                      {driveFileId(doc.file_url) && <button onClick={() => openFolder(doc)} className="rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1">תיקייה</button>}
                    </td>
                  </tr>
                ))}
                {!visibleDocs.length && <tr><td colSpan="5" className="text-center text-slate-400 py-5">אין חשבוניות להצגה</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-bold text-lg">צפייה ישירה בחשבונית</h2>
              <button onClick={() => setPreview(null)} className="mr-auto text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="font-semibold text-sm mb-2 truncate">{preview.file_name || preview.expense_item || preview.vendor}</div>
            <iframe src={directViewUrl(preview)} className="w-full h-[72vh] border rounded-xl bg-white" />
            <div className="flex flex-wrap gap-3 mt-3 text-sm">
              <a href={directViewUrl(preview)} target="_blank" rel="noreferrer" className="underline text-sky-700">פתח צפייה ישירה בכרטיסייה חדשה</a>
              {gmailUrl(preview) && <a href={gmailUrl(preview)} target="_blank" rel="noreferrer" className="underline text-amber-700 font-semibold">פתח גוף המייל</a>}
              {preview.file_url && <a href={preview.file_url} target="_blank" rel="noreferrer" className="underline text-sky-700">פתח חשבונית מקור</a>}
              {driveFileId(preview.file_url) && <button onClick={() => openFolder(preview)} className="underline text-indigo-700">פתח תיקייה בדרייב</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
