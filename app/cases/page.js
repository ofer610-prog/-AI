'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';

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

const TASK_STATUS  = [
  { val: 'open',        label: 'פתוח' },
  { val: 'in_progress', label: 'בטיפול' },
  { val: 'done',        label: 'הושלם' },
  { val: 'cancelled',   label: 'מבוטל' },
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

const PAYMENT_STATUS_OPTS = [
  { val: 'paid',    label: 'שולם' },
  { val: 'partial', label: 'חלקי' },
  { val: 'pending', label: 'ממתין' },
  { val: 'overdue', label: 'בפיגור' },
];

const fmtMoney = v => (v || v === 0) && !isNaN(Number(v)) ? `₪${Number(v).toLocaleString('he-IL')}` : (v || '');
const labelOf  = (opts, val) => opts.find(o => o.val === val)?.label || val || '';
const today    = () => new Date().toISOString().slice(0, 10);

// קבוצות שלבים — בדיוק כמו באקסל
// גיליון "תיקי נדלן": טיוטה/מותנה → [תיקים שנחתמו] → [ברישום] → [ממתין לצד שני]
const STAGE_GROUPS = [
  { key: 'draft',        stages: ['draft', 'conditional', null, '', undefined], label: '📋 תיקים פעילים — לפני חתימה', color: 'bg-sky-50 text-sky-900 border-sky-200' },
  { key: 'signed',       stages: ['signed'],                                    label: '✅ תיקים שנחתמו',                color: 'bg-green-50 text-green-900 border-green-200' },
  { key: 'registration', stages: ['registration'],                              label: '📝 ברישום',                      color: 'bg-purple-50 text-purple-900 border-purple-200' },
  { key: 'waiting',      stages: ['waiting'],                                   label: '⏳ ממתין לצד שני',               color: 'bg-orange-50 text-orange-900 border-orange-200' },
  { key: 'closed',       stages: ['closed'],                                    label: '🔒 סגורים',                      color: 'bg-gray-100 text-gray-500 border-gray-200' },
];

function groupByStage(matters) {
  return STAGE_GROUPS.map(g => ({
    ...g,
    items: matters.filter(m => g.stages.includes(m.stage)),
  })).filter(g => g.items.length > 0);
}

// ─── Row Actions ─────────────────────────────────────────────────────────────
function RowActions({ isClosed, onClose, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="opacity-0 group-hover/row:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100 text-base leading-none"
        title="פעולות">⋮</button>
      {open && (
        <div className="absolute left-0 top-6 bg-white border rounded-lg shadow-lg z-50 min-w-[160px] py-1" style={{ direction: 'rtl' }}>
          {!isClosed && (
            <button onClick={() => { onClose(); setOpen(false); }}
              className="w-full text-right px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 flex items-center gap-2">
              🔒 עסקה התפוצצה
            </button>
          )}
          {isClosed && (
            <button onClick={() => { onClose(); setOpen(false); }}
              className="w-full text-right px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2">
              ↩️ החזר לפעיל
            </button>
          )}
          <hr className="my-1"/>
          <button onClick={() => { onDelete(); setOpen(false); }}
            className="w-full text-right px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
            🗑️ מחק שורה
          </button>
        </div>
      )}
    </div>
  );
}

function whatsAppLink(phone, name, balance) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, '').replace(/^0/, '972');
  const msg   = encodeURIComponent(`שלום ${name}, נותרת יתרה לתשלום בסך ${fmtMoney(balance)} בתיק שלך. אנא צרו קשר. תודה, משרד עו"ד כהן-רוגוזינסקי`);
  return `https://wa.me/${clean}?text=${msg}`;
}

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

function EditableCell({ value, onSave, type = 'text', options, placeholder = '', currency = false, colType, editable = true, displayLabel }) {
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

  const display = displayLabel ?? (options ? labelOf(options, value) : (value ?? ''));
  const shown   = currency && display !== '' ? fmtMoney(display) : display;

  if (!editable) {
    return (
      <div className="min-h-[24px] px-1.5 py-0.5 whitespace-pre-wrap break-words text-sm" title={String(display || '')}>
        {shown || <span className="text-gray-300 text-xs">—</span>}
      </div>
    );
  }

  return (
    <div onClick={() => setEditing(true)}
      className="group relative min-h-[24px] px-1.5 py-0.5 rounded cursor-text border border-transparent hover:border-blue-300 hover:bg-blue-50/60 whitespace-pre-wrap break-words text-sm transition-colors"
      title="לחץ לעריכה">
      {shown || <span className="text-gray-300 text-xs">{placeholder || '—'}</span>}
      <span className="absolute left-0.5 top-0.5 opacity-0 group-hover:opacity-40 text-blue-400 text-[10px] leading-none pointer-events-none">✎</span>
    </div>
  );
}

// ─── Case Detail Drawer ───────────────────────────────────────────────────────

function DrawerField({ label, children }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-1 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 pt-1 leading-snug">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function DrawerSection({ icon, title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-right bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
        <span className="text-base">{icon}</span>
        <span className="font-semibold text-gray-700 text-sm flex-1">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-3 pt-1 pb-2">{children}</div>}
    </div>
  );
}

function CaseDetailDrawer({ matter, lawyers, tasks, unlocked, saveField, onClose }) {
  const lawyerOpts = lawyers.map(l => ({ val: l.id, label: l.full_name }));
  const myTasks    = (tasks || []).filter(t => t.matter_id === matter.id || t.matters?.id === matter.id);

  const name = matter.clients?.name || matter.title || '';
  const isRE = matter.case_category !== 'other';

  const lawyerName = (Array.isArray(matter.profiles) ? matter.profiles[0]?.full_name : matter.profiles?.full_name)
    || lawyers.find(l => l.id === matter.responsible_lawyer_id)?.full_name || '';

  const days = matter.delivery_date
    ? Math.round((new Date(matter.delivery_date) - new Date()) / 86400000) : null;

  const sf = (field, val, isClient = false) => saveField(matter.id, field, val, isClient);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose}/>

      {/* Drawer */}
      <div className="fixed top-0 left-0 h-full w-full max-w-[520px] bg-white shadow-2xl z-50 flex flex-col" dir="rtl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-white sticky top-0 z-10">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 text-base truncate">{name || 'תיק ללא שם'}</div>
            {matter.property_address && (
              <div className="text-xs text-gray-400 truncate">{matter.property_address}</div>
            )}
          </div>
          {matter.stage && (
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STAGE_COLOR[matter.stage] || 'bg-gray-100'}`}>
              {labelOf(STAGE_OPTIONS, matter.stage)}
            </span>
          )}
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1 shrink-0">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">

          {/* ─ פרטי הלקוח ─ */}
          <DrawerSection icon="👤" title="פרטי הלקוח">
            <DrawerField label="שם הלקוח">
              <EditableCell editable={unlocked} value={matter.clients?.name}
                onSave={v => sf('client_name', v, true)} placeholder="שם הלקוח"/>
            </DrawerField>
            <DrawerField label="ת.ז. / ח.פ.">
              <EditableCell editable={unlocked} value={matter.clients?.id_number}
                onSave={v => sf('client_id_number', v, true)} placeholder="000000000"/>
            </DrawerField>
            <DrawerField label="טלפון">
              <div className="flex items-center gap-2">
                <EditableCell editable={unlocked} value={matter.clients?.phone}
                  onSave={v => sf('client_phone', v, true)} placeholder="050-0000000"/>
                {matter.clients?.phone && (
                  <a href={`tel:${matter.clients.phone}`} className="text-blue-500 text-xs hover:underline shrink-0">📞 התקשר</a>
                )}
              </div>
            </DrawerField>
            <DrawerField label='דוא"ל'>
              <div className="flex items-center gap-2">
                <EditableCell editable={unlocked} value={matter.clients?.email}
                  onSave={v => sf('client_email', v, true)} placeholder="email@example.com"/>
                {matter.clients?.email && (
                  <a href={`mailto:${matter.clients.email}`} className="text-blue-500 text-xs hover:underline shrink-0">✉️ שלח</a>
                )}
              </div>
            </DrawerField>
          </DrawerSection>

          {/* ─ פרטי הנכס (נדל"ן בלבד) ─ */}
          {isRE && (
            <DrawerSection icon="🏠" title="פרטי הנכס">
              <DrawerField label="כתובת">
                <EditableCell editable={unlocked} value={matter.property_address}
                  onSave={v => sf('property_address', v)} placeholder="רחוב, עיר"/>
              </DrawerField>
              <DrawerField label="גוש / חלקה">
                <EditableCell editable={unlocked} value={matter.parcel}
                  onSave={v => sf('parcel', v)} placeholder="גוש 1234 / חלקה 56"/>
              </DrawerField>
              <DrawerField label="תאריך מסירה">
                <div className="flex items-center gap-2">
                  <EditableCell editable={unlocked} value={matter.delivery_date}
                    onSave={v => sf('delivery_date', v)} type="date"/>
                  {days != null && (
                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0
                      ${days < 0 ? 'bg-red-100 text-red-700 font-bold' : days === 0 ? 'bg-orange-100 text-orange-700 font-bold' : days <= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                      {days < 0 ? `${Math.abs(days)} ימים באיחור` : days === 0 ? 'היום' : `${days} ימים`}
                    </span>
                  )}
                </div>
              </DrawerField>
            </DrawerSection>
          )}

          {/* ─ שלב ועו"ד ─ */}
          <DrawerSection icon="⚖️" title='שלב ועו"ד'>
            <DrawerField label="שלב">
              <div>
                <EditableCell editable={unlocked} value={matter.stage}
                  onSave={v => sf('stage', v)} options={STAGE_OPTIONS}/>
                {matter.stage && (
                  <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${STAGE_COLOR[matter.stage] || 'bg-gray-100'}`}>
                    {labelOf(STAGE_OPTIONS, matter.stage)}
                  </span>
                )}
              </div>
            </DrawerField>
            {!isRE && (
              <DrawerField label="סוג התיק">
                <EditableCell editable={unlocked} value={matter.type}
                  onSave={v => sf('type', v)} options={TYPE_OPTIONS}/>
              </DrawerField>
            )}
            <DrawerField label='עו"ד מטפל'>
              <EditableCell editable={unlocked} value={matter.responsible_lawyer_id}
                displayLabel={lawyerName} onSave={v => sf('responsible_lawyer_id', v)} options={lawyerOpts}/>
            </DrawerField>
            <DrawerField label='עו"ד צד שני'>
              <EditableCell editable={unlocked} value={matter.other_lawyer}
                onSave={v => sf('other_lawyer', v)} placeholder="שם עו&quot;ד"/>
            </DrawerField>
            {isRE && (
              <DrawerField label="מתווך">
                <EditableCell editable={unlocked} value={matter.broker}
                  onSave={v => sf('broker', v)} placeholder="שם המתווך"/>
              </DrawerField>
            )}
            {!isRE && (
              <>
                <DrawerField label="מקור הפניה">
                  <EditableCell editable={unlocked} value={matter.referral_source}
                    onSave={v => sf('referral_source', v)}/>
                </DrawerField>
                <DrawerField label="מס׳ תיק">
                  <EditableCell editable={unlocked} value={matter.case_number}
                    onSave={v => sf('case_number', v)} placeholder="12345/26"/>
                </DrawerField>
                <DrawerField label="תאריך פתיחה">
                  <EditableCell editable={unlocked} value={matter.open_date}
                    onSave={v => sf('open_date', v)} type="date"/>
                </DrawerField>
                <DrawerField label="תאריך יעד">
                  <EditableCell editable={unlocked} value={matter.target_date}
                    onSave={v => sf('target_date', v)} type="date"/>
                </DrawerField>
              </>
            )}
          </DrawerSection>

          {/* ─ פיננסי ─ */}
          <DrawerSection icon="💰" title="פיננסי">
            <DrawerField label='שכ"ט (תיאור)'>
              <EditableCell editable={unlocked} value={matter.fee_text}
                onSave={v => sf('fee_text', v)} placeholder='לדוג׳: 8500+מע"מ'/>
            </DrawerField>
            <DrawerField label='שכ"ט מוסכם'>
              <EditableCell editable={unlocked} value={matter.agreed_fee}
                onSave={v => sf('agreed_fee', v)} type="number" currency placeholder="₪"/>
            </DrawerField>
            <DrawerField label="נגבה">
              <EditableCell editable={unlocked} value={matter.collected_amount}
                onSave={v => sf('collected_amount', v)} type="number" currency placeholder="₪"/>
            </DrawerField>
            <DrawerField label="יתרה לגבייה">
              <EditableCell editable={unlocked} value={matter.balance_amount}
                onSave={v => sf('balance_amount', v)} type="number" currency placeholder="₪"/>
            </DrawerField>
            <DrawerField label="סטטוס תשלום">
              <EditableCell editable={unlocked} value={matter.payment_status}
                onSave={v => sf('payment_status', v)} options={PAYMENT_STATUS_OPTS}/>
            </DrawerField>
          </DrawerSection>

          {/* ─ פרטים נוספים (נדל"ן) ─ */}
          {isRE && (
            <DrawerSection icon="🔧" title="פרטים נוספים">
              <DrawerField label="משכנתא">
                <EditableCell editable={unlocked} value={matter.mortgage}
                  onSave={v => sf('mortgage', v)} placeholder="סטטוס משכנתא"/>
              </DrawerField>
              <DrawerField label="מס שבח">
                <EditableCell editable={unlocked} value={matter.capital_gains}
                  onSave={v => sf('capital_gains', v)} placeholder="סטטוס"/>
              </DrawerField>
              <DrawerField label="ועדה">
                <EditableCell editable={unlocked} value={matter.committee_status}
                  onSave={v => sf('committee_status', v)} placeholder="סטטוס ועדה"/>
              </DrawerField>
              <DrawerField label="עירייה">
                <EditableCell editable={unlocked} value={matter.municipality_status}
                  onSave={v => sf('municipality_status', v)} placeholder="סטטוס עירייה"/>
              </DrawerField>
              <DrawerField label="פניה רמי">
                <EditableCell editable={unlocked} value={matter.rami_status}
                  onSave={v => sf('rami_status', v)}/>
              </DrawerField>
            </DrawerSection>
          )}

          {/* ─ הערות ─ */}
          <DrawerSection icon="📝" title="הערות">
            <DrawerField label="הערות">
              <EditableCell editable={unlocked} value={matter.description}
                onSave={v => sf('description', v)} placeholder="הערות חופשיות..."/>
            </DrawerField>
          </DrawerSection>

          {/* ─ משימות קשורות ─ */}
          {myTasks.length > 0 && (
            <DrawerSection icon="✅" title={`משימות קשורות (${myTasks.length})`}>
              <div className="space-y-1">
                {myTasks.map(t => {
                  const done    = t.status === 'done';
                  const overdue = !done && t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <div key={t.id} className={`flex items-start gap-2 text-sm py-1 ${done ? 'opacity-40' : ''}`}>
                      <span className={`mt-0.5 text-xs px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_COLOR[t.priority] || 'bg-gray-100 text-gray-500'}`}>
                        {labelOf(TASK_PRIORITY, t.priority)}
                      </span>
                      <span className={`flex-1 ${done ? 'line-through' : ''}`}>{t.description}</span>
                      {t.due_date && (
                        <span className={`text-xs shrink-0 ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                          {t.due_date}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </DrawerSection>
          )}

        </div>

        {/* Footer */}
        {!unlocked && (
          <div className="border-t px-4 py-3 bg-yellow-50 text-xs text-yellow-800 text-center">
            🔒 מצב צפייה — לחץ "כניסה לעריכה" כדי לערוך שדות
          </div>
        )}
      </div>
    </>
  );
}



// ─── AI Case Chat (split-view) ────────────────────────────────────────────────

const AI_TYPE_OPTS = [
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

const EMPTY_FORM = {
  client_name: '', client_id_number: '', client_phone: '', client_email: '',
  property_address: '', parcel: '', type: '', stage: 'draft',
  other_lawyer: '', other_party_name: '', broker: '',
  agreed_fee: '', fee_text: '', delivery_date: '',
  description: '', case_category: 'realestate',
  referral_source: '', mortgage: '', capital_gains: '',
  responsible_lawyer_id: '',
};

// ── FormField: single editable row inside the draft panel ──
function FormField({ label, fkey, form, setForm, type = 'text', placeholder = '', opts, highlight }) {
  const val = form[fkey] ?? '';
  return (
    <div className={`grid grid-cols-[110px_1fr] items-center gap-1 py-1 border-b border-gray-100 last:border-0 transition-colors duration-500 ${highlight ? 'bg-yellow-50' : ''}`}>
      <span className="text-[11px] text-gray-400 leading-snug pr-1">{label}</span>
      {opts ? (
        <select value={val} onChange={e => setForm(f => ({ ...f, [fkey]: e.target.value }))}
          className="text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 w-full">
          <option value="">—</option>
          {opts.map(o => <option key={o.val ?? o} value={o.val ?? o}>{o.label ?? o}</option>)}
        </select>
      ) : (
        <input value={val} onChange={e => setForm(f => ({ ...f, [fkey]: e.target.value }))}
          type={type} placeholder={placeholder}
          className="text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 w-full"/>
      )}
    </div>
  );
}

function AIChatPanel({ lawyers, onCaseCreated, onClose }) {
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [highlighted, setHigh]  = useState({});        // field → true for 1.5s after AI update
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'שלום! אני אעזור לפתוח תיק חדש.\nשלח פרטי העסקה, הודעת WhatsApp, או צרף מסמכים כמו נסח טאבו, צילום ת.ז. או ארנונה.' },
  ]);
  const [input, setInput]       = useState('');
  const [files, setFiles]       = useState([]);
  const [thinking, setThinking] = useState(false);
  const [history, setHistory]   = useState([]);
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  const chatRef  = useRef(null);
  const fileRef  = useRef(null);
  const inputRef = useRef(null);
  const lawyerOpts = lawyers.map(l => ({ val: l.id, label: l.full_name }));

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  function addFiles(list) {
    setFiles(prev => [...prev, ...Array.from(list)].slice(0, 6));
  }

  function flashFields(patches) {
    const keys = Object.keys(patches).filter(k => patches[k] !== null && patches[k] !== undefined);
    if (!keys.length) return;
    setHigh(Object.fromEntries(keys.map(k => [k, true])));
    setTimeout(() => setHigh({}), 1800);
  }

  async function send(overrideText) {
    const text = (overrideText ?? input).trim();
    if (!text && files.length === 0) return;

    const userMsg = { role: 'user', text: text || `[${files.length} קבצים]`, files: files.map(f => f.name) };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setFiles([]);
    setThinking(true);
    setError('');

    const fd = new FormData();
    fd.append('message', text);
    fd.append('form',    JSON.stringify(form));
    fd.append('history', JSON.stringify(history.slice(-6)));
    files.forEach(f => fd.append('files', f));

    try {
      const res  = await fetch('/api/cases/ai-chat', { method: 'POST', body: fd });
      const json = await res.json();

      if (!res.ok) { setError(json.error || 'שגיאה'); setThinking(false); return; }

      // Apply patches
      if (json.patches && Object.keys(json.patches).length) {
        setForm(prev => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(json.patches)) {
            next[k] = v ?? prev[k] ?? '';
          }
          return next;
        });
        flashFields(json.patches);
      }

      const aiMsg = {
        role: 'ai',
        text: json.reply || 'בוצע.',
        questions: json.questions || [],
        patched: Object.keys(json.patches || {}).length,
      };
      setMessages(prev => [...prev, aiMsg]);

      // Update history for next turn
      setHistory(prev => [...prev,
        { role: 'user',      content: text || '[קבצים]' },
        { role: 'assistant', content: json.reply || '' },
      ]);
    } catch {
      setError('שגיאת רשת');
    }
    setThinking(false);
  }

  async function createCase() {
    if (!form.client_name?.trim()) { setError('שם הלקוח חובה — עדכן בטיוטה'); return; }
    const pin = sessionStorage.getItem('cases_pin') || '';
    if (!pin) { setError('נדרש קוד גישה (PIN) — לחץ "כניסה לעריכה" בדף התיקים ואז פתח שוב'); return; }
    setSaving(true); setError('');
    const body = { ...form, case_category: form.case_category || 'realestate',
      agreed_fee: form.agreed_fee ? Number(form.agreed_fee) : undefined, pin };
    const res  = await fetch('/api/matters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': pin },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || 'שגיאה ביצירת תיק'); return; }
    onCaseCreated(json.matter);
    onClose();
  }

  const isRE = form.case_category !== 'other';
  const FF = (label, fkey, props = {}) => (
    <FormField key={fkey} label={label} fkey={fkey} form={form} setForm={setForm}
      highlight={!!highlighted[fkey]} {...props}/>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose}/>

      {/* Full-width modal, split layout */}
      <div className="fixed inset-4 md:inset-8 bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden" dir="rtl">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-l from-indigo-700 to-blue-600 text-white shrink-0">
          <span className="text-2xl">🤖</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base">עוזר פתיחת תיק — שיחה חכמה</div>
            <div className="text-xs opacity-75 truncate">שוחח, צרף מסמכים — הטיוטה מתעדכנת בזמן אמת</div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* ── Body: split ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* LEFT — chat */}
          <div className="flex flex-col w-full md:w-[44%] border-l border-gray-200 min-w-0">

            {/* Messages */}
            <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm mt-0.5
                    ${msg.role === 'ai' ? 'bg-indigo-100' : 'bg-blue-500 text-white'}">
                    {msg.role === 'ai' ? '🤖' : '👤'}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap
                    ${msg.role === 'ai'
                      ? 'bg-gray-100 text-gray-800 rounded-tr-none'
                      : 'bg-blue-600 text-white rounded-tl-none'}`}>
                    {msg.text}
                    {msg.files?.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {msg.files.map((f, j) => (
                          <div key={j} className="text-[11px] opacity-70">📎 {f}</div>
                        ))}
                      </div>
                    )}
                    {msg.patched > 0 && (
                      <div className="text-[11px] opacity-60 mt-1">עודכנו {msg.patched} שדות ✦</div>
                    )}
                  </div>
                </div>
              ))}

              {/* Suggestion chips from last AI message */}
              {!thinking && messages.length > 0 && messages[messages.length - 1].role === 'ai' &&
                (messages[messages.length - 1].questions || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pr-9">
                  {messages[messages.length - 1].questions.map((q, i) => (
                    <button key={i} onClick={() => { setInput(q); send(q); }}
                      className="text-xs bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded-full px-3 py-1 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Thinking indicator */}
              {thinking && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-sm">🤖</div>
                  <div className="bg-gray-100 rounded-2xl rounded-tr-none px-3 py-2 flex gap-1 items-center">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}/>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mx-3 mb-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            {/* Attached files preview */}
            {files.length > 0 && (
              <div className="px-3 pb-1 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                    <span>{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                    <span className="max-w-[100px] truncate">{f.name}</span>
                    <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                      className="text-blue-400 hover:text-red-500 ml-0.5">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Input bar */}
            <div className="border-t p-3 flex gap-2 items-end">
              <button onClick={() => fileRef.current?.click()}
                className="shrink-0 w-9 h-9 rounded-xl border border-gray-300 hover:bg-gray-100 flex items-center justify-center text-gray-500 text-lg transition-colors"
                title="צרף קובץ">
                📎
                <input ref={fileRef} type="file" multiple accept="image/*,.pdf"
                  className="hidden" onChange={e => addFiles(e.target.files)}/>
              </button>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder="שלח הודעה... (Enter לשליחה)"
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400 max-h-24"/>
              <button onClick={() => send()} disabled={thinking || (!input.trim() && files.length === 0)}
                className="shrink-0 w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white flex items-center justify-center text-base transition-colors">
                ▶
              </button>
            </div>
          </div>

          {/* RIGHT — live draft form */}
          <div className="hidden md:flex flex-col flex-1 min-w-0">
            <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-2 shrink-0">
              <span className="font-semibold text-gray-700 text-sm">📋 טיוטת התיק</span>
              <span className="text-xs text-gray-400 flex-1">מתעדכן בזמן אמת · ניתן לעריכה ידנית</span>
              <button onClick={createCase} disabled={saving || !form.client_name}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors">
                {saving ? '⏳...' : '✅ צור תיק'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

              {/* Client */}
              <section>
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-1">👤 פרטי לקוח</div>
                <div className="bg-gray-50 rounded-xl px-3 py-1">
                  {FF('שם הלקוח *', 'client_name', { placeholder: 'ישראל ישראלי' })}
                  {FF('ת.ז. / ח.פ.', 'client_id_number', { placeholder: '000000000' })}
                  {FF('טלפון', 'client_phone', { placeholder: '050-0000000' })}
                  {FF('דוא"ל', 'client_email', { placeholder: 'email@example.com' })}
                </div>
              </section>

              {/* Property */}
              {isRE && (
                <section>
                  <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-1">🏠 פרטי הנכס</div>
                  <div className="bg-gray-50 rounded-xl px-3 py-1">
                    {FF('כתובת', 'property_address', { placeholder: 'רחוב, עיר' })}
                    {FF('גוש / חלקה', 'parcel', { placeholder: 'גוש 12345 חלקה 67' })}
                    {FF('תאריך מסירה', 'delivery_date', { type: 'date' })}
                  </div>
                </section>
              )}

              {/* Transaction */}
              <section>
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-1">⚖️ פרטי עסקה</div>
                <div className="bg-gray-50 rounded-xl px-3 py-1">
                  {FF('קטגוריה', 'case_category', { opts: [{ val: 'realestate', label: 'נדל"ן' }, { val: 'other', label: 'תיק אחר' }] })}
                  {FF('סוג', 'type', { opts: AI_TYPE_OPTS })}
                  {FF('שלב', 'stage', { opts: STAGE_OPTIONS })}
                  {FF('צד שני', 'other_party_name', { placeholder: 'שם הקונה / מוכר' })}
                  {FF('עו"ד צד שני', 'other_lawyer', { placeholder: 'שם עו"ד' })}
                  {FF('מתווך', 'broker', { placeholder: 'שם המתווך' })}
                  {FF('עו"ד מטפל', 'responsible_lawyer_id', { opts: lawyerOpts })}
                  {FF('מקור הפניה', 'referral_source')}
                </div>
              </section>

              {/* Financial */}
              <section>
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-1">💰 פיננסי</div>
                <div className="bg-gray-50 rounded-xl px-3 py-1">
                  {FF('שכ"ט תיאור', 'fee_text', { placeholder: '1%+מע"מ' })}
                  {FF('שכ"ט (₪)', 'agreed_fee', { type: 'number', placeholder: '0' })}
                  {FF('משכנתא', 'mortgage')}
                  {FF('מס שבח', 'capital_gains')}
                </div>
              </section>

              {/* Notes */}
              <section>
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-1">📝 הערות</div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <textarea value={form.description || ''} rows={3}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="פרטים נוספים..."
                    className="w-full text-sm bg-transparent focus:outline-none resize-none"/>
                </div>
              </section>

            </div>

            {/* Mobile create button */}
            <div className="border-t px-4 py-3 md:hidden">
              <button onClick={createCase} disabled={saving || !form.client_name}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold rounded-xl py-2.5 transition-colors">
                {saving ? '⏳ יוצר תיק...' : '✅ צור תיק'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

function NewMatterModal({ category, lawyers, onSave, onClose }) {
  const isRE = category !== 'other';
  const [form, setForm] = useState({
    client_name: '', property_address: '', parcel: '',
    type: isRE ? 'sale' : 'other', stage: 'draft',
    responsible_lawyer_id: '', delivery_date: '',
    agreed_fee: '', fee_text: '', payment_status: '',
    other_lawyer: '', broker: '', description: '',
    case_number: '', referral_source: '', open_date: today(),
    target_date: '',
    mortgage: '', capital_gains: '', committee_status: '',
    municipality_status: '', rami_status: '',
    collected_amount: '', balance_amount: '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.client_name.trim()) { setErr('שם התיק/לקוח חובה'); return; }
    setSaving(true); setErr('');
    const pin = sessionStorage.getItem('cases_pin') || '';
    const res  = await fetch('/api/matters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': pin },
      body: JSON.stringify({ ...form, case_category: category, pin }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(json.error || 'שגיאה'); return; }
    onSave(json.matter);
  }

  const Field = ({ label, children }) => (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
  const inp = (k, type = 'text', placeholder = '') => (
    <input value={form[k]} onChange={e => set(k, e.target.value)}
      type={type} placeholder={placeholder}
      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"/>
  );
  const sel = (k, opts) => (
    <select value={form[k]} onChange={e => set(k, e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400">
      <option value="">—</option>
      {opts.map(o => <option key={o.val ?? o} value={o.val ?? o}>{o.label ?? o}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 text-lg">{isRE ? '🏠 תיק נדל"ן חדש' : '📁 תיק חדש'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="שם התיק / לקוח *">{inp('client_name', 'text', 'שם הלקוח')}</Field>
          </div>
          {isRE ? (
            <>
              <Field label="כתובת הנכס">{inp('property_address', 'text', 'רחוב, עיר')}</Field>
              <Field label="גוש/חלקה">{inp('parcel')}</Field>
              <Field label="שלב">{sel('stage', STAGE_OPTIONS)}</Field>
              <Field label="תאריך מסירה">{inp('delivery_date', 'date')}</Field>
              <Field label='עו"ד מטפל'>
                {sel('responsible_lawyer_id', lawyers.map(l => ({ val: l.id, label: l.full_name })))}
              </Field>
              <Field label='עו"ד צד שני'>{inp('other_lawyer')}</Field>
              <Field label="מתווך">{inp('broker')}</Field>
              <Field label='שכ"ט'>{inp('fee_text', 'text', 'לדוג׳: 8500+מע"מ')}</Field>
              <Field label="משכנתא">{inp('mortgage', 'text', 'סטטוס משכנתא')}</Field>
              <Field label="מס שבח">{inp('capital_gains', 'text', 'סטטוס מס שבח')}</Field>
              <Field label="ועדה">{inp('committee_status', 'text', 'סטטוס ועדה')}</Field>
              <Field label="עירייה">{inp('municipality_status', 'text', 'סטטוס עירייה')}</Field>
              <Field label="פניה רמ״י">{inp('rami_status')}</Field>
              <Field label="נגבה (₪)">{inp('collected_amount', 'number')}</Field>
              <Field label="יתרה (₪)">{inp('balance_amount', 'number')}</Field>
            </>
          ) : (
            <>
              <Field label="מס׳ תיק">{inp('case_number')}</Field>
              <Field label="סוג התיק">{sel('type', TYPE_OPTIONS)}</Field>
              <Field label='עו"ד מטפל'>
                {sel('responsible_lawyer_id', lawyers.map(l => ({ val: l.id, label: l.full_name })))}
              </Field>
              <Field label="צד שני">{inp('other_lawyer')}</Field>
              <Field label="מקור הפניה">{inp('referral_source')}</Field>
              <Field label="תאריך פתיחה">{inp('open_date', 'date')}</Field>
              <Field label="תאריך יעד">{inp('target_date', 'date')}</Field>
              <Field label='שכ"ט'>{inp('fee_text', 'text')}</Field>
            </>
          )}
          <Field label="סטטוס תשלום">{sel('payment_status', PAYMENT_STATUS_OPTS)}</Field>
          <Field label='שכ"ט מוסכם (₪)'>{inp('agreed_fee', 'number')}</Field>
          <div className="col-span-2">
            <Field label="הערות (מידע חופשי)">
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 resize-none"
                placeholder="הערות, פרטים נוספים, מידע חופשי..."/>
            </Field>
          </div>
          {err && <p className="col-span-2 text-red-500 text-sm">{err}</p>}
          <div className="col-span-2 flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5">
              {saving ? 'שומר...' : 'הוסף תיק'}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── New Task Modal ───────────────────────────────────────────────────────────

function NewTaskModal({ lawyers, matters, onSave, onClose }) {
  const [form, setForm] = useState({
    task_number: '', task_type: '', description: '',
    assigned_to: '', due_date: '', priority: 'medium',
    status: 'open', notes: '', matter_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.description.trim()) { setErr('תיאור המשימה חובה'); return; }
    setSaving(true); setErr('');
    const pin = sessionStorage.getItem('cases_pin') || '';
    const res  = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': pin },
      body: JSON.stringify({ ...form, pin }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(json.error || 'שגיאה'); return; }
    onSave(json.task);
  }

  const inp = (k, type = 'text', ph = '') => (
    <input value={form[k]} onChange={e => set(k, e.target.value)} type={type} placeholder={ph}
      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"/>
  );
  const selEl = (k, opts) => (
    <select value={form[k]} onChange={e => set(k, e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400">
      <option value="">—</option>
      {opts.map(o => <option key={o.val ?? o} value={o.val ?? o}>{o.label ?? o}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 text-lg">✅ משימה חדשה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">תיאור המשימה *</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 resize-none"/>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">מס׳ משימה</label>
            {inp('task_number')}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">סוג משימה</label>
            {inp('task_type', 'text', 'לדוג׳: מסמך')}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">אחראי</label>
            {selEl('assigned_to', lawyers.map(l => ({ val: l.id, label: l.full_name })))}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">תאריך יעד</label>
            {inp('due_date', 'date')}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">עדיפות</label>
            {selEl('priority', TASK_PRIORITY)}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">סטטוס</label>
            {selEl('status', TASK_STATUS)}
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">תיק קשור</label>
            <select value={form.matter_id} onChange={e => set('matter_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400">
              <option value="">— אין תיק קשור —</option>
              {matters.map(m => (
                <option key={m.id} value={m.id}>{m.clients?.name || m.title} {m.case_number ? `(${m.case_number})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">הערות</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"/>
          </div>
          {err && <p className="col-span-2 text-red-500 text-sm">{err}</p>}
          <div className="col-span-2 flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5">
              {saving ? 'שומר...' : 'הוסף משימה'}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
              ביטול
            </button>
          </div>
        </form>
      </div>
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
    const options = type === 'select' ? opts.split(',').map(s => s.trim()).filter(Boolean) : null;
    const pin  = sessionStorage.getItem('cases_pin') || '';
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
              placeholder="לדוג׳: מס׳ זהות מוכר"/>
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="כן,לא,ממתין"/>
            </div>
          )}
          {err && <p className="text-red-500 text-xs">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'שומר...' : 'הוסף עמודה'}
            </button>
            <button type="button" onClick={onClose} className="px-4 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function StatsCards({ matters, tasks, lawyers }) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const totalBalance   = matters.reduce((s, m) => s + Number(m.balance_amount || 0), 0);
  const totalCollected = matters.reduce((s, m) => s + Number(m.collected_amount || 0), 0);
  const activeCount    = matters.filter(m => m.stage !== 'closed').length;
  const closedCount    = matters.filter(m => m.stage === 'closed').length;
  const upcomingDel    = matters.filter(m => {
    if (!m.delivery_date) return false;
    const d = new Date(m.delivery_date);
    return d >= now && d <= in30;
  }).length;
  const overdueCount   = matters.filter(m => {
    if (!m.delivery_date) return false;
    return new Date(m.delivery_date) < now && m.stage !== 'closed';
  }).length;
  const openTasks      = (tasks || []).filter(t => t.status === 'open').length;
  const overdueTasks   = (tasks || []).filter(t => t.status === 'open' && t.due_date && new Date(t.due_date) < now).length;

  const cards = [
    { label: 'תיקים פעילים',   value: activeCount,          sub: `${closedCount} סגורים`,          color: 'bg-blue-50 border-blue-200',    val_color: 'text-blue-700' },
    { label: 'יתרה לגבייה',    value: fmtMoney(totalBalance), sub: `נגבה: ${fmtMoney(totalCollected)}`, color: 'bg-orange-50 border-orange-200', val_color: 'text-orange-700' },
    { label: 'מסירות (30 יום)', value: upcomingDel,           sub: overdueCount > 0 ? `${overdueCount} באיחור` : 'הכל בזמן',  color: overdueCount > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200', val_color: overdueCount > 0 ? 'text-red-700' : 'text-green-700' },
    { label: 'משימות פתוחות',   value: openTasks,             sub: overdueTasks > 0 ? `${overdueTasks} באיחור` : 'הכל בסדר', color: overdueTasks > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200', val_color: overdueTasks > 0 ? 'text-yellow-700' : 'text-gray-700' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-3 bg-white border-b">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl border p-3 ${c.color}`}>
          <div className={`text-xl font-bold ${c.val_color}`}>{c.value}</div>
          <div className="text-xs font-semibold text-gray-700 mt-0.5">{c.label}</div>
          <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

// סדר עמודות בדיוק כמו גיליון "תיקי נדלן" באקסל:
// עו"ד | שם | גוש/חלקה | כתובת | הערות | תאריך מסירה | ימים | שכ"ט | סטטוס | משכנתא | מס שבח | ועדה | עירייה | עו"ד צד שני | מתווך | נגבה | יתרה | פניה רמי
const RE_COLS = [
  { key: 'client_name',           label: 'שם התיק/לקוח',  w: 160, kind: 'client',  field: 'name', sticky: true },
  { key: 'responsible_lawyer_id', label: 'עו"ד מטפל',     w: 100, kind: 'lawyer' },
  { key: 'stage',                 label: 'שלב',           w: 120, kind: 'stage' },
  { key: 'parcel',                label: 'גוש/חלקה',      w: 100, kind: 'field' },
  { key: 'property_address',      label: 'כתובת הנכס',    w: 220, kind: 'field' },
  { key: 'description',           label: 'הערות',         w: 280, kind: 'field' },
  { key: 'delivery_date',         label: 'תאריך מסירה',   w: 110, kind: 'date' },
  { key: 'days_left',             label: 'ימים',          w: 65,  kind: 'days_left' },
  { key: 'fee_text',              label: 'שכ"ט',          w: 150, kind: 'field' },
  { key: 'payment_status',        label: 'סטטוס תשלום',   w: 110, kind: 'paystat' },
  { key: 'mortgage',              label: 'משכנתא',        w: 80,  kind: 'field' },
  { key: 'capital_gains',         label: 'מס שבח',        w: 75,  kind: 'field' },
  { key: 'committee_status',      label: 'ועדה',          w: 75,  kind: 'field' },
  { key: 'municipality_status',   label: 'עירייה',        w: 90,  kind: 'field' },
  { key: 'other_lawyer',          label: 'עו"ד צד שני',   w: 110, kind: 'field' },
  { key: 'broker',                label: 'מתווך',         w: 90,  kind: 'field' },
  { key: 'collected_amount',      label: 'נגבה (₪)',      w: 90,  kind: 'money' },
  { key: 'balance_amount',        label: 'יתרה (₪)',      w: 90,  kind: 'money' },
  { key: 'rami_status',           label: 'פניה רמי',      w: 150, kind: 'field' },
];

const OTHER_COLS = [
  { key: 'case_number',           label: 'מס\' תיק',       w: 110, kind: 'field',  sticky: true },
  { key: 'client_name',           label: 'שם התיק/לקוח',   w: 170, kind: 'client', field: 'name' },
  { key: 'client_id_number',      label: 'ת.ז./ח.פ.',      w: 110, kind: 'client', field: 'id_number' },
  { key: 'type',                  label: 'סוג התיק',       w: 110, kind: 'type' },
  { key: 'responsible_lawyer_id', label: 'עו"ד מטפל',      w: 110, kind: 'lawyer' },
  { key: 'other_lawyer',          label: 'צד שני',         w: 120, kind: 'field' },
  { key: 'referral_source',       label: 'מקור הפניה',     w: 130, kind: 'field' },
  { key: 'open_date',             label: 'תאריך פתיחה',    w: 120, kind: 'date' },
  { key: 'target_date',           label: 'תאריך יעד',      w: 120, kind: 'date' },
  { key: 'fee_text',              label: 'שכ"ט',           w: 150, kind: 'field' },
  { key: 'collected_amount',      label: 'נגבה',           w: 90,  kind: 'money' },
  { key: 'balance_amount',        label: 'יתרה',           w: 90,  kind: 'money' },
  { key: 'payment_status',        label: 'סטטוס תשלום',    w: 120, kind: 'paystat' },
  { key: 'description',           label: 'הערות',          w: 280, kind: 'field' },
];

// ─── Matters Table ────────────────────────────────────────────────────────────

function MattersTable({ cols, matters, lawyers, customCols, unlocked, saveField, saveExtra, onAddCol, onDeleteCol, deletingCol, onDeleteRow, onCloseRow, onOpenDrawer }) {
  const lawyerOpts = lawyers.map(l => ({ val: l.id, label: l.full_name }));
  const totalCols  = cols.length + customCols.length + 1;

  function renderCell(m, col) {
    const days = col.kind === 'date' && col.key === 'delivery_date' && m.delivery_date
      ? Math.round((new Date(m.delivery_date) - new Date()) / 86400000) : null;

    if (col.kind === 'client') {
      return (
        <div className="flex items-center gap-1 group/name">
          <EditableCell editable={unlocked} value={m.clients?.[col.field]}
            onSave={v => saveField(m.id, `client_${col.field}`, v, true)} placeholder={col.label}/>
          <button onClick={() => onOpenDrawer(m)}
            className="opacity-0 group-hover/name:opacity-100 transition-opacity text-blue-400 hover:text-blue-600 text-xs leading-none shrink-0 px-1"
            title="פתח פרטי תיק">⬡</button>
        </div>
      );
    }
    if (col.kind === 'lawyer') {
      const lawyerName = (Array.isArray(m.profiles) ? m.profiles[0]?.full_name : m.profiles?.full_name)
        || lawyers.find(l => l.id === m.responsible_lawyer_id)?.full_name
        || '';
      const lawyerId = m.responsible_lawyer_id;
      return (
        <div className="flex items-center gap-1">
          <EditableCell editable={unlocked} value={lawyerId}
            displayLabel={lawyerName}
            onSave={v => saveField(m.id, 'responsible_lawyer_id', v)} options={lawyerOpts}/>
          {lawyerId && lawyerName && (
            <a href={`/lawyer/${lawyerId}`} target="_blank" rel="noreferrer"
              className="text-sky-500 hover:text-sky-700 text-xs flex-shrink-0" title={`עמוד ${lawyerName}`}>↗</a>
          )}
        </div>
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
    if (col.kind === 'paystat') {
      return <EditableCell editable={unlocked} value={m.payment_status} onSave={v => saveField(m.id, 'payment_status', v)} options={PAYMENT_STATUS_OPTS}/>;
    }
    if (col.kind === 'date') {
      return <EditableCell editable={unlocked} value={m[col.key]} onSave={v => saveField(m.id, col.key, v)} type="date"/>;
    }
    if (col.kind === 'days_left') {
      if (!m.delivery_date) return <span className="text-gray-200 text-xs px-1">—</span>;
      const d = Math.round((new Date(m.delivery_date) - new Date()) / 86400000);
      const cls = d < 0 ? 'bg-red-100 text-red-700 font-bold' : d === 0 ? 'bg-orange-100 text-orange-700 font-bold' : d <= 7 ? 'bg-yellow-100 text-yellow-700' : 'text-gray-400';
      const txt = d < 0 ? `-${Math.abs(d)}` : d === 0 ? 'היום' : `${d}`;
      return <span className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{txt}</span>;
    }
    return <EditableCell editable={unlocked} value={m[col.key]} onSave={v => saveField(m.id, col.key, v)} placeholder="—"/>;
  }

  const minW = cols.reduce((s, c) => s + c.w, 0) + customCols.length * 140 + 50;

  return (
    <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
      <table className="w-full text-sm border-collapse" style={{ minWidth: `${minW}px` }}>
        <thead className="bg-gray-100 sticky top-0 z-20">
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
                <div className="flex items-center gap-1 group/colhdr">
                  <span>{col.name}</span>
                  {unlocked && (
                    <button
                      onClick={() => { if (window.confirm(`למחוק את העמודה "${col.name}"? הפעולה תמחק את כל הנתונים בעמודה זו.`)) onDeleteCol(col); }}
                      disabled={deletingCol === col.id}
                      title="מחק עמודה"
                      className="opacity-0 group-hover/colhdr:opacity-100 bg-red-100 hover:bg-red-500 text-red-500 hover:text-white rounded px-1 text-xs transition-all ml-1 leading-none">
                      🗑️
                    </button>
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
          {matters.length === 0 ? (
            <tr><td colSpan={totalCols} className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📂</div>
              <div>{unlocked ? 'אין תיקים. לחץ "סנכרן Drive" לייבוא, או "+ תיק חדש" להוספה.' : 'אין תיקים להצגה.'}</div>
            </td></tr>
          ) : (() => {
            const { unsigned, signed } = groupByStage(matters);
            const renderRow = (m, idx) => {
              const days  = m.delivery_date ? Math.round((new Date(m.delivery_date) - new Date()) / 86400000) : null;
              const rowBg = days != null && days < 0 ? 'bg-red-50'
                : days != null && days <= 7 ? 'bg-yellow-50'
                : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
              return (
                <tr key={m.id} className={`${rowBg} hover:bg-blue-50/70 border-b transition-colors group/row`}>
                  {cols.map(col => (
                    <td key={col.key} className={`px-1 py-0.5 ${col.sticky ? `border-l sticky right-0 z-10 ${rowBg}` : ''}`}>
                      {renderCell(m, col)}
                    </td>
                  ))}
                  {customCols.map(col => {
                    const selectOpts = col.col_type === 'select' && col.options ? col.options.map(o => ({ val: o, label: o })) : null;
                    return (
                      <td key={col.id} className="px-1 py-0.5 bg-purple-50/40">
                        <EditableCell editable={unlocked} value={m.extra_data?.[col.id]}
                          onSave={v => saveExtra(m.id, col.id, v)} colType={col.col_type} options={selectOpts}
                          type={col.col_type === 'number' ? 'number' : col.col_type === 'date' ? 'date' : 'text'}
                          placeholder="—"/>
                      </td>
                    );
                  })}
                  {/* עמודת פעולות */}
                  <td className="px-1 py-0.5 text-center">
                    {unlocked && (
                      <RowActions
                        isClosed={m.stage === 'closed'}
                        onClose={() => onCloseRow(m.id)}
                        onDelete={() => onDeleteRow(m.id, m.clients?.name || m.title)}
                      />
                    )}
                  </td>
                </tr>
              );
            };

            const groups = groupByStage(matters);

            return (
              <>
                {groups.map(g => (
                  <React.Fragment key={g.key}>
                    {/* כותרת קבוצה */}
                    <tr>
                      <td colSpan={totalCols}
                        className={`px-3 py-1.5 text-xs font-bold border-y ${g.color}`}>
                        {g.label} <span className="font-normal opacity-60">({g.items.length})</span>
                      </td>
                    </tr>
                    {g.items.map((m, i) => renderRow(m, i))}
                  </React.Fragment>
                ))}
              </>
            );
          })()}
        </tbody>

        {matters.length > 0 && (
          <tfoot className="bg-gray-100 sticky bottom-0 z-10 shadow-[0_-1px_3px_rgba(0,0,0,0.08)]">
            <tr className="font-semibold text-sm">
              {cols.map((col, i) => {
                if (i === 0) return (
                  <td key={col.key} className={`px-2 py-2 border-t text-xs text-gray-600 whitespace-nowrap ${col.sticky ? 'sticky right-0 bg-gray-100 border-l' : ''}`}>
                    סה"כ: {matters.length} תיקים
                  </td>
                );
                if (col.kind === 'money') {
                  const sum   = matters.reduce((s, m) => s + Number(m[col.key] || 0), 0);
                  const color = col.key === 'collected_amount' ? 'text-blue-700' : col.key === 'balance_amount' ? 'text-orange-700' : 'text-green-700';
                  return <td key={col.key} className={`px-2 py-2 border-t font-bold ${color} whitespace-nowrap`}>{fmtMoney(sum)}</td>;
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
  const now  = new Date();

  return (
    <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
      <table className="w-full text-sm border-collapse" style={{ minWidth: `${minW}px` }}>
        <thead className="bg-gray-100 sticky top-0 z-20">
          <tr>
            {COLS.map(c => (
              <th key={c.key} className="px-2 py-2 text-right font-semibold border-b text-xs whitespace-nowrap" style={{ minWidth: c.w }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, idx) => {
            const done    = t.status === 'done';
            const overdue = !done && t.due_date && new Date(t.due_date) < now;
            const rowBg   = done ? 'bg-gray-50 text-gray-400' : overdue ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70';
            return (
              <tr key={t.id} className={`${rowBg} hover:bg-blue-50/60 border-b`}>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.task_number} onSave={v => saveTask(t.id, 'task_number', v)}/></td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.task_type} onSave={v => saveTask(t.id, 'task_type', v)}/></td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.description} onSave={v => saveTask(t.id, 'description', v)}/></td>
                <td className="px-1 py-1 text-xs text-gray-500">{t.matters?.case_number || t.matters?.title || '—'}</td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.profiles?.id || t.assigned_to} onSave={v => saveTask(t.id, 'assigned_to', v)} options={lawyerOpts}/></td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.due_date} onSave={v => saveTask(t.id, 'due_date', v)} type="date"/></td>
                <td className="px-1 py-1"><EditableCell editable={unlocked} value={t.status} onSave={v => saveTask(t.id, 'status', v)} options={TASK_STATUS}/></td>
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

// ─── Collection Tab ───────────────────────────────────────────────────────────

function CollectionTable({ matters, lawyers, unlocked, saveField }) {
  const lawyerOpts = lawyers.map(l => ({ val: l.id, label: l.full_name }));

  // Only matters with outstanding balance, sorted by balance desc
  const rows = [...matters]
    .filter(m => Number(m.balance_amount || 0) > 0)
    .sort((a, b) => Number(b.balance_amount || 0) - Number(a.balance_amount || 0));

  const totalBalance = rows.reduce((s, m) => s + Number(m.balance_amount || 0), 0);
  const COLS = ['שם לקוח', 'סוג', 'שלב', 'שכ"ט', 'נגבה', 'יתרה', 'סטטוס תשלום', 'עו"ד מטפל', 'WhatsApp'];

  return (
    <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
      {rows.length > 0 && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 text-sm text-orange-800 font-medium">
          סה"כ יתרה לגבייה: <strong>{fmtMoney(totalBalance)}</strong> — {rows.length} תיקים
        </div>
      )}
      <table className="w-full text-sm border-collapse min-w-[800px]">
        <thead className="bg-gray-100 sticky top-0 z-20">
          <tr>
            {COLS.map(c => (
              <th key={c} className="px-2 py-2 text-right font-semibold border-b text-xs whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m, idx) => {
            const balance = Number(m.balance_amount || 0);
            const urgent  = balance > 10000;
            const rowBg   = urgent ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-orange-50/30';
            const phone   = m.clients?.phone;
            const name    = m.clients?.name || m.title || '';
            const waLink  = whatsAppLink(phone, name, balance);
            return (
              <tr key={m.id} className={`${rowBg} hover:bg-blue-50/60 border-b`}>
                <td className="px-2 py-1.5 font-medium text-gray-800">{name}</td>
                <td className="px-2 py-1.5 text-xs">{labelOf(TYPE_OPTIONS, m.type)}</td>
                <td className="px-2 py-1.5">
                  {m.stage && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLOR[m.stage] || 'bg-gray-100'}`}>
                      {labelOf(STAGE_OPTIONS, m.stage)}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-xs text-gray-600">{m.fee_text || fmtMoney(m.agreed_fee) || '—'}</td>
                <td className="px-2 py-1.5 text-blue-700 font-medium">{fmtMoney(m.collected_amount)}</td>
                <td className="px-2 py-1.5 font-bold text-orange-700">{fmtMoney(balance)}</td>
                <td className="px-2 py-1.5">
                  <EditableCell editable={unlocked} value={m.payment_status}
                    onSave={v => saveField(m.id, 'payment_status', v)} options={PAYMENT_STATUS_OPTS}/>
                </td>
                <td className="px-2 py-1.5 text-xs text-gray-600">
                  {m.profiles?.full_name || labelOf(lawyers.map(l => ({ val: l.id, label: l.full_name })), m.responsible_lawyer_id) || '—'}
                </td>
                <td className="px-2 py-1.5">
                  {waLink ? (
                    <a href={waLink} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded-lg transition-colors"
                      title={`שלח תזכורת ל-${name}`}>
                      <span>📲</span> WhatsApp
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">אין טלפון</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={COLS.length} className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">💚</div>
              <div>אין יתרות פתוחות לגבייה!</div>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stats Dashboard Tab ──────────────────────────────────────────────────────

function StatsDashboard({ reMatters, otherMatters, tasks, lawyers }) {
  const allMatters = [...reMatters, ...otherMatters];
  const now        = new Date();
  const thisMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // By lawyer
  const lawyerStats = lawyers.map(l => {
    const lm        = allMatters.filter(m => m.responsible_lawyer_id === l.id || m.profiles?.id === l.id);
    const balance   = lm.reduce((s, m) => s + Number(m.balance_amount || 0), 0);
    const collected = lm.reduce((s, m) => s + Number(m.collected_amount || 0), 0);
    const openTasks = tasks.filter(t => (t.assigned_to === l.id || t.profiles?.id === l.id) && t.status === 'open').length;
    return { name: l.full_name, count: lm.length, balance, collected, openTasks };
  }).filter(l => l.count > 0).sort((a, b) => b.count - a.count);

  // By stage
  const stageStats = STAGE_OPTIONS.map(s => ({
    label: s.label, count: reMatters.filter(m => m.stage === s.val).length,
  })).filter(s => s.count > 0);

  // Deliveries this month
  const deliveriesThisMonth = reMatters.filter(m =>
    m.delivery_date && m.delivery_date.startsWith(thisMonth)
  );

  // Financial summary
  const totalAgreed    = allMatters.reduce((s, m) => s + Number(m.agreed_fee || 0), 0);
  const totalCollected = allMatters.reduce((s, m) => s + Number(m.collected_amount || 0), 0);
  const totalBalance   = allMatters.reduce((s, m) => s + Number(m.balance_amount || 0), 0);

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">

      {/* Financial KPIs */}
      <div>
        <h2 className="text-base font-bold text-gray-700 mb-3">סיכום פיננסי</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'שכ"ט מוסכם סה"כ',  val: fmtMoney(totalAgreed),    color: 'text-gray-700', bg: 'bg-gray-50' },
            { label: 'נגבה סה"כ',         val: fmtMoney(totalCollected), color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'יתרה לגבייה',       val: fmtMoney(totalBalance),   color: 'text-orange-700', bg: 'bg-orange-50' },
          ].map(k => (
            <div key={k.label} className={`rounded-xl border p-4 ${k.bg}`}>
              <div className={`text-2xl font-bold ${k.color}`}>{k.val}</div>
              <div className="text-xs text-gray-600 mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* By lawyer */}
      {lawyerStats.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-gray-700 mb-3">תיקים לפי עו"ד</h2>
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['עו"ד', 'תיקים', 'נגבה', 'יתרה', 'משימות פתוחות'].map(h => (
                    <th key={h} className="px-4 py-2 text-right text-xs font-semibold text-gray-600 border-b">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lawyerStats.map((l, i) => (
                  <tr key={l.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2 font-medium text-gray-800">{l.name}</td>
                    <td className="px-4 py-2 text-gray-600">{l.count}</td>
                    <td className="px-4 py-2 text-blue-700 font-medium">{fmtMoney(l.collected)}</td>
                    <td className="px-4 py-2 text-orange-700 font-medium">{fmtMoney(l.balance)}</td>
                    <td className="px-4 py-2">
                      {l.openTasks > 0 ? (
                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">{l.openTasks} פתוחות</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stage breakdown + deliveries this month */}
      <div className="grid grid-cols-2 gap-4">
        {stageStats.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-gray-700 mb-3">שלבי תיקי נדל"ן</h2>
            <div className="bg-white border rounded-xl overflow-hidden">
              {stageStats.map((s, i) => (
                <div key={s.label} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t' : ''}`}>
                  <span className="text-sm text-gray-700">{s.label}</span>
                  <span className="text-sm font-bold text-gray-800">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {deliveriesThisMonth.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-gray-700 mb-3">מסירות החודש ({deliveriesThisMonth.length})</h2>
            <div className="bg-white border rounded-xl overflow-hidden">
              {deliveriesThisMonth.slice(0, 8).map((m, i) => (
                <div key={m.id} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t' : ''}`}>
                  <span className="text-sm text-gray-800">{m.clients?.name || m.title}</span>
                  <span className="text-xs text-gray-500">{m.delivery_date}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tasks by priority */}
      {tasks.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-gray-700 mb-3">
            משימות פתוחות ({tasks.filter(t => t.status === 'open').length})
          </h2>
          <div className="bg-white border rounded-xl overflow-hidden">
            {tasks.filter(t => t.status === 'open').slice(0, 10).map((t, i) => {
              const overdue  = t.due_date && new Date(t.due_date) < now;
              const assigned = t.profiles?.full_name || lawyers.find(l => l.id === t.assigned_to)?.full_name || '';
              return (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t' : ''} ${overdue ? 'bg-red-50' : ''}`}>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_COLOR[t.priority] || 'bg-gray-100 text-gray-500'}`}>
                    {labelOf(TASK_PRIORITY, t.priority)}
                  </span>
                  <span className="text-sm text-gray-800 flex-1 truncate">{t.description}</span>
                  {assigned && <span className="text-xs text-gray-400 shrink-0">{assigned}</span>}
                  {t.due_date && <span className={`text-xs shrink-0 ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{t.due_date}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCSV(matters, cols, filename) {
  const headers = cols.map(c => c.label).join(',');
  const rows    = matters.map(m =>
    cols.map(c => {
      let v = '';
      if (c.kind === 'client') v = m.clients?.[c.field] || '';
      else if (c.kind === 'lawyer') v = m.profiles?.full_name || '';
      else if (c.kind === 'stage') v = labelOf(STAGE_OPTIONS, m.stage);
      else if (c.kind === 'type')  v = labelOf(TYPE_OPTIONS, m.type);
      else v = m[c.key] || '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv  = '﻿' + headers + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Reports Tab (חיפוש וסינון — כמו באקסל) ──────────────────────────────────

function ReportSection({ icon, title, color, matters, lawyers, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const totalBalance = matters.reduce((s, m) => s + Number(m.balance_amount || 0), 0);
  const lawyerName = id => lawyers.find(l => l.id === id)?.full_name || '';
  if (!matters.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-right ${color}`}>
        <span className="text-lg">{icon}</span>
        <span className="font-bold text-sm flex-1">{title}</span>
        <span className="text-xs opacity-80">{matters.length} תיקים{totalBalance > 0 ? ` · יתרה ${fmtMoney(totalBalance)}` : ''}</span>
        <span className="text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right">שם הלקוח</th>
                <th className="px-3 py-2 text-right">כתובת / סוג</th>
                <th className="px-3 py-2 text-right">שלב</th>
                <th className="px-3 py-2 text-right">עו"ד מטפל</th>
                <th className="px-3 py-2 text-right">תאריך מסירה</th>
                <th className="px-3 py-2 text-right">שכ"ט</th>
                <th className="px-3 py-2 text-right">נגבה</th>
                <th className="px-3 py-2 text-right">יתרה</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {matters.map(m => (
                <tr key={m.id} className="hover:bg-blue-50/40">
                  <td className="px-3 py-1.5 font-medium">{m.clients?.name || m.title || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500">{m.property_address || labelOf(TYPE_OPTIONS, m.type) || ''}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLOR[m.stage] || 'bg-gray-100 text-gray-500'}`}>
                      {labelOf(STAGE_OPTIONS, m.stage) || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-600">{m.profiles?.full_name || lawyerName(m.responsible_lawyer_id)}</td>
                  <td className="px-3 py-1.5 text-gray-500">{m.delivery_date || ''}</td>
                  <td className="px-3 py-1.5">{m.fee_text || fmtMoney(m.fee_amount)}</td>
                  <td className="px-3 py-1.5 text-green-700">{fmtMoney(m.collected_amount)}</td>
                  <td className={`px-3 py-1.5 font-medium ${Number(m.balance_amount) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {fmtMoney(m.balance_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportsTab({ reMatters, otherMatters, lawyers }) {
  const active = reMatters.filter(m => m.stage !== 'closed');
  const noPay      = active.filter(m => !Number(m.collected_amount) && Number(m.balance_amount) > 0);
  const partial    = active.filter(m => Number(m.collected_amount) > 0 && Number(m.balance_amount) > 0);
  const urgent     = active.filter(m => ['signed', 'registration'].includes(m.stage) && Number(m.balance_amount) > 0);
  const drafts     = active.filter(m => !m.stage || m.stage === 'draft');
  const inReg      = active.filter(m => m.stage === 'registration');
  const signedWait = active.filter(m => m.stage === 'signed');
  const condWait   = active.filter(m => ['conditional', 'waiting'].includes(m.stage));
  const nonRE      = otherMatters.filter(m => m.stage !== 'closed');

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="text-sm text-gray-500">
        דוחות מובנים — מתעדכנים אוטומטית מנתוני התיקים, בדיוק כמו גיליון "חיפוש וסינון" באקסל
      </div>
      <ReportSection icon="⚠️" title='דחוף — תיקים שנחתמו / ברישום ושכ"ט לא שולם' color="bg-red-50 text-red-900"
        matters={urgent} lawyers={lawyers} defaultOpen/>
      <ReportSection icon="🔴" title='תיקי נדל"ן שלא שולם בהם שכ"ט' color="bg-rose-50 text-rose-900"
        matters={noPay} lawyers={lawyers}/>
      <ReportSection icon="🟡" title='תיקי נדל"ן בתשלום חלקי' color="bg-yellow-50 text-yellow-900"
        matters={partial} lawyers={lawyers}/>
      <ReportSection icon="📝" title="תיקים בשלב טיוטה" color="bg-sky-50 text-sky-900"
        matters={drafts} lawyers={lawyers}/>
      <ReportSection icon="📅" title="תיקים שנחתמו וממתינים למסירה" color="bg-green-50 text-green-900"
        matters={signedWait} lawyers={lawyers}/>
      <ReportSection icon="📋" title="תיקים בטיפול רישום (אחרי מסירה)" color="bg-purple-50 text-purple-900"
        matters={inReg} lawyers={lawyers}/>
      <ReportSection icon="⏸️" title="תיקים מותנים / ממתינים לצד שני" color="bg-orange-50 text-orange-900"
        matters={condWait} lawyers={lawyers}/>
      <ReportSection icon="📄" title="תיקים שאינם נדל״ן (הסכמי ממון, צוואות, ירושות...)" color="bg-slate-50 text-slate-900"
        matters={nonRE} lawyers={lawyers}/>
    </div>
  );
}

// ─── Personal Lawyer Dashboard (לוח בקרה אישי — כמו גיליונות לידור/פולינה/צופית/עופר) ──

function LawyerDashboard({ lawyer, reMatters, otherMatters, tasks, unlocked, saveTask, onOpenDrawer }) {
  const now = new Date();
  const isMine = m => m.responsible_lawyer_id === lawyer.id || m.profiles?.id === lawyer.id;
  const myRE     = reMatters.filter(isMine);
  const myOther  = otherMatters.filter(isMine);
  const myTasks  = tasks.filter(t => t.assigned_to === lawyer.id || t.profiles?.id === lawyer.id);

  const activeRE    = myRE.filter(m => m.stage !== 'closed');
  const activeOther = myOther.filter(m => m.stage !== 'closed');
  const openTasks   = myTasks.filter(t => t.status === 'open');
  const overdueTasks = openTasks.filter(t => t.due_date && new Date(t.due_date) < now);
  const collected   = [...myRE, ...myOther].reduce((s, m) => s + Number(m.collected_amount || 0), 0);
  const balance     = [...myRE, ...myOther].reduce((s, m) => s + Number(m.balance_amount || 0), 0);

  const cards = [
    { label: 'תיקי נדל"ן פעילים',   val: activeRE.length,        color: 'text-blue-700' },
    { label: 'תיקים אחרים פעילים', val: activeOther.length,     color: 'text-indigo-700' },
    { label: 'משימות פתוחות',       val: openTasks.length,       color: 'text-amber-700' },
    { label: 'משימות באיחור',       val: overdueTasks.length,    color: overdueTasks.length ? 'text-red-600' : 'text-gray-400' },
    { label: 'שכ"ט נגבה (₪)',       val: collected.toLocaleString('he-IL'), color: 'text-green-700' },
    { label: 'יתרה לגבייה (₪)',     val: balance.toLocaleString('he-IL'),   color: balance > 0 ? 'text-red-600' : 'text-gray-400' },
  ];

  const allMine = [...activeRE, ...activeOther];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">👤 לוח בקרה אישי — {lawyer.full_name}</h2>
        <p className="text-sm text-gray-400">מציג רק תיקים ומשימות של {lawyer.full_name} · מתעדכן אוטומטית</p>
      </div>

      {/* סיכום אישי */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm border p-3 text-center">
            <div className={`text-xl font-bold ${c.color}`}>{c.val}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* התיקים שלי */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-4 py-3 bg-blue-50 text-blue-900 font-bold text-sm">📂 התיקים של {lawyer.full_name} ({allMine.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right">שם הלקוח</th>
                <th className="px-3 py-2 text-right">סוג</th>
                <th className="px-3 py-2 text-right">כתובת</th>
                <th className="px-3 py-2 text-right">שלב</th>
                <th className="px-3 py-2 text-right">תאריך מסירה</th>
                <th className="px-3 py-2 text-right">ימים</th>
                <th className="px-3 py-2 text-right">שכ"ט</th>
                <th className="px-3 py-2 text-right">נגבה</th>
                <th className="px-3 py-2 text-right">יתרה</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allMine.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">אין תיקים פעילים</td></tr>
              )}
              {allMine.map(m => {
                const d = m.delivery_date ? Math.round((new Date(m.delivery_date) - now) / 86400000) : null;
                return (
                  <tr key={m.id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-1.5 font-medium">
                      <button onClick={() => onOpenDrawer?.(m)}
                        className="text-right hover:text-blue-600 hover:underline transition-colors">
                        {m.clients?.name || m.title || '—'}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 text-xs">{labelOf(TYPE_OPTIONS, m.type)}</td>
                    <td className="px-3 py-1.5 text-gray-500">{m.property_address || ''}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLOR[m.stage] || 'bg-gray-100 text-gray-500'}`}>
                        {labelOf(STAGE_OPTIONS, m.stage) || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{m.delivery_date || ''}</td>
                    <td className="px-3 py-1.5">
                      {d == null ? '' : (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${d < 0 ? 'bg-red-100 text-red-700 font-bold' : d <= 7 ? 'bg-yellow-100 text-yellow-700' : 'text-gray-400'}`}>
                          {d < 0 ? `-${Math.abs(d)}` : d === 0 ? 'היום' : d}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">{m.fee_text || fmtMoney(m.fee_amount)}</td>
                    <td className="px-3 py-1.5 text-green-700">{fmtMoney(m.collected_amount)}</td>
                    <td className={`px-3 py-1.5 font-medium ${Number(m.balance_amount) > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmtMoney(m.balance_amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* המשימות שלי */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-4 py-3 bg-amber-50 text-amber-900 font-bold text-sm">📋 המשימות של {lawyer.full_name} ({openTasks.length} פתוחות)</div>
        <div className="divide-y">
          {myTasks.length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">אין משימות</div>}
          {myTasks
            .slice()
            .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
            .map(t => {
              const done    = t.status === 'done';
              const overdue = !done && t.due_date && new Date(t.due_date) < now;
              return (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-2 text-sm ${done ? 'opacity-50' : ''}`}>
                  <input type="checkbox" checked={done} disabled={!unlocked}
                    onChange={() => saveTask(t.id, 'status', done ? 'open' : 'done')}
                    className="w-4 h-4 accent-green-600 cursor-pointer disabled:cursor-default"/>
                  <span className={`flex-1 ${done ? 'line-through text-gray-400' : ''}`}>{t.description}</span>
                  {t.priority && <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOR[t.priority] || ''}`}>{labelOf(TASK_PRIORITY, t.priority)}</span>}
                  {t.due_date && <span className={`text-xs shrink-0 ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>{t.due_date}</span>}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'realestate', label: '🏠 נדל"ן' },
  { id: 'other',      label: '📁 תיקים אחרים' },
  { id: 'tasks',      label: '✅ משימות' },
  { id: 'collection', label: '💰 גבייה' },
  { id: 'reports',    label: '🔍 חיפוש וסינון' },
  { id: 'stats',      label: '📊 לוח בקרה' },
];

export default function CasesPage() {
  const [tab,          setTab]          = useState('realestate');
  const [unlocked,     setUnlocked]     = useState(false);
  const [reMatters,    setReMatters]    = useState([]);
  const [otherMatters, setOtherMatters] = useState([]);
  const [allTasksList, setAllTasksList] = useState([]);
  const [tasks,        setTasks]        = useState([]);
  const [lawyers,      setLawyers]      = useState([]);
  const [customCols,   setCustomCols]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [stage,        setStage]        = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [search,       setSearch]       = useState('');
  const [lawyerFilter, setLawyerFilter] = useState('');
  const [syncing,      setSyncing]      = useState(false);
  const [syncMsg,      setSyncMsg]      = useState('');
  const [adding,       setAdding]       = useState(false);
  const [showAddCol,   setShowAddCol]   = useState(false);
  const [showNewMatter, setShowNewMatter] = useState(false);
  const [showNewTask,   setShowNewTask]   = useState(false);
  const [deletingCol,  setDeletingCol]  = useState(null);
  const [showPin,      setShowPin]      = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [selectedMatter, setSelectedMatter] = useState(null);
  const [showAIChat,   setShowAIChat]   = useState(false);
  const [pendingUnlock, setPendingUnlock] = useState(null); // action to run after PIN entry
  const [driveExportStatus, setDriveExportStatus] = useState(''); // '' | 'syncing' | 'ok' | 'err'
  const fileInputRef  = useRef(null);
  const exportTimerRef = useRef(null);

  // Debounced export to Drive: fires 8 seconds after the last field save
  const scheduleExportToDrive = () => {
    if (!process.env.NEXT_PUBLIC_DRIVE_EXPORT_ENABLED && typeof window !== 'undefined') {
      // Only run if GDRIVE_FILE_ID is configured (server knows; we just try and let it fail quietly)
    }
    if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
    setDriveExportStatus('pending');
    exportTimerRef.current = setTimeout(async () => {
      setDriveExportStatus('syncing');
      try {
        const res = await fetch('/api/cases/export-to-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
          body: JSON.stringify({ pin: getPin() }),
        });
        const j = await res.json();
        setDriveExportStatus(j.ok ? 'ok' : 'err');
      } catch { setDriveExportStatus('err'); }
      setTimeout(() => setDriveExportStatus(''), 4000);
    }, 8000);
  };

  // Open the manual new-case form, prompting for the PIN first if still locked.
  const openNewMatter = () => {
    if (unlocked) setShowNewMatter(true);
    else { setPendingUnlock('newMatter'); setShowPin(true); }
  };

  useEffect(() => {
    const ts = sessionStorage.getItem('cases_unlocked');
    if (ts && Date.now() - Number(ts) < 8 * 60 * 60 * 1000) setUnlocked(true);
  }, []);

  const getPin = () => sessionStorage.getItem('cases_pin') || '';

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const pinHdr = { 'x-cases-pin': getPin() };

    try {
      // Load all data in parallel for stats / collection tabs
      const [reRes, otherRes, tasksRes, colsRes] = await Promise.all([
        fetch('/api/matters?category=realestate', { headers: pinHdr }),
        fetch('/api/matters?category=other', { headers: pinHdr }),
        fetch('/api/tasks', { headers: pinHdr }),
        fetch('/api/cases/columns', { headers: pinHdr }),
      ]);

      const [reJson, otherJson, tasksJson, colsJson] = await Promise.all([
        reRes.json(), otherRes.json(), tasksRes.json(), colsRes.json(),
      ]);

      const reMattersFull    = reJson.matters || [];
      const otherMattersFull = otherJson.matters || [];
      const allTasks         = tasksJson.tasks || [];
      const allLawyers       = reJson.lawyers || tasksJson.lawyers || [];

      setReMatters(reMattersFull);
      setOtherMatters(otherMattersFull);
      setAllTasksList(allTasks);
      setLawyers(allLawyers);
      setCustomCols(colsJson.columns || []);

      // Filtered tasks for tasks tab
      setTasks(allTasks);
      setLastUpdated(new Date());
    } catch { /* silently fail */ }

    if (!silent) setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Auto-refresh: silent reload every 60s + on tab focus ──
  // Skipped while the user is typing in a cell so input isn't lost.
  useEffect(() => {
    const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    const tick = () => {
      if (document.visibilityState === 'visible' && !isTyping()) load(true);
    };
    const interval = setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible' && !isTyping()) load(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  // Apply client-side filters
  const filterMatters = (list) => {
    let r = list;
    if (lawyerFilter) r = r.filter(m => m.responsible_lawyer_id === lawyerFilter || m.profiles?.id === lawyerFilter);
    if (stage)        r = r.filter(m => m.stage === stage);
    if (typeFilter)   r = r.filter(m => m.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(m =>
        (m.clients?.name || '').toLowerCase().includes(q) ||
        (m.property_address || '').toLowerCase().includes(q) ||
        (m.parcel || '').toLowerCase().includes(q) ||
        (m.case_number || '').toLowerCase().includes(q) ||
        (m.title || '').toLowerCase().includes(q)
      );
    }
    return r;
  };

  const filterTasks = (list) => {
    let r = list;
    if (lawyerFilter) r = r.filter(t => t.assigned_to === lawyerFilter || t.profiles?.id === lawyerFilter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(t => (t.description || '').toLowerCase().includes(q) || (t.task_type || '').toLowerCase().includes(q));
    }
    return r;
  };

  const displayedRE    = filterMatters(reMatters);
  const displayedOther = filterMatters(otherMatters);
  const displayedTasks = filterTasks(allTasksList);
  const allDisplayed   = [...displayedRE, ...displayedOther];

  async function saveField(matterId, field, value, isClient = false) {
    await fetch('/api/matters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
      body: JSON.stringify({ id: matterId, pin: getPin(), [field]: value }),
    });
    const update = (list, setter) => setter(list.map(m => {
      if (m.id !== matterId) return m;
      const updated = isClient
        ? { ...m, clients: { ...m.clients, [field.replace('client_', '')]: value } }
        : { ...m, [field]: value };
      if (selectedMatter?.id === matterId) setSelectedMatter(updated);
      return updated;
    }));
    update(reMatters, setReMatters);
    update(otherMatters, setOtherMatters);
    scheduleExportToDrive();
  }

  async function saveExtra(matterId, colId, value) {
    const matter = [...reMatters, ...otherMatters].find(m => m.id === matterId);
    const extra  = { ...(matter?.extra_data || {}), [colId]: value };
    await fetch('/api/matters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
      body: JSON.stringify({ id: matterId, pin: getPin(), extra_data: extra }),
    });
    const update = (list, setter) => setter(list.map(m => m.id === matterId ? { ...m, extra_data: extra } : m));
    update(reMatters, setReMatters);
    update(otherMatters, setOtherMatters);
    scheduleExportToDrive();
  }

  async function deleteRow(matterId, name) {
    if (!confirm(`למחוק את התיק "${name}"? פעולה זו אינה הפיכה.`)) return;
    await fetch(`/api/matters?id=${matterId}`, {
      method: 'DELETE',
      headers: { 'x-cases-pin': getPin() },
    });
    setReMatters(p => p.filter(m => m.id !== matterId));
    setOtherMatters(p => p.filter(m => m.id !== matterId));
  }

  async function closeRow(matterId) {
    const matter = [...reMatters, ...otherMatters].find(m => m.id === matterId);
    const newStage = matter?.stage === 'closed' ? 'draft' : 'closed';
    await saveField(matterId, 'stage', newStage);
  }

  async function saveTask(taskId, field, value) {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-cases-pin': getPin() },
      body: JSON.stringify({ id: taskId, pin: getPin(), [field]: value }),
    });
    setAllTasksList(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      if (field === 'assigned_to') {
        const lw = lawyers.find(l => l.id === value);
        return { ...t, assigned_to: value, profiles: lw ? { id: lw.id, full_name: lw.full_name } : null };
      }
      return { ...t, [field]: value };
    }));
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
      setSyncMsg(json.ok
        ? `סונכרן בהצלחה (${json.matters || 0} תיקים, ${json.tasks || 0} משימות)`
        : 'שגיאה: ' + (json.error || 'לא ידוע'));
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
      setSyncMsg(json.ok
        ? `יובאו ${json.matters || 0} תיקים, ${json.tasks || 0} משימות`
        : 'שגיאה: ' + (json.error || 'לא ידוע'));
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

  function handleExport() {
    if (tab === 'realestate') exportCSV(displayedRE, RE_COLS, 'תיקי-נדלן.csv');
    else if (tab === 'other') exportCSV(displayedOther, OTHER_COLS, 'תיקים-אחרים.csv');
  }

  const isTasks      = tab === 'tasks';
  const isCollection = tab === 'collection';
  const isStats      = tab === 'stats';
  const isReports    = tab === 'reports';
  const lawyerTab    = tab.startsWith('lawyer:') ? lawyers.find(l => l.id === tab.slice(7)) : null;
  const isMatters    = !isTasks && !isCollection && !isStats && !isReports && !lawyerTab;
  const cols         = tab === 'other' ? OTHER_COLS : RE_COLS;
  const displayedMatters = tab === 'other' ? displayedOther : displayedRE;
  const count        = isTasks ? displayedTasks.length
    : isCollection ? [...reMatters, ...otherMatters].filter(m => Number(m.balance_amount || 0) > 0).length
    : (isStats || isReports || lawyerTab) ? null
    : displayedMatters.length;

  // All matters for collection/stats tabs (no filter applied there)
  const allMattersList = [...reMatters, ...otherMatters];

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {showAIChat && (
        <AIChatPanel
          lawyers={lawyers}
          onCaseCreated={m => {
            const isRE = m.case_category !== 'other';
            if (isRE) setReMatters(p => [m, ...p]); else setOtherMatters(p => [m, ...p]);
            setSelectedMatter(m);
          }}
          onClose={() => setShowAIChat(false)}
        />
      )}
      {selectedMatter && (
        <CaseDetailDrawer
          matter={selectedMatter}
          lawyers={lawyers}
          tasks={allTasksList}
          unlocked={unlocked}
          saveField={saveField}
          onClose={() => setSelectedMatter(null)}
        />
      )}
      {showPin       && <PinScreen onUnlock={() => { setUnlocked(true); setShowPin(false); if (pendingUnlock === 'newMatter') setShowNewMatter(true); setPendingUnlock(null); }} onClose={() => { setShowPin(false); setPendingUnlock(null); }} />}
      {showAddCol    && <AddColumnModal onAdd={col => { setCustomCols(prev => [...prev, col]); setShowAddCol(false); }} onClose={() => setShowAddCol(false)} />}
      {showNewMatter && (
        <NewMatterModal
          category={tab === 'other' ? 'other' : 'realestate'}
          lawyers={lawyers}
          onSave={m => { tab === 'other' ? setOtherMatters(p => [m, ...p]) : setReMatters(p => [m, ...p]); setShowNewMatter(false); }}
          onClose={() => setShowNewMatter(false)}
        />
      )}
      {showNewTask && (
        <NewTaskModal
          lawyers={lawyers}
          matters={allMattersList}
          onSave={t => { setAllTasksList(p => [t, ...p]); setShowNewTask(false); }}
          onClose={() => setShowNewTask(false)}
        />
      )}

      {/* ── Header ── */}
      <div className="bg-white border-b px-4 py-3 sticky top-12 z-30 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/dashboard"
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">
            ← תפריט
          </a>
          <h1 className="text-lg font-bold text-gray-900">📁 ניהול תיקים</h1>

          {/* Filters (hidden on collection/stats) */}
          {isMatters && (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לקוח / נכס / תיק..."
                className="border rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-blue-400"/>
              {tab === 'realestate' && (
                <select value={stage} onChange={e => setStage(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">כל השלבים</option>
                  {STAGE_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
                </select>
              )}
              {tab === 'other' && (
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">כל הסוגים</option>
                  {TYPE_OPTIONS.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
                </select>
              )}
            </>
          )}

          {/* Lawyer filter (visible on all tabs except stats) */}
          {!isStats && !isReports && !lawyerTab && lawyers.length > 0 && (
            <select value={lawyerFilter} onChange={e => setLawyerFilter(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none">
              <option value="">כל עוה"ד</option>
              {lawyers.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
            </select>
          )}

          {count != null && <span className="text-sm text-gray-400">{count} {isTasks ? 'משימות' : 'תיקים'}</span>}
          <div className="flex-1"/>

          {/* Action buttons */}
          {/* AI chat + manual new-case always accessible when on matters tabs */}
          {isMatters && !unlocked && (
            <>
              <button onClick={() => setShowAIChat(true)}
                className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                🤖 תיק מצ'ט
              </button>
              <button onClick={openNewMatter}
                className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg">
                + תיק חדש
              </button>
            </>
          )}

          {unlocked ? (
            <>
              {isMatters && (
                <button onClick={() => setShowAIChat(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  🤖 תיק מצ'ט
                </button>
              )}
              {isMatters && (
                <button onClick={() => setShowNewMatter(true)} disabled={adding}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg">
                  + תיק חדש
                </button>
              )}
              {isTasks && (
                <button onClick={() => setShowNewTask(true)}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg">
                  + משימה
                </button>
              )}
              {isMatters && (
                <button onClick={handleExport}
                  className="bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-1.5 rounded-lg">
                  ⬇️ Excel
                </button>
              )}
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={uploadFile} className="hidden"/>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">
                {uploading ? '⏳...' : '⬆️ Excel'}
              </button>
              <button onClick={syncNow} disabled={syncing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">
                {syncing ? '⏳...' : '🔄 Drive'}
              </button>
              {isMatters && (
                <button onClick={() => setShowAddCol(true)}
                  className="border border-purple-400 text-purple-700 hover:bg-purple-50 text-sm px-3 py-1.5 rounded-lg">
                  ＋ עמודה
                </button>
              )}
              <button onClick={() => { sessionStorage.removeItem('cases_unlocked'); sessionStorage.removeItem('cases_pin'); setUnlocked(false); }}
                title="נעל עריכה" className="text-gray-400 hover:text-gray-600 px-2 py-1.5 text-lg">🔓</button>
            </>
          ) : (
            <button onClick={() => setShowPin(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1">
              🔒 כניסה לעריכה
            </button>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mt-2 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-t-lg text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${tab === t.id ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
          {lawyers.length > 0 && <span className="border-r border-gray-200 mx-1 my-1"/>}
          {lawyers.map(l => (
            <button key={l.id} onClick={() => setTab(`lawyer:${l.id}`)}
              className={`px-3 py-1.5 rounded-t-lg text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${tab === `lawyer:${l.id}` ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
              👤 {l.full_name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-1">
          {syncMsg && <p className="text-xs text-green-700">{syncMsg}</p>}
          {driveExportStatus === 'pending'  && <p className="text-xs text-gray-400">⏳ מכין גיבוי Excel...</p>}
          {driveExportStatus === 'syncing'  && <p className="text-xs text-blue-500">☁️ מעדכן Excel בDrive...</p>}
          {driveExportStatus === 'ok'       && <p className="text-xs text-green-600">✅ Excel גובה בהצלחה</p>}
          {driveExportStatus === 'err'      && <p className="text-xs text-orange-500" title="ייתכן שהגדרות Drive אינן מורשות לכתיבה">⚠️ גיבוי Drive לא זמין</p>}
          {lastUpdated && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse"/>
              מתעדכן אוטומטית · עודכן {lastUpdated.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      {/* ── Stats Cards (on matter/task tabs) ── */}
      {!loading && !isStats && !isReports && !lawyerTab && (
        <StatsCards matters={allMattersList} tasks={allTasksList} lawyers={lawyers}/>
      )}

      {/* ── Body ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-2">⏳</div>
          <div>טוען נתונים...</div>
        </div>
      ) : isStats ? (
        <StatsDashboard reMatters={reMatters} otherMatters={otherMatters} tasks={allTasksList} lawyers={lawyers}/>
      ) : isReports ? (
        <ReportsTab reMatters={reMatters} otherMatters={otherMatters} lawyers={lawyers}/>
      ) : lawyerTab ? (
        <LawyerDashboard lawyer={lawyerTab} reMatters={reMatters} otherMatters={otherMatters}
          tasks={allTasksList} unlocked={unlocked} saveTask={saveTask} onOpenDrawer={m => setSelectedMatter(m)}/>
      ) : isCollection ? (
        <CollectionTable matters={allMattersList} lawyers={lawyers} unlocked={unlocked} saveField={saveField}/>
      ) : isTasks ? (
        <TasksTable tasks={displayedTasks} lawyers={lawyers} unlocked={unlocked} saveTask={saveTask}/>
      ) : (
        <MattersTable
          cols={cols} matters={displayedMatters} lawyers={lawyers} customCols={customCols}
          unlocked={unlocked} saveField={saveField} saveExtra={saveExtra}
          onAddCol={() => setShowAddCol(true)} onDeleteCol={deleteColumn} deletingCol={deletingCol}
          onDeleteRow={deleteRow} onCloseRow={closeRow}
          onOpenDrawer={m => setSelectedMatter(m)}
        />
      )}

      {/* ── Legend ── */}
      {(isMatters || isTasks) && (
        <div className="fixed bottom-4 left-4 bg-white border rounded-lg shadow-md p-3 text-xs text-gray-500 space-y-1 z-20">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-100 border rounded inline-block"/>באיחור</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-100 border rounded inline-block"/>≤7 ימים</div>
          <div className="text-gray-400 mt-1">{unlocked ? 'לחץ תא לעריכה' : 'מצב צפייה'}</div>
        </div>
      )}
    </div>
  );
}
