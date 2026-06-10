'use client';
import { useState, useEffect, useCallback } from 'react';

const PRIORITY_LABEL = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' };
const PRIORITY_COLOR = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-500',
};

export default function TasksPage() {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [mine, setMine]       = useState(false);
  const [status, setStatus]   = useState('open');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status });
    if (mine) params.set('mine', 'true');
    const res  = await fetch(`/api/tasks?${params}`);
    const json = await res.json();
    setTasks(json.tasks || []);
    setLoading(false);
  }, [mine, status]);

  useEffect(() => { load(); }, [load]);

  async function toggleDone(t) {
    const newStatus = t.status === 'done' ? 'open' : 'done';
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString().slice(0,10) : null }),
    });
    load();
  }

  const overdueCount = tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status === 'open').length;

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
      <div className="max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">משימות</h1>
            {overdueCount > 0 && (
              <p className="text-sm text-red-600 mt-0.5">{overdueCount} משימות באיחור</p>
            )}
          </div>
          <div className="flex gap-2">
            <a href="/cases" className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">תיקים</a>
            <a href="/calendar" className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">לוח שנה</a>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border p-4 mb-4 flex gap-4 items-center">
          <div className="flex gap-1">
            {[['open','פתוח'],['in_progress','בטיפול'],['done','הושלם'],['cancelled','מבוטל']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatus(val)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  status === val ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mr-auto">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="rounded" />
            רק המשימות שלי
          </label>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">טוען...</div>
        ) : (
          <div className="space-y-2">
            {tasks.length === 0 && (
              <div className="text-center py-16 text-gray-400 bg-white rounded-xl border">
                אין משימות. סנכרן את קובץ האקסל מדף <a href="/cases" className="text-blue-600 underline">התיקים</a>.
              </div>
            )}
            {tasks.map((t) => {
              const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status === 'open';
              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-xl border p-4 flex items-start gap-4 transition-opacity ${
                    t.status === 'done' ? 'opacity-60' : ''
                  } ${isOverdue ? 'border-red-200 bg-red-50' : ''}`}
                >
                  <button
                    onClick={() => toggleDone(t)}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 transition-colors ${
                      t.status === 'done'
                        ? 'bg-green-500 border-green-500 text-white flex items-center justify-center'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {t.status === 'done' && <span className="text-xs">✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-medium text-gray-900 ${t.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                        {t.description}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${PRIORITY_COLOR[t.priority] || ''}`}>
                        {PRIORITY_LABEL[t.priority] || t.priority}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                      {t.task_number && <span className="font-mono">{t.task_number}</span>}
                      {t.task_type && <span>{t.task_type}</span>}
                      {t.matters && <span className="text-blue-600">תיק: {t.matters.title}</span>}
                      {t.profiles?.full_name && <span>אחראי: {t.profiles.full_name}</span>}
                      {t.due_date && (
                        <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                          יעד: {new Date(t.due_date).toLocaleDateString('he-IL')}
                          {isOverdue && ' (באיחור!)'}
                        </span>
                      )}
                      {t.notes && <span className="text-gray-400">{t.notes}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
