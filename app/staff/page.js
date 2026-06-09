'use client';
import { useState, useEffect, useCallback } from 'react';

const ROLE_LABELS = { admin: 'מנהל', lawyer: 'עו"ד', accountant: 'רו"ח', secretary: 'מזכיר/ה' };
const fmtMoney = v => v ? `₪${Number(v).toLocaleString('he-IL')}` : '—';
const fmtDate  = d => d ? new Date(d).toLocaleDateString('he-IL') : '—';

// ─── Edit Staff Modal ─────────────────────────────────────────────────────────

function EditModal({ lawyer, onSave, onClose }) {
  const [form, setForm] = useState({
    full_name:      lawyer.full_name || '',
    phone:          lawyer.phone || '',
    email:          lawyer.email || '',
    role:           lawyer.role || 'lawyer',
    is_active:      lawyer.is_active !== false,
    monthly_salary: lawyer.monthly_salary || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setErr('');
    const res  = await fetch('/api/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lawyer.id, ...form, monthly_salary: form.monthly_salary ? Number(form.monthly_salary) : null }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(json.error || 'שגיאה'); return; }
    onSave(json.lawyer);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">עריכת פרטי עו"ד</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">שם מלא</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"/>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">טלפון (WhatsApp)</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="0501234567" dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"/>
            <p className="text-xs text-gray-400 mt-1">ישמש לשליחת עדכונים בוקריים ב-WhatsApp</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">אימייל</label>
            <input value={form.email} onChange={e => set('email', e.target.value)} type="email" dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"/>
            <p className="text-xs text-gray-400 mt-1">ישמש לשליחת סיכום בוקר גם במייל</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">תפקיד</label>
              <select value={form.role} onChange={e => set('role', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm">
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">משכורת חודשית (₪)</label>
              <input value={form.monthly_salary} onChange={e => set('monthly_salary', e.target.value)} type="number"
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-400"/>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}
              className="w-4 h-4"/>
            <span className="text-sm text-gray-700">עובד/ת פעיל/ה</span>
          </label>
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm">
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Digest Preview Modal ─────────────────────────────────────────────────────

function DigestPreviewModal({ lawyer, onClose }) {
  const [preview, setPreview]   = useState('');
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);
  const [sendResult, setSendResult] = useState('');

  useEffect(() => {
    // Fetch a preview by triggering the digest endpoint in dry-run style
    // We show the status cards as preview
    const lines = [];
    if (lawyer.open_tasks > 0) lines.push(`📋 ${lawyer.open_tasks} משימות פתוחות`);
    if (lawyer.active_matters > 0) lines.push(`📁 ${lawyer.active_matters} תיקים פעילים`);
    if (lawyer.total_balance > 0) lines.push(`💰 יתרה לגבייה: ${fmtMoney(lawyer.total_balance)}`);
    setPreview(lines.join('\n') || 'אין פריטים לשליחה');
    setLoading(false);
  }, [lawyer]);

  async function sendNow() {
    setSending(true); setSendResult('');
    const res  = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send-digest', lawyerId: lawyer.id }),
    });
    const json = await res.json();
    setSending(false);
    const result = json.results?.[0];
    if (result) {
      setSendResult(result.sent === false
        ? `דילוג: ${result.reason}`
        : `✅ נשלח! WhatsApp: ${result.waSent ? 'כן' : 'לא'}, מייל: ${result.emailSent ? 'כן' : 'לא'}`
      );
    } else {
      setSendResult(json.error || 'שגיאה לא ידועה');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">שליחת עדכון ל-{lawyer.full_name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="font-bold text-gray-800">{lawyer.open_tasks}</div>
              <div className="text-gray-500 text-xs">משימות פתוחות</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="font-bold text-gray-800">{lawyer.active_matters}</div>
              <div className="text-gray-500 text-xs">תיקים פעילים</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <div className="font-bold text-orange-700">{fmtMoney(lawyer.total_balance)}</div>
              <div className="text-gray-500 text-xs">יתרה לגבייה</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="font-bold text-gray-800">{lawyer.last_digest_at ? fmtDate(lawyer.last_digest_at) : '—'}</div>
              <div className="text-gray-500 text-xs">עדכון אחרון</div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <div className="font-semibold text-gray-700 mb-2">ייצלח אל:</div>
            {lawyer.phone
              ? <div className="flex items-center gap-2">✅ WhatsApp: {lawyer.phone}</div>
              : <div className="text-orange-500">⚠️ לא הוגדר מספר טלפון</div>}
            {lawyer.email
              ? <div className="flex items-center gap-2 mt-1">✅ מייל: {lawyer.email}</div>
              : <div className="text-gray-400 mt-1">אין מייל מוגדר</div>}
          </div>

          {!lawyer.phone && !lawyer.email && (
            <p className="text-orange-600 text-sm bg-orange-50 rounded-lg p-3">
              יש להגדיר טלפון או מייל לפני השליחה. לחץ "עריכה" להוספת פרטים.
            </p>
          )}

          {sendResult && (
            <p className={`text-sm p-3 rounded-lg ${sendResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {sendResult}
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={sendNow} disabled={sending || (!lawyer.phone && !lawyer.email)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm">
              {sending ? '⏳ שולח...' : '📲 שלח עדכון עכשיו'}
            </button>
            <button onClick={onClose} className="px-5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
              סגור
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const [lawyers,    setLawyers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editLawyer, setEditLawyer] = useState(null);
  const [digestLawyer, setDigestLawyer] = useState(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllMsg, setSendAllMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/staff');
    const json = await res.json();
    setLawyers(json.lawyers || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function sendAllDigests() {
    setSendingAll(true); setSendAllMsg('');
    const res  = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send-digest' }),
    });
    const json = await res.json();
    setSendingAll(false);
    if (json.results) {
      const sent = json.results.filter(r => r.waSent || r.emailSent).length;
      setSendAllMsg(`נשלח ל-${sent} מתוך ${json.results.length} עו"ד`);
    } else {
      setSendAllMsg(json.error || 'שגיאה');
    }
  }

  const active   = lawyers.filter(l => l.is_active);
  const inactive = lawyers.filter(l => !l.is_active);
  const totalBalance = active.reduce((s, l) => s + Number(l.total_balance || 0), 0);
  const totalOpenTasks = active.reduce((s, l) => s + (l.open_tasks || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {editLawyer   && <EditModal   lawyer={editLawyer}   onSave={u => { setLawyers(p => p.map(l => l.id === u.id ? { ...l, ...u } : l)); setEditLawyer(null); }} onClose={() => setEditLawyer(null)} />}
      {digestLawyer && <DigestPreviewModal lawyer={digestLawyer} onClose={() => setDigestLawyer(null)} />}

      {/* ── Header ── */}
      <div className="bg-white border-b px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <a href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">← תפריט</a>
          <h1 className="text-xl font-bold text-gray-900">👥 ניהול עובדים</h1>
          <div className="flex-1"/>
          <button onClick={sendAllDigests} disabled={sendingAll || loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium">
            {sendingAll ? '⏳ שולח...' : '📲 שלח עדכון לכולם'}
          </button>
          <a href="/cases" className="border border-gray-300 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
            📁 תיקים
          </a>
        </div>
        {sendAllMsg && <p className="text-sm mt-2 text-green-700">{sendAllMsg}</p>}
      </div>

      {/* ── Summary Cards ── */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4">
          {[
            { label: 'עובדים פעילים',    val: active.length,       color: 'text-blue-700',   bg: 'bg-blue-50   border-blue-200' },
            { label: 'משימות פתוחות סה"כ', val: totalOpenTasks,   color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
            { label: 'יתרת גבייה כוללת', val: `₪${Number(totalBalance).toLocaleString('he-IL')}`, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
            { label: 'כלי WhatsApp',      val: active.filter(l=>l.phone).length + '/' + active.length + ' מוגדרים', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
              <div className={`text-2xl font-bold ${c.color}`}>{c.val}</div>
              <div className="text-xs text-gray-600 mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Lawyers Table ── */}
      <div className="px-6 pb-8">
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-3xl mb-2">⏳</div><div>טוען...</div>
          </div>
        ) : (
          <>
            {/* Active */}
            <h2 className="text-base font-bold text-gray-700 mb-3">עובדים פעילים ({active.length})</h2>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['שם', 'תפקיד', 'טלפון', 'מייל', 'תיקים פעילים', 'משימות פתוחות', 'יתרה לגבייה', 'עדכון אחרון', 'פעולות'].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((l, i) => {
                    const hasPhone   = Boolean(l.phone);
                    const hasEmail   = Boolean(l.email);
                    const canNotify  = hasPhone || hasEmail;
                    return (
                      <tr key={l.id} className={`border-b hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-800">{l.full_name}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                            {ROLE_LABELS[l.role] || l.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {l.phone ? (
                            <span className="text-green-700 text-xs flex items-center gap-1">
                              <span>📱</span> {l.phone}
                            </span>
                          ) : (
                            <button onClick={() => setEditLawyer(l)} className="text-orange-400 text-xs hover:underline">
                              + הוסף טלפון
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate" title={l.email || ''}>
                          {l.email || <button onClick={() => setEditLawyer(l)} className="text-orange-400 hover:underline">+ הוסף מייל</button>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-medium text-gray-800">{l.active_matters}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {l.open_tasks > 0 ? (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium">
                              {l.open_tasks}
                            </span>
                          ) : (
                            <span className="text-green-500 text-xs">✅ 0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {l.total_balance > 0 ? (
                            <span className="text-orange-700 font-medium text-sm">{fmtMoney(l.total_balance)}</span>
                          ) : (
                            <span className="text-green-500 text-xs">✅ ללא יתרה</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {l.last_digest_at ? (
                            <>
                              <div>{fmtDate(l.last_digest_at)}</div>
                              <div className="flex gap-1 mt-0.5">
                                {l.last_digest_wa && <span className="text-green-500" title="WhatsApp נשלח">📱</span>}
                              </div>
                            </>
                          ) : (
                            <span className="text-gray-300">לא נשלח</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditLawyer(l)}
                              className="text-xs border border-gray-300 px-2 py-1 rounded-lg hover:bg-gray-50">
                              עריכה
                            </button>
                            <button onClick={() => setDigestLawyer(l)} disabled={!canNotify}
                              title={canNotify ? 'שלח עדכון' : 'יש להגדיר טלפון/מייל'}
                              className={`text-xs px-2 py-1 rounded-lg font-medium
                                ${canNotify ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                              📲 שלח
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {active.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-8 text-gray-400">אין עובדים פעילים</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Inactive */}
            {inactive.length > 0 && (
              <>
                <h2 className="text-base font-bold text-gray-400 mb-3">לא פעילים ({inactive.length})</h2>
                <div className="bg-white rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {inactive.map(l => (
                        <tr key={l.id} className="border-b opacity-60">
                          <td className="px-4 py-3 font-medium text-gray-500">{l.full_name}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{ROLE_LABELS[l.role] || l.role}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => setEditLawyer(l)} className="text-xs border border-gray-300 px-2 py-1 rounded hover:bg-gray-50">עריכה</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* How digests work */}
            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
              <h3 className="font-bold text-blue-800 mb-3">📲 כיצד עובדים העדכונים האוטומטיים?</h3>
              <div className="grid md:grid-cols-3 gap-4 text-sm text-blue-900">
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <div className="font-semibold mb-1">🌅 07:00 כל בוקר (א׳–ה׳)</div>
                  <div className="text-xs text-gray-600">כל עו"ד מקבל WhatsApp / מייל אישי עם: משימות שעברו את המועד, משימות להיום ולשבוע, תאריכי מסירה קרובים, ותיקים עם יתרת גבייה.</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <div className="font-semibold mb-1">📋 תוכן העדכון</div>
                  <div className="text-xs text-gray-600">
                    🔴 משימות שעברו המועד<br/>
                    📌 משימות להיום<br/>
                    📋 משימות לשבוע<br/>
                    🚨 מסירות שעברו<br/>
                    📅 מסירות קרובות (14 יום)<br/>
                    💰 גבייה פתוחה
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <div className="font-semibold mb-1">⚙️ הגדרה</div>
                  <div className="text-xs text-gray-600">לכל עו"ד חובה להגדיר מספר טלפון (WhatsApp) או כתובת מייל. לחץ "עריכה" ליד כל עו"ד להוספת פרטי קשר.</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
