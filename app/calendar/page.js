'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronRight, ChevronLeft, Plus, X, Calendar, Clock,
  Phone, User, MapPin, Loader2, CheckCircle, Trash2,
} from 'lucide-react';

const DAYS_HE   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const TYPE_LABELS = { meeting: 'פגישה', court: 'דיון', deadline: 'מועד אחרון', call: 'שיחה', other: 'אחר' };
const TYPE_COLORS = {
  meeting:  'bg-sky-100 text-sky-800 border-sky-300',
  court:    'bg-red-100 text-red-800 border-red-300',
  deadline: 'bg-orange-100 text-orange-800 border-orange-300',
  call:     'bg-green-100 text-green-800 border-green-300',
  other:    'bg-slate-100 text-slate-700 border-slate-300',
};

const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
const toDateStr = (d) => d.toISOString().slice(0, 10);

export default function CalendarPage() {
  const [view, setView]         = useState('week'); // 'week' | 'month' | 'list'
  const [current, setCurrent]   = useState(new Date());
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [clients, setClients]   = useState([]);

  const fetchRange = () => {
    const d = new Date(current);
    if (view === 'week') {
      const dow = d.getDay();
      const from = new Date(d); from.setDate(d.getDate() - dow); from.setHours(0,0,0,0);
      const to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23,59,59,999);
      return { from, to };
    }
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    return { from, to };
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { from, to } = fetchRange();
      const res = await fetch(`/api/events?from=${from.toISOString()}&to=${to.toISOString()}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadClients = async () => {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      setClients(data.clients || []);
    } catch {}
  };

  useEffect(() => { loadEvents(); }, [current, view]);
  useEffect(() => { loadClients(); }, []);

  const navigate = (dir) => {
    const d = new Date(current);
    if (view === 'week')  d.setDate(d.getDate() + dir * 7);
    else                  d.setMonth(d.getMonth() + dir);
    setCurrent(d);
  };

  const openNew = (date) => {
    const start = date ? new Date(date) : new Date();
    start.setHours(9, 0, 0, 0);
    const end = new Date(start); end.setHours(10, 0, 0, 0);
    setEditEvent({
      title: '', event_type: 'meeting', start_time: start.toISOString().slice(0, 16),
      end_time: end.toISOString().slice(0, 16), attendee_name: '', attendee_phone: '', location: '', notes: '',
    });
    setShowModal(true);
  };

  const openEdit = (ev) => {
    setEditEvent({
      ...ev,
      start_time: ev.start_time?.slice(0, 16) || '',
      end_time:   ev.end_time?.slice(0, 16) || '',
    });
    setShowModal(true);
  };

  const saveEvent = async (form) => {
    const method = form.id ? 'PATCH' : 'POST';
    await fetch('/api/events', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    setShowModal(false);
    loadEvents();
  };

  const deleteEvent = async (id) => {
    await fetch(`/api/events?id=${id}`, { method: 'DELETE' });
    setShowModal(false);
    loadEvents();
  };

  const markComplete = async (id) => {
    await fetch('/api/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'completed' }),
    });
    loadEvents();
  };

  const [syncing, setSyncing]     = useState(false);
  const [syncMsg, setSyncMsg]     = useState('');
  const syncGoogleCalendar = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const res  = await fetch('/api/calendar/sync', { method: 'POST' });
      const json = await res.json();
      if (json.error === 'no_token' || json.error === 'no_calendar_scope') {
        setSyncMsg('⚠️ יש לחבר מחדש את חשבון Google עם הרשאת יומן');
        setTimeout(() => window.location.href = '/api/auth/google/connect?return_to=/calendar', 2500);
      } else if (json.ok) {
        setSyncMsg(`✅ סונכרן — ${json.imported} חדשים, ${json.updated} עודכנו`);
        loadEvents();
      } else {
        setSyncMsg('❌ שגיאה: ' + (json.message || json.error));
      }
    } catch { setSyncMsg('❌ שגיאת רשת'); }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 6000);
  };

  // ── Week view helpers ──────────────────────────────────────────────────────
  const getWeekDays = () => {
    const d = new Date(current);
    d.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => { const day = new Date(d); day.setDate(d.getDate() + i); return day; });
  };

  const eventsOnDay = (date) => {
    const ds = toDateStr(date);
    return events.filter((e) => e.start_time?.slice(0, 10) === ds);
  };

  const weekDays = getWeekDays();
  const todayStr = toDateStr(new Date());

  const title = view === 'week'
    ? `${DAYS_HE[weekDays[0].getDay()]} ${weekDays[0].getDate()} — ${DAYS_HE[weekDays[6].getDay()]} ${weekDays[6].getDate()} ${MONTHS_HE[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
    : `${MONTHS_HE[current.getMonth()]} ${current.getFullYear()}`;

  return (
    <div dir="rtl" className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="border-b border-sky-100 bg-white sticky top-12 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm ml-2">← לוח בקרה</Link>
            <Calendar className="w-5 h-5 text-sky-600" />
            <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-2xl font-bold">לוח שנה</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-sky-200 rounded-lg overflow-hidden">
              {['week','month','list'].map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm ${view===v ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-sky-50'}`}>
                  {v==='week'?'שבוע':v==='month'?'חודש':'רשימה'}
                </button>
              ))}
            </div>
            <button
              onClick={syncGoogleCalendar}
              disabled={syncing}
              title="סנכרן עם Google Calendar"
              className="px-3 py-2 border border-sky-300 text-sky-700 text-sm rounded-md flex items-center gap-1.5 hover:bg-sky-50 disabled:opacity-50">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : '📅'}
              {syncing ? 'מסנכרן...' : 'סנכרן Google'}
            </button>
            <button onClick={() => openNew(null)}
              className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md flex items-center gap-2 hover:bg-slate-900">
              <Plus className="w-4 h-4" /> פגישה חדשה
            </button>
          </div>
        </div>
        {/* Navigation */}
        <div className="max-w-7xl mx-auto px-6 pb-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-sky-50 rounded"><ChevronRight className="w-5 h-5" /></button>
          <button onClick={() => setCurrent(new Date())} className="text-xs px-2 py-1 border border-sky-200 rounded hover:bg-sky-50">היום</button>
          <button onClick={() => navigate(1)}  className="p-1 hover:bg-sky-50 rounded"><ChevronLeft className="w-5 h-5" /></button>
          <span className="text-sm font-medium text-slate-700">{title}</span>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-sky-400 mr-2" />}
          {syncMsg && <span className="text-xs mr-2 text-sky-700">{syncMsg}</span>}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* WEEK VIEW */}
        {view === 'week' && (
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const isToday = toDateStr(day) === todayStr;
              const dayEvents = eventsOnDay(day);
              return (
                <div key={day.toISOString()} className={`rounded-xl border min-h-[160px] ${isToday ? 'border-sky-400 bg-sky-50/40' : 'border-sky-100 bg-white'}`}>
                  <div className={`px-3 py-2 border-b text-center cursor-pointer hover:bg-sky-50 ${isToday ? 'border-sky-200' : 'border-sky-100'}`}
                    onClick={() => openNew(day)}>
                    <div className="text-xs text-slate-500">{DAYS_HE[day.getDay()]}</div>
                    <div className={`text-lg font-bold ${isToday ? 'text-sky-600' : 'text-slate-700'}`}>{day.getDate()}</div>
                  </div>
                  <div className="p-1 space-y-1">
                    {dayEvents.map((ev) => (
                      <button key={ev.id} onClick={() => openEdit(ev)}
                        className={`w-full text-right text-xs px-2 py-1 rounded border ${TYPE_COLORS[ev.event_type] || TYPE_COLORS.other} ${ev.status==='completed'?'opacity-50 line-through':''} truncate`}>
                        {ev.all_day ? '' : `${fmtTime(ev.start_time)} `}{ev.title}
                      </button>
                    ))}
                    <button onClick={() => openNew(day)} className="w-full text-xs text-slate-300 hover:text-sky-400 py-0.5">+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* LIST VIEW */}
        {view === 'list' && (
          <div className="space-y-3">
            {!events.length && !loading && (
              <div className="text-center py-12 text-slate-400">אין אירועים בטווח הנבחר</div>
            )}
            {events.map((ev) => (
              <div key={ev.id} onClick={() => openEdit(ev)}
                className={`bg-white border rounded-xl px-5 py-4 flex items-start gap-4 cursor-pointer hover:shadow-md transition-shadow ${ev.status==='completed'?'opacity-60':''}`}>
                <div className="text-center min-w-[48px]">
                  <div className="text-xs text-slate-400">{DAYS_HE[new Date(ev.start_time).getDay()]}</div>
                  <div className="text-2xl font-bold text-slate-700">{new Date(ev.start_time).getDate()}</div>
                  <div className="text-xs text-slate-400">{MONTHS_HE[new Date(ev.start_time).getMonth()]}</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded border ${TYPE_COLORS[ev.event_type]||TYPE_COLORS.other}`}>
                      {TYPE_LABELS[ev.event_type]||ev.event_type}
                    </span>
                    <span className="font-semibold text-slate-800">{ev.title}</span>
                    {ev.status === 'completed' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                    {!ev.all_day && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtTime(ev.start_time)}{ev.end_time?`–${fmtTime(ev.end_time)}`:''}</span>}
                    {(ev.attendee_name||ev.clients?.name) && <span className="flex items-center gap-1"><User className="w-3 h-3" />{ev.attendee_name||ev.clients?.name}</span>}
                    {ev.attendee_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{ev.attendee_phone}</span>}
                    {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</span>}
                  </div>
                </div>
                {ev.status !== 'completed' && (
                  <button onClick={(e) => { e.stopPropagation(); markComplete(ev.id); }}
                    className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100">
                    סיים
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* MONTH VIEW */}
        {view === 'month' && (
          <MonthView current={current} events={events} onDayClick={openNew} onEventClick={openEdit} />
        )}
      </main>

      {showModal && editEvent && (
        <EventModal
          event={editEvent}
          clients={clients}
          onSave={saveEvent}
          onDelete={editEvent.id ? () => deleteEvent(editEvent.id) : null}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function MonthView({ current, events, onDayClick, onEventClick }) {
  const firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
  const lastDay  = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  const startDow = firstDay.getDay();
  const todayStr = toDateStr(new Date());

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(current.getFullYear(), current.getMonth(), d));

  const eventsOnDay = (date) => {
    const ds = toDateStr(date);
    return events.filter((e) => e.start_time?.slice(0, 10) === ds);
  };

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_HE.map((d) => <div key={d} className="text-center text-xs text-slate-400 py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const isToday = toDateStr(day) === todayStr;
          const dayEvs = eventsOnDay(day);
          return (
            <div key={day.toISOString()} onClick={() => onDayClick(day)}
              className={`min-h-[80px] rounded-lg border p-1 cursor-pointer hover:bg-sky-50 ${isToday?'border-sky-400 bg-sky-50/30':'border-sky-100 bg-white'}`}>
              <div className={`text-sm font-semibold mb-1 ${isToday?'text-sky-600':'text-slate-600'}`}>{day.getDate()}</div>
              {dayEvs.slice(0,3).map((ev) => (
                <div key={ev.id} onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  className={`text-xs truncate px-1 rounded mb-0.5 ${TYPE_COLORS[ev.event_type]||TYPE_COLORS.other}`}>
                  {ev.title}
                </div>
              ))}
              {dayEvs.length > 3 && <div className="text-xs text-slate-400">+{dayEvs.length-3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventModal({ event, clients, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({ ...event });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" dir="rtl">
        <div className="px-6 py-4 border-b border-sky-100 flex items-center justify-between">
          <h3 className="font-semibold text-lg">{form.id ? 'עריכת אירוע' : 'פגישה חדשה'}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <label className="block">
            <span className="text-xs text-slate-500 mb-1 block">כותרת *</span>
            <input required value={form.title||''} onChange={(e) => set('title', e.target.value)}
              className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-500" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">סוג</span>
              <select value={form.event_type||'meeting'} onChange={(e) => set('event_type', e.target.value)}
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">לקוח (אופציונלי)</span>
              <select value={form.client_id||''} onChange={(e) => set('client_id', e.target.value||null)}
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none">
                <option value="">— בחר לקוח —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">התחלה *</span>
              <input type="datetime-local" required value={form.start_time||''} onChange={(e) => set('start_time', e.target.value)}
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">סיום</span>
              <input type="datetime-local" value={form.end_time||''} onChange={(e) => set('end_time', e.target.value)}
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">שם נוכח</span>
              <input value={form.attendee_name||''} onChange={(e) => set('attendee_name', e.target.value)} placeholder="שם מלא"
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">טלפון</span>
              <input value={form.attendee_phone||''} onChange={(e) => set('attendee_phone', e.target.value)} placeholder="050-0000000"
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" dir="ltr" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1 block">מיקום</span>
            <input value={form.location||''} onChange={(e) => set('location', e.target.value)}
              className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1 block">הערות</span>
            <textarea rows={2} value={form.notes||''} onChange={(e) => set('notes', e.target.value)}
              className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none resize-none" />
          </label>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-slate-800 text-white rounded-md text-sm disabled:opacity-50 hover:bg-slate-900">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (form.id ? 'שמור שינויים' : 'הוסף פגישה')}
            </button>
            {onDelete && (
              <button type="button" onClick={onDelete}
                className="px-3 py-2 border border-red-200 text-red-600 rounded-md text-sm hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-sky-200 text-slate-700 rounded-md text-sm hover:bg-sky-50">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
