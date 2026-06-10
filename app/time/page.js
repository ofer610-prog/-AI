'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const fmtDur = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}ש' ${m}ד'` : `${m}ד'`;
};
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '';

export default function TimePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [allUsers, setAllUsers] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date, mine: allUsers ? 'false' : 'true' });
      const res = await fetch(`/api/time-entries?${params}`);
      if (res.status === 401) { window.location.href = '/login'; return; }
      const d = await res.json();
      setEntries(d.entries || []);
    } catch {}
    setLoading(false);
  }, [date, allUsers]);

  useEffect(() => { load(); }, [load]);

  // Navigate days
  const shift = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  // Group by user
  const byUser = {};
  for (const e of entries.filter(e => e.ended_at)) {
    const name = e.profiles?.full_name || 'לא ידוע';
    if (!byUser[name]) byUser[name] = [];
    byUser[name].push(e);
  }

  const totalMin = entries
    .filter(e => e.ended_at)
    .reduce((s, e) => s + Math.floor((new Date(e.ended_at) - new Date(e.started_at)) / 60000), 0);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-teal-800 text-white sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="text-teal-200 hover:text-white text-sm">← תפריט</Link>
          <h1 className="text-xl font-bold">⏱ דוח שעות עבודה</h1>
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={allUsers} onChange={e => setAllUsers(e.target.checked)}
              className="rounded" />
            כל הצוות
          </label>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        {/* Date nav */}
        <div className="flex items-center gap-3">
          <button onClick={() => shift(-1)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">←</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-sm" />
          <button onClick={() => shift(1)} disabled={date >= today}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">→</button>
          <button onClick={() => setDate(today)} className="text-xs text-teal-700 underline">היום</button>
          <div className="flex-1" />
          {!loading && (
            <span className="font-bold text-teal-800 text-lg">{fmtDur(totalMin)} סה"כ</span>
          )}
        </div>

        {loading ? (
          <div className="text-center text-slate-400 py-12 animate-pulse">טוען...</div>
        ) : Object.keys(byUser).length === 0 ? (
          <div className="text-center text-slate-400 py-12 bg-white rounded-2xl border">
            <div className="text-4xl mb-3">⏱</div>
            <div className="font-medium">אין רשומות ליום זה</div>
            <div className="text-sm mt-1">לחץ על הכפתור הירוק כדי להתחיל מעקב</div>
          </div>
        ) : (
          Object.entries(byUser).map(([name, ents]) => {
            const userMin = ents.reduce((s, e) => s + Math.floor((new Date(e.ended_at) - new Date(e.started_at)) / 60000), 0);
            return (
              <section key={name} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-800 text-white flex items-center justify-between">
                  <span className="font-bold">{name}</span>
                  <span className="font-mono text-teal-300">{fmtDur(userMin)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs">
                      <th className="px-4 py-2 text-right font-medium">תיק</th>
                      <th className="px-4 py-2 text-right font-medium">תיאור</th>
                      <th className="px-4 py-2 text-right font-medium">שעת התחלה</th>
                      <th className="px-4 py-2 text-right font-medium">שעת סיום</th>
                      <th className="px-4 py-2 text-right font-medium">משך</th>
                      <th className="px-4 py-2 text-center font-medium">לחיוב</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ents.map(e => {
                      const min = Math.floor((new Date(e.ended_at) - new Date(e.started_at)) / 60000);
                      return (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-600 text-xs">
                            {e.matters?.case_number || e.matters?.title || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{e.description || '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{fmtTime(e.started_at)}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{fmtTime(e.ended_at)}</td>
                          <td className="px-4 py-2.5 font-bold text-teal-700 font-mono">{fmtDur(min)}</td>
                          <td className="px-4 py-2.5 text-center">{e.billable ? '✓' : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-teal-50">
                      <td colSpan={4} className="px-4 py-2 text-right text-xs text-teal-700 font-medium">סה"כ</td>
                      <td className="px-4 py-2 font-bold text-teal-800 font-mono">{fmtDur(userMin)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
