'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

const BUCKET_CONFIG = {
  current:  { label: 'בתוקף',  color: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200', priority: 0 },
  '1-30':   { label: '1–30 יום', color: 'bg-amber-100 text-amber-700',   border: 'border-amber-200',   priority: 1 },
  '31-60':  { label: '31–60',   color: 'bg-orange-100 text-orange-700',  border: 'border-orange-200',  priority: 2 },
  '61-90':  { label: '61–90',   color: 'bg-rose-100 text-rose-700',      border: 'border-rose-200',    priority: 3 },
  '90+':    { label: '90+ יום', color: 'bg-red-100 text-red-700',        border: 'border-red-200',     priority: 4 },
};
const fmt = d => d ? new Date(d).toLocaleDateString('he-IL') : '—';
const money = n => `₪${Number(n||0).toLocaleString('he-IL')}`;

// Payment Ethics Law — 45 calendar days statutory due date when no due_date
const PAYMENT_ETHICS_DAYS = 45;
const SMALL_CLAIMS_CEILING = 39900;

function getStatutoryDueDate(inv) {
  if (inv.due_date) return new Date(inv.due_date);
  if (!inv.issue_date) return null;
  const d = new Date(inv.issue_date);
  d.setDate(d.getDate() + PAYMENT_ETHICS_DAYS);
  return d;
}

function isSmallClaims(amount) {
  return Number(amount || 0) <= SMALL_CLAIMS_CEILING;
}

// Reminder stages from israeli-client-payment-chaser skill
const STAGES = [
  { num: 1, label: 'שלב 1', sub: 'ידידותי', days: '≤30 יום', color: 'bg-amber-50 border-amber-300 text-amber-700', channel: 'whatsapp' },
  { num: 2, label: 'שלב 2', sub: 'מקצועי',  days: '45 יום',  color: 'bg-orange-50 border-orange-300 text-orange-700', channel: 'whatsapp' },
  { num: 3, label: 'שלב 3', sub: 'רשמי',    days: '60 יום',  color: 'bg-rose-50 border-rose-300 text-rose-700', channel: 'email' },
  { num: 4, label: 'שלב 4', sub: 'התראה',   days: '75 יום',  color: 'bg-red-50 border-red-300 text-red-700', channel: 'email' },
  { num: 5, label: 'שלב 5', sub: 'סופי',    days: '90+ יום', color: 'bg-red-100 border-red-500 text-red-800', channel: 'email' },
];

function detectStage(daysLate) {
  if (daysLate >= 76) return 5;
  if (daysLate >= 61) return 4;
  if (daysLate >= 46) return 3;
  if (daysLate >= 31) return 2;
  return 1;
}

function buildTemplate(stage, inv, orgName = 'משרד עורכי דין') {
  const name = inv.clients?.name || 'לקוח יקר';
  const num = inv.number ? `#${inv.number}` : 'ללא מספר';
  const amt = money(inv.amount);
  const date = fmt(inv.issue_date);
  const dueDate = fmt(inv.due_date);
  const deadline = new Date(Date.now() + 14 * 86400000).toLocaleDateString('he-IL');
  const bank = 'בנק הפועלים | סניף 600 | חשבון 123456 | ע"ש ' + orgName;

  switch (stage) {
    case 1:
      return `היי ${name},\nרציתי לבדוק לגבי חשבונית ${num} מ-${date} בסך ${amt}.\nאשמח לעדכון על מועד התשלום.\nתודה רבה!\n${orgName}`;
    case 2:
      return `שלום ${name},\nתזכורת נוספת לגבי חשבונית ${num} מתאריך ${date}.\nסה"כ לתשלום: ${amt}.\n\nפרטי העברה בנקאית:\n${bank}\n\nאשמח לעדכון בהקדם.\nבברכה,\n${orgName}`;
    case 3:
      return `לכבוד ${name},\n\nהנדון: דרישת תשלום עבור חשבונית ${num}\n\nאני פונה אליך בהמשך לפניות קודמות בנושא חשבונית ${num} שהונפקה בתאריך ${date} בסך ${amt}.\n\nנכון להיום, החשבונית טרם שולמה למרות שחלפו למעלה מ-60 יום ממועד הפירעון.\n\nאבקש להסדיר את התשלום בהקדם האפשרי.\n\nפרטי העברה:\n${bank}\n\nבברכה,\n${orgName}`;
    case 4:
      return `לכבוד ${name},\n\nהנדון: התראה לפני נקיטת צעדים משפטיים\n\nלמרות פניותינו החוזרות, חשבונית ${num} מ-${date} בסך ${amt} טרם שולמה.\n\nללא תשלום מלא תוך 14 יום (עד ${deadline}), ניאלץ לשקול פנייה לבית משפט לתביעות קטנות.\n\nפרטי העברה:\n${bank}\n\nבברכה,\n${orgName}`;
    case 5:
      return `לכבוד ${name},\n\nמכתב דרישה סופי לתשלום חשבונית ${num} מ-${date} בסך ${amt}.\n\nמכתב זה מהווה דרישה רשמית ואחרונה. ככל שהתשלום לא יתקבל עד ${deadline}, תוגש תביעה בתוספת ריבית והצמדה כדין.\n\nפרטי העברה:\n${bank}\n\nמכתב זה נשלח גם בדואר רשום.\n\nבברכה,\n${orgName}`;
    default:
      return '';
  }
}

export default function CollectionPage() {
  const [invoices, setInvoices]   = useState([]);
  const [matters, setMatters]     = useState([]);
  const [lawyers, setLawyers]     = useState([]);
  const [summary, setSummary]     = useState({});
  const [loading, setLoading]     = useState(true);
  const [lawyerFilter, setLawyer] = useState('all');
  const [bucketFilter, setBucket] = useState('all');
  const [sending, setSending]     = useState(null);
  const [flash, setFlash]         = useState('');
  const [msgInvoice, setMsgInvoice] = useState(null);
  const [activeStage, setActiveStage] = useState(1);
  const [customMsg, setCustomMsg] = useState('');
  const [view, setView]           = useState('invoices');
  const [copied, setCopied]       = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/collection');
      const j = await res.json();
      if (res.ok) {
        setInvoices(j.invoices || []);
        setMatters(j.matters || []);
        setLawyers(j.lawyers || []);
        setSummary(j.summary || {});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openReminder(inv) {
    const stage = detectStage(inv.daysLate || 0);
    setActiveStage(stage);
    setCustomMsg(buildTemplate(stage, inv));
    setMsgInvoice(inv);
    setCopied(false);
  }

  function selectStage(s) {
    setActiveStage(s);
    setCustomMsg(buildTemplate(s, msgInvoice));
    setCopied(false);
  }

  const filtered = useMemo(() => invoices.filter(inv => {
    if (bucketFilter !== 'all' && inv.bucket !== bucketFilter) return false;
    if (lawyerFilter !== 'all' && inv.matters?.responsible_lawyer_id !== lawyerFilter) return false;
    return true;
  }), [invoices, bucketFilter, lawyerFilter]);

  const filteredMatters = useMemo(() => {
    if (lawyerFilter === 'all') return matters;
    return matters.filter(m => m.responsible_lawyer_id === lawyerFilter);
  }, [matters, lawyerFilter]);

  const byClient = useMemo(() => {
    const map = {};
    for (const inv of filtered) {
      const key = inv.client_id || inv.client_name;
      if (!map[key]) map[key] = { name: inv.clients?.name || inv.client_name, phone: inv.clients?.phone, invoices: [] };
      map[key].invoices.push(inv);
    }
    return Object.values(map).sort((a,b) => {
      const aTotal = a.invoices.reduce((s,i) => s+Number(i.amount||0), 0);
      const bTotal = b.invoices.reduce((s,i) => s+Number(i.amount||0), 0);
      return bTotal - aTotal;
    });
  }, [filtered]);

  const bucketTotals = useMemo(() => {
    const t = {};
    for (const inv of invoices) {
      if (!t[inv.bucket]) t[inv.bucket] = { count: 0, amount: 0 };
      t[inv.bucket].count++;
      t[inv.bucket].amount += Number(inv.amount || 0);
    }
    return t;
  }, [invoices]);

  function showFlash(msg) { setFlash(msg); setTimeout(() => setFlash(''), 4000); }

  async function sendReminder(inv, msg) {
    setSending(inv.id);
    try {
      const res = await fetch('/api/invoices/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: inv.id, custom_message: msg || undefined }),
      });
      const j = await res.json();
      if (res.ok) { showFlash(`✅ תזכורת נשלחה ל${inv.clients?.name || inv.client_name}`); load(); }
      else showFlash(`❌ ${j.error || 'שגיאה בשליחה'}`);
    } finally {
      setSending(null);
      setMsgInvoice(null);
      setCustomMsg('');
    }
  }

  const currentStageInfo = STAGES[activeStage - 1];
  const isWhatsApp = currentStageInfo?.channel === 'whatsapp';

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white sticky top-12 z-30 shadow">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center gap-3 flex-wrap">
          <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-xl font-bold flex-1">💰 מרכז גבייה</h1>
          <Link href="/finance" className="text-slate-400 hover:text-white text-sm">כספים →</Link>
          <Link href="/finance/invoices" className="text-slate-400 hover:text-white text-sm">חשבוניות →</Link>
        </div>
      </header>

      {flash && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-medium">
          {flash}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-5 py-5 space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="סה״כ פתוח"       value={money(summary.totalOpen)}    color="text-blue-700"   />
          <KpiCard label="סה״כ בפיגור"     value={money(summary.totalOverdue)} color="text-red-700"    />
          <KpiCard label="חשבוניות פתוחות" value={summary.count || 0}          color="text-slate-700"  />
          <KpiCard label="בפיגור (#)"       value={summary.overdueCount || 0}   color="text-orange-700" />
        </div>

        {/* Aging buckets */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.entries(BUCKET_CONFIG).map(([key, cfg]) => {
            const t = bucketTotals[key] || { count: 0, amount: 0 };
            const active = bucketFilter === key;
            return (
              <button key={key} onClick={() => setBucket(active ? 'all' : key)}
                className={`p-3 rounded-xl border text-right transition-all ${active ? cfg.color + ' ' + cfg.border + ' shadow-sm font-bold ring-2 ring-current ring-offset-1' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                <p className={`text-xs font-semibold mb-0.5 ${active ? '' : 'text-slate-500'}`}>{cfg.label}</p>
                <p className={`text-base font-bold ${active ? '' : 'text-slate-800'}`}>{money(t.amount)}</p>
                <p className={`text-xs ${active ? 'opacity-70' : 'text-slate-400'}`}>{t.count} חשבוניות</p>
              </button>
            );
          })}
        </div>

        {/* Filters + View toggle */}
        <div className="flex flex-wrap gap-3 items-center">
          <select value={lawyerFilter} onChange={e => setLawyer(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="all">כל הצוות</option>
            {lawyers.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
          </select>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
            {[['invoices','חשבוניות'],['matters','תיקים']].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-2 ${view===v ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          {(bucketFilter !== 'all' || lawyerFilter !== 'all') && (
            <button onClick={() => { setBucket('all'); setLawyer('all'); }} className="text-xs text-red-500 underline">נקה סינון</button>
          )}
          <span className="text-sm text-slate-500 mr-auto">
            {view === 'invoices' ? `${filtered.length} חשבוניות` : `${filteredMatters.length} תיקים`}
          </span>
        </div>

        {/* ── INVOICES VIEW ── */}
        {view === 'invoices' && (
          loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-24 bg-slate-200 animate-pulse rounded-xl" />)}</div>
          ) : byClient.length === 0 ? (
            <div className="bg-white rounded-xl border p-12 text-center text-slate-400">
              <p className="text-3xl mb-2">🎉</p>
              <p className="font-medium">אין חשבוניות פתוחות עם הסינון הנוכחי</p>
            </div>
          ) : (
            <div className="space-y-3">
              {byClient.map(client => {
                const total = client.invoices.reduce((s,i) => s+Number(i.amount||0), 0);
                const maxBucket = client.invoices.reduce((max,i) => {
                  const p = BUCKET_CONFIG[i.bucket]?.priority ?? 0;
                  return p > max.p ? { p, bucket: i.bucket } : max;
                }, { p: -1, bucket: 'current' }).bucket;
                const cfg = BUCKET_CONFIG[maxBucket];
                const worstDaysLate = Math.max(...client.invoices.map(i => i.daysLate || 0));
                const clientStage = detectStage(worstDaysLate);
                const clientStageInfo = STAGES[clientStage - 1];

                return (
                  <div key={client.name} className={`bg-white rounded-xl border ${cfg.border} shadow-sm overflow-hidden`}>
                    {/* Client header */}
                    <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${cfg.color}`}>
                          {client.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{client.name}</p>
                          {client.phone && (
                            <a href={`tel:${client.phone}`} className="text-xs text-slate-400 hover:text-blue-600" dir="ltr">{client.phone}</a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${clientStageInfo.color}`}>
                          {clientStageInfo.label} — {clientStageInfo.sub}
                        </span>
                        <p className="text-lg font-bold text-rose-700">{money(total)}</p>
                        {client.phone && (
                          <a href={`https://wa.me/972${client.phone.replace(/^0/,'').replace(/\D/g,'')}`}
                            target="_blank" rel="noopener noreferrer"
                            className="bg-green-500 hover:bg-green-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                            📲 ווטסאפ
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Invoice rows */}
                    <div className="divide-y divide-slate-100">
                      {client.invoices.map(inv => {
                        const b = BUCKET_CONFIG[inv.bucket];
                        const sentDaysAgo = inv.daysSinceReminder;
                        const stage = detectStage(inv.daysLate || 0);
                        const stageInfo = STAGES[stage - 1];
                        return (
                          <div key={inv.id} className={`flex items-center gap-3 px-5 py-3 ${inv.daysLate > 60 ? 'bg-red-50/30' : ''}`}>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${b.color}`}>{b.label}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800">
                                {inv.number ? `#${inv.number}` : 'ללא מספר'}
                                {inv.notes ? <span className="text-slate-400 font-normal mr-2">— {inv.notes}</span> : ''}
                              </p>
                              <p className="text-xs text-slate-400 flex flex-wrap gap-x-2 items-center">
                                <span>פירעון: {fmt(inv.due_date) !== '—' ? fmt(inv.due_date) : `${fmt(getStatutoryDueDate(inv)?.toISOString()?.split('T')[0])} (חוק)`}</span>
                                {!inv.due_date && <span className="text-amber-600 font-medium">⚖️ מועד סטטוטורי</span>}
                                {inv.daysLate > 0 && <span className="text-red-600 font-medium">({inv.daysLate} ימים)</span>}
                                {sentDaysAgo !== null && <span>· תזכורת לפני {sentDaysAgo} ימים ({inv.reminder_count || 1}×)</span>}
                              </p>
                              <div className="flex gap-1.5 mt-0.5 flex-wrap">
                                {isSmallClaims(inv.amount) && inv.daysLate > 30 && (
                                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                                    ⚖️ תביעות קטנות
                                  </span>
                                )}
                                {!inv.due_date && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                                    חוק אמצעי תשלום
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="font-bold text-slate-900 flex-shrink-0">{money(inv.amount)}</p>
                            {inv.clients?.phone && (
                              <button
                                onClick={() => openReminder(inv)}
                                className={`flex-shrink-0 text-xs border px-2.5 py-1.5 rounded-lg font-medium transition-colors ${stageInfo.color}`}
                                title={`שלח תזכורת — ${stageInfo.label} (${stageInfo.sub})`}>
                                📩 {stageInfo.label}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── MATTERS VIEW ── */}
        {view === 'matters' && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {['לקוח','תיק','שכ״ט מוסכם','גבוי','יתרה','סטטוס',''].map(h => (
                    <th key={h} className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMatters.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">אין תיקים עם יתרה לגבייה</td></tr>
                ) : filteredMatters.map(m => {
                  const balance = Number(m.balance_amount || 0);
                  const phone = m.clients?.phone;
                  const waMsg = encodeURIComponent(`שלום ${m.clients?.name || ''},\nאנו מבקשים לעדכן בנוגע ליתרת שכ״ט בתיק ${m.title || ''} — ₪${balance.toLocaleString('he-IL')} לתשלום.\nנשמח לתאם. תודה.`);
                  return (
                    <tr key={m.id} className={balance > 5000 ? 'bg-red-50/30' : ''}>
                      <td className="px-4 py-3 font-medium">{m.clients?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{m.case_number || m.title || '—'}</td>
                      <td className="px-4 py-3">{money(m.agreed_fee)}</td>
                      <td className="px-4 py-3 text-green-700">{money(m.collected_amount)}</td>
                      <td className="px-4 py-3 font-bold text-red-700">
                        {money(balance)}
                        {isSmallClaims(balance) && balance > 0 && (
                          <span className="mr-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">⚖️ קטנות</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          {m.payment_status || 'פתוח'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {phone && (
                          <a href={`https://wa.me/972${phone.replace(/^0/,'').replace(/\D/g,'')}?text=${waMsg}`}
                            target="_blank" rel="noopener noreferrer"
                            className="bg-green-500 hover:bg-green-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                            📲 ווטסאפ
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── REMINDER MODAL — 5-Stage System ── */}
      {msgInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setMsgInvoice(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg space-y-4 overflow-hidden" dir="rtl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-slate-800 text-white px-6 py-4">
              <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-xl font-bold">📩 תזכורת לתשלום</h2>
              <p className="text-slate-300 text-sm mt-0.5">
                {msgInvoice.clients?.name} · חשבונית {msgInvoice.number ? `#${msgInvoice.number}` : ''} · {money(msgInvoice.amount)}
                {msgInvoice.daysLate > 0 && <span className="text-rose-300 mr-2">({msgInvoice.daysLate} ימים פיגור)</span>}
              </p>
            </div>

            <div className="px-6 pb-6 space-y-4">
              {/* Stage selector */}
              <div>
                <p className="text-xs text-slate-500 font-medium mb-2">שלב הסלמה (נבחר אוטומטית לפי גיל החוב)</p>
                <div className="flex gap-1.5 flex-wrap">
                  {STAGES.map(s => (
                    <button key={s.num} onClick={() => selectStage(s.num)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${activeStage === s.num ? s.color + ' ring-2 ring-offset-1 ring-current shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                      {s.label}<br/>
                      <span className="font-normal opacity-75">{s.sub}</span>
                    </button>
                  ))}
                </div>
                <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5 ${currentStageInfo.color}`}>
                  {isWhatsApp ? '📲 WhatsApp' : '📧 אימייל'}
                  <span className="opacity-75">· {currentStageInfo.days}</span>
                </div>
              </div>

              {/* Message textarea */}
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1.5">טקסט ההודעה (ניתן לעריכה)</p>
                <textarea
                  value={customMsg}
                  onChange={e => setCustomMsg(e.target.value)}
                  rows={7}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-right"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {isWhatsApp && msgInvoice.clients?.phone ? (
                  <a href={`https://wa.me/972${msgInvoice.clients.phone.replace(/^0/,'').replace(/\D/g,'')}?text=${encodeURIComponent(customMsg)}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={() => sendReminder(msgInvoice, customMsg)}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white text-center font-semibold py-2.5 rounded-lg text-sm">
                    📲 שלח ווטסאפ
                  </a>
                ) : (
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(customMsg);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 3000);
                    }}
                    className={`flex-1 font-semibold py-2.5 rounded-lg text-sm transition-colors ${copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                    {copied ? '✅ הועתק!' : '📋 העתק לקליפבורד'}
                  </button>
                )}
                <button
                  onClick={() => sendReminder(msgInvoice, customMsg)}
                  disabled={!!sending}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  {sending === msgInvoice.id ? 'שולח...' : '💾 שמור תזכורת'}
                </button>
                <button onClick={() => { setMsgInvoice(null); setCustomMsg(''); }}
                  className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-400 hover:bg-slate-50">
                  ביטול
                </button>
              </div>

              {/* Stage guide */}
              <details className="text-xs text-slate-400 border border-slate-100 rounded-lg p-3 cursor-pointer">
                <summary className="font-medium text-slate-500">מדריך שלבי הסלמה</summary>
                <div className="mt-2 space-y-1">
                  {STAGES.map(s => (
                    <p key={s.num}><strong>{s.label}:</strong> {s.sub} · {s.channel === 'whatsapp' ? 'ווטסאפ' : 'אימייל'} · {s.days}</p>
                  ))}
                  <p className="mt-2 text-slate-400">שלב 5 — מלווה בדואר רשום. מומלץ לייעץ עם עו״ד לפני שליחה.</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
