'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const fmtMoney = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '—';

const STAGE_HE = {
  draft: 'טיוטה', conditional: 'מותנה', waiting: 'ממתין',
  signed: 'נחתם', registration: 'ברישום', closed: 'סגור',
};

export default function CommandCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [newTaskFor, setNewTaskFor] = useState(null); // lawyer id
  const [taskText, setTaskText] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/command');
      if (res.status === 401) { window.location.href = '/login'; return; }
      const d = await res.json();
      setData(d);
    } catch {}
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const runAi = async () => {
    if (!data) return;
    setAiLoading(true);
    setAi(null);
    try {
      const res = await fetch('/api/command/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const d = await res.json();
      setAi(d.recommendations || []);
    } catch {
      setAi([]);
    }
    setAiLoading(false);
  };

  const assignTask = async () => {
    if (!taskText.trim() || !newTaskFor) return;
    setSavingTask(true);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: taskText.trim(),
          assigned_to: newTaskFor,
          due_date: taskDue || null,
          priority: 'high',
        }),
      });
      setNewTaskFor(null); setTaskText(''); setTaskDue('');
      load(true);
    } catch {}
    setSavingTask(false);
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse text-lg">טוען מרכז שליטה…</div>
      </div>
    );
  }
  if (!data) return null;

  const lawyerName = (id) => data.lawyers.find((l) => l.id === id)?.name || '—';

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-slate-900 text-white sticky top-12 z-30">
        <div className="max-w-[1500px] mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm">← תפריט</Link>
          <h1 className="text-xl font-bold">🎯 מרכז שליטה</h1>
          <span className="text-slate-400 text-sm">{new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <div className="flex-1" />
          <button onClick={runAi} disabled={aiLoading}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-xl font-medium">
            {aiLoading ? '🤖 מנתח…' : '🤖 מה דורש טיפול היום?'}
          </button>
          <Link href="/finance" className="bg-slate-700 hover:bg-slate-600 text-sm px-4 py-2 rounded-xl">💰 כספים</Link>
          <Link href="/finance/invoices" className="bg-slate-700 hover:bg-slate-600 text-sm px-4 py-2 rounded-xl">🧾 חשבוניות</Link>
          <Link href="/expenses" className="bg-slate-700 hover:bg-slate-600 text-sm px-4 py-2 rounded-xl">💸 הוצאות</Link>
          <Link href="/staff" className="bg-slate-700 hover:bg-slate-600 text-sm px-4 py-2 rounded-xl">👥 עובדים</Link>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-5 py-6 space-y-6">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="יתרות לגבייה" value={fmtMoney(data.collections.total)} accent="text-red-600"
            sub={`${data.collections.top.length}+ תיקים פתוחים`} />
          <Kpi label="חשבוניות בפיגור" value={data.invoices.overdue} accent={data.invoices.overdue > 0 ? 'text-orange-600' : 'text-emerald-600'}
            sub={fmtMoney(data.invoices.overdue_amount)} />
          <Kpi label="הוצאות החודש" value={fmtMoney(data.expenses.month_total)} accent="text-slate-800"
            sub={`מתחילת שנה: ${fmtMoney(data.expenses.ytd_total)}`} />
          <Kpi label="משימות ללא אחראי" value={data.unassigned_tasks} accent={data.unassigned_tasks > 0 ? 'text-orange-600' : 'text-emerald-600'}
            sub="ממתינות לשיוך" />
        </div>

        {/* ── AI recommendations ── */}
        {ai && (
          <section className="bg-violet-50 border border-violet-200 rounded-2xl p-5">
            <h2 className="font-bold text-violet-900 mb-3">🤖 המלצות לפעולה — לפי דחיפות</h2>
            {ai.length === 0 ? (
              <div className="text-sm text-violet-700">אין המלצות כרגע — או שה-AI לא זמין.</div>
            ) : (
              <ol className="space-y-2">
                {ai.map((r, i) => (
                  <li key={i} className="bg-white rounded-xl px-4 py-3 flex items-start gap-3 shadow-sm">
                    <span className="text-lg">{r.icon || '•'}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{r.action}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{r.area} · אחראי: {r.owner}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {/* ── Per-lawyer board ── */}
        <section>
          <h2 className="font-bold text-slate-800 mb-3 text-lg">👥 מצב לפי עו"ד</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.lawyers.map((l) => (
              <div key={l.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-slate-800 text-white flex items-center justify-between">
                  <span className="font-bold">{l.name}</span>
                  <button onClick={() => setNewTaskFor(newTaskFor === l.id ? null : l.id)}
                    className="text-xs bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 rounded-lg">
                    + משימה
                  </button>
                </div>

                {/* quick task form */}
                {newTaskFor === l.id && (
                  <div className="p-3 bg-emerald-50 border-b border-emerald-100 space-y-2">
                    <input autoFocus value={taskText} onChange={(e) => setTaskText(e.target.value)}
                      placeholder="מה המשימה?" className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    <div className="flex gap-2">
                      <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)}
                        className="border rounded-lg px-2 py-1 text-sm flex-1" />
                      <button onClick={assignTask} disabled={savingTask || !taskText.trim()}
                        className="bg-emerald-600 text-white text-sm px-3 py-1 rounded-lg disabled:opacity-50">
                        {savingTask ? '...' : 'שלח 📤'}
                      </button>
                    </div>
                    <div className="text-[11px] text-emerald-700">תקפוץ לו התראה במחשב והוא יאשר קבלה</div>
                  </div>
                )}

                <div className="p-4 space-y-3">
                  <div className="flex gap-2 text-center">
                    <Stat n={l.active_cases} label="תיקים" />
                    <Stat n={l.open_tasks} label="משימות" warn={l.overdue_tasks > 0} />
                    <Stat n={fmtMoney(l.to_collect)} label="לגבייה" small warn={l.to_collect > 20000} />
                    {l.today_minutes > 0 && (
                      <Stat n={`${Math.floor(l.today_minutes/60)}:${String(l.today_minutes%60).padStart(2,'0')}`} label="שעות היום" />
                    )}
                  </div>

                  {Object.keys(l.stages).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(l.stages).map(([s, n]) => (
                        <span key={s} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {STAGE_HE[s] || s}: {n}
                        </span>
                      ))}
                    </div>
                  )}

                  {l.overdue_tasks > 0 && (
                    <div className="bg-red-50 rounded-xl p-2.5">
                      <div className="text-xs font-bold text-red-700 mb-1">⚠️ {l.overdue_tasks} משימות באיחור</div>
                      {l.overdue_list.map((t) => (
                        <div key={t.id} className="text-xs text-red-600 truncate">• {t.description} ({fmtDate(t.due_date)})</div>
                      ))}
                    </div>
                  )}

                  {l.deliveries_14d.length > 0 && (
                    <div className="bg-blue-50 rounded-xl p-2.5">
                      <div className="text-xs font-bold text-blue-700 mb-1">🏠 מסירות קרובות</div>
                      {l.deliveries_14d.map((d) => (
                        <div key={d.id} className="text-xs text-blue-600 truncate">• {d.title} — {fmtDate(d.date)}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* ── Collections ── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-red-600 text-white font-bold flex items-center justify-between">
              <span>💰 גבייה — היתרות הגדולות</span>
              <span className="text-sm font-normal">{fmtMoney(data.collections.total)} סה"כ</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {data.collections.top.map((c) => (
                <div key={c.id} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{c.client}</div>
                    <div className="text-xs text-slate-400">{lawyerName(c.lawyer_id)} · {c.payment_status || 'ללא סטטוס'}</div>
                  </div>
                  <div className="text-sm font-bold text-red-600 whitespace-nowrap">{fmtMoney(c.balance)}</div>
                </div>
              ))}
              {data.collections.top.length === 0 && (
                <div className="p-6 text-center text-sm text-emerald-600">🎉 אין יתרות פתוחות</div>
              )}
            </div>
          </section>

          {/* ── Time tracking today ── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-teal-700 text-white font-bold flex items-center justify-between">
              <span>⏱ שעות עבודה — היום</span>
              <Link href="/time" className="text-xs bg-teal-600 hover:bg-teal-500 px-3 py-1 rounded-lg">דוח מלא</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {data.lawyers.filter(l => l.today_minutes > 0).length === 0 ? (
                <div className="p-5 text-center text-sm text-slate-400">לא נרשמו שעות עבודה היום</div>
              ) : (
                data.lawyers.filter(l => l.today_minutes > 0).sort((a,b) => b.today_minutes - a.today_minutes).map(l => (
                  <div key={l.id} className="px-5 py-2.5 flex items-center gap-3">
                    <div className="flex-1 text-sm font-medium text-slate-800">{l.name}</div>
                    <div className="font-mono text-sm font-bold text-teal-700">
                      {Math.floor(l.today_minutes/60)}:{String(l.today_minutes%60).padStart(2,'0')}
                    </div>
                    <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${Math.min(100, l.today_minutes/480*100)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ── Overdue invoices + week ahead ── */}
          <div className="space-y-6">
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-orange-500 text-white font-bold">🧾 חשבוניות בפיגור</div>
              <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {data.invoices.overdue_list.map((inv) => (
                  <div key={inv.id} className="px-5 py-2 flex items-center justify-between">
                    <span className="text-sm text-slate-700 truncate">{inv.client_name}</span>
                    <span className="text-sm text-orange-600 font-semibold whitespace-nowrap">
                      {fmtMoney(inv.amount)} · {fmtDate(inv.due_date)}
                    </span>
                  </div>
                ))}
                {data.invoices.overdue_list.length === 0 && (
                  <div className="p-5 text-center text-sm text-emerald-600">אין חשבוניות בפיגור ✓</div>
                )}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-blue-600 text-white font-bold">📅 השבוע הקרוב</div>
              <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {data.week_events.map((ev) => (
                  <div key={ev.id} className="px-5 py-2 flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700 truncate">{ev.title}</span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {new Date(ev.start_time).toLocaleString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {data.week_events.length === 0 && (
                  <div className="p-5 text-center text-sm text-slate-400">אין אירועים השבוע</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

const Kpi = ({ label, value, sub, accent = 'text-slate-800' }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
    <div className="text-xs text-slate-400 mb-1">{label}</div>
    <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
  </div>
);

const Stat = ({ n, label, warn, small }) => (
  <div className={`flex-1 rounded-xl py-2 ${warn ? 'bg-red-50' : 'bg-slate-50'}`}>
    <div className={`${small ? 'text-sm' : 'text-lg'} font-bold ${warn ? 'text-red-600' : 'text-slate-800'}`}>{n}</div>
    <div className="text-[11px] text-slate-400">{label}</div>
  </div>
);
