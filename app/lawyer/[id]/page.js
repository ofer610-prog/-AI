// app/lawyer/[id]/page.js
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

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

const PAYMENT_STATUS_CONFIG = {
  paid: { label: 'שולם', className: 'bg-green-100 text-green-700' },
  partial: { label: 'חלקי', className: 'bg-amber-100 text-amber-700' },
  unpaid: { label: 'לא שולם', className: 'bg-red-100 text-red-700' },
  pending: { label: 'ממתין', className: 'bg-blue-100 text-blue-700' },
};

const STAGE_LABELS = {
  initial: 'פתיחה',
  investigation: 'חקירה',
  hearing: 'דיון',
  verdict: 'פסיקה',
  appeal: 'ערעור',
  closed: 'סגור',
  active: 'פעיל',
};

const STATUS_CONFIG = {
  open: { label: 'פתוח', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'בטיפול', className: 'bg-purple-100 text-purple-700' },
  done: { label: 'הושלם', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'מבוטל', className: 'bg-gray-100 text-gray-500' },
};

const PRIORITY_CONFIG = {
  high: { label: 'גבוהה', className: 'bg-red-100 text-red-700 border border-red-200' },
  medium: { label: 'בינונית', className: 'bg-amber-100 text-amber-700 border border-amber-200' },
  low: { label: 'נמוכה', className: 'bg-green-100 text-green-700 border border-green-200' },
};

function isOverdue(dateStr, status) {
  if (!dateStr) return false;
  if (status === 'done' || status === 'cancelled') return false;
  return new Date(dateStr) < new Date();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCurrency(amount) {
  if (amount == null || amount === '') return '—';
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
}

function buildWhatsAppUrl(phone, clientName, matterTitle, balance) {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '').replace(/^0/, '972');
  const text = encodeURIComponent(
    `שלום ${clientName},\nאנו מזכירים כי קיים יתרת חוב בסך ${formatCurrency(balance)} בתיק "${matterTitle}".\nנא לסדר את התשלום בהקדם האפשרי.\nתודה,\nמשרד עורכי הדין`
  );
  return `https://wa.me/${cleaned}?text=${text}`;
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className={`rounded-xl border bg-white shadow-sm p-4 flex flex-col gap-1 ${color ? `border-r-4 ${color}` : ''}`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="animate-pulse bg-gray-200 rounded h-12 w-1/2" />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-24 w-full" />
        ))}
      </div>
      <div className="animate-pulse bg-gray-200 rounded h-8 w-full" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function MattersTab({ matters }) {
  const sorted = useMemo(() => {
    return [...matters].sort((a, b) => {
      if (!a.delivery_date) return 1;
      if (!b.delivery_date) return -1;
      return new Date(a.delivery_date) - new Date(b.delivery_date);
    });
  }, [matters]);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-3xl mb-2">📂</p>
        <p>אין תיקים פעילים</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-gray-500 font-medium">
            <th className="text-right py-3 px-4">מספר תיק</th>
            <th className="text-right py-3 px-4">לקוח</th>
            <th className="text-right py-3 px-4">שלב</th>
            <th className="text-right py-3 px-4">מועד מסירה</th>
            <th className="text-right py-3 px-4">יתרה לגבייה</th>
            <th className="text-right py-3 px-4">סטטוס תשלום</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((matter) => {
            const deliveryOverdue = matter.delivery_date
              ? new Date(matter.delivery_date) < new Date()
              : false;
            const paymentCfg =
              PAYMENT_STATUS_CONFIG[matter.payment_status] ||
              PAYMENT_STATUS_CONFIG.pending;

            return (
              <tr
                key={matter.id}
                className="border-b hover:bg-gray-50 transition"
              >
                <td className="py-3 px-4 font-mono text-xs text-gray-600">
                  {matter.case_number || '—'}
                </td>
                <td className="py-3 px-4 font-medium text-gray-800">
                  {matter.clients?.name || '—'}
                </td>
                <td className="py-3 px-4">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {STAGE_LABELS[matter.stage] || matter.stage || '—'}
                  </span>
                </td>
                <td className={`py-3 px-4 text-xs font-medium ${deliveryOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                  {deliveryOverdue ? '⚠ ' : ''}
                  {formatDate(matter.delivery_date)}
                </td>
                <td className={`py-3 px-4 font-semibold ${(matter.balance_amount ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(matter.balance_amount)}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${paymentCfg.className}`}>
                    {paymentCfg.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TasksTab({ tasks, lawyerId }) {
  const [localTasks, setLocalTasks] = useState(tasks);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  async function markDone(task) {
    const newStatus = task.status === 'done' ? 'open' : 'done';
    const completed_at = newStatus === 'completed' ? new Date().toISOString() : null;
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus, completed_at } : t))
    );
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus, completed_at }),
      });
    } catch (err) {
      setLocalTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  }

  if (localTasks.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-3xl mb-2">📋</p>
        <p>אין משימות פתוחות</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {localTasks.map((task) => {
        const overdue = isOverdue(task.due_date, task.status);
        const isDone = task.status === 'done';
        const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
        const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.open;

        return (
          <div
            key={task.id}
            className={`bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3 ${overdue ? 'border-red-200' : ''}`}
          >
            <button
              onClick={() => markDone(task)}
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
                {overdue && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">
                    ⚠ באיחור
                  </span>
                )}
              </div>

              <p className={`font-semibold text-sm text-gray-800 ${isDone ? 'line-through text-gray-400' : ''}`}>
                {task.description}
              </p>

              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                {task.due_date && (
                  <span className={overdue ? 'text-red-600 font-medium' : ''}>
                    📅 {formatDate(task.due_date)}
                  </span>
                )}
                {task.matters && (
                  <span>📁 {task.matters.case_number} – {task.matters.title}</span>
                )}
                {task.notes && <span className="truncate max-w-xs text-gray-400">{task.notes}</span>}
              </div>
            </div>

            <button
              onClick={() => markDone(task)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
                isDone
                  ? 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
              }`}
            >
              {isDone ? 'בטל סימון' : 'סמן הושלם'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CollectionTab({ matters }) {
  const unpaidMatters = useMemo(() => {
    return matters.filter(
      (m) => m.payment_status !== 'paid' && (m.balance_amount ?? 0) > 0
    );
  }, [matters]);

  if (unpaidMatters.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-3xl mb-2">💸</p>
        <p>אין יתרות לגבייה</p>
        <p className="text-sm mt-1">כל התיקים שולמו במלואם</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {unpaidMatters.map((matter) => {
        const paymentCfg =
          PAYMENT_STATUS_CONFIG[matter.payment_status] || PAYMENT_STATUS_CONFIG.pending;
        const clientName = matter.clients?.name || 'לקוח';
        const clientPhone = matter.clients?.phone;
        const waUrl = buildWhatsAppUrl(clientPhone, clientName, matter.title, matter.balance_amount);

        return (
          <div
            key={matter.id}
            className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-gray-800">{clientName}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${paymentCfg.className}`}>
                  {paymentCfg.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                <span className="font-mono">{matter.case_number}</span>
                {matter.title && ` – ${matter.title}`}
              </p>
              <div className="flex flex-wrap gap-4 text-xs">
                <span className="text-gray-500">
                  שכ"ט מוסכם:{' '}
                  <span className="font-semibold text-gray-700">{formatCurrency(matter.agreed_fee)}</span>
                </span>
                <span className="text-gray-500">
                  שולם:{' '}
                  <span className="font-semibold text-green-600">{formatCurrency(matter.collected_amount)}</span>
                </span>
                <span className="text-gray-500">
                  יתרה:{' '}
                  <span className="font-bold text-red-600">{formatCurrency(matter.balance_amount)}</span>
                </span>
              </div>
            </div>

            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center gap-1.5 text-xs bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600 transition font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                שלח תזכורת
              </a>
            )}
            {!waUrl && clientPhone && (
              <a
                href={`tel:${clientPhone}`}
                className="flex-shrink-0 text-xs bg-slate-100 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 transition"
              >
                📞 חייג
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LawyerDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const lawyerId = params.id;

  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [matters, setMatters] = useState([]);
  const [timeHours, setTimeHours] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('matters');

  // Fetch profile from public endpoint
  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles/' + lawyerId);
      const data = await res.json();
      setProfile(data.profile || null);
    } catch (err) {
      console.error('Failed to load profile', err);
    }
  }, [lawyerId]);

  // Fetch tasks assigned to this lawyer
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?assigned_to=${lawyerId}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error('Failed to load tasks', err);
    }
  }, [lawyerId]);

  // Fetch all matters and filter by responsible_lawyer_id
  const loadMatters = useCallback(async () => {
    try {
      const res = await fetch('/api/matters?limit=500');
      const data = await res.json();
      const all = data.matters || [];
      const lawyerMatters = all.filter(
        (m) =>
          m.profiles?.id === lawyerId ||
          m.responsible_lawyer_id === lawyerId
      );
      setMatters(lawyerMatters);
    } catch (err) {
      console.error('Failed to load matters', err);
    }
  }, [lawyerId]);

  // Fetch time entries — best effort, non-blocking
  const loadTimeEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/time-entries?user_id=${lawyerId}&this_month=true`);
      if (!res.ok) { setTimeHours(0); return; }
      const data = await res.json();
      const entries = data.entries || data.time_entries || [];
      const total = entries.reduce((sum, e) => { if (!e.started_at || !e.ended_at) return sum; return sum + Math.floor((new Date(e.ended_at) - new Date(e.started_at)) / 60000); }, 0);
      setTimeHours(Math.round(total / 60));
    } catch {
      setTimeHours(0);
    }
  }, [lawyerId]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([loadProfile(), loadTasks(), loadMatters()]);
      setLoading(false);
      loadTimeEntries();
    }
    loadAll();
  }, [loadProfile, loadTasks, loadMatters, loadTimeEntries]);

  // KPI calculations
  const activeMatterCount = useMemo(
    () => matters.filter((m) => m.status !== 'closed' && m.status !== 'cancelled').length,
    [matters]
  );

  const openTaskCount = useMemo(
    () => tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
    [tasks]
  );

  const totalBalance = useMemo(
    () => matters.reduce((sum, m) => sum + (m.balance_amount ?? 0), 0),
    [matters]
  );

  // Lawyer color based on index in a stable way (just use a hash of the id)
  const lawyerColorIndex = useMemo(() => {
    if (!lawyerId) return 0;
    let hash = 0;
    for (let i = 0; i < lawyerId.length; i++) hash += lawyerId.charCodeAt(i);
    return hash % 5;
  }, [lawyerId]);

  const lawyerColor = getLawyerColor(lawyerColorIndex);

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50">
        <div className="sticky top-12 z-30 bg-slate-900 text-white px-6 py-3 h-12" />
        <LoadingSkeleton />
      </div>
    );
  }

  if (!profile) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-xl font-semibold text-gray-700">עורך הדין לא נמצא</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition text-sm"
          >
            חזור
          </button>
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'matters', label: 'תיקים', count: matters.length },
    { key: 'tasks', label: 'משימות', count: openTaskCount },
    { key: 'collection', label: 'גבייה', count: matters.filter((m) => (m.balance_amount ?? 0) > 0 && m.payment_status !== 'paid').length },
  ];

  const roleLabels = {
    lawyer: 'עורך דין',
    admin: 'מנהל',
    accountant: 'רואה חשבון',
    secretary: 'מזכיר/ה',
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-12 z-30 bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-slate-300 hover:text-white transition text-sm font-medium"
          >
            ← חזור
          </button>
          <span className="text-slate-600">|</span>
          <h1
            className="text-lg font-bold"
            style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
          >
            {profile.full_name}
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-200">
            {roleLabels[profile.role] || profile.role}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {profile.phone && (
            <a
              href={`https://wa.me/972${profile.phone.replace(/\D/g, '').replace(/^0/, '')}?text=${encodeURIComponent(`שלום ${profile.full_name}, `)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs bg-green-500 hover:bg-green-400 text-white px-3 py-1.5 rounded-lg transition font-medium"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              שלח וואטסאפ
            </a>
          )}
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg transition"
            >
              📞 {profile.phone}
            </a>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Profile Header Card */}
        <div className="bg-white rounded-xl border shadow-sm p-6 flex items-center gap-4">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0 ${lawyerColor}`}
          >
            {profile.full_name?.[0] || '?'}
          </div>
          <div>
            <h2
              className="text-2xl font-bold text-gray-900"
              style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
            >
              {profile.full_name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">{roleLabels[profile.role] || profile.role}</span>
              {profile.email && (
                <>
                  <span className="text-gray-300">•</span>
                  <a href={`mailto:${profile.email}`} className="text-sm text-blue-600 hover:underline">
                    {profile.email}
                  </a>
                </>
              )}
              {profile.phone && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-sm text-gray-500">{profile.phone}</span>
                </>
              )}
            </div>
            {!profile.is_active && (
              <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                לא פעיל
              </span>
            )}
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="תיקים פעילים"
            value={activeMatterCount}
            sub={`מתוך ${matters.length} סה"כ`}
            color="border-blue-400"
          />
          <KpiCard
            label="משימות פתוחות"
            value={openTaskCount}
            sub={`${tasks.filter((t) => isOverdue(t.due_date, t.status)).length} באיחור`}
            color="border-purple-400"
          />
          <KpiCard
            label="לגבייה"
            value={formatCurrency(totalBalance)}
            sub={`${matters.filter((m) => (m.balance_amount ?? 0) > 0).length} תיקים פתוחים`}
            color="border-red-400"
          />
          <KpiCard
            label="שעות החודש"
            value={timeHours === null ? '...' : timeHours}
            sub="שעות עבודה רשומות"
            color="border-green-400"
          />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {/* Tab Bar */}
          <div className="flex border-b">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? 'border-slate-800 text-slate-800'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                      activeTab === tab.key
                        ? 'bg-slate-800 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {activeTab === 'matters' && <MattersTab matters={matters} />}
            {activeTab === 'tasks' && <TasksTab tasks={tasks} lawyerId={lawyerId} />}
            {activeTab === 'collection' && <CollectionTab matters={matters} />}
          </div>
        </div>
      </div>
    </div>
  );
}
