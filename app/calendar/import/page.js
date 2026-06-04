'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Upload, RefreshCw, CheckCircle, XCircle, Loader2, FileSpreadsheet, ExternalLink } from 'lucide-react';

export default function CalendarImportPage() {
  const [csvText,   setCsvText]   = useState('');
  const [file,      setFile]      = useState(null);
  const [result,    setResult]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult,  setSyncResult]  = useState(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(f, 'UTF-8');
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    return lines.map((line) => {
      const cells = []; let cur = ''; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (inQ && line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
        else if (ch===',' && !inQ) { cells.push(cur); cur=''; }
        else cur += ch;
      }
      cells.push(cur);
      return cells;
    });
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/events/upload-xlsx', { method: 'POST', body: fd });
      const data = await res.json();
      setResult(data);
    } catch (e) { setResult({ error: e.message }); }
    setLoading(false);
  };

  const handleGSheetSync = async () => {
    setSyncLoading(true); setSyncResult(null);
    try {
      const res = await fetch('/api/cron/sync-gsheet', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data);
    } catch (e) { setSyncResult({ error: e.message }); }
    setSyncLoading(false);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-cream-50">
      <header className="border-b border-sky-100 bg-white sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/calendar" className="text-slate-400 hover:text-slate-700 text-sm">← לוח שנה</Link>
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          <h1 style={{ fontFamily:"'Frank Ruhl Libre',serif" }} className="text-xl font-bold">ייבוא לוחות זמנים</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Google Drive AUTO sync */}
        <div className="bg-white border-2 border-emerald-300 rounded-xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0 text-2xl">📂</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-semibold text-lg">סנכרון אוטומטי מ-Google Drive</h2>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">מומלץ</span>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                האפליקציה קוראת את קובץ ה-Excel ישירות מ-Google Drive שלך — כל שעה באופן אוטומטי. <strong>אין צורך בהורדות או העלאות.</strong>
              </p>

              <div className="bg-slate-50 rounded-lg p-4 text-sm mb-4">
                <p className="font-semibold text-slate-700 mb-3">הגדרה חד-פעמית (5 דקות):</p>
                <ol className="space-y-3 text-slate-600">
                  <li className="flex gap-2">
                    <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                    <span>
                      <strong>צור Service Account ב-Google Cloud:</strong><br/>
                      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-sky-600 underline text-xs">console.cloud.google.com</a>
                      {' '}← Credentials ← Create credentials ← Service account ← תן שם ← Done ← לחץ על החשבון שנוצר ← Keys ← Add Key ← JSON ← הורד
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                    <span>
                      <strong>אפשר Drive API:</strong><br/>
                      <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" className="text-sky-600 underline text-xs">Enable Google Drive API</a>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                    <span>
                      <strong>שתף את קובץ ה-Excel עם ה-service account:</strong><br/>
                      פתח את הקובץ ב-Drive ← שתף ← הדבק את כתובת המייל של ה-service account (נגמרת ב-<code className="bg-slate-200 px-1 rounded text-xs">@...iam.gserviceaccount.com</code>) ← צופה
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5">4</span>
                    <span>
                      <strong>הוסף ב-Vercel → Environment Variables:</strong><br/>
                      <code className="bg-slate-200 px-1 rounded text-xs block mt-1">GOOGLE_SERVICE_ACCOUNT_JSON = {"{"} ... {"}"}</code>
                      <span className="text-xs text-slate-400">(תוכן קובץ ה-JSON שהורדת)</span><br/>
                      <code className="bg-slate-200 px-1 rounded text-xs block mt-1">GDRIVE_FILE_ID = 1TEc9HdfQOr9o0bCBcuWzWRd3rr1H76G5</code>
                    </span>
                  </li>
                </ol>
              </div>

              {syncResult && (
                <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-3 ${syncResult.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {syncResult.error
                    ? <><XCircle className="w-4 h-4" />{syncResult.error}</>
                    : <><CheckCircle className="w-4 h-4" />סונכרנו {syncResult.synced} אירועים מתוך {syncResult.total_rows} שורות</>}
                </div>
              )}

              <button onClick={handleGSheetSync} disabled={syncLoading}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                {syncLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                סנכרן עכשיו
              </button>
            </div>
          </div>
        </div>

        {/* CSV upload */}
        <div className="bg-white border border-sky-100 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5 text-sky-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-lg mb-1">ייבוא קובץ Excel / CSV</h2>
              <p className="text-sm text-slate-500 mb-4">
                הורד את הקובץ מ-Google Drive (<strong>הורדה</strong>) ואז העלה כאן ישירות — Excel ו-CSV נתמכים.
              </p>

              <div className="border-2 border-dashed border-sky-200 rounded-lg p-6 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50 transition-colors mb-4"
                onClick={() => document.getElementById('file-input').click()}>
                <Upload className="w-8 h-8 text-sky-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">{file ? file.name : 'לחץ לבחירת קובץ'}</p>
                <p className="text-xs text-slate-400 mt-1">Excel (.xlsx) או CSV — בעברית</p>
                <input id="file-input" type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFile} className="hidden" />
              </div>

              {/* Column format hint */}
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 mb-4">
                <p className="font-medium text-slate-600 mb-1">עמודות נתמכות (שמות בעברית):</p>
                <p><code>תאריך, שעת התחלה, שעת סיום, כותרת, סוג, שם משתתף, טלפון, מיקום, הערות, עובד</code></p>
                <p className="mt-1">סוגים: פגישה / דיון / שיחה / מועד אחרון</p>
              </div>

              {result && (
                <div className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg mb-3 ${result.error ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-sky-700'}`}>
                  {result.error
                    ? <><XCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{result.error}</span></>
                    : <><CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>יובאו {result.imported} אירועים{result.errors?.length ? ` (${result.errors.length} שגיאות)` : ''}</span></>}
                </div>
              )}

              <button onClick={handleImport} disabled={!file || loading}
                className="px-5 py-2.5 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                ייבא אירועים
              </button>
            </div>
          </div>
        </div>

        {/* Apps Script instructions */}
        <div id="apps-script" className="bg-white border border-amber-200 rounded-xl p-6">
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-amber-600" />
            סנכרון בזמן אמת — Google Apps Script
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            הוסף קוד זה לגיליון שלך כדי לשלוח עדכון לאפליקציה בכל פעם שמישהו משנה שורה.
          </p>
          <ol className="text-sm text-slate-600 space-y-1 mb-4 list-decimal list-inside">
            <li>בגיליון: <strong>כלים ← עורך סקריפטים</strong></li>
            <li>מחק כל קוד קיים והדבק את הקוד למטה</li>
            <li>שנה את <code className="bg-slate-100 px-1 rounded">APP_URL</code> לכתובת האתר שלך</li>
            <li>שנה את <code className="bg-slate-100 px-1 rounded">SECRET</code> לערך <code className="bg-slate-100 px-1 rounded">GSHEET_WEBHOOK_SECRET</code> שהגדרת ב-Vercel</li>
            <li>שמור ← הרץ את <code className="bg-slate-100 px-1 rounded">installTrigger</code> פעם אחת</li>
          </ol>
          <pre className="bg-slate-900 text-emerald-300 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed" dir="ltr">{APPS_SCRIPT_CODE}</pre>
        </div>

      </main>
    </div>
  );
}

const APPS_SCRIPT_CODE = `const APP_URL = 'https://YOUR-APP.vercel.app';
const SECRET  = 'your-gsheet-webhook-secret';

function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0].map(String);

  // Collect all rows with data
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  const rows = data
    .filter(r => r.some(c => c !== ''))
    .map((r, i) => {
      const row = {};
      headers.forEach((h, j) => { row[h] = r[j] === '' ? '' : String(r[j]); });
      row.sheet_row_id = String(i + 2);
      return row;
    });

  if (!rows.length) return;

  UrlFetchApp.fetch(APP_URL + '/api/events/gsheet-webhook', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-gsheet-secret': SECRET },
    payload: JSON.stringify({ rows }),
    muteHttpExceptions: true,
  });
}

function installTrigger() {
  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
}`;
