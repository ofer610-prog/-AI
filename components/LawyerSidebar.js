'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Floating side rail showing every lawyer/employee in the office.
 * - Collapsed: a slim vertical tab on the right edge ("הצוות")
 * - Expanded: a panel with one prominent button per lawyer → their personal page
 * - Admins get a "➕ הוסף עובד" button that creates a new staff profile
 * Visible on every page (except login / landing).
 */

const COLORS = [
  { bg: 'bg-violet-500', soft: 'bg-violet-50 text-violet-700 border-violet-200', ring: 'ring-violet-300' },
  { bg: 'bg-teal-500',   soft: 'bg-teal-50 text-teal-700 border-teal-200',     ring: 'ring-teal-300' },
  { bg: 'bg-amber-500',  soft: 'bg-amber-50 text-amber-700 border-amber-200',   ring: 'ring-amber-300' },
  { bg: 'bg-rose-500',   soft: 'bg-rose-50 text-rose-700 border-rose-200',     ring: 'ring-rose-300' },
  { bg: 'bg-sky-500',    soft: 'bg-sky-50 text-sky-700 border-sky-200',       ring: 'ring-sky-300' },
  { bg: 'bg-emerald-500',soft: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'ring-emerald-300' },
];

const ROLE_LABELS = {
  admin: 'מנהל',
  accountant: 'הנהלת חשבונות',
  lawyer: 'עו"ד',
  paralegal: 'עוזר/ת משפטי',
  intern: 'מתמחה',
};

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2) : (parts[0][0] + parts[1][0]);
}

export default function LawyerSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [profile, setProfile] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const loadStaff = () => {
    fetch('/api/profiles')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setStaff(j.lawyers || []); })
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.profile) setProfile(j.profile); })
      .catch(() => {});
    loadStaff();
  }, []);

  if (!pathname || pathname === '/login' || pathname === '/') return null;

  const isAdmin = profile && ['admin', 'accountant'].includes(profile.role);
  const activeId = pathname.startsWith('/lawyer/') ? pathname.split('/')[2] : null;

  return (
    <>
      {/* Collapsed tab — always visible on the right edge */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          dir="rtl"
          className="fixed top-1/2 -translate-y-1/2 right-0 z-40 bg-slate-900 text-white rounded-r-none rounded-l-xl shadow-lg hover:bg-slate-800 transition-colors py-4 px-2 flex flex-col items-center gap-2"
          style={{ writingMode: 'vertical-rl' }}
          title="הצוות שלי"
        >
          <span className="text-lg">👥</span>
          <span className="text-sm font-bold tracking-wide">הצוות</span>
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />
          <aside
            dir="rtl"
            className="fixed top-0 right-0 h-full w-72 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
          >
            <div className="bg-slate-900 text-white px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">👥</span>
                <h2 className="font-bold text-lg" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>הצוות</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-white text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {staff.length === 0 && (
                <p className="text-sm text-slate-400 text-center mt-6">טוען צוות...</p>
              )}
              {staff.map((s, i) => {
                const c = COLORS[i % COLORS.length];
                const isActive = activeId === s.id;
                return (
                  <Link
                    key={s.id}
                    href={`/lawyer/${s.id}`}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                      isActive ? `${c.soft} ring-2 ${c.ring} shadow-sm` : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full ${c.bg} text-white flex items-center justify-center font-bold text-sm flex-shrink-0`}>
                      {initials(s.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{s.full_name}</p>
                      <p className="text-xs text-slate-500">{ROLE_LABELS[s.role] || s.role}</p>
                    </div>
                    <span className="text-slate-300 text-lg">←</span>
                  </Link>
                );
              })}
            </div>

            {isAdmin && (
              <div className="p-3 border-t border-slate-200">
                <button
                  onClick={() => setShowAdd(true)}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <span className="text-base">➕</span> הוסף עובד
                </button>
              </div>
            )}
          </aside>
        </>
      )}

      {showAdd && (
        <AddEmployeeModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadStaff(); }}
        />
      )}
    </>
  );
}

function AddEmployeeModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ full_name: '', role: 'lawyer', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) { setErr('שם העובד חובה'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'שגיאה ביצירת עובד'); setSaving(false); return; }
      onSaved();
    } catch {
      setErr('שגיאת רשת');
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-slate-800 mb-1">הוספת עובד חדש</h2>
        <p className="text-sm text-slate-500 mb-5">העובד יקבל עמוד אישי משלו עם תיקים, משימות וגבייה</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שם מלא *</label>
            <input
              autoFocus value={form.full_name} onChange={(e) => set('full_name', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:border-sky-500 focus:outline-none"
              placeholder="לדוגמה: עו״ד רונית לוי"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">תפקיד</label>
            <select
              value={form.role} onChange={(e) => set('role', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:border-sky-500 focus:outline-none"
            >
              <option value="lawyer">עו"ד</option>
              <option value="paralegal">עוזר/ת משפטי</option>
              <option value="intern">מתמחה</option>
              <option value="accountant">הנהלת חשבונות</option>
              <option value="admin">מנהל</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">טלפון</label>
              <input
                value={form.phone} onChange={(e) => set('phone', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:border-sky-500 focus:outline-none"
                placeholder="050-0000000" dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">אימייל</label>
              <input
                value={form.email} onChange={(e) => set('email', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:border-sky-500 focus:outline-none"
                placeholder="name@example.com" dir="ltr"
              />
            </div>
          </div>
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="submit" disabled={saving}
              className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg py-2.5 font-semibold transition-colors"
            >
              {saving ? 'שומר...' : 'צור עובד'}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-slate-500 hover:text-slate-700">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}
