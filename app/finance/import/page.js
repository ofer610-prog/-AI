'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Upload, Eye, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

const fmtMoney = (n) => (n == null ? '—' : `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`);
const fmtDate = (d) => d || '—';

const STATUS_LABELS = {
  draft: 'טיוטה', sent: 'נשלחה', paid: 'שולמה',
  overdue: 'פיגור', open: 'פתוחה', cancelled: 'בוטלה',
};

export default function ImportInvoicesPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(''); // 'preview' | 'import'
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const onFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setPreview(null);
    setResult(null);
    setError('');
  };

  const send = async (isPreview) => {
    if (!file) { setError('יש לבחור קובץ אקסל'); return; }
    setError('');
    setResult(null);
    setLoading(true);
    setMode(isPreview ? 'preview' : 'import');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const url = `/api/invoices/import-excel${isPreview ? '?preview=true' : ''}`;
      const res = await fetch(url, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'שגיאה בעיבוד הקובץ');
        setPreview(null);
      } else if (isPreview) {
        setPreview(data);
      } else {
        setResult(data);
        setPreview(null);
      }
    } catch (e) {
      setError('שגיאה בתקשורת עם השרת');
    }
    setLoading(false);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="border-b border-sky-100 bg-white sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/finance" className="text-slate-400 hover:text-slate-700 text-sm ml-2">← כספים</Link>
            <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-2xl font-bold">ייבוא חשבוניות מקליגל</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Instructions */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 text-sm text-slate-700 leading-relaxed">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-sky-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-slate-800 mb-1">הוראות</p>
              <p>ייצא דוח חשבוניות מקליגל (הפקת דוחות אקסל), ואז העלה את הקובץ כאן.</p>
              <p className="text-slate-500 mt-1">המערכת תזהה אוטומטית את העמודות (מספר חשבונית, לקוח, תאריך, סכום ועוד). מומלץ ללחוץ על "תצוגה מקדימה" כדי לוודא את הזיהוי לפני הייבוא.</p>
            </div>
          </div>
        </div>

        {/* Upload box */}
        <div className="bg-white border border-sky-100 rounded-xl p-6 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChange}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-sky-200 rounded-lg p-8 text-center cursor-pointer hover:bg-sky-50/50"
          >
            <Upload className="w-8 h-8 mx-auto text-sky-400 mb-2" />
            {file ? (
              <p className="text-slate-800 font-medium">{file.name}</p>
            ) : (
              <p className="text-slate-500">לחץ לבחירת קובץ אקסל (‎.xlsx / .xls)</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => send(true)}
              disabled={loading || !file}
              className="px-4 py-2 border border-sky-300 text-slate-700 text-sm rounded-md hover:bg-sky-50 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && mode === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              תצוגה מקדימה
            </button>
            <button
              onClick={() => send(false)}
              disabled={loading || !file}
              className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md hover:bg-slate-900 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && mode === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              ייבא חשבוניות
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Import result summary */}
        {result && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold">
              <CheckCircle className="w-5 h-5" />
              הייבוא הושלם בהצלחה
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <SummaryStat label="יובאו" value={result.imported} color="text-emerald-700" />
              <SummaryStat label="דולגו (קיימות)" value={result.skipped} color="text-amber-700" />
              <SummaryStat label="נותחו" value={result.parsed_rows} color="text-slate-700" />
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="bg-white border border-red-100 rounded-md p-3">
                <p className="text-sm font-semibold text-red-700 mb-1">שגיאות ({result.errors.length}):</p>
                <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-auto list-disc pr-4">
                  {result.errors.map((er, i) => <li key={i}>{er}</li>)}
                </ul>
              </div>
            )}
            <Link href="/finance/invoices" className="inline-block text-sm text-sky-600 hover:text-sky-800">
              צפה בכל החשבוניות ←
            </Link>
          </div>
        )}

        {/* Preview table */}
        {preview && (
          <PreviewTable preview={preview} />
        )}
      </main>
    </div>
  );
}

function SummaryStat({ label, value, color }) {
  return (
    <div className="bg-white border border-sky-100 rounded-lg py-3">
      <div className={`text-2xl font-bold ${color}`}>{value ?? 0}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function PreviewTable({ preview }) {
  const rows = preview.preview || [];
  const cols = preview.detected_columns || {};

  return (
    <div className="bg-white border border-sky-100 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-sky-100">
        <h2 className="font-semibold text-slate-800 text-lg">תצוגה מקדימה</h2>
        <p className="text-xs text-slate-500 mt-1">
          זוהו {preview.parsed_rows} שורות. מוצגות {rows.length} הראשונות. ודא את הזיהוי לפני הייבוא.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {Object.entries(cols).map(([field, header]) => (
            <span key={field} className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2 py-1 rounded">
              {FIELD_LABELS[field] || field}: <span className="font-medium">{header}</span>
            </span>
          ))}
        </div>
      </div>
      {!rows.length ? (
        <div className="p-8 text-center text-slate-400">אין שורות להצגה</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-sky-100">
              <tr>
                <Th>מספר חשבונית</Th>
                <Th>לקוח</Th>
                <Th>תאריך</Th>
                <Th>סטטוס</Th>
                <Th align="left">לפני מע״מ</Th>
                <Th align="left">מע״מ</Th>
                <Th align="left">סה״כ</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-sky-50 hover:bg-sky-50/50">
                  <Td className="text-slate-600">{r.invoice_number || '—'}</Td>
                  <Td className="font-medium">{r.client_name || '—'}</Td>
                  <Td>{fmtDate(r.issue_date)}</Td>
                  <Td>{STATUS_LABELS[r.status] || r.status}</Td>
                  <Td align="left">{fmtMoney(r.subtotal)}</Td>
                  <Td align="left">{fmtMoney(r.vat_amount)}</Td>
                  <Td align="left" className="font-semibold">{fmtMoney(r.total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const FIELD_LABELS = {
  invoice_number: 'מספר חשבונית',
  client_name: 'לקוח',
  issue_date: 'תאריך הפקה',
  due_date: 'תאריך פירעון',
  vat: 'מע״מ',
  total: 'סה״כ',
  subtotal: 'לפני מע״מ',
  status: 'סטטוס',
  notes: 'הערות',
};

const Th = ({ children, align = 'right' }) => (
  <th className={`px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-${align}`}>{children}</th>
);
const Td = ({ children, align = 'right', className = '' }) => (
  <td className={`px-4 py-3 text-sm text-slate-800 text-${align} ${className}`}>{children}</td>
);
