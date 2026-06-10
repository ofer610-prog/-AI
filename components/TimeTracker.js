'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const fmtDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const fmtMin = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}ש' ${m}ד'`;
  return `${m}ד'`;
};

export default function TimeTracker() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);   // active time entry
  const [entries, setEntries] = useState([]);
  const [matters, setMatters] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [desc, setDesc] = useState('');
  const [matterId, setMatterId] = useState('');
  const [saving, setSaving] = useState(false);
  const tickRef = useRef(null);

  const today = () => new Date().toISOString().slice(0, 10);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await fetch(`/api/time-entries?date=${today()}`);
      if (!res.ok) return;
      const d = await res.json();
      setEntries(d.entries || []);
      setActive(d.active || null);
      if (d.active) {
        const sec = Math.floor((Date.now() - new Date(d.active.started_at)) / 1000);
        setElapsed(sec);
      } else {
        setElapsed(0);
      }
    } catch {}
  }, []);

  const loadMatters = useCallback(async () => {
    if (matters.length > 0) return;
    try {
      const res = await fetch('/api/matters?limit=100');
      if (!res.ok) return;
      const d = await res.json();
      setMatters(d.matters || d || []);
    } catch {}
  }, [matters.length]);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 30_000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (active) {
      tickRef.current = setInterval(() => {
        setElapsed(s => s + 1);
      }, 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [active]);

  const start = async () => {
    setSaving(true);
    try {
      await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, matter_id: matterId || null }),
      });
      setDesc('');
      await load();
    } catch {}
    setSaving(false);
  };

  const stop = async () => {
    setSaving(true);
    try {
      await fetch('/api/time-entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stop: true }),
      });
      await load();
    } catch {}
    setSaving(false);
  };

  const deleteEntry = async (id) => {
    try {
      await fetch(`/api/time-entries?id=${id}`, { method: 'DELETE' });
      await load();
    } catch {}
  };

  const todayTotal = entries
    .filter(e => e.ended_at)
    .reduce((s, e) => {
      const sec = Math.floor((new Date(e.ended_at) - new Date(e.started_at)) / 1000);
      return s + sec;
    }, 0);

  const isActive = Boolean(active);

  return (
    <div className="fixed bottom-20 left-4 z-50" dir="rtl">
      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) loadMatters(); }}
        className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-white text-sm font-bold transition-all ${
          isActive
            ? 'bg-green-600 animate-pulse hover:bg-green-700'
            : 'bg-slate-700 hover:bg-slate-800'
        }`}
        title="מעקב שעות"
      >
        <span>⏱</span>
        {isActive ? (
          <span className="font-mono">{fmtDuration(elapsed)}</span>
        ) : (
          <span>{todayTotal > 0 ? fmtMin(todayTotal) : 'שעות'}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute bottom-12 left-0 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
            <span className="font-bold text-sm">⏱ מעקב שעות</span>
            <div className="flex items-center gap-2 text-xs opacity-80">
              <span>היום: {fmtMin(todayTotal + (isActive ? elapsed : 0))}</span>
              <button onClick={() => setOpen(false)} className="hover:opacity-60">✕</button>
            </div>
          </div>

          {/* Active timer */}
          {isActive ? (
            <div className="p-4 bg-green-50 border-b border-green-200">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-mono text-2xl font-bold text-green-700">{fmtDuration(elapsed)}</div>
                  <div className="text-xs text-green-600 mt-0.5">
                    {active.matters?.case_number || active.matters?.title || 'ללא תיק'}
                    {active.description ? ` · ${active.description}` : ''}
                  </div>
                </div>
                <button
                  onClick={stop}
                  disabled={saving}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold"
                >
                  ⏹ עצור
                </button>
              </div>
            </div>
          ) : (
            /* Start form */
            <div className="p-4 border-b border-slate-200">
              <select
                value={matterId}
                onChange={e => setMatterId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-sm mb-2 bg-white"
              >
                <option value="">— בחר תיק (אופציונלי) —</option>
                {matters.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.case_number || m.title || m.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="תיאור עבודה..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && start()}
                className="w-full border border-slate-300 rounded-lg p-2 text-sm mb-2"
              />
              <button
                onClick={start}
                disabled={saving}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold"
              >
                ▶ התחל מעקב
              </button>
            </div>
          )}

          {/* Today's entries */}
          <div className="max-h-52 overflow-y-auto">
            {entries.filter(e => e.ended_at).length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-4">אין רשומות להיום</p>
            ) : (
              entries.filter(e => e.ended_at).map(e => {
                const sec = Math.floor((new Date(e.ended_at) - new Date(e.started_at)) / 1000);
                return (
                  <div key={e.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 border-b border-slate-100 text-xs">
                    <span className="font-mono text-slate-600 w-14 shrink-0">{fmtMin(sec)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-slate-800">
                        {e.matters?.case_number || e.matters?.title || '—'}
                      </div>
                      {e.description && <div className="truncate text-slate-500">{e.description}</div>}
                    </div>
                    <button
                      onClick={() => deleteEntry(e.id)}
                      className="text-slate-300 hover:text-red-500 shrink-0"
                    >✕</button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
