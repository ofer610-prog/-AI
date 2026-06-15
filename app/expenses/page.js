'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';

const MONTHS     = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];
const MONTHS_FULL = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const BUILTIN_SECTIONS = [
  { key: 'office',   label: '🏢 עלויות משרדיות' },
  { key: 'personal', label: '👤 הוצאות אישיות / נכסים' },
  { key: 'ai',       label: '🤖 בינה מלאכותית וכלים דיגיטליים' },
];

const fmtMoney = (n) => Number(n) ? Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 }) : '';

export default function ExpensesPage() {
  const [year, setYear]               = useState(new Date().getFullYear());
  const [entries, setEntries]         = useState([]);
  const [docs, setDocs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [customSections, setCustomSections] = useState([]);
  const [newItem, setNewItem]         = useState({ section: null, name: '' });
  const [newSection, setNewSection]   = useState('');
  const [showAddSection, setShowAddSection] = useState(false);
  const [showReport, setShowReport]   = useState(false);
  const [acctEmail, setAcctEmail]     = useState('');
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sending, setSending]         = useState(false);

  // Invoice panel
  const [invoicePanel, setInvoicePanel] = useState(null); // {section, item, month}
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const invoiceFileRef = useRef(null);

  // Gmail scanner
  const [scanning, setScanning]         = useState(false);
  const [gmailSuggestions, setGmailSuggestions] = useState([]);
  const [showGmailPanel, setShowGmailPanel] = useState(false);
  const [gmailError, setGmailError]     = useState('');

  const fileRef = useRef(null);
  const curMonth = new Date().getMonth() + 1;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/office-expenses?year=${year}`);
      if (res.status === 401) { window.location.href = '/login'; return; }
      const d = await res.json();
      setEntries(d.entries || []);
      setDocs(d.docs || []);
      if (d.accountant_email) setAcctEmail(prev => prev || d.accountant_email);
    } catch {}
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // Build expense matrix
  const matrix = useMemo(() => {
    const m = {};
    for (const e of entries) {
      m[e.section] = m[e.section] || {};
      const item = m[e.section][e.item_name] = m[e.section][e.item_name]
        || { months: {}, notes: e.notes, sort: e.sort_order ?? 9999, is_recurring: e.is_recurring };
      item.months[e.month] = Number(e.amount) || 0;
      if (e.notes && !item.notes) item.notes = e.notes;
      if (e.is_recurring) item.is_recurring = true;
    }
    return m;
  }, [entries]);

  // Build invoice docs lookup: "section|item|month" → docs[]
  const docsMap = useMemo(() => {
    const map = {};
    for (const doc of docs) {
      if (!doc.expense_item || !doc.expense_month_num) continue;
      const key = `${doc.expense_section}|${doc.expense_item}|${doc.expense_month_num}`;
      map[key] = map[key] || [];
      map[key].push(doc);
    }
    return map;
  }, [docs]);

  // Missing invoices for current month
  const missingInvoices = useMemo(() => {
    const missing = [];
    const allSections = getAllSections();
    for (const sec of allSections) {
      const rows = sectionRowsFor(sec.key);
      for (const [name, it] of rows) {
        const amount = it.months[curMonth] || 0;
        if (amount <= 0) {
          // Check if recurring (had amount in previous months) but missing this month
          const hasPrevious = Object.entries(it.months).some(([m, v]) => Number(m) < curMonth && v > 0);
          if (hasPrevious || it.is_recurring) {
            missing.push({ section: sec.key, sectionLabel: sec.label, item: name, amount: 0, type: 'missing_amount' });
          }
          continue;
        }
        const key = `${sec.key}|${name}|${curMonth}`;
        const hasDocs = (docsMap[key] || []).length > 0;
        if (!hasDocs) {
          missing.push({ section: sec.key, sectionLabel: sec.label, item: name, amount, type: 'missing_invoice' });
        }
      }
    }
    return missing;
  }, [matrix, docsMap, curMonth]);

  // All sections (builtin + custom)
  function getAllSections() {
    const known = new Set([...BUILTIN_SECTIONS.map(s => s.key), ...customSections]);
    // Also detect sections from entries
    for (const e of entries) { if (!known.has(e.section)) known.add(e.section); }
    const sections = [...BUILTIN_SECTIONS];
    const builtinKeys = new Set(BUILTIN_SECTIONS.map(s => s.key));
    for (const key of known) {
      if (!builtinKeys.has(key)) sections.push({ key, label: `📁 ${key}` });
    }
    return sections;
  }

  function sectionRowsFor(key) {
    return Object.entries(matrix[key] || {}).sort((a, b) => (a[1].sort ?? 9999) - (b[1].sort ?? 9999));
  }

  const saveCell = async (section, item, month, value) => {
    const amount = parseFloat(String(value).replace(/[₪,\s]/g, '')) || 0;
    setEntries(prev => {
      const rest = prev.filter(e => !(e.section === section && e.item_name === item && e.month === month));
      return [...rest, { section, item_name: item, year, month, amount, notes: matrix[section]?.[item]?.notes, sort_order: matrix[section]?.[item]?.sort }];
    });
    await fetch('/api/office-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, item_name: item, year, month, amount }),
    }).catch(() => {});
  };

  const addItem = async (section) => {
    const name = newItem.name.trim();
    if (!name) return;
    setNewItem({ section: null, name: '' });
    await fetch('/api/office-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, item_name: name, year, month: 1, amount: 0 }),
    }).catch(() => {});
    load();
  };

  const deleteItem = async (section, item) => {
    if (!confirm(`למחוק את "${item}" מכל ${year}?`)) return;
    setEntries(p => p.filter(e => !(e.section === section && e.item_name === item)));
    await fetch(`/api/office-expenses?item=${encodeURIComponent(item)}&section=${section}&year=${year}`, { method: 'DELETE' }).catch(() => {});
  };

  const addSection = async () => {
    const name = newSection.trim();
    if (!name) return;
    setCustomSections(prev => [...prev, name]);
    setNewSection('');
    setShowAddSection(false);
  };

  const uploadExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file); fd.append('year', String(year));
    try {
      const res = await fetch('/api/office-expenses/import', { method: 'POST', body: fd });
      const d = await res.json();
      if (d.ok) alert(`✅ יובאו ${d.items} סעיפים (${d.cells} תאים)`);
      else alert('שגיאה: ' + (d.error || ''));
    } catch { alert('שגיאת רשת'); }
    setUploading(false);
    e.target.value = '';
    load();
  };

  const sendReport = async () => {
    if (!acctEmail.trim()) { alert('הזן מייל רו"ח'); return; }
    setSending(true);
    try {
      const [y, m] = reportMonth.split('-').map(Number);
      const res = await fetch('/api/cron/accountant-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountant_email: acctEmail.trim(), send: true, year: y, month: m }),
      });
      const d = await res.json();
      if (d.ok) { alert(`✅ הדוח נשלח ל-${d.to}`); setShowReport(false); }
      else alert('שגיאה: ' + (d.error || ''));
    } catch { alert('שגיאת רשת'); }
    setSending(false);
  };

  const scanGmail = async () => {
    setScanning(true); setGmailError('');
    try {
      const res = await fetch('/api/expenses/scan-gmail', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { setGmailError(d.error || 'שגיאה'); setScanning(false); return; }
      setGmailSuggestions(d.suggestions || []);
      setShowGmailPanel(true);
    } catch { setGmailError('שגיאת רשת'); }
    setScanning(false);
  };

  const importGmailSuggestion = async (s, section, item, month) => {
    try {
      const res = await fetch('/api/expense-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: `gmail:${s.gmail_id}`,
          file_name: s.subject || 'מייל',
          file_type: 'email',
          amount: s.amount,
          vendor: s.matched_vendor || item,
          description: s.subject,
          doc_date: s.date || new Date().toISOString().slice(0, 10),
          expense_item: item,
          expense_section: section,
          expense_year: year,
          expense_month_num: month,
          gmail_message_id: s.gmail_id,
        }),
      });
      if (res.ok) {
        setGmailSuggestions(prev => prev.filter(x => x.gmail_id !== s.gmail_id));
        load();
      }
    } catch {}
  };

  // Upload invoice file for a specific expense cell
  const uploadInvoiceFile = async (file, section, item, month) => {
    setUploadingInvoice(true);
    try {
      // 1. Upload file
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await fetch('/api/expense-docs/upload', { method: 'POST', body: fd });
      if (!upRes.ok) { alert('שגיאה בהעלאת הקובץ'); setUploadingInvoice(false); return; }
      const { url, name, type } = await upRes.json();

      // 2. Create expense doc record linked to this cell
      await fetch('/api/expense-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: url, file_name: name, file_type: type,
          vendor: item,
          doc_date: `${year}-${String(month).padStart(2,'0')}-01`,
          expense_item: item, expense_section: section,
          expense_year: year, expense_month_num: month,
        }),
      });
      load();
      setInvoicePanel(null);
    } catch { alert('שגיאה'); }
    setUploadingInvoice(false);
  };

  const unlinkDoc = async (docId) => {
    if (!confirm('הסר את הקישור לחשבונית?')) return;
    await fetch('/api/expense-docs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: docId, status: 'pending' }),
    }).catch(() => {});
    // Remove from docs state
    setDocs(prev => prev.filter(d => d.id !== docId));
  };

  const colTotal = (key, month) => sectionRowsFor(key).reduce((s, [, it]) => s + (it.months[month] || 0), 0);
  const rowTotal = (it) => Object.values(it.months).reduce((s, v) => s + v, 0);
  const grandMonth = (m) => getAllSections().reduce((s, sec) => s + colTotal(sec.key, m), 0);

  const allSections = getAllSections();
  const grandTotal = MONTHS.reduce((s, _, i) => s + grandMonth(i + 1), 0);
  const completedMonths = Math.max(1, new Date().getMonth() + 1);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-20">
      {/* ── Header ── */}
      <header className="bg-slate-900 text-white sticky top-12 z-30">
        <div className="max-w-[1500px] mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link href="/command" className="text-slate-400 hover:text-white text-sm">← מרכז שליטה</Link>
          <h1 className="text-xl font-bold">💸 מעקב הוצאות</h1>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm border-0">
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex-1" />

          <button onClick={scanGmail} disabled={scanning}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
            {scanning ? '⏳ סורק…' : '📧 סרוק מיילים'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={uploadExcel} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm px-4 py-2 rounded-xl">
            {uploading ? '⏳ מייבא…' : '⬆️ ייבוא אקסל'}
          </button>
          <button onClick={() => setShowReport(s => !s)}
            className="bg-blue-600 hover:bg-blue-500 text-sm px-4 py-2 rounded-xl">
            📤 דוח לרו"ח
          </button>
        </div>

        {/* Report panel */}
        {showReport && (
          <div className="max-w-[1500px] mx-auto px-5 pb-4">
            <div className="bg-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">מייל רו"ח</label>
                <input type="email" value={acctEmail} onChange={e => setAcctEmail(e.target.value)}
                  placeholder="accountant@example.com" dir="ltr"
                  className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm w-64 border-0" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">חודש הדוח</label>
                <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                  className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm border-0" />
              </div>
              <button onClick={sendReport} disabled={sending}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm px-4 py-2 rounded-lg">
                {sending ? '⏳ שולח…' : 'שלח עכשיו 📤'}
              </button>
              <div className="text-xs text-slate-400 w-full">
                הדוח נשלח כקובץ אקסל מנותח עם סיכום ההוצאות. ב-1 לכל חודש נשלח אוטומטית.
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-[1500px] mx-auto px-5 py-6 space-y-6">
        {loading ? (
          <div className="text-center text-slate-400 py-20 animate-pulse">טוען…</div>
        ) : (
          <>
            {/* ── Missing invoices alert ── */}
            {missingInvoices.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-amber-800 flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    {missingInvoices.length} פריטים דורשים טיפול — {MONTHS_FULL[curMonth - 1]} {year}
                  </h2>
                  <button onClick={scanGmail} disabled={scanning}
                    className="text-xs bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-500 disabled:opacity-50">
                    {scanning ? 'סורק…' : '📧 סרוק מיילים לחשבוניות'}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {missingInvoices.slice(0, 12).map((m, i) => (
                    <div key={i} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                      m.type === 'missing_invoice' ? 'bg-red-50 border border-red-200' : 'bg-amber-100 border border-amber-200'
                    }`}>
                      <span>{m.type === 'missing_invoice' ? '📎' : '🔴'}</span>
                      <span className="font-medium">{m.item}</span>
                      {m.amount > 0 && <span className="text-slate-500">₪{fmtMoney(m.amount)}</span>}
                      <span className="text-xs text-slate-400 mr-auto">
                        {m.type === 'missing_invoice' ? 'חסרה חשבונית' : 'חסר סכום החודש'}
                      </span>
                      {m.type === 'missing_invoice' && (
                        <button onClick={() => setInvoicePanel({ section: m.section, item: m.item, month: curMonth })}
                          className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded hover:bg-red-200">
                          + העלה
                        </button>
                      )}
                    </div>
                  ))}
                  {missingInvoices.length > 12 && (
                    <div className="text-xs text-amber-600 col-span-2 text-center">
                      ועוד {missingInvoices.length - 12} פריטים נוספים…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Gmail suggestions panel ── */}
            {showGmailPanel && gmailSuggestions.length > 0 && (
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-sky-800">📧 {gmailSuggestions.length} חשבוניות נמצאו במייל</h2>
                  <button onClick={() => setShowGmailPanel(false)} className="text-sky-500 text-sm">✕ סגור</button>
                </div>
                <div className="space-y-2">
                  {gmailSuggestions.map((s, i) => (
                    <div key={i} className="bg-white border border-sky-100 rounded-xl p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-800 truncate">{s.subject}</p>
                        <p className="text-xs text-slate-500">{s.from} · {s.date}</p>
                        {s.matched_vendor && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✓ {s.matched_vendor}</span>}
                      </div>
                      {s.amount && <span className="font-bold text-slate-800 text-sm">₪{fmtMoney(s.amount)}</span>}
                      <div className="flex gap-1">
                        {s.matched_vendor && (
                          <button onClick={() => importGmailSuggestion(s, 'office', s.matched_vendor, curMonth)}
                            className="text-xs bg-sky-600 text-white px-2 py-1 rounded hover:bg-sky-700">
                            + קשר להוצאה
                          </button>
                        )}
                        <button onClick={() => setGmailSuggestions(prev => prev.filter((_, j) => j !== i))}
                          className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {gmailSuggestions.length === 0 && showGmailPanel && (
              <div className="bg-slate-100 rounded-xl p-4 text-center text-slate-500 text-sm">
                לא נמצאו חשבוניות חדשות במייל ב-60 הימים האחרונים.
                <button onClick={() => setShowGmailPanel(false)} className="mr-2 text-slate-400 hover:text-slate-600">✕</button>
              </div>
            )}
            {gmailError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{gmailError}</div>
            )}

            {/* ── KPI strip ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SumCard label={`סה"כ ${year}`} value={`₪${fmtMoney(grandTotal) || 0}`} />
              <SumCard label={`${MONTHS_FULL[curMonth - 1]}`} value={`₪${fmtMoney(grandMonth(curMonth)) || 0}`} />
              <SumCard label="ממוצע חודשי" value={`₪${fmtMoney(grandTotal / completedMonths) || 0}`} />
              <SumCard label="חסרות חשבוניות" value={missingInvoices.filter(m => m.type === 'missing_invoice').length}
                highlight={missingInvoices.filter(m => m.type === 'missing_invoice').length > 0} />
            </div>

            {/* ── Expense sections ── */}
            {allSections.map(sec => (
              <ExpenseSection key={sec.key}
                sec={sec} matrix={matrix} docsMap={docsMap} year={year} curMonth={curMonth}
                newItem={newItem} setNewItem={setNewItem}
                addItem={addItem} deleteItem={deleteItem} saveCell={saveCell}
                invoicePanel={invoicePanel} setInvoicePanel={setInvoicePanel}
                uploadInvoiceFile={uploadInvoiceFile} uploadingInvoice={uploadingInvoice}
                invoiceFileRef={invoiceFileRef} unlinkDoc={unlinkDoc}
                colTotal={colTotal} rowTotal={rowTotal}
              />
            ))}

            {/* ── Add custom section ── */}
            <div className="flex justify-center">
              {!showAddSection ? (
                <button onClick={() => setShowAddSection(true)}
                  className="text-sm text-slate-500 hover:text-slate-800 border border-dashed border-slate-300 rounded-xl px-6 py-3 hover:border-slate-500 transition">
                  + הוסף קטגוריה חדשה
                </button>
              ) : (
                <div className="flex gap-2 items-center bg-white border rounded-xl px-4 py-3 shadow-sm">
                  <input autoFocus value={newSection}
                    onChange={e => setNewSection(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setShowAddSection(false); }}
                    placeholder="שם הקטגוריה (למשל: שיווק)"
                    className="border-0 outline-none text-sm w-48" />
                  <button onClick={addSection} className="bg-slate-800 text-white text-sm px-3 py-1.5 rounded-lg">הוסף</button>
                  <button onClick={() => setShowAddSection(false)} className="text-slate-400 text-sm">ביטול</button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── Invoice panel modal ── */}
      {invoicePanel && (
        <InvoiceModal
          section={invoicePanel.section} item={invoicePanel.item} month={invoicePanel.month} year={year}
          docs={docsMap[`${invoicePanel.section}|${invoicePanel.item}|${invoicePanel.month}`] || []}
          uploading={uploadingInvoice}
          onUpload={(file) => uploadInvoiceFile(file, invoicePanel.section, invoicePanel.item, invoicePanel.month)}
          onUnlink={unlinkDoc}
          onClose={() => setInvoicePanel(null)}
        />
      )}
    </div>
  );
}

// ─── Section component ─────────────────────────────────────────────────────

function ExpenseSection({ sec, matrix, docsMap, year, curMonth, newItem, setNewItem, addItem, deleteItem,
  saveCell, invoicePanel, setInvoicePanel, uploadInvoiceFile, uploadingInvoice, invoiceFileRef, unlinkDoc,
  colTotal, rowTotal }) {

  const rows = Object.entries(matrix[sec.key] || {}).sort((a, b) => (a[1].sort ?? 9999) - (b[1].sort ?? 9999));

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-slate-800 text-white font-bold flex items-center justify-between">
        <span>{sec.label}</span>
        <button onClick={() => setNewItem({ section: sec.key, name: '' })}
          className="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded-lg font-normal">
          + סעיף חדש
        </button>
      </div>

      {newItem.section === sec.key && (
        <div className="p-3 bg-emerald-50 flex gap-2">
          <input autoFocus value={newItem.name}
            onChange={e => setNewItem({ section: sec.key, name: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && addItem(sec.key)}
            placeholder="שם הסעיף (למשל: חשמל משרד)"
            className="border rounded-lg px-3 py-1.5 text-sm flex-1" />
          <button onClick={() => addItem(sec.key)}
            className="bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg">הוסף</button>
          <button onClick={() => setNewItem({ section: null, name: '' })}
            className="text-slate-400 text-sm px-2">ביטול</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[1200px]">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-right font-semibold text-xs sticky right-0 bg-slate-100 min-w-[160px]">סעיף</th>
              {MONTHS.map((m, mi) => (
                <th key={m} className={`px-1 py-2 font-semibold text-xs min-w-[64px] ${mi + 1 === curMonth ? 'bg-blue-50 text-blue-700' : ''}`}>
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 font-bold text-xs min-w-[90px] bg-slate-200">שנה</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, it], idx) => (
              <tr key={name} className={`border-b border-slate-100 ${idx % 2 ? 'bg-slate-50/60' : 'bg-white'} hover:bg-blue-50/30`}>
                <td className="px-3 py-1 sticky right-0 bg-inherit font-medium text-slate-700 text-xs whitespace-nowrap" title={it.notes || ''}>
                  {it.is_recurring && <span className="text-blue-400 text-xs ml-1" title="הוצאה קבועה">🔁</span>}
                  {name}
                </td>
                {MONTHS.map((_, mi) => {
                  const mo = mi + 1;
                  const amount = it.months[mo] || 0;
                  const key = `${sec.key}|${name}|${mo}`;
                  const cellDocs = docsMap[key] || [];
                  const isCurrentMonth = mo === curMonth;

                  let invoiceIcon = null;
                  if (amount > 0) {
                    if (cellDocs.length > 0) {
                      invoiceIcon = <span className="text-green-500 cursor-pointer text-xs" title={`${cellDocs.length} חשבונית${cellDocs.length > 1 ? 'ות' : ''}`}
                        onClick={() => setInvoicePanel({ section: sec.key, item: name, month: mo })}>📎</span>;
                    } else {
                      invoiceIcon = <span className="text-red-400 cursor-pointer text-xs" title="חסרה חשבונית — לחץ להעלאה"
                        onClick={() => setInvoicePanel({ section: sec.key, item: name, month: mo })}>⚠️</span>;
                    }
                  } else if (isCurrentMonth) {
                    invoiceIcon = <span className="text-slate-200 cursor-pointer text-xs hover:text-slate-400"
                      onClick={() => setInvoicePanel({ section: sec.key, item: name, month: mo })}>📎</span>;
                  }

                  return (
                    <td key={mi} className={`px-0.5 py-0.5 text-center ${isCurrentMonth ? 'bg-blue-50/40' : ''}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <CellInput value={amount || undefined} onSave={v => saveCell(sec.key, name, mo, v)} />
                        {invoiceIcon}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-bold text-slate-800 bg-slate-100/70 text-xs">
                  {fmtMoney(rowTotal(it)) || '—'}
                </td>
                <td className="text-center">
                  <button onClick={() => deleteItem(sec.key, name)}
                    className="text-slate-300 hover:text-red-500 text-xs px-1" title="מחק סעיף">✕</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={16} className="text-center text-slate-400 py-8 text-sm">
                אין סעיפים — הוסף ידנית או ייבא את קובץ האקסל
              </td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-slate-800 text-white">
              <tr>
                <td className="px-3 py-2 font-bold text-xs sticky right-0 bg-slate-800">סה"כ</td>
                {MONTHS.map((_, mi) => (
                  <td key={mi} className="px-1 py-2 text-center text-xs font-bold">
                    {fmtMoney(colTotal(sec.key, mi + 1)) || '—'}
                  </td>
                ))}
                <td className="px-2 py-2 text-center font-bold bg-slate-900 text-xs">
                  {fmtMoney(MONTHS.reduce((s, _, i) => s + colTotal(sec.key, i + 1), 0))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// ─── Invoice Modal ──────────────────────────────────────────────────────────

function InvoiceModal({ section, item, month, year, docs, uploading, onUpload, onUnlink, onClose }) {
  const fileRef = useRef(null);

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div dir="rtl" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-800">חשבוניות — {item}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <p className="text-sm text-slate-500 mb-4">{MONTHS_FULL[month - 1]} {year}</p>

        {docs.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">אין חשבוניות מצורפות לתא זה</div>
        ) : (
          <div className="space-y-2 mb-4">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3 border">
                <span className="text-2xl">{doc.file_type?.includes('pdf') ? '📄' : doc.file_type === 'email' ? '📧' : '🖼️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{doc.file_name}</p>
                  {doc.amount && <p className="text-xs text-slate-500">₪{Number(doc.amount).toLocaleString('he-IL')}</p>}
                </div>
                {doc.file_url && !doc.file_url.startsWith('gmail:') && (
                  <a href={doc.file_url} target="_blank" rel="noreferrer"
                    className="text-sky-600 text-xs hover:underline">פתח</a>
                )}
                <button onClick={() => onUnlink(doc.id)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />

        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2">
          {uploading ? '⏳ מעלה…' : '📎 העלה חשבונית / קבלה'}
        </button>
        <p className="text-center text-xs text-slate-400 mt-2">תמונה (JPG/PNG) או PDF</p>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function CellInput({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  if (!editing) {
    return (
      <button onClick={() => { setVal(value || ''); setEditing(true); }}
        className={`w-full px-1 py-0.5 rounded text-xs ${value ? 'text-slate-800 font-medium' : 'text-slate-200'} hover:bg-blue-100`}>
        {value ? fmtMoney(value) : '·'}
      </button>
    );
  }
  return (
    <input autoFocus type="text" inputMode="decimal" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { setEditing(false); if (String(val) !== String(value || '')) onSave(val); }}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false); }}
      className="w-16 border border-blue-400 rounded px-1 py-0.5 text-xs text-center" />
  );
}

function SumCard({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl border shadow-sm p-4 ${highlight ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}
