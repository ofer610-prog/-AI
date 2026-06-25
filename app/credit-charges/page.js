'use client';
import { useState, useEffect, useRef } from 'react';

const money = n => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const STATUS_LABEL = {
  pending:   { label: '⚠️ חסרה חשבונית', cls: 'bg-red-100 text-red-800' },
  matched:   { label: '✅ יש חשבונית',   cls: 'bg-green-100 text-green-800' },
  dismissed: { label: 'בוטל',            cls: 'bg-gray-100 text-gray-500' },
};

// ── Reusable charge card ──────────────────────────────────────────────────────
function ChargeCard({ c, onDismiss }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <p className="font-bold text-gray-900 text-lg">{money(c.amount)}</p>
          <p className="text-gray-700 text-sm">{c.vendor}</p>
          <p className="text-xs text-gray-400 mt-1">
            {fmtDate(c.charge_date)}
            {c.card_last4 && ` • כרטיס *${c.card_last4}`}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${STATUS_LABEL[c.alert_status]?.cls || ''}`}>
          {STATUS_LABEL[c.alert_status]?.label}
        </span>
      </div>

      {c.expense_documents && (
        <div className="bg-green-50 rounded-lg p-2 text-xs text-green-700 mb-2">
          📄 חשבונית: {c.expense_documents.vendor} — {money(c.expense_documents.amount || 0)}
          {c.expense_documents.file_url && (
            <a href={c.expense_documents.file_url} target="_blank" rel="noreferrer" className="mr-2 underline">פתח</a>
          )}
        </div>
      )}

      {c.alert_status === 'pending' && onDismiss && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onDismiss(c.id)}
            className="flex-1 text-xs py-2 rounded-lg border border-gray-300 text-gray-600 active:bg-gray-100"
          >
            בטל התראה
          </button>
          <a
            href="/expenses/receipts"
            className="flex-1 text-xs py-2 rounded-lg bg-blue-600 text-white text-center active:bg-blue-700"
          >
            העלה חשבונית
          </a>
        </div>
      )}
    </div>
  );
}

// ── File upload result row (before saving) ───────────────────────────────────
function FileResultRow({ row }) {
  const isMissing   = row.status === 'pending';
  const isDuplicate = row.status === 'duplicate';
  return (
    <div className={`rounded-lg border p-3 ${isMissing ? 'border-red-200 bg-red-50' : isDuplicate ? 'border-gray-200 bg-gray-50' : 'border-green-200 bg-green-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{row.vendor}</p>
          <p className="text-xs text-gray-500">{fmtDate(row.charge_date)}</p>
        </div>
        <div className="text-left shrink-0">
          <p className="font-bold text-sm">{money(row.amount)}</p>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            isMissing   ? 'bg-red-200 text-red-800' :
            isDuplicate ? 'bg-gray-200 text-gray-600' :
                          'bg-green-200 text-green-800'
          }`}>
            {isMissing ? '⚠️ חסרה' : isDuplicate ? '↩ כפול' : '✅ יש'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CreditChargesPage() {
  const [tab, setTab] = useState('file'); // 'sms' | 'file'

  // SMS state
  const [smsText, setSmsText]         = useState('');
  const [parsing, setParsing]         = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [parseError, setParseError]   = useState('');

  // File upload state
  const [file, setFile]               = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [showAllRows, setShowAllRows] = useState(false);
  const fileInputRef = useRef(null);

  // Charges list state
  const [charges, setCharges]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');

  const loadCharges = async (status = filterStatus) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/credit-charges/list?status=${status}`);
      const data = await res.json();
      setCharges(data.charges || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadCharges(); }, []);

  // ── SMS submit ──────────────────────────────────────────────────────────────
  const handleParse = async () => {
    if (!smsText.trim()) return;
    setParsing(true); setParseError(''); setParseResult(null);
    try {
      const res  = await fetch('/api/credit-charges/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sms: smsText }),
      });
      const data = await res.json();
      if (!res.ok) setParseError(data.error || 'שגיאה');
      else { setParseResult(data); setSmsText(''); loadCharges(); }
    } catch { setParseError('שגיאת רשת'); }
    setParsing(false);
  };

  // ── File upload submit ──────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setUploadError(''); setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch('/api/credit-charges/upload-file', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) setUploadError(data.error || 'שגיאה בעיבוד הקובץ');
      else { setUploadResult(data); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; loadCharges(); }
    } catch { setUploadError('שגיאת רשת'); }
    setUploading(false);
  };

  const dismiss = async (id) => {
    await fetch('/api/credit-charges/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, alert_status: 'dismissed' }),
    });
    loadCharges();
  };

  const pendingCount = charges.filter(c => c.alert_status === 'pending').length;

  const displayRows = uploadResult?.rows
    ? (showAllRows ? uploadResult.rows : uploadResult.rows.filter(r => r.status === 'pending'))
    : [];

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">💳 חיובי אשראי ודפי חשבון</h1>
            <p className="text-sm text-gray-500">זיהוי חיובים ללא חשבוניות</p>
          </div>
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
              {pendingCount} חסרים
            </span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* Tab switcher */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
          <button
            onClick={() => setTab('file')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'file' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            📂 קובץ / דף חשבון
          </button>
          <button
            onClick={() => setTab('sms')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'sms' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            📱 הדבק SMS
          </button>
        </div>

        {/* ── FILE UPLOAD TAB ── */}
        {tab === 'file' && (
          <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
            <h2 className="font-semibold text-gray-800">📂 ייבוא קובץ חיובים / דף חשבון</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              העלה קובץ Excel, CSV או PDF שהורדת מאתר הבנק (הפועלים, לאומי, דיסקונט, מזרחי) או מחברת האשראי (ישראכרט, Max, Visa Cal).
              המערכת תזהה אוטומטית את הפורמט, תחשב את כל החיובים ותסמן אלו שאין להם חשבונית.
            </p>

            {/* Drag-and-drop zone */}
            <label
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
                file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx,.ods,.tsv,.pdf"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <>
                  <span className="text-3xl mb-1">📄</span>
                  <p className="font-semibold text-blue-700 text-sm">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                </>
              ) : (
                <>
                  <span className="text-3xl mb-1">⬆️</span>
                  <p className="text-sm text-gray-600">גרור קובץ לכאן או לחץ לבחירה</p>
                  <p className="text-xs text-gray-400 mt-1">CSV, XLS, XLSX, PDF</p>
                </>
              )}
            </label>

            {/* Supported formats hint */}
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-700">פורמטים נתמכים:</p>
              <p>🏦 <strong>דפי חשבון:</strong> הפועלים, לאומי, דיסקונט, מזרחי (עמודות: תאריך, תיאור, חובה)</p>
              <p>💳 <strong>דפי אשראי:</strong> ישראכרט, Max, Visa Cal (עמודות: תאריך עסקה, שם בית עסק, סכום חיוב)</p>
            </div>

            {uploadError && <p className="text-red-600 text-sm">❌ {uploadError}</p>}

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold text-sm disabled:opacity-50 active:bg-blue-700"
            >
              {uploading ? '⏳ מנתח קובץ...' : '🔍 נתח וייבא חיובים'}
            </button>
          </div>
        )}

        {/* File upload result */}
        {tab === 'file' && uploadResult && (
          <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
            {/* Summary */}
            <h3 className="font-bold text-gray-800">📊 תוצאות ניתוח</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xl font-bold text-gray-800">{uploadResult.total}</p>
                <p className="text-xs text-gray-500">סה"כ עסקאות</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2">
                <p className="text-xl font-bold text-red-600">{uploadResult.missing}</p>
                <p className="text-xs text-red-500">חסרות חשבוניות</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-xl font-bold text-green-600">{uploadResult.matched}</p>
                <p className="text-xs text-green-500">תואמות</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xl font-bold text-gray-500">{uploadResult.duplicates}</p>
                <p className="text-xs text-gray-500">כפולות</p>
              </div>
            </div>

            {uploadResult.missing > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-800 mb-1">
                  ⚠️ {uploadResult.missing} חיובים ללא חשבונית
                </p>
                <p className="text-xs text-red-600">יש להשלים חשבוניות לפריטים אלו</p>
              </div>
            )}

            {/* Row list */}
            <div className="space-y-2">
              {displayRows.map((row, i) => <FileResultRow key={i} row={row} />)}
            </div>

            {uploadResult.rows?.length > uploadResult.missing && (
              <button
                onClick={() => setShowAllRows(v => !v)}
                className="text-xs text-blue-600 underline w-full text-center"
              >
                {showAllRows ? 'הצג רק חסרים' : `הצג את כל ${uploadResult.total} העסקאות`}
              </button>
            )}
          </div>
        )}

        {/* ── SMS TAB ── */}
        {tab === 'sms' && (
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h2 className="font-semibold text-gray-800 mb-2">📱 הדבק SMS מהאשראי</h2>
            <p className="text-xs text-gray-500 mb-3">
              קבלת SMS על חיוב? העתק את ההודעה מכל חברת אשראי (ישראכרט, Max, Visa Cal, Amex) והדבק כאן
            </p>
            <textarea
              value={smsText}
              onChange={e => setSmsText(e.target.value)}
              placeholder={`לדוגמה:\nחויבת ב-345.00 ₪ ב-SPOTIFY T.LAviv בתאריך 14/06/26 כרטיס מסתיים ב-9434\n\nאפשר להדביק כמה הודעות ביחד`}
              rows={5}
              className="w-full border rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {parseError && <p className="text-red-600 text-sm mt-2">❌ {parseError}</p>}
            <button
              onClick={handleParse}
              disabled={parsing || !smsText.trim()}
              className="mt-3 w-full bg-blue-600 text-white py-3 rounded-lg font-semibold text-sm disabled:opacity-50 active:bg-blue-700"
            >
              {parsing ? '⏳ מנתח...' : '🔍 נתח וזהה חיוב'}
            </button>
          </div>
        )}

        {/* SMS parse result */}
        {tab === 'sms' && parseResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <h3 className="font-semibold text-green-800 mb-2">✅ זוהו {parseResult.count} חיובים</h3>
            {parseResult.parsed.map((p, i) => (
              <div key={i} className="bg-white rounded-lg p-3 mb-2 border border-green-100">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">{money(p.amount)}</p>
                    <p className="text-sm text-gray-600">{p.vendor}</p>
                    <p className="text-xs text-gray-400">{fmtDate(p.charge_date)} {p.card_last4 && `• *${p.card_last4}`}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${p.matched ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {p.matched ? '✅ יש חשבונית' : '⚠️ חסרה חשבונית'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CHARGES LIST (shared) ── */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-800">📋 כל החיובים</h2>

          {/* Filter */}
          <div className="flex gap-2">
            {['pending', 'matched', 'dismissed'].map(s => (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); loadCharges(s); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {s === 'pending' ? '⚠️ חסרים' : s === 'matched' ? '✅ תואמים' : '🚫 בוטלו'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400">טוען...</div>
          ) : charges.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {filterStatus === 'pending' ? (
                <><p className="text-4xl mb-2">✅</p><p>כל החיובים תועדו!</p></>
              ) : (
                <p>אין חיובים להצגה</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {charges.map(c => <ChargeCard key={c.id} c={c} onDismiss={dismiss} />)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
