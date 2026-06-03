'use client';
import { useState, useEffect, useCallback } from 'react';

const STAGES = [
  { val: '',              label: 'הכל' },
  { val: 'draft',        label: 'טיוטה' },
  { val: 'conditional',  label: 'מותנה' },
  { val: 'waiting',      label: 'ממתין לצד שני' },
  { val: 'signed',       label: 'נחתם' },
  { val: 'registration', label: 'ברישום' },
  { val: 'closed',       label: 'סגור' },
];

const STAGE_HEB = {
  draft: 'טיוטה', conditional: 'מותנה', waiting: 'ממתין לצד שני',
  signed: 'נחתם', registration: 'ברישום', closed: 'סגור',
};

const STAGE_COLOR = {
  draft:        'bg-blue-100 text-blue-800',
  conditional:  'bg-yellow-100 text-yellow-800',
  waiting:      'bg-orange-100 text-orange-800',
  signed:       'bg-green-100 text-green-800',
  registration: 'bg-purple-100 text-purple-800',
  closed:       'bg-gray-100 text-gray-600',
};

const PAY_COLOR = {
  'שולם':              'text-green-600',
  'לא שולם':           'text-red-600',
  'חלקי':              'text-orange-500',
  'ממתין לתשלום':      'text-yellow-600',
};

export default function CasesPage() {
  const [matters, setMatters]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [stage, setStage]       = useState('');
  const [mine, setMine]         = useState(false);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState(null);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stage)  params.set('stage', stage);
    if (mine)   params.set('mine', 'true');
    if (search) params.set('q', search);
    const res  = await fetch(`/api/matters?${params}`);
    const json = await res.json();
    setMatters(json.matters || []);
    setLoading(false);
  }, [stage, mine, search]);

  useEffect(() => { load(); }, [load]);

  async function syncNow() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res  = await fetch('/api/cron/sync-gdrive', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setSyncMsg(`סונכרן: ${json.matters || 0} תיקים, ${json.clients || 0} לקוחות, ${json.tasks || 0} משימות`);
        load();
      } else {
        setSyncMsg('שגיאה: ' + (json.error || 'לא ידוע'));
      }
    } catch { setSyncMsg('שגיאת רשת'); }
    setSyncing(false);
  }

  async function updateMatter(id, updates) {
    await fetch('/api/matters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    load();
  }

  const days = (d) => {
    if (!d) return null;
    const diff = Math.round((new Date(d) - new Date()) / 86400000);
    return diff;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ניהול תיקים</h1>
            <p className="text-sm text-gray-500">מסונכרן אוטומטית עם קובץ Excel בגוגל דרייב</p>
          </div>
          <div className="flex gap-2 items-center">
            {syncMsg && <span className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded">{syncMsg}</span>}
            <button
              onClick={syncNow}
              disabled={syncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? 'מסנכרן...' : 'סנכרן עכשיו'}
            </button>
            <a href="/calendar" className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">לוח שנה</a>
            <a href="/tasks" className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">משימות</a>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="חיפוש לפי שם לקוח..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-48"
          />
          <div className="flex gap-1">
            {STAGES.map((s) => (
              <button
                key={s.val}
                onClick={() => setStage(s.val)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  stage === s.val
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mr-auto">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="rounded" />
            רק התיקים שלי
          </label>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {STAGES.slice(1).map((s) => {
            const count = matters.filter((m) => m.stage === s.val).length;
            return (
              <div key={s.val}
                onClick={() => setStage(stage === s.val ? '' : s.val)}
                className="bg-white border rounded-xl p-3 cursor-pointer hover:border-blue-400 transition"
              >
                <div className="text-2xl font-bold text-gray-800">{count}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">טוען...</div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">לקוח / תיק</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">כתובת</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">עו"ד מטפל</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">שלב</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך מסירה</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">שכ"ט</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">תשלום</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matters.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      אין תיקים. לחץ "סנכרן עכשיו" לטעינה מגוגל דרייב.
                    </td>
                  </tr>
                )}
                {matters.map((m) => {
                  const daysToDelivery = days(m.delivery_date);
                  const isUrgent = daysToDelivery !== null && daysToDelivery <= 7 && daysToDelivery >= 0;
                  const isOverdue = daysToDelivery !== null && daysToDelivery < 0;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelected(m)}
                      className={`hover:bg-blue-50 cursor-pointer transition-colors ${isUrgent ? 'bg-yellow-50' : ''} ${isOverdue ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{m.title}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{m.property_address || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {m.profiles?.full_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLOR[m.stage] || 'bg-gray-100 text-gray-600'}`}>
                          {STAGE_HEB[m.stage] || m.stage || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {m.delivery_date ? (
                          <span>
                            {new Date(m.delivery_date).toLocaleDateString('he-IL')}
                            {daysToDelivery !== null && (
                              <span className={`mr-1 text-xs ${isOverdue ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-gray-400'}`}>
                                ({daysToDelivery < 0 ? `${Math.abs(daysToDelivery)} ימים איחור` : `${daysToDelivery} ימים`})
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {m.agreed_fee ? `₪${Number(m.agreed_fee).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${PAY_COLOR[m.payment_status] || 'text-gray-500'}`}>
                          {m.payment_status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">פרטים</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Side panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex" onClick={() => setSelected(null)}>
          <div className="mr-auto w-full max-w-lg bg-white h-full overflow-y-auto p-6" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold">{selected.title}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{selected.property_address}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <div className="space-y-4">
              <Field label="עו\"ד מטפל" value={selected.profiles?.full_name} />
              <Field label="שלב" value={STAGE_HEB[selected.stage] || selected.stage} />
              <Field label="תאריך מסירה" value={selected.delivery_date ? new Date(selected.delivery_date).toLocaleDateString('he-IL') : null} />
              <Field label="גוש / חלקה" value={selected.parcel} />
              <Field label="שכ\"ט" value={selected.agreed_fee ? `₪${Number(selected.agreed_fee).toLocaleString()}` : null} />
              <Field label="נגבה" value={selected.collected_amount ? `₪${Number(selected.collected_amount).toLocaleString()}` : null} />
              <Field label="יתרה" value={selected.balance_amount ? `₪${Number(selected.balance_amount).toLocaleString()}` : null} />
              <Field label="סטטוס תשלום" value={selected.payment_status} />
              <Field label="עו\"ד צד שני" value={selected.other_lawyer} />
              <Field label="מתווך" value={selected.broker} />
              <Field label="משכנתא" value={selected.mortgage} />
              <Field label="מס שבח" value={selected.capital_gains} />
              <Field label="וועדה" value={selected.committee_status} />
              <Field label="עירייה/ארנונה" value={selected.municipality_status} />
              {selected.description && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">הערות</p>
                  <p className="text-sm text-gray-800 bg-gray-50 rounded p-3 whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}
            </div>

            <div className="mt-6 border-t pt-4">
              <p className="text-xs text-gray-500 mb-2">עדכון שלב</p>
              <div className="flex flex-wrap gap-2">
                {STAGES.slice(1).map((s) => (
                  <button
                    key={s.val}
                    onClick={async () => {
                      await updateMatter(selected.id, { stage: s.val });
                      setSelected({ ...selected, stage: s.val });
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border font-medium transition ${
                      selected.stage === s.val
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-2 border-b border-gray-100">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}
