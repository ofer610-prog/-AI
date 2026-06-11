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
const LAWYER_COLORS = ['bg-violet-100 text-violet-700','bg-teal-100 text-teal-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700','bg-sky-100 text-sky-700'];
const fmt = d => d ? new Date(d).toLocaleDateString('he-IL') : '—';
const money = n => `₪${Number(n||0).toLocaleString('he-IL')}`;

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
  const [customMsg, setCustomMsg] = useState('');
  const [msgInvoice, setMsgInvoice] = useState(null);
  const [view, setView]           = useState('invoices'); // invoices | matters

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

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (bucketFilter !== 'all' && inv.bucket !== bucketFilter) return false;
      if (lawyerFilter !== 'all' && inv.matters?.responsible_lawyer_id !== lawyerFilter) return false;
      return true;
    });
  }, [invoices, bucketFilter, lawyerFilter]);

  const filteredMatters = useMemo(() => {
    if (lawyerFilter === 'all') return matters;
    return matters.filter(m => m.responsible_lawyer_id === lawyerFilter);
  }, [matters, lawyerFilter]);

  // Group invoices by client
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

  // Bucket totals
  const bucketTotals = useMemo(() => {
    const t = {};
    for (const inv of invoices) {
      if (!t[inv.bucket]) t[inv.bucket] = { count: 0, amount: 0 };
      t[inv.bucket].count++;
      t[inv.bucket].amount += Number(inv.amount || 0);
    }
    return t;
  }, [invoices]);

  function showFlash(msg) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 4000);
  }

  async function sendReminder(inv, msg) {
    setSending(inv.id);
    try {
      const res = await fetch('/api/invoices/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: inv.id, custom_message: msg || undefined }),
      });
      const j = await res.json();
      if (res.ok) {
        showFlash(`✅ תזכורת נשלחה ל${inv.clients?.name || inv.client_name}`);
        load();
      } else {
        showFlash(`❌ ${j.error || 'שגיאה בשליחה'}`);
      }
    } finally {
      setSending(null);
      setMsgInvoice(null);
      setCustomMsg('');
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      {/* Header */}
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
          <KpiCard label="סה״כ פתוח"    value={money(summary.totalOpen)}    color="text-blue-700"  />
          <KpiCard label="סה״כ בפיגור"  value={money(summary.totalOverdue)} color="text-red-700"   />
          <KpiCard label="חשבוניות פתוחות" value={summary.count || 0}       color="text-slate-700" />
          <KpiCard label="בפיגור (#)"   value={summary.overdueCount || 0}   color="text-orange-700" />
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
                className={`px-4 py-2 ${view===v ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>
          {(bucketFilter !== 'all' || lawyerFilter !== 'all') && (
            <button onClick={() => { setBucket('all'); setLawyer('all'); }}
              className="text-xs text-red-500 underline">נקה סינון</button>
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
                      <div className="flex items-center gap-3">
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
                        return (
                          <div key={inv.id} className={`flex items-center gap-3 px-5 py-3 ${inv.daysLate > 60 ? 'bg-red-50/30' : ''}`}>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${b.color}`}>{b.label}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800">
                                {inv.number ? `#${inv.number}` : 'ללא מספר'}
                                {inv.notes ? <span className="text-slate-400 font-normal mr-2">— {inv.notes}</span> : ''}
                              </p>
                              <p className="text-xs text-slate-400">
                                פירעון: {fmt(inv.due_date)}
                                {inv.daysLate > 0 && <span className="text-red-600 font-medium mr-2">({inv.daysLate} ימים)</span>}
                                {sentDaysAgo !== null && <span className="mr-2">· תזכורת לפני {sentDaysAgo} ימים ({inv.reminder_count || 1}×)</span>}
                              </p>
                            </div>
                            <p className="font-bold text-slate-900 flex-shrink-0">{money(inv.amount)}</p>
                            {inv.clients?.phone && (
                              <div className="flex gap-1 flex-shrink-0">
                                <button
                                  onClick={() => setMsgInvoice(inv)}
                                  className="text-xs border border-slate-300 hover:border-slate-500 px-2 py-1.5 rounded-lg text-slate-600"
                                  title="שלח תזכורת ווטסאפ">
                                  📩 תזכורת
                                </button>
                              </div>
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
                    <tr key={m.id} className={`${balance > 5000 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3 font-medium">{m.clients?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{m.case_number || m.title || '—'}</td>
                      <td className="px-4 py-3">{money(m.agreed_fee)}</td>
                      <td className="px-4 py-3 text-green-700">{money(m.collected_amount)}</td>
                      <td className="px-4 py-3 font-bold text-red-700">{money(balance)}</td>
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

      {/* Custom message modal */}
      {msgInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMsgInvoice(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-xl font-bold">📩 שליחת תזכורת</h2>
            <p className="text-sm text-slate-500">ל: {msgInvoice.clients?.name} ({msgInvoice.clients?.phone})</p>
            <p className="text-sm text-slate-500">חשבונית: {msgInvoice.number ? `#${msgInvoice.number} — ` : ''}{money(msgInvoice.amount)}</p>
            <textarea
              value={customMsg}
              onChange={e => setCustomMsg(e.target.value)}
              rows={5}
              placeholder="הודעה מותאמת אישית (ריק = ברירת מחדל)"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => sendReminder(msgInvoice, customMsg || undefined)}
                disabled={!!sending}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm">
                {sending === msgInvoice.id ? 'שולח...' : '📲 שלח ווטסאפ'}
              </button>
              <button onClick={() => { setMsgInvoice(null); setCustomMsg(''); }}
                className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                ביטול
              </button>
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
