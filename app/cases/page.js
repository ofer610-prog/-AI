'use client';
import { useState, useEffect, useCallback, useRef, Fragment } from 'react';

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

const fmtMoney = v => v ? `₪${Number(v).toLocaleString('he-IL')}` : '';
const labelOf  = (opts, val) => opts.find(o => o.val === val)?.label || val || '';

// ─── PIN Screen ───────────────────────────────────────────────────────────────

function PinScreen({ onUnlock, onClose }) {
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!pin) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/cases/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (json.ok) {
        sessionStorage.setItem('cases_unlocked', Date.now());
        sessionStorage.setItem('cases_pin', pin);
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
    <div className="fixed inset-0 bg-gray-900/95 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-80 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">כניסה לעריכה</h1>
        <p className="text-sm text-gray-500 mb-6">הזן קוד גישה כדי לערוך ולהוסיף תיקים</p>
        <form onSubmit={submit} className="space-y-4">
          <input
            ref={inputRef} type="password" inputMode="numeric" maxLength={8}
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="הזן קוד גישה"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:border-blue-500 focus:outline-none"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading || !pin}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl py-3 transition-colors">
            {loading ? '...' : 'כניסה'}
          </button>
          {onClose && (
            <button type="button" onClick={onClose}
              className="w-full text-gray-500 hover:text-gray-700 text-sm py-1">
              ביטול — המשך בצפייה בלבד
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Editable Cell ────────────────────────────────────────────────────────────

function EditableCell({ value, onSave, type = 'text', options, placeholder = '', currency = false, colType, editable = true }) {
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
        {options.map(o => <option key={o.val ?? o} value={o.val ?? o}>{o.label ?? o}</option>)}
      </select>
    );
  }

  if (editing) {
    return (
      <input ref={inputRef} type={colType === 'number' ? 'number' : colType === 'date' ? 'date' : type}
        value={val} onChange={e => setVal(e.target.value)}
        onBlur={commit} onKeyDown={keyDown} placeholder={placeholder}
        className="w-full border border-blue-400 rounded px-1 py-0.5 text-sm"/>
    );
  }

  const display = options ? labelOf(options, value) : (value ?? '');
  const shown   = currency && display ? fmtMoney(display) : display;

  if (!editable) {
    return (
      <div className="min-h-[22px] px-1 py-0.5 truncate text-sm" title={String(display || '')}>
        {shown || <span className="text-gray-300 text-xs">—</span>}
      </div>
    );
  }

  return (
    <div onClick={() => setEditing(true)}
      className="min-h-[22px] px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 truncate text-sm"
      title={String(display || 'לחץ לעריכה')}>
      {shown || <span className="text-gray-300 text-xs">{placeholder || '+'}</span>}
    </div>
  );
}

// ─── Add Column Modal ─────────────────────────────────────────────────────────

function AddColumnModal({ onAdd, onClose }) {
  const [name, setName]     = useState('');
  const [type, setType]     = useState('text');
  const [opts, setOpts]     = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('שם עמודה חובה'); return; }
    setSaving(true); setErr('');
    const options = type === 'select'
      ? opts.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    const res  = await fetch('/api/cases/columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), col_type: type, options }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(json.error || 'שגיאה'); return; }
    onAdd(json.column);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h2 className="font-bold text-gray-800 mb-4">➕ הוסף עמודה חדשה</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">שם העמודה</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="לדוג׳: מס׳ זהות מוכר" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">סוג</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="text">טקסט</option>
              <option value="number">מספר</option>
              <option value="date">תאריך</option>
              <option value="select">רשימה</option>
            </select>
          </div>
          {type === 'select' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">אפשרויות (מופרדות בפסיק)</label>
              <input value={opts} onChange={e => setOpts(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="כן,לא,ממתין" />
            </div>
          )}
          {err && <p className="text-red-500 text-xs">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'שומר...' : 'הוסף עמודה'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CasesPage() {
  const [unlocked,    setUnlocked]    = useState(false);
  const [matters,     setMatters]     = useState([]);
  const [lawyers,     setLawyers]     = useState([]);
  const [customCols,  setCustomCols]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [stage,       setStage]       = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [search,      setSearch]      = useState('');
  const [syncing,     setSyncing]     = useState(false);
  const [syncMsg,     setSyncMsg]     = useState('');
  const [newRow,      setNewRow]      = useState(null);
  const [adding,      setAdding]      = useState(false);
  const [showAddCol,  setShowAddCol]  = useState(false);
  const [deletingCol, setDeletingCol] = useState(null);
  const [showPin,     setShowPin]     = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const fileInputRef = useRef(null);

  // Check PIN session (8h)
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
    const [mRes, cRes] = await Promise.all([
      fetch(`/api/matters?${params}`),
      fetch('/api/cases/columns'),
    ]);
    const mJson = await mRes.json();
    const cJson = await cRes.json();
    setMatters(mJson.matters || []);
    setLawyers(mJson.lawyers || []);
    setCustomCols(cJson.columns || []);
    setLoading(false);
  }, [stage, typeFilter, search]);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  // Save a field on a matter
  async function saveField(matterId, field, value, isClient = false) {
    const body = { id: matterId, [field]: value };
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

  // Save a custom column value into extra_data
  async function saveExtra(matterId, colId, value) {
    const matter = matters.find(m => m.id === matterId);
    const extra  = { ...(matter?.extra_data || {}), [colId]: value };
    await fetch('/api/matters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: matterId, extra_data: extra }),
    });
    setMatters(prev => prev.map(m =>
      m.id === matterId ? { ...m, extra_data: extra } : m
    ));
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
      const pin = sessionStorage.getItem('cases_pin') || '';
      const res  = await fetch('/api/cron/sync-gdrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      setSyncMsg(json.ok ? `סונכרן: ${json.matters||0} תיקים` : 'שגיאה: ' + (json.error||'לא ידוע'));
      if (json.ok) load();
    } catch { setSyncMsg('שגיאת רשת'); }
    setSyncing(false);
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setSyncMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch('/api/cases/upload-xlsx', { method: 'POST', body: fd });
      const json = await res.json();
      setSyncMsg(json.ok
        ? `יובאו ${json.matters||0} תיקים, ${json.clients||0} לקוחות, ${json.tasks||0} משימות`
        : 'שגיאה: ' + (json.error||'לא ידוע'));
      if (json.ok) load();
    } catch { setSyncMsg('שגיאת העלאה'); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function deleteColumn(col) {
    if (!confirm(`למחוק את העמודה "${col.name}"? הנתונים יאבדו.`)) return;
    setDeletingCol(col.id);
    await fetch(`/api/cases/columns?id=${col.id}`, { method: 'DELETE' });
    setCustomCols(prev => prev.filter(c => c.id !== col.id));
    setDeletingCol(null);
  }

  const lawyerOpts = lawyers.map(l => ({ val: l.id, label: l.full_name }));

  // Group: before signing → after signing, each sorted new→old
  const PRE_SIGN  = ['draft','conditional','waiting'];
  const POST_SIGN = ['signed','registration','closed'];
  const byGroup   = (m) => PRE_SIGN.includes(m.stage) ? 0 : POST_SIGN.includes(m.stage) ? 1 : 2;
  const sortedMatters = [...matters].sort((a, b) => {
    const gd = byGroup(a) - byGroup(b);
    if (gd !== 0) return gd;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  // Pre-calculate group counts to avoid O(n²) in map
  const groupCounts = sortedMatters.reduce((acc, m) => {
    const g = byGroup(m);
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});

  // Fixed columns definition
  const FIXED_COLS = [
    { key: 'client_name',         label: 'שם לקוח',       w: '150px', sticky: true },
    { key: 'client_id_number',    label: 'ת.ז.',           w: '90px' },
    { key: 'client_phone',        label: 'טלפון',          w: '110px' },
    { key: 'property_address',    label: 'כתובת נכס',      w: '180px' },
    { key: 'parcel',              label: 'גוש/חלקה',       w: '100px' },
    { key: 'stage',               label: 'שלב',            w: '130px' },
    { key: 'type',                label: 'סוג תיק',        w: '105px' },
    { key: 'delivery_date',       label: 'תאריך מסירה',    w: '130px' },
    { key: 'responsible_lawyer_id', label: 'עו"ד אחראי',  w: '120px' },
    { key: 'other_lawyer',        label: 'עו"ד שכנגד',     w: '120px' },
    { key: 'broker',              label: 'מתווך',          w: '100px' },
    { key: 'agreed_fee',          label: 'שכ"ט',           w: '90px',  currency: true },
    { key: 'collected_amount',    label: 'נגבה',           w: '85px',  currency: true },
    { key: 'balance_amount',      label: 'יתרה',           w: '85px',  currency: true },
    { key: 'payment_status',      label: 'סטטוס תשלום',    w: '120px' },
    { key: 'mortgage',            label: 'משכנתא',         w: '100px' },
    { key: 'capital_gains',       label: 'מס שבח',         w: '95px' },
    { key: 'committee_status',    label: 'ועדת תכנון',     w: '100px' },
    { key: 'municipality_status', label: 'עירייה/ארנונה',  w: '115px' },
    { key: 'description',         label: 'הערות',          w: '200px' },
  ];

  const totalCols = FIXED_COLS.length + customCols.length + 1; // +1 for add-col button col

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {showPin && (
        <PinScreen
          onUnlock={() => { setUnlocked(true); setShowPin(false); }}
          onClose={() => setShowPin(false)}
        />
      )}

      {showAddCol && (
        <AddColumnModal
          onAdd={col => { setCustomCols(prev => [...prev, col]); setShowAddCol(false); }}
          onClose={() => setShowAddCol(false)}
        />
      )}

      {/* ── Header ── */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-30 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/dashboard"
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            title="חזרה לתפריט הנהלת החשבונות">
            ← תפריט
          </a>
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

          {unlocked ? (
            <>
              <button onClick={() => setNewRow(newRow ? null : {})}
                className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg">
                {newRow ? '✕ ביטול' : '+ תיק חדש'}
              </button>

              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                onChange={uploadFile} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">
                {uploading ? '⏳ מעלה...' : '⬆️ העלה קובץ Excel'}
              </button>

              <button onClick={syncNow} disabled={syncing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">
                {syncing ? '⏳...' : '🔄 סנכרן Drive'}
              </button>

              <button onClick={() => setShowAddCol(true)}
                className="border border-purple-400 text-purple-700 hover:bg-purple-50 text-sm px-3 py-1.5 rounded-lg">
                ＋ עמודה
              </button>

              <button onClick={() => { sessionStorage.removeItem('cases_unlocked'); sessionStorage.removeItem('cases_pin'); setUnlocked(false); setNewRow(null); }}
                title="נעל עריכה" className="text-gray-400 hover:text-gray-600 px-2 py-1.5 text-lg">🔓</button>
            </>
          ) : (
            <button onClick={() => setShowPin(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1">
              🔒 כניסה לעריכה
            </button>
          )}
        </div>
        {syncMsg && <p className="text-xs mt-1 text-green-700">{syncMsg}</p>}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse"
          style={{ minWidth: `${FIXED_COLS.reduce((s,c)=>s+parseInt(c.w),0) + customCols.length*140 + 50}px` }}>
          <thead className="bg-gray-100 sticky top-[57px] z-20">
            <tr>
              {FIXED_COLS.map(col => (
                <th key={col.key}
                  className={`px-2 py-2 text-right font-semibold border-b text-xs whitespace-nowrap
                    ${col.sticky ? 'sticky right-0 bg-gray-100 border-l z-10' : ''}`}
                  style={{ minWidth: col.w }}>
                  {col.label}
                </th>
              ))}
              {customCols.map(col => (
                <th key={col.id}
                  className="px-2 py-2 text-right font-semibold border-b text-xs whitespace-nowrap bg-purple-50"
                  style={{ minWidth: '140px' }}>
                  <div className="flex items-center gap-1">
                    <span>{col.name}</span>
                    {unlocked && (
                      <button
                        onClick={() => deleteColumn(col)}
                        disabled={deletingCol === col.id}
                        title="מחק עמודה"
                        className="text-gray-300 hover:text-red-400 text-xs ml-1 leading-none">✕</button>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-right text-xs border-b bg-gray-50 whitespace-nowrap" style={{ minWidth: '45px' }}>
                {unlocked && (
                  <button onClick={() => setShowAddCol(true)}
                    className="text-purple-500 hover:text-purple-700 text-lg leading-none" title="הוסף עמודה">＋</button>
                )}
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ── New row form ── */}
            {newRow && (
              <tr className="bg-green-50 border-b-2 border-green-300">
                <td className="px-1 py-1 border-l sticky right-0 bg-green-50 z-10">
                  <input autoFocus value={newRow.client_name||''} placeholder="שם לקוח *"
                    onChange={e=>setNewRow(p=>({...p,client_name:e.target.value}))}
                    className="w-full border border-green-400 rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.client_id_number||''} placeholder="ת.ז."
                    onChange={e=>setNewRow(p=>({...p,client_id_number:e.target.value}))}
                    className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.client_phone||''} placeholder="טלפון"
                    onChange={e=>setNewRow(p=>({...p,client_phone:e.target.value}))}
                    className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.property_address||''} placeholder="כתובת"
                    onChange={e=>setNewRow(p=>({...p,property_address:e.target.value}))}
                    className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.parcel||''} placeholder="גוש/חלקה"
                    onChange={e=>setNewRow(p=>({...p,parcel:e.target.value}))}
                    className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
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
                <td className="px-1 py-1">
                  <select value={newRow.responsible_lawyer_id||''} onChange={e=>setNewRow(p=>({...p,responsible_lawyer_id:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm">
                    <option value="">—</option>
                    {lawyers.map(l=><option key={l.id} value={l.id}>{l.full_name}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.other_lawyer||''} placeholder="עו״ד שכנגד" onChange={e=>setNewRow(p=>({...p,other_lawyer:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.broker||''} placeholder="מתווך" onChange={e=>setNewRow(p=>({...p,broker:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input type="number" value={newRow.agreed_fee||''} placeholder="שכ״ט" onChange={e=>setNewRow(p=>({...p,agreed_fee:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input type="number" value={newRow.collected_amount||''} placeholder="נגבה" onChange={e=>setNewRow(p=>({...p,collected_amount:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input type="number" value={newRow.balance_amount||''} placeholder="יתרה" onChange={e=>setNewRow(p=>({...p,balance_amount:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.payment_status||''} placeholder="סטטוס" onChange={e=>setNewRow(p=>({...p,payment_status:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.mortgage||''} placeholder="משכנתא" onChange={e=>setNewRow(p=>({...p,mortgage:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.capital_gains||''} placeholder="מס שבח" onChange={e=>setNewRow(p=>({...p,capital_gains:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.committee_status||''} placeholder="ועדה" onChange={e=>setNewRow(p=>({...p,committee_status:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1">
                  <input value={newRow.municipality_status||''} placeholder="עירייה" onChange={e=>setNewRow(p=>({...p,municipality_status:e.target.value}))} className="w-full border rounded px-1 py-0.5 text-sm"/>
                </td>
                <td className="px-1 py-1 flex gap-1 min-w-[200px]">
                  <input value={newRow.description||''} placeholder="הערות" onChange={e=>setNewRow(p=>({...p,description:e.target.value}))} className="flex-1 border rounded px-1 py-0.5 text-sm"/>
                  <button onClick={addMatter} disabled={adding||!newRow.client_name} className="bg-green-600 text-white px-2 rounded text-xs disabled:bg-gray-300">שמור</button>
                </td>
                {customCols.map(col => <td key={col.id} className="px-1 py-1 bg-purple-50/60"/>)}
                <td/>
              </tr>
            )}

            {loading && (
              <tr><td colSpan={totalCols} className="text-center py-12 text-gray-400">טוען...</td></tr>
            )}

            {!loading && (() => {
              let lastGroup = -1;
              const GROUP_LABEL = [
                '📋 לפני חתימה',
                '✅ אחרי חתימה',
                '📁 אחר',
              ];
              const GROUP_COLOR = [
                'bg-blue-50 text-blue-800',
                'bg-green-50 text-green-800',
                'bg-gray-50 text-gray-600',
              ];
              return sortedMatters.map((m, idx) => {
              const group    = byGroup(m);
              const showHead = group !== lastGroup;
              lastGroup = group;
              const daysLeft = m.delivery_date
                ? Math.round((new Date(m.delivery_date) - new Date()) / 86400000) : null;
              const rowBg = daysLeft != null && daysLeft < 0  ? 'bg-red-50'
                : daysLeft != null && daysLeft <= 7 ? 'bg-yellow-50'
                : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70';

              return (
                <Fragment key={m.id}>
                {showHead && (
                  <tr className={`${GROUP_COLOR[group]} border-b-2`}>
                    <td colSpan={totalCols} className="px-4 py-2 font-bold text-sm tracking-wide">
                      {GROUP_LABEL[group]}
                      <span className="mr-2 font-normal text-xs opacity-70">{groupCounts[group]} תיקים</span>
                    </td>
                  </tr>
                )}
                <tr className={`${rowBg} hover:bg-blue-50/60 border-b transition-colors`}>
                  {/* שם לקוח – sticky */}
                  <td className={`px-1 py-1 border-l sticky right-0 z-10 ${rowBg}`}>
                    <EditableCell editable={unlocked} value={m.clients?.name}
                      onSave={v=>saveField(m.id,'client_name',v,true)} placeholder="שם לקוח"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.clients?.id_number}
                      onSave={v=>saveField(m.id,'client_id_number',v,true)} placeholder="ת.ז."/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.clients?.phone}
                      onSave={v=>saveField(m.id,'client_phone',v,true)} type="tel" placeholder="טלפון"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.property_address}
                      onSave={v=>saveField(m.id,'property_address',v)} placeholder="כתובת"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.parcel}
                      onSave={v=>saveField(m.id,'parcel',v)} placeholder="גוש/חלקה"/>
                  </td>
                  {/* שלב */}
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.stage} onSave={v=>saveField(m.id,'stage',v)} options={STAGE_OPTIONS}/>
                    {m.stage && (
                      <span className={`block mt-0.5 text-xs px-1.5 py-0.5 rounded-full w-fit ${STAGE_COLOR[m.stage]||'bg-gray-100'}`}>
                        {labelOf(STAGE_OPTIONS,m.stage)}
                      </span>
                    )}
                  </td>
                  {/* סוג */}
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.type} onSave={v=>saveField(m.id,'type',v)} options={TYPE_OPTIONS}/>
                  </td>
                  {/* תאריך מסירה */}
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.delivery_date} onSave={v=>saveField(m.id,'delivery_date',v)} type="date"/>
                    {daysLeft != null && (
                      <div className={`text-xs font-medium ${daysLeft<0?'text-red-600':daysLeft<=7?'text-orange-500':'text-gray-400'}`}>
                        {daysLeft<0?`${Math.abs(daysLeft)}י׳ איחור`:daysLeft===0?'היום':`${daysLeft} ימים`}
                      </div>
                    )}
                  </td>
                  {/* עו"ד אחראי */}
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.profiles?.id || m.responsible_lawyer_id}
                      onSave={v=>saveField(m.id,'responsible_lawyer_id',v)} options={lawyerOpts}/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.other_lawyer} onSave={v=>saveField(m.id,'other_lawyer',v)} placeholder="עו״ד"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.broker} onSave={v=>saveField(m.id,'broker',v)} placeholder="מתווך"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.agreed_fee} onSave={v=>saveField(m.id,'agreed_fee',v)} type="number" currency placeholder="₪"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.collected_amount} onSave={v=>saveField(m.id,'collected_amount',v)} type="number" currency placeholder="₪"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.balance_amount} onSave={v=>saveField(m.id,'balance_amount',v)} type="number" currency placeholder="₪"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.payment_status} onSave={v=>saveField(m.id,'payment_status',v)} placeholder="סטטוס"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.mortgage} onSave={v=>saveField(m.id,'mortgage',v)} placeholder="משכנתא"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.capital_gains} onSave={v=>saveField(m.id,'capital_gains',v)} placeholder="שבח"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.committee_status} onSave={v=>saveField(m.id,'committee_status',v)} placeholder="ועדה"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.municipality_status} onSave={v=>saveField(m.id,'municipality_status',v)} placeholder="עירייה"/>
                  </td>
                  <td className="px-1 py-1">
                    <EditableCell editable={unlocked} value={m.description} onSave={v=>saveField(m.id,'description',v)} placeholder="הערות"/>
                  </td>

                  {/* Custom columns */}
                  {customCols.map(col => {
                    const cval = m.extra_data?.[col.id];
                    const selectOpts = col.col_type === 'select' && col.options
                      ? col.options.map(o => ({ val: o, label: o }))
                      : null;
                    return (
                      <td key={col.id} className="px-1 py-1 bg-purple-50/40">
                        <EditableCell
                          editable={unlocked}
                          value={cval}
                          onSave={v => saveExtra(m.id, col.id, v)}
                          colType={col.col_type}
                          options={selectOpts}
                          type={col.col_type === 'number' ? 'number' : col.col_type === 'date' ? 'date' : 'text'}
                          currency={col.col_type === 'number'}
                          placeholder="+"
                        />
                      </td>
                    );
                  })}
                  <td/>
                </tr>
                </Fragment>
              );
              });
            })()}

            {!loading && matters.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="text-center py-16 text-gray-400">
                  <div className="text-4xl mb-2">📂</div>
                  <div>{unlocked
                    ? 'אין תיקים. לחץ "סנכרן Excel" לייבוא, או "תיק חדש" להוספה ידנית.'
                    : 'אין תיקים להצגה. ל­הוספה ועריכה לחץ "🔒 כניסה לעריכה".'}</div>
                </td>
              </tr>
            )}
          </tbody>

          {/* ── Totals footer ── */}
          {!loading && matters.length > 0 && (
            <tfoot className="bg-gray-100 sticky bottom-0 z-10">
              <tr className="font-semibold text-sm">
                <td className="px-2 py-2 sticky right-0 bg-gray-100 border-t border-l text-xs text-gray-600">
                  סה"כ ({matters.length})
                </td>
                {/* skip t.z, phone, address, parcel, stage, type, date, lawyer, other_lawyer, broker */}
                {Array(9).fill(null).map((_,i) => <td key={i} className="border-t"/>)}
                <td className="px-2 py-2 border-t text-green-700">
                  {fmtMoney(sortedMatters.reduce((s,m)=>s+Number(m.agreed_fee||0),0))}
                </td>
                <td className="px-2 py-2 border-t text-blue-700">
                  {fmtMoney(sortedMatters.reduce((s,m)=>s+Number(m.collected_amount||0),0))}
                </td>
                <td className="px-2 py-2 border-t text-orange-700">
                  {fmtMoney(sortedMatters.reduce((s,m)=>s+Number(m.balance_amount||0),0))}
                </td>
                {/* payment_status, mortgage, cap_gains, committee, municipality, description */}
                {Array(6).fill(null).map((_,i) => <td key={i} className="border-t"/>)}
                {customCols.map(col => <td key={col.id} className="border-t bg-purple-50/40"/>)}
                <td className="border-t"/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Legend */}
      <div className="fixed bottom-4 left-4 bg-white border rounded-lg shadow-md p-3 text-xs text-gray-500 space-y-1">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-100 border rounded inline-block"/>באיחור</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-100 border rounded inline-block"/>≤7 ימים</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-purple-100 border rounded inline-block"/>עמודות מותאמות</div>
        <div className="text-gray-400 mt-1">{unlocked ? 'לחץ תא לעריכה' : 'מצב צפייה — לעריכה נדרש קוד'}</div>
      </div>
    </div>
  );
}
