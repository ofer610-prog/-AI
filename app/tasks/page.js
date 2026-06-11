// app/tasks/page.js
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

const LAWYER_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
];

function getLawyerColor(index) {
  return LAWYER_COLORS[index % LAWYER_COLORS.length];
}

const PRIORITY_CONFIG = {
  high: { label: 'גבוהה', className: 'bg-red-100 text-red-700 border border-red-200' },
  medium: { label: 'בינונית', className: 'bg-amber-100 text-amber-700 border border-amber-200' },
  low: { label: 'נמוכה', className: 'bg-green-100 text-green-700 border border-green-200' },
};

const STATUS_CONFIG = {
  open: { label: 'פתוח', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'בטיפול', className: 'bg-purple-100 text-purple-700' },
  done: { label: 'הושלם', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'מבוטל', className: 'bg-gray-100 text-gray-500' },
};

function isOverdue(task) {
  if (!task.due_date) return false;
  if (task.status === 'done' || task.status === 'cancelled') return false;
  return new Date(task.due_date) < new Date();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function MatterSearchDropdown({ matters, value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = matters.find((m) => m.id === value);
  const filtered = matters.filter(
    (m) =>
      m.title?.toLowerCase().includes(query.toLowerCase()) ||
      m.case_number?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        placeholder="חפש תיק..."
        value={open ? query : selected ? `${selected.case_number} – ${selected.title}` : ''}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-50 w-full bg-white border rounded shadow-lg max-h-48 overflow-y-auto mt-1">
          <div
            className="px-3 py-2 text-sm text-gray-500 cursor-pointer hover:bg-gray-50"
            onMouseDown={() => {
              onChange('');
              setOpen(false);
            }}
          >
            — ללא תיק —
          </div>
          {filtered.map((m) => (
            <div
              key={m.id}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
              onMouseDown={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <span className="font-mono text-xs text-gray-500 ml-2">{m.case_number}</span>
              {m.title}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">אין תוצאות</div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskModal({ mode, task, lawyers, matters, onClose, onSuccess }) {
  const emptyForm = {
    description: '',
    assigned_to: '',
    priority: 'medium',
    due_date: '',
    due_time: '',
    task_type: '',
    matter_id: '',
    notes: '',
    status: 'open',
  };

  const [form, setForm] = useState(() => {
    if (mode === 'edit' && task) {
      const dueDateRaw = task.due_date || '';
      const dueDate = dueDateRaw ? dueDateRaw.split('T')[0] : '';
      const dueTime =
        dueDateRaw && dueDateRaw.includes('T') ? dueDateRaw.split('T')[1]?.slice(0, 5) : '';
      return {
        description: task.description || '',
        assigned_to: task.assigned_to || '',
        priority: task.priority || 'medium',
        due_date: dueDate,
        due_time: dueTime,
        task_type: task.task_type || '',
        matter_id: task.matter_id || '',
        notes: task.notes || '',
        status: task.status || 'open',
      };
    }
    return emptyForm;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim()) {
      setError('תיאור המשימה הוא שדה חובה');
      return;
    }
    setLoading(true);
    setError('');

    try {
      let dueDateFull = form.due_date;
      if (form.due_date && form.due_time) {
        dueDateFull = `${form.due_date}T${form.due_time}`;
      }

      const body = {
        description: form.description,
        assigned_to: form.assigned_to || null,
        priority: form.priority,
        due_date: dueDateFull || null,
        task_type: form.task_type || null,
        matter_id: form.matter_id || null,
        notes: form.notes || null,
        status: form.status,
      };

      if (mode === 'edit') {
        body.id = task.id;
        const res = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('שגיאה בעדכון המשימה');
      } else {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('שגיאה ביצירת המשימה');
      }

      const assignedLawyer = lawyers.find((l) => l.id === form.assigned_to);
      const msg =
        mode === 'create' && assignedLawyer
          ? `✅ משימה נוצרה ונשלחה התראה ל${assignedLawyer.full_name}`
          : mode === 'create'
          ? '✅ המשימה נוצרה בהצלחה'
          : '✅ המשימה עודכנה בהצלחה';
      onSuccess(msg);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-900 rounded-t-xl">
          <h2 className="text-white font-bold text-lg">
            {mode === 'edit' ? '✏️ עריכת משימה' : '+ משימה חדשה'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תיאור המשימה <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="תאר את המשימה..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">הוקצה ל</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={form.assigned_to}
                onChange={(e) => set('assigned_to', e.target.value)}
              >
                <option value="">— בחר —</option>
                {lawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
              >
                <option value="high">גבוהה</option>
                <option value="medium">בינונית</option>
                <option value="low">נמוכה</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={form.due_date}
                onChange={(e) => set('due_date', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שעה (אופציונלי)</label>
              <input
                type="time"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={form.due_time}
                onChange={(e) => set('due_time', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סוג משימה</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={form.task_type}
              onChange={(e) => set('task_type', e.target.value)}
              placeholder="כגון: הגשה, תזכורת, פגישה..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיק מקושר</label>
            <MatterSearchDropdown
              matters={matters}
              value={form.matter_id}
              onChange={(v) => set('matter_id', v)}
            />
          </div>

          {mode === 'edit' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
              >
                <option value="open">פתוח</option>
                <option value="in_progress">בטיפול</option>
                <option value="done">הושלם</option>
                <option value="cancelled">מבוטל</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="הערות נוספות..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-slate-900 text-white py-2 rounded-lg font-medium hover:bg-slate-700 transition disabled:opacity-50"
            >
              {loading ? 'שומר...' : mode === 'edit' ? 'שמור שינויים' : 'צור משימה'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 transition"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskCard({ task, lawyers, onToggleDone, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const overdue = isOverdue(task);
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.open;
  const isDone = task.status === 'done';
  const lawyerName = task.profiles?.full_name || '';
  const lawyerIdx = lawyers.findIndex((l) => l.id === task.assigned_to);
  const lawyerColor = getLawyerColor(lawyerIdx === -1 ? 0 : lawyerIdx);

  async function handleCheck(e) {
    e.stopPropagation();
    setToggling(true);
    await onToggleDone(task);
    setToggling(false);
  }

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm mb-3 transition-all cursor-pointer hover:shadow-md ${expanded ? 'ring-2 ring-slate-300' : ''} ${overdue ? 'border-red-200' : ''}`}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={handleCheck}
          disabled={toggling}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
            isDone
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-300 hover:border-slate-500'
          }`}
        >
          {isDone && (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priority.className}`}>
              {priority.label}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
            {task.task_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {task.task_type}
              </span>
            )}
            {overdue && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">
                ⚠ באיחור
              </span>
            )}
          </div>

          <p
            className={`font-semibold text-gray-800 text-sm leading-snug ${isDone ? 'line-through text-gray-400' : ''}`}
          >
            {task.description}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
            {lawyerName && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lawyerColor}`}>
                {lawyerName}
              </span>
            )}
            {task.due_date && (
              <span className={overdue ? 'text-red-600 font-medium' : ''}>
                {overdue ? '⚠ ' : '📅 '}
                {formatDate(task.due_date)}
              </span>
            )}
            {task.matters && (
              <span className="text-slate-500">
                📁 {task.matters.case_number} – {task.matters.title}
              </span>
            )}
          </div>

          {task.notes && !expanded && (
            <p className="text-xs text-gray-400 mt-1 truncate">{task.notes}</p>
          )}
        </div>
      </div>

      {expanded && (
        <div
          className="border-t px-4 py-3 bg-slate-50 rounded-b-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {task.notes && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">הערות:</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.notes}</p>
            </div>
          )}
          {task.task_number && (
            <p className="text-xs text-gray-400 mb-2">מספר משימה: {task.task_number}</p>
          )}
          {task.created_at && (
            <p className="text-xs text-gray-400 mb-2">נוצר: {formatDate(task.created_at)}</p>
          )}
          {task.completed_at && (
            <p className="text-xs text-gray-400 mb-3">הושלם: {formatDate(task.completed_at)}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(task)}
              className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition"
            >
              ✏️ ערוך
            </button>
            <button
              onClick={() => onDelete(task)}
              className="px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition"
            >
              🗑 בטל משימה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LawyerSummaryCard({ lawyer, index, tasks, selected, onClick }) {
  const lawyerTasks = tasks.filter((t) => t.assigned_to === lawyer.id);
  const openCount = lawyerTasks.filter((t) => t.status === 'open').length;
  const inProgressCount = lawyerTasks.filter((t) => t.status === 'in_progress').length;
  const overdueCount = lawyerTasks.filter((t) => isOverdue(t)).length;
  const color = getLawyerColor(index);

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md mb-3 ${
        selected ? 'ring-2 ring-slate-800 border-slate-800 bg-slate-50' : 'bg-white'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${color}`}
        >
          {lawyer.full_name?.[0] || '?'}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-800 truncate">{lawyer.full_name}</p>
          <a
            href={`/lawyer/${lawyer.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-600 hover:underline"
          >
            צפה בדשבורד ←
          </a>
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex flex-col items-center">
          <span className="font-bold text-blue-600 text-base leading-tight">{openCount}</span>
          <span className="text-gray-500">פתוח</span>
        </span>
        <span className="flex flex-col items-center">
          <span className="font-bold text-purple-600 text-base leading-tight">{inProgressCount}</span>
          <span className="text-gray-500">בטיפול</span>
        </span>
        <span className="flex flex-col items-center">
          <span
            className={`font-bold text-base leading-tight ${overdueCount > 0 ? 'text-red-600' : 'text-gray-400'}`}
          >
            {overdueCount}
          </span>
          <span className={overdueCount > 0 ? 'text-red-500' : 'text-gray-500'}>באיחור</span>
        </span>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [lawyers, setLawyers] = useState([]);
  const [matters, setMatters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myProfile, setMyProfile] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState(['open', 'in_progress']);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [lawyerFilter, setLawyerFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [flash, setFlash] = useState('');

  // Sidebar selected lawyer
  const [selectedLawyerCard, setSelectedLawyerCard] = useState('');

  function showFlash(msg) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 4000);
  }

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
      setLawyers(data.lawyers || []);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMatters = useCallback(async () => {
    try {
      const res = await fetch('/api/matters?limit=200');
      const data = await res.json();
      setMatters(data.matters || []);
    } catch (err) {
      console.error('Failed to load matters', err);
    }
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      setMyProfile(data.profile || null);
    } catch (err) {
      console.error('Failed to load profile', err);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    loadMatters();
    loadMe();
  }, [loadTasks, loadMatters, loadMe]);

  function toggleStatusFilter(status) {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter.length > 0 && !statusFilter.includes(t.status)) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      const effectiveLawyerFilter = selectedLawyerCard || lawyerFilter;
      if (effectiveLawyerFilter && t.assigned_to !== effectiveLawyerFilter) return false;
      if (mineOnly && myProfile && t.assigned_to !== myProfile.id) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, lawyerFilter, mineOnly, myProfile, selectedLawyerCard]);

  const overdueCount = useMemo(() => tasks.filter((t) => isOverdue(t)).length, [tasks]);

  async function handleToggleDone(task) {
    const newStatus = task.status === 'done' ? 'open' : 'done';
    const completed_at = newStatus === 'done' ? new Date().toISOString() : null;

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus, completed_at } : t))
    );

    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus, completed_at }),
      });
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  }

  async function handleDelete(task) {
    if (!confirm(`לבטל את המשימה: "${task.description}"?`)) return;
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: 'cancelled' }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'cancelled' } : t)));
      showFlash('המשימה בוטלה');
    } catch (err) {
      alert('שגיאה בביטול המשימה');
    }
  }

  function handleSuccess(msg) {
    setShowCreate(false);
    setEditTask(null);
    showFlash(msg);
    loadTasks();
  }

  const STATUS_PILLS = [
    { key: 'open', label: 'פתוח' },
    { key: 'in_progress', label: 'בטיפול' },
    { key: 'done', label: 'הושלם' },
    { key: 'cancelled', label: 'מבוטל' },
  ];

  const hasActiveFilters =
    statusFilter.length !== 2 ||
    !statusFilter.includes('open') ||
    !statusFilter.includes('in_progress') ||
    priorityFilter !== 'all' ||
    lawyerFilter !== '' ||
    selectedLawyerCard !== '' ||
    mineOnly;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-12 z-30 bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <h1
            className="text-lg font-bold"
            style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
          >
            ✅ משימות
          </h1>
          {overdueCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {overdueCount} באיחור
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-white text-slate-900 text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-slate-100 transition"
        >
          + משימה חדשה
        </button>
      </div>

      {/* Flash Message */}
      {flash && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-xl text-sm font-medium">
          {flash}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <TaskModal
          mode="create"
          lawyers={lawyers}
          matters={matters}
          onClose={() => setShowCreate(false)}
          onSuccess={handleSuccess}
        />
      )}

      {/* Edit Modal */}
      {editTask && (
        <TaskModal
          mode="edit"
          task={editTask}
          lawyers={lawyers}
          matters={matters}
          onClose={() => setEditTask(null)}
          onSuccess={handleSuccess}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Main Column: Filters + Task List */}
          <div className="flex-1 min-w-0">
            {/* Filter Bar */}
            <div className="bg-white rounded-xl border shadow-sm p-4 mb-4 space-y-3">
              {/* Status Pills */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500 font-medium">סטטוס:</span>
                {STATUS_PILLS.map((pill) => (
                  <button
                    key={pill.key}
                    onClick={() => toggleStatusFilter(pill.key)}
                    className={`text-xs px-3 py-1 rounded-full border transition font-medium ${
                      statusFilter.includes(pill.key)
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-slate-400'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                {/* Priority Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">עדיפות:</span>
                  <select
                    className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                  >
                    <option value="all">הכל</option>
                    <option value="high">גבוהה</option>
                    <option value="medium">בינונית</option>
                    <option value="low">נמוכה</option>
                  </select>
                </div>

                {/* Lawyer Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">עו"ד:</span>
                  <select
                    className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    value={selectedLawyerCard || lawyerFilter}
                    onChange={(e) => {
                      setLawyerFilter(e.target.value);
                      setSelectedLawyerCard('');
                    }}
                  >
                    <option value="">הכל</option>
                    {lawyers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mine Only */}
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={mineOnly}
                    onChange={(e) => setMineOnly(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  רק המשימות שלי
                </label>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setStatusFilter(['open', 'in_progress']);
                      setPriorityFilter('all');
                      setLawyerFilter('');
                      setSelectedLawyerCard('');
                      setMineOnly(false);
                    }}
                    className="text-xs text-red-500 hover:text-red-700 underline"
                  >
                    נקה סינון
                  </button>
                )}
              </div>
            </div>

            {/* Task Count */}
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-sm text-gray-500">
                מציג <span className="font-bold text-gray-800">{filteredTasks.length}</span> משימות
              </p>
            </div>

            {/* Task List */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-20 w-full" />
                ))}
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-gray-400">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-lg font-medium">אין משימות להצגה</p>
                <p className="text-sm mt-1">שנה את הסינון או צור משימה חדשה</p>
              </div>
            ) : (
              <div>
                {filteredTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lawyers={lawyers}
                    onToggleDone={handleToggleDone}
                    onEdit={setEditTask}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar: Lawyer Summary Cards (desktop only) */}
          <div className="hidden md:block w-64 flex-shrink-0">
            <div className="sticky top-28">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 px-1">
                סיכום לפי עו"ד
              </h2>
              {loading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-24 w-full" />
                  ))}
                </div>
              )}
              {!loading && lawyers.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-6">אין נתונים</div>
              )}
              {lawyers.map((lawyer, index) => (
                <LawyerSummaryCard
                  key={lawyer.id}
                  lawyer={lawyer}
                  index={index}
                  tasks={tasks}
                  selected={selectedLawyerCard === lawyer.id}
                  onClick={() => {
                    setSelectedLawyerCard((prev) => (prev === lawyer.id ? '' : lawyer.id));
                    setLawyerFilter('');
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
