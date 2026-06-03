'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar, Plus, Clock, Phone, User, MapPin,
  ChevronRight, ChevronLeft, CheckCircle, Loader2, X, Trash2,
} from 'lucide-react';

const DAYS_HE   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const TYPE_LABELS = { meeting:'פגישה', court:'דיון', deadline:'מועד אחרון', call:'שיחה', other:'אחר' };
const TYPE_COLORS = {
  meeting:  'bg-sky-100 text-sky-800 border-sky-300',
  court:    'bg-red-100 text-red-800 border-red-300',
  deadline: 'bg-orange-100 text-orange-800 border-orange-300',
  call:     'bg-green-100 text-green-800 border-green-300',
  other:    'bg-slate-100 text-slate-700 border-slate-300',
};
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit', hour12:false }) : '';
const fmtDay  = (d) => `${DAYS_HE[d.getDay()]} ${d.getDate()} ${MONTHS_HE[d.getMonth()]}`;
const toDateStr = (d) => d.toISOString().slice(0, 10);

export default function MySchedulePage() {
  const [current, setCurrent]     = useState(new Date());
  const [events,  setEvents]      = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [profile,  setProfile]    = useState(null);

  const weekStart = () => {
    const d = new Date(current);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0,0,0,0);
    return d;
  };

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      setProfile(data.profile);
    } catch {}
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const ws  = weekStart();
      const we  = new Date(ws); we.setDate(ws.getDate() + 6); we.setHours(23,59,59,999);
      const res = await fetch(`/api/events?from=${ws.toISOString()}&to=${we.toISOString()}&mine=true`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadProfile(); }, []);
  useEffect(() => { loadEvents(); }, [current]);

  const navigate = (dir) => {
    const d = new Date(current);
    d.setDate(d.getDate() + dir * 7);
    setCurrent(d);
  };

  const getWeekDays = () => {
    const start = weekStart();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  };

  const eventsOnDay = (date) => {
    const ds = toDateStr(date);
    return events
      .filter((e) => e.start_time?.slice(0,10) === ds)
      .sort((a,b) => (a.start_time||'') < (b.start_time||'') ? -1 : 1);
  };

  const openNew = (date) => {
    const start = date ? new Date(date) : new Date();
    start.setHours(9,0,0,0);
    const end = new Date(start); end.setHours(10,0,0,0);
    setEditEvent({
      title:'', event_type:'meeting',
      start_time: start.toISOString().slice(0,16),
      end_time:   end.toISOString().slice(0,16),
      attendee_name:'', attendee_phone:'', location:'', notes:'',
    });
    setShowModal(true);
  };

  const openEdit = (ev) => {
    setEditEvent({ ...ev, start_time: ev.start_time?.slice(0,16)||'', end_time: ev.end_time?.slice(0,16)||'' });
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
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, status:'completed' }),
    });
    loadEvents();
  };

  const weekDays = getWeekDays();
  const todayStr = toDateStr(new Date());
  const weekLabel = `${DAYS_HE[weekDays[0].getDay()]} ${weekDays[0].getDate()} — ${DAYS_HE[weekDays[6].getDay()]} ${weekDays[6].getDate()} ${MONTHS_HE[weekDays[6].getMonth()]}`;

  return (
    <div dir="rtl" className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="border-b border-sky-100 bg-white sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm">← לוח בקרה</Link>
            <Calendar className="w-5 h-5 text-sky-600" />
            <h1 style={{ fontFamily:"'Frank Ruhl Libre',serif" }} className="text-xl font-bold">
              הלוז שלי{profile?.full_name ? ` — ${profile.full_name}` : ''}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/calendar" className="text-xs text-sky-600 border border-sky-200 px-3 py-1.5 rounded hover:bg-sky-50">
              לוח כל הצוות
            </Link>
            <button onClick={() => openNew(null)}
              className="px-3 py-1.5 bg-slate-800 text-white text-sm rounded-md flex items-center gap-1.5 hover:bg-slate-900">
              <Plus className="w-4 h-4" /> הוסף
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 pb-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-sky-50 rounded"><ChevronRight className="w-5 h-5" /></button>
          <button onClick={() => setCurrent(new Date())} className="text-xs px-2 py-1 border border-sky-200 rounded hover:bg-sky-50">היום</button>
          <button onClick={() => navigate(1)}  className="p-1 hover:bg-sky-50 rounded"><ChevronLeft  className="w-5 h-5" /></button>
          <span className="text-sm font-medium text-slate-700">{weekLabel}</span>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-sky-400" />}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {weekDays.map((day) => {
          const isToday   = toDateStr(day) === todayStr;
          const dayEvents = eventsOnDay(day);
          const isPast    = day < new Date() && !isToday;
          return (
            <div key={day.toISOString()}
              className={`rounded-xl border overflow-hidden ${isToday ? 'border-sky-400 shadow-md' : 'border-sky-100'} ${isPast ? 'opacity-70' : ''}`}>
              {/* Day header */}
              <div className={`px-5 py-3 flex items-center justify-between cursor-pointer ${isToday ? 'bg-sky-600 text-white' : 'bg-white hover:bg-sky-50'}`}
                onClick={() => openNew(day)}>
                <div className="flex items-center gap-3">
                  <span className={`font-bold text-lg ${isToday?'text-white':'text-slate-700'}`}>{fmtDay(day)}</span>
                  {isToday && <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">היום</span>}
                  {dayEvents.length > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isToday?'bg-white/20 text-white':'bg-sky-100 text-sky-700'}`}>
                      {dayEvents.length} {dayEvents.length === 1 ? 'אירוע' : 'אירועים'}
                    </span>
                  )}
                </div>
                <Plus className={`w-4 h-4 ${isToday?'text-white/70':'text-slate-300'}`} />
              </div>

              {/* Events */}
              {dayEvents.length > 0 ? (
                <div className="divide-y divide-sky-50 bg-white">
                  {dayEvents.map((ev) => (
                    <div key={ev.id}
                      className={`px-5 py-3 flex items-start gap-4 hover:bg-sky-50/40 ${ev.status==='completed'?'opacity-60':''}`}>
                      {/* Time column */}
                      <div className="min-w-[60px] text-center">
                        {ev.all_day ? (
                          <span className="text-xs text-slate-400">כל היום</span>
                        ) : (
                          <>
                            <div className="text-sm font-bold text-slate-700">{fmtTime(ev.start_time)}</div>
                            {ev.end_time && <div className="text-xs text-slate-400">{fmtTime(ev.end_time)}</div>}
                          </>
                        )}
                      </div>

                      {/* Left border color by type */}
                      <div className={`w-1 self-stretch rounded-full ${
                        ev.event_type==='court'    ? 'bg-red-400'    :
                        ev.event_type==='deadline' ? 'bg-orange-400' :
                        ev.event_type==='call'     ? 'bg-green-400'  :
                        'bg-sky-400'
                      }`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(ev)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded border ${TYPE_COLORS[ev.event_type]||TYPE_COLORS.other}`}>
                            {TYPE_LABELS[ev.event_type]||ev.event_type}
                          </span>
                          <span className={`font-semibold ${ev.status==='completed'?'line-through text-slate-400':'text-slate-800'}`}>
                            {ev.title}
                          </span>
                          {ev.status === 'completed' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                          {(ev.attendee_name||ev.clients?.name) && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />{ev.attendee_name||ev.clients?.name}
                            </span>
                          )}
                          {ev.attendee_phone && (
                            <a href={`tel:${ev.attendee_phone}`} onClick={(e)=>e.stopPropagation()}
                              className="flex items-center gap-1 text-sky-600 hover:underline">
                              <Phone className="w-3 h-3" />{ev.attendee_phone}
                            </a>
                          )}
                          {ev.location && (
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</span>
                          )}
                        </div>
                        {ev.notes && <div className="text-xs text-slate-400 mt-1 truncate">{ev.notes}</div>}
                      </div>

                      {/* Actions */}
                      {ev.status !== 'completed' && (
                        <button onClick={() => markComplete(ev.id)}
                          className="shrink-0 px-2 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100">
                          ✓ סיים
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white px-5 py-4 text-sm text-slate-300 text-center">
                  אין אירועים — לחץ להוסיף
                </div>
              )}
            </div>
          );
        })}
      </main>

      {showModal && editEvent && (
        <EventModal
          event={editEvent}
          onSave={saveEvent}
          onDelete={editEvent.id ? () => deleteEvent(editEvent.id) : null}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function EventModal({ event, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({ ...event });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" dir="rtl">
        <div className="px-6 py-4 border-b border-sky-100 flex items-center justify-between">
          <h3 className="font-semibold text-lg">{form.id ? 'עריכת אירוע' : 'אירוע חדש'}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-500 block mb-1">כותרת *</span>
            <input required value={form.title||''} onChange={(e)=>set('title',e.target.value)}
              className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-500" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">סוג</span>
              <select value={form.event_type||'meeting'} onChange={(e)=>set('event_type',e.target.value)}
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none">
                {Object.entries(TYPE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block flex items-end">
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input type="checkbox" checked={!!form.all_day} onChange={(e)=>set('all_day',e.target.checked)} />
                <span className="text-xs text-slate-600">כל היום</span>
              </label>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">התחלה *</span>
              <input type="datetime-local" required value={form.start_time||''}
                onChange={(e)=>set('start_time',e.target.value)}
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">סיום</span>
              <input type="datetime-local" value={form.end_time||''}
                onChange={(e)=>set('end_time',e.target.value)}
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">שם משתתף</span>
              <input value={form.attendee_name||''} onChange={(e)=>set('attendee_name',e.target.value)}
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">טלפון</span>
              <input value={form.attendee_phone||''} onChange={(e)=>set('attendee_phone',e.target.value)}
                dir="ltr" className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-500 block mb-1">מיקום</span>
            <input value={form.location||''} onChange={(e)=>set('location',e.target.value)}
              className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500 block mb-1">הערות</span>
            <textarea rows={2} value={form.notes||''} onChange={(e)=>set('notes',e.target.value)}
              className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none resize-none" />
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-slate-800 text-white rounded-md text-sm hover:bg-slate-900 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (form.id?'שמור':'הוסף')}
            </button>
            {onDelete && (
              <button type="button" onClick={onDelete}
                className="px-3 border border-red-200 text-red-500 rounded-md hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={onClose}
              className="px-4 border border-sky-200 text-slate-600 rounded-md text-sm">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
