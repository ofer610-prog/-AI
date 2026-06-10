'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

const MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const SECTIONS = [
  { key: 'office', label: '🏢 עלויות משרדיות' },
  { key: 'personal', label: '👤 הוצאות אישיות / נכסים' },
];
const fmtMoney = (n) => Number(n) ? Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 }) : '';

export default function ExpensesPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newItem, setNewItem] = useState({ section: null, name: '' });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/office-expenses?year=${year}`);
      if (res.status === 401) { window.location.href = '/login'; return; }
      const d = await res.json();
      setEntries(d.entries || []);
    } catch {}
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // Build matrix: section → item → {months: {1: amt}, notes}
  const matrix = {};
  for (const e of entries) {
    matrix[e.section] = matrix[e.section] || {};
    const item = matrix[e.section][e.item_name] = matrix[e.section][e.item_name]
      || { months: {}, notes: e.notes, sort: e.sort_order ?? 9999 };
    item.months[e.month] = Number(e.amount) || 0;
    if (e.notes && !item.notes) item.notes = e.notes;
  }

  const saveCell = async (section, item, month, value) => {
    const amount = parseFloat(String(value).replace(/[₪,\s]/g, '')) || 0;
    setEntries((prev) => {
      const rest = prev.filter((e) => !(e.section === section && e.item_name === item && e.month === month));
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
    setEntries((p) => p.filter((e) => !(e.section === section && e.item_name === item)));
    await fetch(`/api/office-expenses?item=${encodeURIComponent(item)}&section=${section}&year=${year}`, { method: 'DELETE' }).catch(() => {});
  };

  const uploadExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', String(year));
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

  const sectionRows = (key) => Object.entries(matrix[key] || {})
    .sort((a, b) => (a[1].sort ?? 9999) - (b[1].sort ?? 9999));

  const colTotal = (key, month) => sectionRows(key).reduce((s, [, it]) => s + (it.months[month] || 0), 0);
  const rowTotal = (it) => Object.values(it.months).reduce((s, v) => s + v, 0);
  const grandMonth = (m) => SECTIONS.reduce((s, sec) => s + colTotal(sec.key, m), 0);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-slate-900 text-white sticky top-0 z-30">
        <div className="max-w-[1500px] mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link href="/command" className="text-slate-400 hover:text-white text-sm">← מרכז שליטה</Link>
          <h1 className="text-xl font-bold">💸 מעקב הוצאות</h1>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm border-0">
            {[year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className="flex-1" />
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={uploadExcel} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm px-4 py-2 rounded-xl">
            {uploading ? '⏳ מייבא…' : '⬆️ ייבוא אקסל'}
          </button>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-5 py-6 space-y-8">
        {loading ? (
          <div className="text-center text-slate-400 py-20 animate-pulse">טוען…</div>
        ) : (
          <>
            {/* Yearly summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Sum label={`סה"כ ${year}`} value={`₪${fmtMoney(MONTHS.reduce((s, _, i) => s + grandMonth(i + 1), 0)) || 0}`} />
              <Sum label="החודש הנוכחי" value={`₪${fmtMoney(grandMonth(new Date().getMonth() + 1)) || 0}`} />
              <Sum label="ממוצע חודשי" value={`₪${fmtMoney(MONTHS.reduce((s, _, i) => s + grandMonth(i + 1), 0) / Math.max(1, new Date().getMonth() + 1)) || 0}`} />
              <Sum label="סעיפים במעקב" value={SECTIONS.reduce((s, sec) => s + sectionRows(sec.key).length, 0)} />
            </div>

            {SECTIONS.map((sec) => (
              <section key={sec.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                      onChange={(e) => setNewItem({ section: sec.key, name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && addItem(sec.key)}
                      placeholder="שם הסעיף (למשל: חשמל משרד)"
                      className="border rounded-lg px-3 py-1.5 text-sm flex-1" />
                    <button onClick={() => addItem(sec.key)}
                      className="bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg">הוסף</button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[1100px]">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-right font-semibold text-xs sticky right-0 bg-slate-100 min-w-[160px]">סעיף</th>
                        {MONTHS.map((m) => <th key={m} className="px-1 py-2 font-semibold text-xs min-w-[72px]">{m}</th>)}
                        <th className="px-2 py-2 font-bold text-xs min-w-[90px] bg-slate-200">שנה</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionRows(sec.key).map(([name, it], idx) => (
                        <tr key={name} className={`border-b border-slate-100 ${idx % 2 ? 'bg-slate-50/60' : 'bg-white'} hover:bg-blue-50/40`}>
                          <td className="px-3 py-1 sticky right-0 bg-inherit font-medium text-slate-700 text-xs whitespace-nowrap" title={it.notes || ''}>
                            {name}{it.notes && <span className="text-slate-300"> ℹ️</span>}
                          </td>
                          {MONTHS.map((_, mi) => (
                            <td key={mi} className="px-0.5 py-0.5 text-center">
                              <CellInput value={it.months[mi + 1]} onSave={(v) => saveCell(sec.key, name, mi + 1, v)} />
                            </td>
                          ))}
                          <td className="px-2 py-1 text-center font-bold text-slate-800 bg-slate-100/70">
                            {fmtMoney(rowTotal(it)) || '—'}
                          </td>
                          <td className="text-center">
                            <button onClick={() => deleteItem(sec.key, name)}
                              className="text-slate-300 hover:text-red-500 text-xs px-1" title="מחק סעיף">✕</button>
                          </td>
                        </tr>
                      ))}
                      {sectionRows(sec.key).length === 0 && (
                        <tr><td colSpan={15} className="text-center text-slate-400 py-8 text-sm">
                          אין סעיפים — הוסף ידנית או ייבא את קובץ האקסל
                        </td></tr>
                      )}
                    </tbody>
                    {sectionRows(sec.key).length > 0 && (
                      <tfoot className="bg-slate-800 text-white">
                        <tr>
                          <td className="px-3 py-2 font-bold text-xs sticky right-0 bg-slate-800">סה"כ</td>
                          {MONTHS.map((_, mi) => (
                            <td key={mi} className="px-1 py-2 text-center text-xs font-bold">
                              {fmtMoney(colTotal(sec.key, mi + 1)) || '—'}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center font-bold bg-slate-900">
                            {fmtMoney(MONTHS.reduce((s, _, i) => s + colTotal(sec.key, i + 1), 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

function CellInput({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  if (!editing) {
    return (
      <button onClick={() => { setVal(value || ''); setEditing(true); }}
        className={`w-full px-1 py-1 rounded text-xs ${value ? 'text-slate-800' : 'text-slate-200'} hover:bg-blue-100`}>
        {value ? fmtMoney(value) : '·'}
      </button>
    );
  }
  return (
    <input autoFocus type="text" inputMode="decimal" value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { setEditing(false); if (String(val) !== String(value || '')) onSave(val); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-16 border border-blue-400 rounded px-1 py-0.5 text-xs text-center" />
  );
}

const Sum = ({ label, value }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
    <div className="text-xs text-slate-400 mb-1">{label}</div>
    <div className="text-xl font-bold text-slate-800">{value}</div>
  </div>
);
