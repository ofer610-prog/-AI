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

const TASK_STATUS = [
  { val: 'open',      label: 'פתוח' },
  { val: 'done',      label: 'הושלם' },
  { val: 'cancelled', label: 'מבוטל' },
];

const TASK_PRIORITY = [
  { val: 'high',   label: 'גבוהה' },
  { val: 'medium', label: 'בינונית' },
  { val: 'low',    label: 'נמוכה' },
];

const STAGE_COLOR = {
  draft:        'bg-blue-100 text-blue-800',
  conditional:  'bg-yellow-100 text-yellow-800',
  waiting:      'bg-orange-100 text-orange-800',
  signed:       'bg-green-100 text-green-800',
  registration: 'bg-purple-100 text-purple-800',
  closed:       'bg-gray-200 text-gray-500',
};

const PRIORITY_COLOR = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-600',
};

const fmtMoney = v => (v || v === 0) && !isNaN(Number(v)) ? `₪${Number(v).toLocaleString('he-IL')}` : (v || '');
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
  const shown   = currency && display !== '' ? fmtMoney(display) : display;

  if (!editable) {
    return (
      <div className="min-h-[22px] px-1 py-0.5 whitespace-pre-wrap break-words text-sm" title={String(display || '')}>
        {shown || <span className="text-gray-300 text-xs">—</span>}
      </div>
    );
  }

  return (
    <div onClick={() => setEditing(true)}
      className="min-h-[22px] px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 whitespace-pre-wrap break-words text-sm"
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
    const pin = sessionStorage.getItem('cases_pin') || '';
    const res  = await fetch('/api/cases/columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': pin },
      body: JSON.stringify({ name: name.trim(), col_type: type, options, pin }),
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

// ─── Column definitions per tab ───────────────────────────────────────────────
// kind: 'client' | 'field' | 'lawyer' | 'stage' | 'type' | 'fee' | 'money' | 'date' | 'days'

const RE_COLS = [
  { key: 'client_name',         label: 'שם לקוח',       w: 150, kind: 'client', field: 'name',       sticky: true },
  { key: 'parcel',              label: 'גוש/חלקה',       w: 110, kind: 'field' },
  { key: 'property_address',    label: 'כתובת הנכס',     w: 170, kind: 'field' },
  { key: 'stage',               label: 'שלב',            w: 130, kind: 'stage' },
  { key: 'responsible_lawyer_id', label: 'עו"ד מטפל',   w: 110, kind: 'lawyer' },
  { key: 'delivery_date',       label: 'תאריך מסירה',    w: 130, kind: 'date' },
  { key: 'fee_text',            label: 'שכ"ט',           w: 110, kind: 'field' },
  { key: 'collected_amount',    label: 'נגבה',           w: 90,  kind: 'money' },
  { key: 'balance_amount',      label: 'יתרה',           w: 90,  kind: 'money' },
  { key: 'payment_status',      label: 'סטטוס תשלום',    w: 110, kind: 'field' },
  { key: 'mortgage',            label: 'משכנתא',         w: 90,  kind: 'field' },
  { key: 'capital_gains',       label: 'מס שבח',         w: 90,  kind: 'field' },
  { key: 'committee_status',    label: 'ועדה',           w: 90,  kind: 'field' },
  { key: 'municipality_status', label: 'עירייה/ארנונה',  w: 110, kind: 'field' },
  { key: 'other_lawyer',        label: 'עו"ד צד שני',    w: 120, kind: 'field' },
  { key: 'broker',              label: 'מתווך',          w: 100, kind: 'field' },
  { key: 'rami_status',         label: 'פניה רמי',       w: 160, kind: 'field' },
  { key: 'description',         label: 'הערות',          w: 220, kind: 'field' },
];

const OTHER_COLS = [
  { key: 'case_number',         label: 'מס\' תיק',       w: 110, kind: 'field',  sticky: true },
  { key: 'client_name',         label: 'שם התיק/לקוח',  w: 170, kind: 'client', field: 'name' },
  { key: 'client_id_number',    label: 'ת.ז./ח.פ.',      w: 110, kind: 'client', field: 'id_number' },
  { key: 'type',                label: 'סוג התיק',       w: 110, kind: 'type' },
  { key: 'responsible_lawyer_id', label: 'עו"ד מטפל',   w: 110, kind: 'lawyer' },
  { key: 'other_lawyer',        label: 'צד שני',         w: 120, kind: 'field' },
  { key: 'referral_source',     label: 'מקור הפניה',     w: 130, kind: 'field' },
  { key: 'open_date',           label: 'תאריך פתיחה',    w: 120, kind: 'date' },
  { key: 'target_date',         label: 'תאריך יעד',      w: 120, kind: 'date' },
  { key: 'fee_text',            label: 'שכ"ט',           w: 100, kind: 'field' },
  { key: 'collected_amount',    label: 'נגבה',           w: 90,  kind: 'money' },
  { key: 'balance_amount',      label: 'יתרה',           w: 90,  kind: 'money' },
  { key: 'payment_status',      label: 'סטטוס תשלום',    w: 110, kind: 'field' },
  { key: 'description',         label: 'הערות',          w: 220, kind: 'field' },
];

// ─── Matters Table ────────────────────────────────────────────────────────────

function MattersTable({ cols, matters, lawyers, customCols, unlocked, saveField, saveExtra, onAddCol, onDeleteCol, deletingCol }) {
  const lawyerOpts = lawyers.map(l => ({ val: l.id, label: l.full_name }));
  const totalCols  = cols.length + customCols.length + 1;

  function renderCell(m, col) {
    const days = col.kind === 'date' && col.key === 'delivery_date' && m.delivery_date
      ? Math.round((new Date(m.delivery_date) - new Date()) / 86400000) : null;

    if (col.kind === 'client') {
      return (
        <EditableCell editable={unlocked} value={m.clients?.[col.field]}
          onSave={v => saveField(m.id, `client_${col.field}`, v, true)} placeholder={col.label}/>
      );
    }
    if (col.kind === 'lawyer') {
      return (
        <EditableCell editable={unlocked} value={m.profiles?.id || m.responsible_lawyer_id}
          onSave={v => saveField(m.id, 'responsible_lawyer_id', v)} options={lawyerOpts}/>
      );
    }
    if (col.kind === 'stage') {
      return (
        <>
          <EditableCell editable={unlocked} value={m.stage} onSave={v => saveField(m.id, 'stage', v)} options={STAGE_OPTIONS}/>
          {m.stage && (
            <span className={`block mt-0.5 text-xs px-1.5 py-0.5 rounded-full w-fit ${STAGE_COLOR[m.stage] || 'bg-gray-100'}`}>
              {labelOf(STAGE_OPTIONS, m.stage)}
            </span>
          )}
        </>
      );
    }
    if (col.kind === 'type') {
      return <EditableCell editable={unlocked} value={m.type} onSave={v => saveField(m.id, 'type', v)} options={TYPE_OPTIONS}/>;
    }
    if (col.kind === 'money') {
      return <EditableCell editable={unlocked} value={m[col.key]} onSave={v => saveField(m.id, col.key, v)} type="number" currency placeholder="₪"/>;
    }
    if (col.kind === 'date') {
      return (
        <>
          <EditableCell editable={unlocked} value={m[col.key]} onSave={v => saveField(m.id, col.key, v)} type="date"/>
          {days != null && (
            <div className={`text-xs font-medium ${days < 0 ? 'text-red-600' : days <= 7 ? 'text-orange-500' : 'text-gray-400'}`}>
              {days < 0 ? `${Math.abs(days)}י׳ איחור` : days === 0 ? 'היום' : `${days} ימים`}
            </div>
          )}
        </>
      );
    }
    // generic field
    return <EditableCell editable={unlocked} value={m[col.key]} onSave={v => saveField(m.id, col.key, v)} placeholder={col.label}/>;
  }

  const minW = cols.reduce((s, c) => s + c.w, 0) + customCols.length * 140 + 50;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" style={{ minWidth: `${minW}px` }}>
        <thead className="bg-gray-100 sticky top-[97px] z-20">
          <tr>
            {cols.map(col => (
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
                    <button onClick={() => onDeleteCol(col)} disabled={deletingCol === col.id}
                      title="מחק עמודה" className="text-gray-300 hover:text-red-400 text-xs ml-1 leading-none">✕</button>
                  )}
                </div>
              </th>
            ))}
            <th className="px-2 py-2 text-right text-xs border-b bg-gray-50 whitespace-nowrap" style={{ minWidth: '45px' }}>
              {unlocked && (
                <button onClick={onAddCol} className="text-purple-500 hover:text-purple-700 text-lg leading-none" title="הוסף עמודה">＋</button>
              )}
            </th>
          </tr>
        </thead>

        <tbody>
          {matters.map((m, idx) => {
            const days = m.delivery_date ? Math.round((new Date(m.delivery_date) - new Date()) / 86400000) : null;
            const rowBg = days != null && days < 0 ? 'bg-red-50'
              : days != null && days <= 7 ? 'bg-yellow-50'
              : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70';
            return (
              <tr key={m.id} className={`${rowBg} hover:bg-blue-50/60 border-b transition-colors`}>
                {cols.map(col => (
                  <td key={col.key}
                    className={`px-1 py-1 ${col.sticky ? `border-l sticky right-0 z-10 ${rowBg}` : ''}`}>
                    {renderCell(m, col)}
                  </td>
                ))}
                {customCols.map(col => {
                  const selectOpts = col.col_type === 'select' && col.options
                    ? col.options.map(o => ({ val: o, label: o })) : null;
                  return (
                    <td key={col.id} className="px-1 py-1 bg-purple-50/40">
                      <EditableCell editable={unlocked} value={m.extra_data?.[col.id]}
                        onSave={v => saveExtra(m.id, col.id, v)} colType={col.col_type} options={selectOpts}
                        type={col.col_type === 'number' ? 'number' : col.col_type === 'date' ? 'date' : 'text'}
                        placeholder="+"/>
                    </td>
                  );
                })}
                <td/>
              </tr>
            );
          })}

          {matters.length === 0 && (
            <tr><td colSpan={totalCols} className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📂</div>
              <div>{unlocked ? 'אין תיקים. לחץ "סנכרן Drive" לייבוא, או "תיק חדש" להוספה.' : 'אין תיקים להצגה.'}</div>
            </td></tr>
          )}
        </tbody>

        {matters.length > 0 && (
          <tfoot className="bg-gray-100 sticky bottom-0 z-10">
            <tr className="font-semibold text-sm">
              {cols.map((col, i) => {
                if (i === 0) return <td key={col.key} className={`px-2 py-2 border-t text-xs text-gray-600 ${col.sticky ? 'sticky right-0 bg-gray-100 border-l' : ''}`}>סה"כ ({matters.length})</td>;
                if (col.kind === 'money') {
                  const sum = matters.reduce((s, m) => s + Number(m[col.key] || 0), 0);
                  const color = col.key === 'collected_amount' ? 'text-blue-700' : col.key === 'balance_amount' ? 'text-orange-700' : 'text-green-700';
                  return <td key={col.key} className={`px-2 py-2 border-t ${color}`}>{fmtMoney(sum)}</td>;
                }
                return <td key={col.key} className="border-t"/>;
              })}
              {customCols.map(col => <td key={col.id} className="border-t bg-purple-50/40"/>)}
              <td className="border-t"/>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Tasks Table ──────────────────────────────────────────────────────────────

function TasksTable({ tasks, lawyers, unlocked, saveTask }) {
  const lawyerOpts = lawyers.map(l => ({ val: l.id, label: l.full_name }));
  const COLS = [
    { key: 'task_number', label: 'מס\' משימה', w: 100 },
    { key: 'task_type',   label: 'סוג',        w: 90 },
    { key: 'description', label: 'תיאור המשימה', w: 280 },
    { key: 'matter',      label: 'תיק',        w: 130 },
    { key: 'assigned_to', label: 'אחראי',      w: 120 },
    { key: 'due_date',    label: 'תאריך יעד',  w: 120 },
    { key: 'status',      label: 'סטטוס',      w: 110 },
    { key: 'priority',    label: 'עדיפות',     w: 110 },
    { key: 'notes',       label: 'הערות',      w: 200 },
  ];
  const minW = COLS.reduce((s, c) => s + c.w, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" style={{ minWidth: `${minW}px` }}>
        <thead className="bg-gray-100 sticky top-[97px] z-20">
          <tr>
            {COLS.map(c => (
              <th key={c.key} className="px-2 py-2 text-right font-semibold border-b text-xs whitespace-nowrap" style={{ minWidth: c.w }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, idx) => {
            const done = t.status === 'done';
            const overdue = !done && t.due_date && new Date(t.due_date) < new Date();
            const rowBg = done ? 'bg-gray-50 text-gray-400' : overdue ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70';
            return (
              <tr key={t.id} className={`${rowBg} hover:bg-blue-50/60 border-b`}>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.task_number} onSave={v => saveTask(t.id, 'task_number', v)}/></td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.task_type} onSave={v => saveTask(t.id, 'task_type', v)}/></td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.description} onSave={v => saveTask(t.id, 'description', v)}/></td>
                <td className="px-1 py-1 text-xs text-gray-500">{t.matters?.case_number || t.matters?.title || '—'}</td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.profiles?.id || t.assigned_to} onSave={v => saveTask(t.id, 'assigned_to', v)} options={lawyerOpts}/></td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.due_date} onSave={v => saveTask(t.id, 'due_date', v)} type="date"/></td>
                <td className="px-1 py-1">
                  <EditableCell editable={unlocked} value={t.status} onSave={v => saveTask(t.id, 'status', v)} options={TASK_STATUS}/>
                </td>
                <td className="px-1 py-1">
                  <EditableCell editable={unlocked} value={t.priority} onSave={v => saveTask(t.id, 'priority', v)} options={TASK_PRIORITY}/>
                  {t.priority && <span className={`block mt-0.5 text-xs px-1.5 py-0.5 rounded-full w-fit ${PRIORITY_COLOR[t.priority]}`}>{labelOf(TASK_PRIORITY, t.priority)}</span>}
                </td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.notes} onSave={v => saveTask(t.id, 'notes', v)}/></td>
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr><td colSpan={COLS.length} className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">✅</div><div>אין משימות להצגה.</div>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'realestate', label: '🏠 תיקי נדל"ן' },
  { id: 'other',      label: '📁 תיקים אחרים' },
  { id: 'tasks',      label: '✅ משימות' },
];

export default function CasesPage() {
  const [tab,         setTab]         = useState('realestate');
  const [unlocked,    setUnlocked]    = useState(false);
  const [matters,     setMatters]     = useState([]);
  const [tasks,       setTasks]       = useState([]);
  const [lawyers,     setLawyers]     = useState([]);
  const [customCols,  setCustomCols]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [stage,       setStage]       = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [search,      setSearch]      = useState('');
  const [syncing,     setSyncing]     = useState(false);
  const [syncMsg,     setSyncMsg]     = useState('');
  const [adding,      setAdding]      = useState(false);
  const [showAddCol,  setShowAddCol]  = useState(false);
  const [deletingCol, setDeletingCol] = useState(null);
  const [showPin,     setShowPin]     = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const ts = sessionStorage.getItem('cases_unlocked');
    if (ts && Date.now() - Number(ts) < 8 * 60 * 60 * 1000) setUnlocked(true);
  }, []);

  const getPin = () => sessionStorage.getItem('cases_pin') || '';

  const load = useCallback(async () => {
    setLoading(true);
    const pinHdr = { 'x-cases-pin': getPin() };
    if (tab === 'tasks') {
      const res  = await fetch('/api/tasks', { headers: pinHdr });
      const json = await res.json();
      setTasks(json.tasks || []);
      setLawyers(json.lawyers || []);
    } else {
      const params = new URLSearchParams({ category: tab });
      if (stage)      params.set('stage', stage);
      if (typeFilter) params.set('type', typeFilter);
      if (search)     params.set('q', search);
      const [mRes, cRes] = await Promise.all([
        fetch(`/api/matters?${params}`, { headers: pinHdr }),
        fetch('/api/cases/columns', { headers: pinHdr }),
      ]);
      const mJson = await mRes.json();
      const cJson = await cRes.json();
      setMatters(mJson.matters || []);
      setLawyers(mJson.lawyers || []);
      setCustomCols(cJson.columns || []);
    }
    setLoading(false);
  }, [tab, stage, typeFilter, search]);

  useEffect(() => { load(); }, [load]);

  async function saveField(matterId, field, value, isClient = false) {
    await fetch('/api/matters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
      body: JSON.stringify({ id: matterId, pin: getPin(), [field]: value }),
    });
    setMatters(prev => prev.map(m => {
      if (m.id !== matterId) return m;
      if (isClient) return { ...m, clients: { ...m.clients, [field.replace('client_', '')]: value } };
      return { ...m, [field]: value };
    }));
  }

  async function saveExtra(matterId, colId, value) {
    const matter = matters.find(m => m.id === matterId);
    const extra  = { ...(matter?.extra_data || {}), [colId]: value };
    await fetch('/api/matters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
      body: JSON.stringify({ id: matterId, pin: getPin(), extra_data: extra }),
    });
    setMatters(prev => prev.map(m => m.id === matterId ? { ...m, extra_data: extra } : m));
  }

  async function saveTask(taskId, field, value) {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
      body: JSON.stringify({ id: taskId, pin: getPin(), [field]: value }),
    });
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      if (field === 'assigned_to') {
        const lw = lawyers.find(l => l.id === value);
        return { ...t, assigned_to: value, profiles: lw ? { id: lw.id, full_name: lw.full_name } : null };
      }
      return { ...t, [field]: value };
    }));
  }

  async function addMatter() {
    setAdding(true);
    const res  = await fetch('/api/matters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
      body: JSON.stringify({ client_name: 'תיק חדש', case_category: tab === 'other' ? 'other' : 'realestate', type: tab === 'other' ? 'other' : 'sale', pin: getPin() }),
    });
    const json = await res.json();
    if (json.matter) setMatters(prev => [json.matter, ...prev]);
    setAdding(false);
  }

  async function addTask() {
    setAdding(true);
    const res  = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
      body: JSON.stringify({ description: 'משימה חדשה', pin: getPin() }),
    });
    const json = await res.json();
    if (json.task) setTasks(prev => [json.task, ...prev]);
    setAdding(false);
  }

  async function syncNow() {
    setSyncing(true); setSyncMsg('');
    try {
      const res  = await fetch('/api/cron/sync-gdrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: getPin() }),
      });
      const json = await res.json();
      setSyncMsg(json.ok ? `סונכרן בהצלחה (${json.matters || 0} תיקים, ${json.tasks || 0} משימות חדשים)` : 'שגיאה: ' + (json.error || 'לא ידוע'));
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
      const res  = await fetch('/api/cases/upload-xlsx', { method: 'POST', body: fd, headers: { 'x-cases-pin': getPin() } });
      const json = await res.json();
      setSyncMsg(json.ok ? `יובאו ${json.matters || 0} תיקים, ${json.tasks || 0} משימות` : 'שגיאה: ' + (json.error || 'לא ידוע'));
      if (json.ok) load();
    } catch { setSyncMsg('שגיאת העלאה'); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function deleteColumn(col) {
    if (!confirm(`למחוק את העמודה "${col.name}"? הנתונים יאבדו.`)) return;
    setDeletingCol(col.id);
    await fetch(`/api/cases/columns?id=${col.id}`, { method: 'DELETE', headers: { 'x-cases-pin': getPin() } });
    setCustomCols(prev => prev.filter(c => c.id !== col.id));
    setDeletingCol(null);
  }

  const isTasks  = tab === 'tasks';
  const cols     = tab === 'other' ? OTHER_COLS : RE_COLS;
  const count    = isTasks ? tasks.length : matters.length;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {showPin && (
        <PinScreen onUnlock={() => { setUnlocked(true); setShowPin(false); }} onClose={() => setShowPin(false)} />
      )}
      {showAddCol && (
        <AddColumnModal onAdd={col => { setCustomCols(prev => [...prev, col]); setShowAddCol(false); }} onClose={() => setShowAddCol(false)} />
      )}

      {/* ── Header ── */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-30 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/dashboard"
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            title="חזרה לתפריט">← תפריט</a>
          <h1 className="text-lg font-bold text-gray-900">📁 ניהול תיקים</h1>

          {!isTasks && (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לקוח / נכס..."
                className="border rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-blue-400"/>
              <select value={stage} onChange={e => setStage(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                <option value="">כל השלבים</option>
                {STAGE_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
              </select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                <option value="">כל הסוגים</option>
                {TYPE_OPTIONS.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
              </select>
            </>
          )}

          <span className="text-sm text-gray-400">{count} {isTasks ? 'משימות' : 'תיקים'}</span>
          <div className="flex-1"/>

          {unlocked ? (
            <>
              <button onClick={isTasks ? addTask : addMatter} disabled={adding}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">
                {adding ? '...' : isTasks ? '+ משימה' : '+ תיק חדש'}
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={uploadFile} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">
                {uploading ? '⏳ מעלה...' : '⬆️ העלה Excel'}
              </button>
              <button onClick={syncNow} disabled={syncing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">
                {syncing ? '⏳...' : '🔄 סנכרן Drive'}
              </button>
              {!isTasks && (
                <button onClick={() => setShowAddCol(true)}
                  className="border border-purple-400 text-purple-700 hover:bg-purple-50 text-sm px-3 py-1.5 rounded-lg">＋ עמודה</button>
              )}
              <button onClick={() => { sessionStorage.removeItem('cases_unlocked'); sessionStorage.removeItem('cases_pin'); setUnlocked(false); }}
                title="נעל עריכה" className="text-gray-400 hover:text-gray-600 px-2 py-1.5 text-lg">🔓</button>
            </>
          ) : (
            <button onClick={() => setShowPin(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1">🔒 כניסה לעריכה</button>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mt-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-t-lg text-sm font-medium border-b-2 transition-colors
                ${tab === t.id ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {syncMsg && <p className="text-xs mt-1 text-green-700">{syncMsg}</p>}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">טוען...</div>
      ) : isTasks ? (
        <TasksTable tasks={tasks} lawyers={lawyers} unlocked={unlocked} saveTask={saveTask} />
      ) : (
        <MattersTable
          cols={cols} matters={matters} lawyers={lawyers} customCols={customCols}
          unlocked={unlocked} saveField={saveField} saveExtra={saveExtra}
          onAddCol={() => setShowAddCol(true)} onDeleteCol={deleteColumn} deletingCol={deletingCol}
        />
      )}

      {/* Legend */}
      <div className="fixed bottom-4 left-4 bg-white border rounded-lg shadow-md p-3 text-xs text-gray-500 space-y-1">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-100 border rounded inline-block"/>באיחור</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-100 border rounded inline-block"/>≤7 ימים</div>
        <div className="text-gray-400 mt-1">{unlocked ? 'לחץ תא לעריכה' : 'מצב צפייה — לעריכה נדרש קוד'}</div>
      </div>
    </div>
  );
}
