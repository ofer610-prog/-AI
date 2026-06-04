'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_OPTIONS = [
  { val: 'draft',        label: 'טיוטה' },
  { val: 'conditional',  label: 'מותנה' },
  { val: 'waiting',      label: 'ממתין לצד שני' },
  { val: 'signed',       label: 'נחתם' },
  { val: 'registration', label: 'ברישום' },
  { val: 'closed',       label: 'סגור' },
];

const TYPE_OPTIONS = [
  { val: 'sale',         label: 'מכירה' },
  { val: 'purchase',     label: 'רכישה' },
  { val: 'rental',       label: 'שכירות' },
  { val: 'tama38',       label: 'תמ"א 38' },
  { val: 'pinui',        label: 'פינוי בינוי' },
  { val: 'inheritance',  label: 'ירושה' },
  { val: 'registration', label: 'רישום' },
  { val: 'mortgage',     label: 'משכנתא' },
  { val: 'litigation',   label: 'ליטיגציה' },
  { val: 'consulting',   label: 'ייעוץ' },
  { val: 'other',        label: 'אחר' },
];

const STAGE_COLOR = {
  draft:        'bg-blue-100 text-blue-800',
  conditional:  'bg-yellow-100 text-yellow-800',
  waiting:      'bg-orange-100 text-orange-800',
  signed:       'bg-green-100 text-green-800',
  registration: 'bg-purple-100 text-purple-800',
  closed:       'bg-gray-200 text-gray-500',
};

const labelOf = (opts, val) => opts.find(o => o.val === val)?.label || val || '';

// ─── PIN Screen ───────────────────────────────────────────────────────────────

function PinScreen({ onUnlock }) {
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!pin) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/cases/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (json.ok) {
        sessionStorage.setItem('cases_unlocked', Date.now());
        onUnlock();
      } else {
        setError('קוד שגוי. נסה שנית.');
        setPin('');
        inputRef.current?.focus();
      }
    } catch { setError('שגיאת רשת'); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-80 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">ניהול תיקים</h1>
        <p className="text-sm text-gray-500 mb-6">כהן-רוגוזינסקי עורכי דין</p>
        <form onSubmit={submit} className="space-y-4">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="הזן קוד גישה"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-center text-2xl
              tracking-widest focus:border-blue-500 focus:outline-none"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white
              font-semibold rounded-xl py-3 transition-colors"
          >
            {loading ? '...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Editable Cell ────────────────────────────────────────────────────────────

function EditableCell({ value, onSave, type = 'text', options, placeholder = '' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setVal(value ?? ''); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = typeof val === 'string' ? val.trim() : val;
    if (String(trimmed) !== String(value ?? '')) onSave(trimmed || null);
  }

  function keyDown(e) {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') { setVal(value ?? ''); setEditing(false); }
  }

  if (editing && options) {
    return (
      <select ref={inputRef} value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
        className="w-full border border-blue-400 rounded px-1 py-0.5 text-sm bg-white">
        <option value="">—</option>
        {options.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
      </select>
    );
  }

  if (editing) {
    return (
      <input ref={inputRef} type={type} value={val}
        onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={keyDown}
        placeholder={placeholder}
        className="w-full border border-blue-400 rounded px-1 py-0.5 text-sm"/>
    );
  }

  const display = options ? labelOf(options, value) : (value ?? '');
  return (
    <div onClick={() => setEditing(true)}
      className="min-h-[22px] px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 truncate text-sm"
      title={String(display || 'לחץ לעריכה')}>
      {display || <span className="text-gray-300 text-xs">{placeholder || '+'}</span>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CasesPage() {
  const [unlocked,   setUnlocked]   = useState(false);
  const [matters,    setMatters]    = useState([]);
  const [lawyers,    setLawyers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [stage,      setStage]      = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search,     setSearch]     = useState('');
  const [syncing,    setSyncing]    = useState(false);
  const [syncMsg,    setSyncMsg]    = useState('');
  const [newRow,     setNewRow]     = useState(null);
  const [adding,     setAdding]     = useState(false);

  // Check session
  useEffect(() => {
    const ts = sessionStorage.getItem('cases_unlocked');
    if (ts && Date.now() - Number(ts) < 8 * 60 * 60 * 1000) setUnlocked(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stage)      params.set('stage', stage);
    if (typeFilter) params.set('type', typeFilter);
    if (search)     params.set('q', search);
    const res  = await fetch(`/api/matters?${params}`);
    const json = await res.json();
    setMatters(json.matters || []);
    setLawyers(json.lawyers || []);
    setLoading(false);
  }, [stage, typeFilter, search]);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  async function saveField(matterId, field, value, isClient = false) {
    const body = isClient ? { id: matterId, [field]: value } : { id: matterId, [field]: value };
    await fetch('/api/matters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setMatters(prev => prev.map(m => {
      if (m.id !== matterId) return m;
      if (isClient) return { ...m, clients: { ...m.clients, [field.replace('client_', '')]: value } };
      return { ...m, [field]: value };
    }));
  }

  async function addMatter() {
    if (!newRow?.client_name) return;
    setAdding(true);
    const res  = await fetch('/api/matters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRow),
    });
    const json = await res.json();
    if (json.matter) { setMatters(prev => [json.matter, ...prev]); setNewRow(null); }
    setAdding(false);
  }

  async function syncNow() {
    setSyncing(true); setSyncMsg('');
    try {
      const res  = await fetch('/api/cron/sync-gdrive', { method: 'POST' });
      const json = await res.json();
      setSyncMsg(json.ok ? `סונכרן: ${json.matters||0} תיקים` : 'שגיאה: ' + (json.error||'לא ידוע'));
      if (json.ok) load();
    } catch { setSyncMsg('שגיאת רשת'); }
    setSyncing(false);
  }

  const lawyerOpts = lawyers.map(l => ({ val: l.id, label: l.full_name }));

  if (!unlocked) return <PinScreen onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* ── Header ── */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-30 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900">📁 ניהול תיקים</h1>

          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לקוח / נכס..."
            className="border rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-blue-400"/>

          <select value={stage} onChange={e => setStage(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none">
            <option value="">כל השלבים</option>
            {STAGE_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
          </select>

          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none">
            <option value="">כל הסוגים</option>
            {TYPE_OPTIONS.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
          </select>

          <span className="text-sm text-gray-400">{matters.length} תיקים</span>
          <div className="flex-1"/>

          <button onClick={() => setNewRow(newRow ? null : {})}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg">
            {newRow ? '✕ ביטול' : '+ תיק חדש'}
          </button>

          <button onClick={syncNow} disabled={syncing}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">
            {syncing ? '⏳ מסנכרן...' : '🔄 סנכרן Excel'}
          </button>

          <button onClick={() => { sessionStorage.removeItem('cases_unlocked'); setUnlocked(false); }}
            title="נעל" className="text-gray-400 hover:text-gray-600 px-2 py-1.5 text-lg">🔒</button>
        </div>
        {syncMsg && <p className="text-xs mt-1 text-green-700">{syncMsg}</p>}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: '1900px' }}>
          <thead className="bg-gray-100 sticky top-[57px] z-20">
            <tr>
              {[
                ['שם לקוח',      '160px', true],
                ['ת.ז.',         '90px'],
                ['טלפון',        '110px'],
                ['כתובת נכס',    '180px'],
                ['גוש/חלקה',     '100px'],
                ['שלב',          '120px'],
                ['סוג',          '100px'],
                ['תאריך מסירה',  '130px'],
                ['עו"ד שכנגד',   '120px'],
                ['מתווך',        '100px'],
                ['שכ"ט',         '85px'],
                ['שולם',         '80px'],
                ['יתרה',         '80px'],
                ['סטטוס תשלום',  '120px'],
                ['משכנתא',       '100px'],
                ['מס שבח',       '95px'],
                ['ועדת תכנון',   '100px'],
                ['ועדה מקומית',  '110px'],
                ['עו"ד אחראי',   '120px'],
                ['הערות',        '200px'],
              ].map(([label, w, sticky]) => (
                <th key={label}
                  className={`px-2 py-2 text-right font-semibold border-b text-xs whitespace-nowrap
                    ${sticky ? 'sticky right-0 bg-gray-100 border-l z-10' : ''}`}
                  style={{ minWidth: w }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* ── Add new row ── */}
            {newRow && (
              <tr className="bg-green-50 border-b-2 border-green-300">
                <td className="px-1 py-1 border-l sticky right-0 bg-green-50 z-10">
                  <input autoFocus value={newRow.client_name||''} placeholder="שם לקוח *"
                    onChange={e=>setNewRow(p=>({...p,client_name:e.target.value}))}
                    className="w-full border border-green-400 rounded px-1 py-0.5 text-sm"/>
                </td>
                {[
                  ['client_id_number','ת.ז.','text'],
                  ['client_phone','טלפון','tel'],
                  ['property_address','כתובת','text'],
                  ['parcel','גוש/חלקה','text'],
                ].map(([f,ph,t])=>(
                  <td key={f} className="px-1 py-1">
                    <input value={newRow[f]||''} placeholder={ph} type={t}
                      onChange={e=>setNewRow(p=>({...p,[f]:e.target.value}))}
                      className="w-full border rounded px-1 py-0.5 text-sm"/>
                  </td>
                ))}
                <td className="px-1 py-1">
                  <select value={newRow.stage||'draft'} onChange={e=>setNewRow(p=>({...p,stage:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm">
                    {STAGE_OPTIONS.map(s=><option key={s.val} value={s.val}>{s.label}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <select value={newRow.type||'other'} onChange={e=>setNewRow(p=>({...p,type:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm">
                    {TYPE_OPTIONS.map(t=><option key={t.val} value={t.val}>{t.label}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input type="date" value={newRow.delivery_date||''} onChange={e=>setNewRow(p=>({...p,delivery_date:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                {[['other_lawyer','עו״ד'],['broker','מתווך']].map(([f,ph])=>(
                  <td key={f} className="px-1 py-1">
                    <input value={newRow[f]||''} placeholder={ph} onChange={e=>setNewRow(p=>({...p,[f]:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                  </td>
                ))}
                {[['agreed_fee','שכ"ט'],['collected_amount','שולם'],['balance_amount','יתרה']].map(([f,ph])=>(
                  <td key={f} className="px-1 py-1">
                    <input type="number" value={newRow[f]||''} placeholder={ph} onChange={e=>setNewRow(p=>({...p,[f]:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                  </td>
                ))}
                {[['payment_status','סטטוס תשלום'],['mortgage','משכנתא'],['capital_gains','מס שבח'],['committee_status','ועדה'],['municipality_status','ועדה מקומית']].map(([f,ph])=>(
                  <td key={f} className="px-1 py-1">
                    <input value={newRow[f]||''} placeholder={ph} onChange={e=>setNewRow(p=>({...p,[f]:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                  </td>
                ))}
                <td className="px-1 py-1">
                  <select value={newRow.responsible_lawyer_id||''} onChange={e=>setNewRow(p=>({...p,responsible_lawyer_id:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm">
                    <option value="">—</option>
                    {lawyers.map(l=><option key={l.id} value={l.id}>{l.full_name}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1 flex gap-1">
                  <input value={newRow.description||''} placeholder="הערות" onChange={e=>setNewRow(p=>({...p,description:e.target.value}))} className="flex-1 border rounded px-1 py-0.5 text-sm"/>
                  <button onClick={addMatter} disabled={adding||!newRow.client_name} className="bg-green-600 text-white px-2 rounded text-xs disabled:bg-gray-300">שמור</button>
                </td>
              </tr>
            )}

            {loading && (
              <tr><td colSpan={20} className="text-center py-12 text-gray-400">טוען...</td></tr>
            )}

            {!loading && matters.map((m, idx) => {
              const daysLeft = m.delivery_date
                ? Math.round((new Date(m.delivery_date) - new Date()) / 86400000) : null;
              const rowBg = daysLeft != null && daysLeft < 0 ? 'bg-red-50'
                : daysLeft != null && daysLeft <= 7 ? 'bg-yellow-50'
                : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

              return (
                <tr key={m.id} className={`${rowBg} hover:bg-blue-50 border-b transition-colors`}>
                  {/* Sticky: שם לקוח */}
                  <td className={`px-1 py-1 border-l sticky right-0 z-10 ${rowBg} hover:bg-blue-50`}>
                    <EditableCell value={m.clients?.name}
                      onSave={v=>saveField(m.id,'client_name',v,true)} placeholder="שם לקוח"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.clients?.id_number}
                      onSave={v=>saveField(m.id,'client_id_number',v,true)} placeholder="ת.ז."/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.clients?.phone}
                      onSave={v=>saveField(m.id,'client_phone',v,true)} type="tel" placeholder="טלפון"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.property_address}
                      onSave={v=>saveField(m.id,'property_address',v)} placeholder="כתובת"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.parcel}
                      onSave={v=>saveField(m.id,'parcel',v)} placeholder="גוש/חלקה"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.stage} onSave={v=>saveField(m.id,'stage',v)} options={STAGE_OPTIONS}/>
                    {m.stage && (
                      <span className={`block mt-0.5 text-xs px-1.5 py-0.5 rounded-full w-fit ${STAGE_COLOR[m.stage]||'bg-gray-100'}`}>
                        {labelOf(STAGE_OPTIONS,m.stage)}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.type} onSave={v=>saveField(m.id,'type',v)} options={TYPE_OPTIONS}/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.delivery_date} onSave={v=>saveField(m.id,'delivery_date',v)} type="date"/>
                    {daysLeft != null && (
                      <div className={`text-xs font-medium ${daysLeft<0?'text-red-600':daysLeft<=7?'text-orange-500':'text-gray-400'}`}>
                        {daysLeft<0?`${Math.abs(daysLeft)}י׳ איחור`:daysLeft===0?'היום':`${daysLeft} ימים`}
                      </div>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.other_lawyer} onSave={v=>saveField(m.id,'other_lawyer',v)} placeholder="עו״ד"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.broker} onSave={v=>saveField(m.id,'broker',v)} placeholder="מתווך"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.agreed_fee} onSave={v=>saveField(m.id,'agreed_fee',v)} type="number" placeholder="₪"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.collected_amount} onSave={v=>saveField(m.id,'collected_amount',v)} type="number" placeholder="₪"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.balance_amount} onSave={v=>saveField(m.id,'balance_amount',v)} type="number" placeholder="₪"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.payment_status} onSave={v=>saveField(m.id,'payment_status',v)} placeholder="סטטוס"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.mortgage} onSave={v=>saveField(m.id,'mortgage',v)} placeholder="משכנתא"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.capital_gains} onSave={v=>saveField(m.id,'capital_gains',v)} placeholder="שבח"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.committee_status} onSave={v=>saveField(m.id,'committee_status',v)} placeholder="ועדה"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.municipality_status} onSave={v=>saveField(m.id,'municipality_status',v)} placeholder="ועדה מקומית"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.responsible_lawyer_id} onSave={v=>saveField(m.id,'responsible_lawyer_id',v)} options={lawyerOpts}/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell value={m.description} onSave={v=>saveField(m.id,'description',v)} placeholder="הערות"/>
                  </td>
                </tr>
              );
            })}

            {!loading && matters.length === 0 && (
              <tr>
                <td colSpan={20} className="text-center py-16 text-gray-400">
                  <div className="text-4xl mb-2">📂</div>
                  <div>אין תיקים. לחץ "סנכרן Excel" לייבוא, או "תיק חדש" להוספה ידנית.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="fixed bottom-4 left-4 bg-white border rounded-lg shadow-md p-3 text-xs text-gray-500 space-y-1">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-100 border rounded inline-block"/>באיחור</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-100 border rounded inline-block"/>7 ימים קרובים</div>
        <div className="text-gray-400 mt-1">לחץ על תא לעריכה</div>
      </div>
    </div>
  );
}
