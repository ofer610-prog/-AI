'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const EXPENSE_SECTIONS = [
  { value: 'office',        label: 'משרד כללי' },
  { value: 'vehicle',       label: 'רכב ודלק' },
  { value: 'telecom',       label: 'תקשורת' },
  { value: 'professional',  label: 'שירותים מקצועיים' },
  { value: 'insurance',     label: 'ביטוח' },
  { value: 'salary',        label: 'שכר' },
  { value: 'personal',      label: 'אישי / נכסים' },
];

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const money = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

function sourceOf(d) {
  if (d.gmail_message_id?.startsWith('outlook_') || d.file_type === 'outlook_receipt')
    return 'outlook';
  if (d.gmail_message_id || d.file_type === 'gmail_candidate' || d.file_type === 'drive_email_body' || d.file_type === 'drive_receipt')
    return 'gmail';
  return 'manual';
}
const SOURCE_LABELS = {
  outlook: { label: 'Outlook', cls: 'bg-blue-100 text-blue-800' },
  gmail:   { label: 'Gmail',   cls: 'bg-red-100 text-red-700' },
  manual:  { label: 'ידני',    cls: 'bg-slate-100 text-slate-600' },
};

function driveFileId(url) {
  const s = String(url || '');
  let m = s.match(/\/file\/d\/([^/]+)/);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]id=([^&]+)/);
  return m?.[1] || null;
}
function gmailUrl(doc) {
  return doc?.gmail_message_id ? `https://mail.google.com/mail/#all/${doc.gmail_message_id}` : '';
}

export default function ReceiptsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [docs, setDocs] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanState, setScanState] = useState('idle');
  const [lastScan, setLastScan] = useState('');
  const [result, setResult] = useState(null);
  const [q, setQ] = useState('');
  const [m, setM] = useState('all');
  const [src, setSrc] = useState('all');
  const [sec, setSec] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grouped'
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState(null);
  const [missingExpenses, setMissingExpenses] = useState([]);
  const [missingDismissed, setMissingDismissed] = useState(false);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/office-expenses?year=${year}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      setDocs(data.docs || []);
      setEntries(data.entries || []);
    } catch {}
    setLoading(false);
  }, [year]);

  const autoScan = useCallback(async () => {
    setScanState('running');
    setResult(null);
    try {
      // Quick scan uses the same comprehensive scanner as the deep scan,
      // limited to the last 30 days (finds invoices by supplier/keyword/
      // attachment, not only by card number).
      const res = await fetch('/api/expenses/deep-scan?days=30', { method: 'POST', cache: 'no-store', keepalive: true });
      const data = await res.json().catch(() => ({}));
      setResult(data.error ? data : { _deep: true, ...data });
      setScanState(res.ok ? 'done' : 'error');
      setLastScan(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
      await load();
    } catch {
      setScanState('error');
      setResult({ error: 'הסריקה הופעלה אך לא ניתן היה להציג תוצאה. המערכת תנסה שוב בסריקה הקבועה.' });
    }
  }, [load]);


  useEffect(() => { load(); }, [load]);

  // Alert for recurring monthly expenses not yet entered this month
  useEffect(() => {
    const now = new Date();
    if (now.getFullYear() !== year) return;
    fetch('/api/expenses/missing-check')
      .then(r => r.json())
      .then(d => { if (d.missing?.length) setMissingExpenses(d.missing); })
      .catch(() => {});
  }, [year]);

  const topics = useMemo(() => [...new Set(entries.map(e => e.item_name).filter(Boolean))].sort(), [entries]);
  const NEEDS_APPROVAL = new Set(['needs_review', 'linked', 'duplicate_review', 'pending']);
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return docs.filter(d => {
      if (m !== 'all' && Number(d.expense_month_num) !== Number(m)) return false;
      if (src !== 'all' && sourceOf(d) !== src) return false;
      if (sec !== 'all' && (d.expense_section || 'office') !== sec) return false;
      if (!query) return true;
      return [d.vendor, d.file_name, d.description, d.expense_item, d.status, d.expense_section].filter(Boolean).join(' ').toLowerCase().includes(query);
    }).sort((a, b) => {
      const aPend = NEEDS_APPROVAL.has(a.status) ? 0 : 1;
      const bPend = NEEDS_APPROVAL.has(b.status) ? 0 : 1;
      if (aPend !== bPend) return aPend - bPend;
      return String(b.doc_date || '').localeCompare(String(a.doc_date || ''));
    });
  }, [docs, q, m, src, sec]);

  const pending = rows.filter(d => NEEDS_APPROVAL.has(d.status)).length;
  const total = rows.filter(d => d.status === 'approved').reduce((s, d) => s + Number(d.amount || 0), 0);
  const linked = rows.filter(d => d.file_url).length;

  const rejectDoc = async (doc) => {
    if (!confirm('למחוק חשבונית זו? הפעולה תסיר אותה מהרשימה.')) return;
    await fetch('/api/expenses/review-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: doc.id, action: 'reject' }) });
    await load();
  };

  const openEdit = (doc, approveMode = false) => {
    const d = doc;
    setEdit({
      id: d.id,
      vendor: d.vendor || '',
      amount: d.amount != null ? String(d.amount) : '',
      vat: d.vat != null ? String(d.vat) : '',
      doc_date: d.doc_date || new Date().toISOString().slice(0, 10),
      expense_item: d.expense_item || '',
      expense_section: d.expense_section || 'office',
      _approve: approveMode,
    });
  };

  const quickApprove = async (doc) => {
    if (!doc.expense_item) { openEdit(doc, true); return; }
    const res = await fetch('/api/expenses/review-doc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: doc.id, action: 'approve', expense_item: doc.expense_item, expense_section: doc.expense_section || 'office', doc_date: doc.doc_date, vendor: doc.vendor, amount: doc.amount, vat: doc.vat }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'שגיאה'); return; }
    await load();
  };

  const saveEdit = async (andApprove = false) => {
    if (andApprove && !edit?.expense_item) { alert('יש לבחור תת נושא לפני אישור'); return; }
    const action = andApprove ? 'approve' : 'edit';
    const res = await fetch('/api/expenses/review-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...edit, action }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'שגיאה בשמירה'); return; }
    setEdit(null); await load();
  };

  const openFolder = async (doc) => {
    try {
      const res = await fetch(`/api/expense-docs/folder?id=${encodeURIComponent(doc.id)}`);
      const data = await res.json();
      if (data.folder_url) window.open(data.folder_url, '_blank', 'noopener,noreferrer');
      else alert(data.error || 'לא נמצאה תיקייה. ייתכן שהחשבונית עדיין לא נשמרה בדרייב.');
    } catch { alert('לא ניתן לפתוח תיקייה'); }
  };

  const scanLabel = scanState === 'running' ? '⏳ סורק חשבוניות…' : scanState === 'done' ? '✅ הסריקה הסתיימה' : scanState === 'error' ? '⚠️ שגיאת סריקה' : '✅ מוכן';
  const scanClass = scanState === 'running' ? 'bg-red-600 text-white' : scanState === 'done' || scanState === 'idle' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white';
  const gmailNeedsReconnect = result?.error && (
    String(result.error).toLowerCase().includes('invalid_grant') ||
    String(result.error).toLowerCase().includes('token') ||
    String(result.error).toLowerCase().includes('unauthorized')
  );

  const resultText = result?.error
    ? result.error
    : result?._outlook
      ? `סריקת Outlook (${result.days || 30} יום): נמצאו ${result.found || 0} הודעות. יובאו אוטומטית: ${result.auto_imported || 0}. נשלחו לסיווג: ${result.pending_review || 0}. סה״כ בתור: ${result.total_queue ?? '?'}.`
      : result?._drive
        ? `סריקת Drive: נמצאו ${result.found || 0} קבצים. נוספו ${result.added || 0} חדשים. כפילויות: ${result.duplicates || 0}.`
        : result?._deep
          ? `סריקה עמוקה (${result.days || 120} יום): נמצאו ${result.found || 0} מיילים. נשמרו ${result.imported || 0}. ממתינות לסיווג ${result.pending_review || 0}. כפילויות שדולגו ${result.duplicates || 0}.`
          : result
            ? `נסרקו ${result.scanned || 0}. יובאו ${result.imported?.length || 0}. ממתינות לסיווג ${result.pending_review?.length || 0}.`
            : '';

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
          {lastScan && <span className="text-slate-400 text-xs">סריקה אחרונה: {lastScan}</span>}
          <button
            onClick={autoScan}
            disabled={scanState === 'running'}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-semibold"
            title="סריקה מהירה של חשבוניות חדשות (מתבצעת גם אוטומטית 3× ביום)"
          >
            {scanState === 'running' ? '⏳ סורק…' : '📧 סרוק Gmail'}
          </button>
          <button
            onClick={async () => {
              setScanState('running'); setResult(null);
              try {
                const res = await fetch('/api/cron/scan-outlook?days=30', { method: 'POST', cache: 'no-store' });
                const data = await res.json();
                setResult(data.error ? data : { _outlook: true, ...data });
                setScanState(res.ok ? 'done' : 'error');
                setLastScan(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
                await load();
              } catch { setScanState('error'); }
            }}
            disabled={scanState === 'running'}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-semibold"
            title="סרוק Outlook / Hotmail לפי מספרי כרטיס אשראי"
          >
            {scanState === 'running' ? '⏳ סורק…' : '📨 סרוק Outlook'}
          </button>
          <a
            href={`/api/expenses/export-csv?year=${year}`}
            download
            className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            title="ייצוא לרו״ח — כל החשבוניות המאושרות בשנה זו"
          >
            📊 ייצוא CSV
          </a>

        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-5 py-6 space-y-5">
        {gmailNeedsReconnect && (
          <div className="rounded-2xl p-4 border bg-red-50 border-red-300 text-red-900 flex items-center gap-4">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <div className="font-bold">חיבור Gmail פג תוקף — יש לחבר מחדש</div>
              <div className="text-sm text-red-700 mt-0.5">{result?.error}</div>
            </div>
            <a href="/api/auth/google/connect?return_to=/expenses/receipts"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap">
              🔗 חבר Gmail מחדש
            </a>
          </div>
        )}
        {pending > 0 && <div className="rounded-2xl p-4 border bg-orange-100 border-orange-300 text-orange-900 font-bold">⚠️ {pending} חשבוניות ממתינות לאישורך. רק חשבוניות שאישרת נספרות כהוצאה מוכרת.</div>}

        {missingExpenses.length > 0 && !missingDismissed && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔔</span>
              <div className="flex-1">
                <div className="font-bold text-red-900 mb-1">{missingExpenses.length} הוצאות חודשיות קבועות עדיין לא הוזנו החודש</div>
                <p className="text-xs text-red-600 mb-2">פריטים שהוזנו בחודשים קודמים אך חסרים לחודש הנוכחי:</p>
                <div className="flex flex-wrap gap-2">
                  {missingExpenses.map(item => (
                    <span key={`${item.section}__${item.item_name}`} className="inline-flex items-center gap-1 bg-white border border-red-200 text-red-800 text-xs px-2.5 py-1.5 rounded-full font-medium shadow-sm">
                      {item.is_recurring ? '📌' : '🔄'} {item.item_name}
                      {item.last_amount && <span className="text-red-400 mr-1">₪{Number(item.last_amount).toLocaleString('he-IL')}</span>}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <Link href="/expenses" className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors">➕ עדכן הוצאות</Link>
                  <button onClick={() => setMissingDismissed(true)} className="text-xs text-red-500 hover:text-red-700 underline">הסתר עד לרענון</button>
                </div>
              </div>
              <button onClick={() => setMissingDismissed(true)} className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0" title="סגור התראה">✕</button>
            </div>
          </div>
        )}
        {resultText && (
          <div className={`rounded-2xl p-4 border ${result?.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            {resultText}
            {result?._outlook && (result?.total_queue > 0) && (
              <a href="/dashboard?tab=gmail" className="block mt-2 text-sm font-semibold underline text-indigo-700">
                ← עבור לדשבורד לסיווג {result.total_queue} פריטים
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="מסמכים" value={rows.length} />
          <Card title="ממתינים" value={pending} warn={pending > 0} />
          <Card title="סה״כ מאושרות" value={`₪${money(total)}`} />
          <Card title="עם קישור" value={linked} />
        </div>

        <RecurringSection />

        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש ספק / נושא / הערה" className="border rounded-xl px-3 py-2 text-sm w-64" />
            <select value={m} onChange={e => setM(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל החודשים</option>
              {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
            <select value={sec} onChange={e => setSec(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל הקטגוריות</option>
              {EXPENSE_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={src} onChange={e => setSrc(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל המקורות</option>
              <option value="outlook">Outlook בלבד</option>
              <option value="gmail">Gmail בלבד</option>
              <option value="manual">ידני בלבד</option>
            </select>
            <div className="flex rounded-xl border overflow-hidden text-xs font-semibold mr-auto">
              <button onClick={() => setViewMode('list')} className={`px-3 py-2 ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>☰ רשימה</button>
              <button onClick={() => setViewMode('grouped')} className={`px-3 py-2 ${viewMode === 'grouped' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>📁 לפי נושא</button>
            </div>
          </div>
          {loading ? <div className="py-12 text-center text-slate-400">טוען…</div> : viewMode === 'grouped'
            ? <GroupedView rows={rows} setPreview={setPreview} openEdit={openEdit} quickApprove={quickApprove} rejectDoc={rejectDoc} openFolder={openFolder} NEEDS_APPROVAL={NEEDS_APPROVAL} />
            : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-slate-100 text-slate-600">
                  <th className="text-right p-2 border-b">סטטוס</th>
                  <th className="text-right p-2 border-b">מקור</th>
                  <th className="text-right p-2 border-b">תאריך</th>
                  <th className="text-right p-2 border-b">ספק</th>
                  <th className="text-right p-2 border-b">נושא</th>
                  <th className="text-left p-2 border-b">סכום</th>
                  <th className="text-right p-2 border-b">פעולות</th>
                </tr></thead>
                <tbody>{rows.map(d => <DocRow key={d.id} d={d} setPreview={setPreview} openEdit={openEdit} quickApprove={quickApprove} rejectDoc={rejectDoc} openFolder={openFolder} NEEDS_APPROVAL={NEEDS_APPROVAL} />)}</tbody>
              </table>
              {!rows.length && <div className="py-10 text-center text-slate-400">אין מסמכים להצגה.</div>}
            </div>)}
        </section>
      </main>

      {preview && <Modal title="צפייה מהירה" onClose={() => setPreview(null)}><div className="space-y-3"><div className="font-bold">{preview.file_name}</div><iframe src={`/api/expense-docs/preview?id=${encodeURIComponent(preview.id)}`} className="w-full h-[70vh] border rounded-xl bg-white" /><div className="flex gap-3 flex-wrap"><a href={`/api/expense-docs/preview?id=${encodeURIComponent(preview.id)}`} target="_blank" rel="noreferrer" className="text-sky-600 underline">פתח צפייה בכרטיסייה חדשה</a>{gmailUrl(preview) && <a href={gmailUrl(preview)} target="_blank" rel="noreferrer" className="text-amber-700 underline font-semibold">פתח גוף המייל</a>}{preview.file_url && <a href={preview.file_url} target="_blank" rel="noreferrer" className="text-sky-600 underline">פתח מקור</a>}{driveFileId(preview.file_url) && <button onClick={() => openFolder(preview)} className="text-indigo-700 underline">פתח תיקייה בדרייב</button>}</div></div></Modal>}
      {edit && (
        <Modal title={edit._approve ? 'ערוך ואשר חשבונית' : 'עריכת פרטי חשבונית'} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm col-span-2">ספק
                <input value={edit.vendor} onChange={e => setEdit({ ...edit, vendor: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1" placeholder="שם הספק" />
              </label>
              <label className="text-sm">סכום (₪)
                <input type="number" min="0" step="0.01" value={edit.amount} onChange={e => setEdit({ ...edit, amount: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1" placeholder="0.00" />
              </label>
              <label className="text-sm">מע״מ (₪) — אופציונלי
                <input type="number" min="0" step="0.01" value={edit.vat} onChange={e => setEdit({ ...edit, vat: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1" placeholder="ריק = אין מע״מ" />
              </label>
              <label className="text-sm">תאריך
                <input type="date" value={edit.doc_date} onChange={e => setEdit({ ...edit, doc_date: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1" />
              </label>
              <label className="text-sm">קטגוריה
                <select value={edit.expense_section} onChange={e => setEdit({ ...edit, expense_section: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1">
                  {EXPENSE_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="text-sm col-span-2">תת נושא {edit._approve && <span className="text-red-500">*</span>}
                <select value={edit.expense_item} onChange={e => setEdit({ ...edit, expense_item: e.target.value })} className="block w-full border rounded-xl px-3 py-2 mt-1">
                  <option value="">— בחר —</option>
                  {topics.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {edit._approve && !edit.expense_item && <p className="text-xs text-red-500 mt-1">חובה לבחור תת נושא לפני אישור</p>}
              </label>
            </div>
            <div className="flex gap-3 pt-1">
              {edit._approve
                ? <button onClick={() => saveEdit(true)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 font-bold">✓ שמור ואשר</button>
                : <>
                    <button onClick={() => saveEdit(false)} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2 font-semibold">💾 שמור שינויים</button>
                    <button onClick={() => saveEdit(true)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 font-bold">✓ שמור ואשר</button>
                  </>
              }
              <button onClick={() => setEdit(null)} className="px-4 py-2 rounded-xl border text-slate-600 hover:bg-slate-50">ביטול</button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}

function Card({ title, value, warn }) { return <div className={`rounded-2xl border bg-white ${warn ? 'border-orange-300' : 'border-slate-200'} p-4`}><div className="text-xs text-slate-500 mb-1">{title}</div><div className={`text-2xl font-bold ${warn ? 'text-orange-600' : 'text-slate-800'}`}>{value}</div></div>; }
function Modal({ title, children, onClose }) { return <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4"><div dir="rtl" className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-5"><div className="flex items-center mb-4"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose} className="mr-auto text-slate-500 hover:text-black">✕</button></div>{children}</div></div>; }

function DocRow({ d, setPreview, openEdit, quickApprove, rejectDoc, openFolder, NEEDS_APPROVAL }) {
  const s = sourceOf(d);
  const sl = SOURCE_LABELS[s];
  const needsApproval = NEEDS_APPROVAL.has(d.status);
  const rowCls = d.status === 'needs_review'
    ? 'bg-orange-50 hover:bg-orange-100 border-r-4 border-orange-500'
    : d.status === 'linked' || d.status === 'pending'
      ? 'bg-amber-50 hover:bg-amber-100 border-r-4 border-amber-400'
      : d.status === 'duplicate_review'
        ? 'bg-purple-50 hover:bg-purple-100 border-r-4 border-purple-500'
        : 'hover:bg-slate-50';
  const statusBadge = d.status === 'approved'
    ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ מאושר</span>
    : d.status === 'needs_review'
      ? <span className="text-orange-700 font-bold text-xs">⚠️ ממתין לסיווג</span>
      : d.status === 'duplicate_review'
        ? <span className="text-purple-700 font-bold text-xs">כפילות</span>
        : <span className="text-amber-700 font-bold text-xs">⏳ ממתין לאישורך</span>;
  return (
    <tr className={rowCls}>
      <td className="p-2 border-b whitespace-nowrap">{statusBadge}</td>
      <td className="p-2 border-b whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sl.cls}`}>{sl.label}</span></td>
      <td className="p-2 border-b whitespace-nowrap">{d.doc_date || '—'}</td>
      <td className="p-2 border-b font-medium">
        {d.vendor || '—'}
        {d.doc_number && <div className="text-xs text-slate-400"># {d.doc_number}</div>}
      </td>
      <td className="p-2 border-b"><div>{d.expense_item || d.file_name || '—'}</div><div className="text-xs text-slate-400 truncate max-w-[440px]">{d.description || ''}</div></td>
      <td className="p-2 border-b text-left font-semibold whitespace-nowrap">
        {d.currency && d.currency !== 'ILS' && d.original_amount
          ? <div className="text-xs text-slate-500">{d.currency === 'USD' ? '$' : d.currency === 'EUR' ? '€' : d.currency} {Number(d.original_amount).toLocaleString()}</div>
          : null}
        ₪{money(d.amount)}
        {d.vat ? <div className="text-xs font-normal text-slate-500">מע״מ ₪{money(d.vat)}</div> : null}
      </td>
      <td className="p-2 border-b whitespace-nowrap">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPreview(d)} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs">צפייה</button>
          {d.gmail_message_id && !d.gmail_message_id.startsWith('outlook_') && <a href={`https://mail.google.com/mail/#all/${d.gmail_message_id}`} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs">מייל</a>}
          {driveFileId(d.file_url) && <button onClick={() => openFolder(d)} className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs">תיקייה</button>}
          <button onClick={() => openEdit(d, false)} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-medium">✏️ ערוך</button>
          {needsApproval && <button onClick={() => quickApprove(d)} className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">✓ אשר</button>}
          <button onClick={() => rejectDoc(d)} className="px-2 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">✕ דחה</button>
        </div>
      </td>
    </tr>
  );
}

function GroupedView({ rows, setPreview, openEdit, quickApprove, rejectDoc, openFolder, NEEDS_APPROVAL }) {
  const [openSections, setOpenSections] = useState({});
  const sectionMap = useMemo(() => {
    const m = {};
    for (const d of rows) {
      const sec = d.expense_section || 'office';
      const item = d.expense_item || d.vendor || 'ללא נושא';
      const key = `${sec}__${item}`;
      if (!m[key]) m[key] = { sec, item, docs: [], total: 0 };
      m[key].docs.push(d);
      m[key].total += Number(d.amount || 0);
    }
    return Object.values(m).sort((a, b) => {
      if (a.sec !== b.sec) return a.sec.localeCompare(b.sec);
      return a.item.localeCompare(b.item, 'he');
    });
  }, [rows]);

  const secLabel = (s) => EXPENSE_SECTIONS.find(x => x.value === s)?.label || s;

  if (!sectionMap.length) return <div className="py-10 text-center text-slate-400">אין מסמכים להצגה.</div>;

  return (
    <div className="space-y-3">
      {sectionMap.map(({ sec, item, docs, total }) => {
        const key = `${sec}__${item}`;
        const isOpen = openSections[key];
        const pendingCount = docs.filter(d => NEEDS_APPROVAL.has(d.status)).length;
        return (
          <div key={key} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-right"
            >
              <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{secLabel(sec)}</span>
              <span className="font-semibold text-slate-800">{item}</span>
              <span className="text-slate-500 text-sm">{docs.length} מסמכים</span>
              {pendingCount > 0 && <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{pendingCount} ממתינים</span>}
              <span className="mr-auto font-bold text-slate-700">₪{money(total)}</span>
              <span className="text-slate-400 text-xs">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="bg-slate-100 text-slate-600">
                    <th className="text-right p-2 border-b">סטטוס</th>
                    <th className="text-right p-2 border-b">מקור</th>
                    <th className="text-right p-2 border-b">תאריך</th>
                    <th className="text-right p-2 border-b">ספק</th>
                    <th className="text-left p-2 border-b">סכום</th>
                    <th className="text-right p-2 border-b">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {docs.map(d => <DocRow key={d.id} d={d} setPreview={setPreview} openEdit={openEdit} quickApprove={quickApprove} rejectDoc={rejectDoc} openFolder={openFolder} NEEDS_APPROVAL={NEEDS_APPROVAL} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecurringSection() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/expenses/recurring').then(r => r.json()).then(d => {
      if (d.recurring?.length) setData(d);
    }).catch(() => {});
  }, []);

  if (!data?.recurring?.length) return null;
  const missing = data.recurring.filter(r => !r.arrived_this_month);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full text-right">
        <span className="text-base font-bold">🔄 הוצאות קבועות</span>
        {missing.length > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{missing.length} חסרות החודש</span>}
        <span className="mr-auto text-slate-400 text-sm">{open ? '▲' : '▼'} {data.recurring.length} ספקים קבועים</span>
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-slate-50 text-slate-600">
              <th className="text-right p-2 border-b">ספק</th>
              <th className="text-right p-2 border-b">חודשים</th>
              <th className="text-left p-2 border-b">ממוצע חודשי</th>
              <th className="text-right p-2 border-b">מצב החודש</th>
            </tr></thead>
            <tbody>{data.recurring.map(r => (
              <tr key={r.key} className={r.arrived_this_month ? 'hover:bg-slate-50' : 'bg-red-50 hover:bg-red-100'}>
                <td className="p-2 border-b font-medium">{r.vendor}</td>
                <td className="p-2 border-b text-slate-500">{r.months_seen} מתוך 6</td>
                <td className="p-2 border-b text-left">{r.avg_amount ? '₪' + Number(r.avg_amount).toLocaleString('he-IL') : '—'}</td>
                <td className="p-2 border-b">{r.arrived_this_month
                  ? <span className="text-emerald-600 text-xs font-semibold">✓ הגיע</span>
                  : <span className="text-red-600 text-xs font-semibold">⚠️ טרם הגיע</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const DOC_TYPE_LABELS = { tax_invoice: 'חשבונית מס', tax_invoice_receipt: 'חשבונית מס / קבלה', receipt: 'קבלה', proforma: 'חשבונית עסקה', unknown: 'לא ידוע' };
const money2 = n => n == null ? '—' : Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ReceiptScanResult({ result, fileName, topics = [], onSaved }) {
  const r = result;
  const docLabel = DOC_TYPE_LABELS[r.document_type] || r.document_type;
  const vendorName = r.merchant?.name_he || r.merchant?.name_en || '—';

  const now = new Date();
  const [saveForm, setSaveForm] = useState(null); // null | { section, item, year, month }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function openSaveForm() {
    setSaveForm({
      section: 'office',
      item: topics[0] || '',
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
  }

  async function doSave() {
    if (!saveForm.item) { alert('יש לבחור נושא הוצאה'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/expenses/import-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan: r, ...saveForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בשמירה');
      setSaved(true);
      setTimeout(() => onSaved?.(), 1200);
    } catch (e) {
      alert('שגיאה: ' + e.message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4 text-sm max-h-[80vh] overflow-y-auto">
      {/* header */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${r.needs_review ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {r.needs_review ? '⚠️ דורש בדיקה' : '✅ תקין'}
        </span>
        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">{docLabel}</span>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${r.vat_deductible ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
          מע"מ: {r.vat_deductible ? 'ניתן לניכוי' : 'לא ניתן לניכוי'}
        </span>
      </div>

      {/* main grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 bg-slate-50 rounded-xl p-4 border">
        <Field label="ספק" value={vendorName} />
        <Field label="עוסק מורשה" value={r.merchant?.vat_registration || '—'} />
        <Field label="תאריך" value={r.date || '—'} />
        <Field label="מספר מסמך" value={r.document_number || '—'} />
        <Field label="מספר הקצאה" value={r.allocation_number || '—'} />
        <Field label="קטגוריה" value={r.category_he || r.category || '—'} />
        <Field label="קונה" value={r.buyer_name || '—'} />
        <Field label="ע.מ. קונה" value={r.buyer_vat_number || '—'} />
      </div>

      {/* amounts */}
      <div className="grid grid-cols-3 gap-3">
        <AmountCard label='סה"כ לפני מע"מ' value={`₪${money2(r.subtotal)}`} />
        <AmountCard label='מע"מ 18%' value={`₪${money2(r.vat_amount)}`} />
        <AmountCard label='סה"כ לתשלום' value={`₪${money2(r.total)}`} accent />
      </div>

      {/* payment */}
      {r.payment?.method && (
        <div className="text-xs text-slate-600 bg-slate-50 rounded-xl px-4 py-2 border">
          אמצעי תשלום: <span className="font-medium">{r.payment.method === 'credit_card' ? `כרטיס אשראי${r.payment.card_last_four ? ` ****${r.payment.card_last_four}` : ''}` : r.payment.method === 'cash' ? 'מזומן' : r.payment.method}</span>
          {r.payment.installments > 1 && <span className="mr-3">{r.payment.installments} תשלומים</span>}
        </div>
      )}

      {/* items */}
      {r.items?.length > 0 && (
        <div>
          <div className="font-semibold text-slate-700 mb-1.5">פריטים ({r.items.length})</div>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-100"><th className="text-right p-2 border-b">תיאור</th><th className="text-left p-2 border-b">כמות</th><th className="text-left p-2 border-b">מחיר יחידה</th><th className="text-left p-2 border-b">סה"כ</th></tr></thead>
              <tbody>{r.items.map((it, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="p-2">{it.description}</td>
                  <td className="p-2 text-left">{it.quantity ?? '—'}</td>
                  <td className="p-2 text-left">{it.unit_price != null ? `₪${money2(it.unit_price)}` : '—'}</td>
                  <td className="p-2 text-left font-medium">{it.total != null ? `₪${money2(it.total)}` : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* warnings */}
      {r.warnings?.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1">
          <div className="font-bold text-amber-800 text-xs mb-1">אזהרות</div>
          {r.warnings.map((w, i) => <div key={i} className="text-xs text-amber-700">• {w}</div>)}
        </div>
      )}

      <div className="text-xs text-slate-400 pt-1">{fileName}</div>

      {/* Save to expenses */}
      {!saved && !saveForm && (
        <button
          onClick={openSaveForm}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition text-sm"
        >
          💾 שמור להוצאות
        </button>
      )}

      {saveForm && !saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wider">שמירה להוצאות</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">מדור</label>
              <select value={saveForm.section} onChange={e => setSaveForm(f => ({ ...f, section: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {EXPENSE_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">נושא הוצאה</label>
              <select value={saveForm.item} onChange={e => setSaveForm(f => ({ ...f, item: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">בחר נושא</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
                <option value={vendorName !== '—' ? vendorName : 'אחר'}>{vendorName !== '—' ? vendorName : 'אחר'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">שנה</label>
              <input type="number" value={saveForm.year} onChange={e => setSaveForm(f => ({ ...f, year: Number(e.target.value) }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">חודש</label>
              <select value={saveForm.month} onChange={e => setSaveForm(f => ({ ...f, month: Number(e.target.value) }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={doSave} disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-2 rounded-xl text-sm transition">
              {saving ? 'שומר…' : '✅ אישור ושמירה'}
            </button>
            <button onClick={() => setSaveForm(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm">ביטול</button>
          </div>
        </div>
      )}

      {saved && (
        <div className="rounded-xl bg-emerald-100 text-emerald-800 font-bold text-center py-3 text-sm">
          ✅ נשמר בהצלחה!
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <span className="text-slate-400 text-xs">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
function AmountCard({ label, value, accent }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${accent ? 'bg-slate-800 text-white border-slate-700' : 'bg-white'}`}>
      <div className={`text-xs mb-1 ${accent ? 'text-slate-300' : 'text-slate-500'}`}>{label}</div>
      <div className={`font-bold text-lg ${accent ? 'text-white' : 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
