'use client';

import { useState, useRef, useCallback } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const BANKS = [
  { value: 'hapoalim',  label: 'פועלים' },
  { value: 'leumi',     label: 'לאומי' },
  { value: 'discount',  label: 'דיסקונט' },
  { value: 'mizrahi',   label: 'מזרחי' },
  { value: 'generic',   label: 'כל בנק' },
];

const CATEGORIES = [
  { value: 'רכב',      label: 'רכב' },
  { value: 'תקשורת',   label: 'תקשורת' },
  { value: 'תוכנה',    label: 'תוכנה' },
  { value: 'שכירות',   label: 'שכירות' },
  { value: 'ביטוח',    label: 'ביטוח' },
  { value: 'ספריות',   label: 'ספריות' },
  { value: 'אחר',      label: 'אחר' },
];

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

/**
 * Try to detect the column indices for: date, description, credit, debit, balance.
 * Returns an object: { dateIdx, descIdx, creditIdx, debitIdx, balanceIdx }
 * Indices that cannot be found are set to -1.
 */
function detectColumns(headers) {
  const h = headers.map(s => s.trim().toLowerCase());

  const find = (...terms) => {
    for (const t of terms) {
      const i = h.findIndex(c => c.includes(t));
      if (i !== -1) return i;
    }
    return -1;
  };

  return {
    dateIdx:    find('date', 'תאריך', 'תאריך ערך', 'תאריך עסקה', 'value date'),
    descIdx:    find('description', 'תיאור', 'פרטים', 'details', 'narrative', 'reference', 'payee'),
    creditIdx:  find('credit', 'זכות', 'זיכוי', 'הכנסה', 'income', 'deposit'),
    debitIdx:   find('debit', 'חובה', 'חיוב', 'הוצאה', 'charge', 'withdrawal'),
    balanceIdx: find('balance', 'יתרה', 'יתרה לאחר פעולה', 'running balance'),
    amountIdx:  find('amount', 'סכום'), // generic fallback
  };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text, bank) {
  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Skip empty lines and find header row
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length < 2) return [];

  // Try to find the header row (heuristic: first row with recognizable column names)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, nonEmpty.length); i++) {
    const cols = parseCSVLine(nonEmpty[i]).map(s => s.toLowerCase());
    if (
      cols.some(c =>
        c.includes('date') || c.includes('תאריך') ||
        c.includes('credit') || c.includes('זכות') ||
        c.includes('debit') || c.includes('חובה') ||
        c.includes('amount') || c.includes('סכום') ||
        c.includes('description') || c.includes('תיאור')
      )
    ) {
      headerIdx = i;
      break;
    }
  }

  const rawHeaders = parseCSVLine(nonEmpty[headerIdx]);
  const cols = detectColumns(rawHeaders);

  const transactions = [];

  for (let i = headerIdx + 1; i < nonEmpty.length; i++) {
    const cells = parseCSVLine(nonEmpty[i]);
    if (cells.length < 2) continue;

    const get = (idx) => (idx !== -1 && idx < cells.length ? cells[idx].replace(/[₪,\s]/g, '').trim() : '');
    const getStr = (idx) => (idx !== -1 && idx < cells.length ? cells[idx].trim() : '');

    const rawDate = getStr(cols.dateIdx);
    const rawDesc = getStr(cols.descIdx);
    let rawCredit = get(cols.creditIdx);
    let rawDebit  = get(cols.debitIdx);
    const rawBalance = get(cols.balanceIdx);

    // Generic fallback: if no separate credit/debit columns, use amount column
    // Negative amounts → debit, positive → credit
    if (rawCredit === '' && rawDebit === '' && cols.amountIdx !== -1) {
      const amt = parseFloat(get(cols.amountIdx));
      if (!isNaN(amt)) {
        if (amt < 0) rawDebit = String(Math.abs(amt));
        else rawCredit = String(amt);
      }
    }

    const credit  = parseFloat(rawCredit)  || 0;
    const debit   = parseFloat(rawDebit)   || 0;
    const balance = parseFloat(rawBalance) || null;

    // Skip rows with no meaningful data
    if (!rawDate && !rawDesc && credit === 0 && debit === 0) continue;

    // Normalise date to DD/MM/YYYY
    let date = rawDate;
    // Handle YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
      const parts = date.substring(0, 10).split('-');
      date = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    transactions.push({
      id: `${i}-${rawDate}-${rawDesc}`,
      date,
      description: rawDesc || '—',
      credit,
      debit,
      balance,
      category: '',
    });
  }

  return transactions;
}

// ─── Helper: download CSV ─────────────────────────────────────────────────────

function exportToCSV(transactions) {
  const header = 'תאריך,תיאור,חובה,זכות,יתרה,קטגוריה';
  const rows = transactions.map(t =>
    [
      t.date,
      `"${t.description.replace(/"/g, '""')}"`,
      t.debit  || '',
      t.credit || '',
      t.balance != null ? t.balance : '',
      t.category || '',
    ].join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bank-transactions.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CategoryPicker({ current, onSelect, onClose }) {
  return (
    <div className="absolute z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-2 flex flex-wrap gap-1 min-w-[220px]">
      {CATEGORIES.map(cat => (
        <button
          key={cat.value}
          onClick={() => { onSelect(cat.value); onClose(); }}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors
            ${current === cat.value
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700'
            }`}
        >
          {cat.label}
        </button>
      ))}
      {current && (
        <button
          onClick={() => { onSelect(''); onClose(); }}
          className="px-3 py-1 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
        >
          נקה
        </button>
      )}
    </div>
  );
}

function SummaryBar({ transactions }) {
  const totalDebit  = transactions.reduce((s, t) => s + t.debit,  0);
  const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
  const categorized = transactions.filter(t => t.category).length;

  const fmt = n => n.toLocaleString('he-IL', { maximumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <p className="text-xs text-slate-500 mb-1">סה״כ עסקאות</p>
        <p className="text-2xl font-bold text-slate-800">{transactions.length}</p>
        <p className="text-xs text-slate-400 mt-1">{categorized} מסווגות</p>
      </div>
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <p className="text-xs text-slate-500 mb-1">סה״כ חובה</p>
        <p className="text-2xl font-bold text-red-600">₪{fmt(totalDebit)}</p>
      </div>
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <p className="text-xs text-slate-500 mb-1">סה״כ זכות</p>
        <p className="text-2xl font-bold text-green-600">₪{fmt(totalCredit)}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BankImportPage() {
  const [selectedBank, setSelectedBank] = useState('generic');
  const [transactions, setTransactions] = useState([]);
  const [fileName, setFileName]         = useState('');
  const [error, setError]               = useState('');
  const [openPickerIdx, setOpenPickerIdx] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [saveResult, setSaveResult]     = useState(null);
  const fileRef = useRef(null);

  // Close picker when clicking outside
  const handleContainerClick = useCallback((e) => {
    if (!e.target.closest('[data-picker]')) {
      setOpenPickerIdx(null);
    }
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSaveResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const parsed = parseCSV(text, selectedBank);
        if (parsed.length === 0) {
          setError('לא נמצאו עסקאות בקובץ. בדוק שהקובץ הוא ייצוא CSV תקין מהבנק.');
        } else {
          setTransactions(parsed);
        }
      } catch (err) {
        setError('שגיאה בפענוח הקובץ: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const setCategory = (idx, category) => {
    setTransactions(prev =>
      prev.map((t, i) => (i === idx ? { ...t, category } : t))
    );
  };

  const handleSave = async () => {
    const categorized = transactions.filter(t => t.category);
    if (categorized.length === 0) {
      setError('יש לסווג לפחות עסקה אחת לפני השמירה.');
      return;
    }
    setSaving(true);
    setSaveResult(null);
    setError('');

    try {
      const res = await fetch('/api/bank-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: categorized, bank: selectedBank }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאת שרת');
      setSaveResult(data);
    } catch (err) {
      setError('שגיאה בשמירה: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const fmt = n => n
    ? Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })
    : '—';

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-6" onClick={handleContainerClick}>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-1">ייבוא דפי בנק</h1>
          <p className="text-slate-500 text-sm">העלה קובץ CSV מהבנק, סווג עסקאות ושמור להוצאות</p>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">בחר בנק והעלה קובץ</h2>
          <div className="flex flex-wrap gap-4 items-end">

            {/* Bank selector */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600 font-medium">בנק</label>
              <select
                value={selectedBank}
                onChange={e => setSelectedBank(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {BANKS.map(b => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>

            {/* File upload */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600 font-medium">קובץ CSV</label>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {fileName ? fileName : 'בחר קובץ'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Format hint */}
            <p className="text-xs text-slate-400 self-end pb-2">
              תומך בפועלים · לאומי · דיסקונט · מזרחי · וכל פורמט כללי
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Save result */}
        {saveResult && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-4 text-sm">
            נשמרו {saveResult.imported} עסקאות בהצלחה
            {saveResult.skipped > 0 && ` · ${saveResult.skipped} דולגו`}
          </div>
        )}

        {/* Transactions */}
        {transactions.length > 0 && (
          <>
            <SummaryBar transactions={transactions} />

            {/* Action bar */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <button
                onClick={() => exportToCSV(transactions)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                ייצא לגיליון CSV
              </button>

              <button
                onClick={handleSave}
                disabled={saving || transactions.filter(t => t.category).length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    שומר...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M5 13l4 4L19 7" />
                    </svg>
                    שמור לבסיס נתונים
                  </>
                )}
              </button>

              <span className="text-xs text-slate-400 self-center">
                {transactions.filter(t => t.category).length} עסקאות מסווגות מתוך {transactions.length}
              </span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">תאריך</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">תיאור</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">חובה</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">זכות</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">יתרה</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">סיווג</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, idx) => (
                      <tr
                        key={t.id}
                        className={`border-b border-slate-100 hover:bg-slate-50 transition-colors
                          ${t.category ? 'bg-blue-50/40' : ''}`}
                      >
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap font-mono text-xs">
                          {t.date || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-800 max-w-xs">
                          <span className="line-clamp-2">{t.description}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {t.debit > 0
                            ? <span className="text-red-600 font-medium">₪{fmt(t.debit)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {t.credit > 0
                            ? <span className="text-green-600 font-medium">₪{fmt(t.credit)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 text-xs">
                          {t.balance != null ? `₪${fmt(t.balance)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="relative" data-picker>
                            <button
                              onClick={() => setOpenPickerIdx(openPickerIdx === idx ? null : idx)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors
                                ${t.category
                                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                                }`}
                            >
                              {t.category || 'סווג'}
                            </button>

                            {openPickerIdx === idx && (
                              <CategoryPicker
                                current={t.category}
                                onSelect={(cat) => setCategory(idx, cat)}
                                onClose={() => setOpenPickerIdx(null)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {transactions.length === 0 && !error && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-16 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-slate-400 text-sm">העלה קובץ CSV כדי לראות את העסקאות</p>
            <p className="text-slate-300 text-xs mt-1">ייצא את דף הבנק מהאתר של הבנק בפורמט CSV</p>
          </div>
        )}
      </div>
    </div>
  );
}
