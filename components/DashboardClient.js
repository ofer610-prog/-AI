'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Loader2, X, Send, Trash2, Bell, AlertCircle, Clock, Wallet, FileText,
  TrendingUp, TrendingDown, Target, ChevronRight, Check, Mail, MailCheck, Plus,
  Edit3, Upload, Download, BarChart3, PieChart, Activity, Users, Briefcase,
  RefreshCw, XCircle, CheckCircle, Calendar, DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import PinGate from '@/components/PinGate';
import {
  fmt, fmtMoney, daysBetween, today, getDeadlines, agingBucket, forecastTaxes,
  getGreeting, MATTER_TYPES, MATTER_STATUS, ROLE_LABELS, DEFAULT_RATES,
} from '@/lib/helpers';

export default function DashboardClient({
  profile, organization, clients, matters, income, expense, invoices,
  timesheet, team, alerts, gmailPending,
}) {
  const [tab, setTab] = useState('cockpit');
  const [chatOpen, setChatOpen] = useState(false);

  // Allow deep-linking to a tab: /dashboard?tab=my_collection
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t) setTab(t);
  }, []);
  const router = useRouter();
  const supabase = createClient();

  const totals = useMemo(() => {
    const tInc = income.reduce((a, b) => a + Number(b.amount || 0), 0);
    const tExp = expense.reduce((a, b) => a + Number(b.amount || 0), 0);
    const vatCol = income.reduce((a, b) => a + Number(b.vat || 0), 0);
    const vatPaid = expense.reduce((a, b) => a + Number(b.vat || 0), 0);
    return { tInc, tExp, net: tInc - tExp, vatCol, vatPaid, vatBalance: vatCol - vatPaid };
  }, [income, expense]);

  const deadlines = useMemo(() => getDeadlines(organization.filing_freq), [organization.filing_freq]);
  const forecast = useMemo(() => forecastTaxes(income, expense, organization), [income, expense, organization]);

  const ctx = {
    profile, organization, clients, matters, income, expense, invoices,
    timesheet, team, alerts, gmailPending, totals, deadlines, forecast,
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isAdmin = profile.role === 'admin' || profile.role === 'accountant';
  const isLawyer = isAdmin || profile.role === 'lawyer';

  // External pages live in the global AppNav; only in-dashboard sections here.
  // Financial tabs are admin-only AND PIN-gated when opened.
  const tabs = [
    { id: 'cockpit',       label: 'קוקפיט' },
    isAdmin && { id: 'gmail', label: `📧 מייל${gmailPending.length > 0 ? ` (${gmailPending.length})` : ''}` },
    { id: 'clients',       label: 'לקוחות' },
    { id: 'timesheet',     label: 'שעתון' },
    isLawyer && { id: 'my_collection', label: '💳 גבייה שלי' },
    isAdmin && { id: 'income',    label: '🔐 הכנסות' },
    isAdmin && { id: 'expense',   label: '🔐 הוצאות' },
    isAdmin && { id: 'invoices',  label: '🔐 חשבוניות' },
    isAdmin && { id: 'collection', label: '🔐 גבייה' },
    isAdmin && { id: 'forecast',  label: '🔐 תחזיות מס' },
    isAdmin && { id: 'team',      label: 'צוות' },
    { id: 'deadlines',     label: 'דדליינים' },
    isAdmin && { id: 'settings',  label: 'הגדרות' },
  ].filter(Boolean);

  const gated = (content) => <PinGate title="הנהלת חשבונות וגבייה">{content}</PinGate>;

  return (
    <div dir="rtl" className="min-h-screen bg-cream-50">
      <header className="border-b border-sky-100 bg-white sticky top-12 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-2xl font-bold">
              {organization.name || 'ספרי משרד'}
            </h1>
            <span className="text-xs text-slate-400 tracking-widest uppercase">Law Firm</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden md:inline">{profile.full_name} • {ROLE_LABELS[profile.role]}</span>
            <button onClick={() => setChatOpen(true)} className="px-3 py-1.5 bg-slate-800 text-white text-sm rounded-md flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> יועץ AI
            </button>
            <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-900">יציאה</button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-6 flex gap-1 -mb-px overflow-x-auto">
          {tabs.map(t => t.href ? (
            <Link key={t.id} href={t.href}
              className="px-3 py-3 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap">
              {t.label}
            </Link>
          ) : (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-sky-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 pb-32">
        {tab === 'cockpit' && <Cockpit ctx={ctx} setTab={setTab} />}
        {tab === 'gmail' && <GmailPanel ctx={ctx} onRefresh={() => router.refresh()} />}
        {tab === 'clients' && <ClientsPanel clients={clients} matters={matters} invoices={invoices} onRefresh={() => router.refresh()} canEdit={isLawyer} />}
        {tab === 'matters' && <MattersPanel matters={matters} clients={clients} team={team} onRefresh={() => router.refresh()} canEdit={isLawyer} />}
        {tab === 'timesheet' && <TimesheetPanel timesheet={timesheet} matters={matters} team={team} clients={clients} profile={profile} onRefresh={() => router.refresh()} />}
        {tab === 'income' && gated(<IncomeExpensePanel type="income" data={income} clients={clients} matters={matters} vatRate={organization.vat_rate} onRefresh={() => router.refresh()} />)}
        {tab === 'expense' && gated(<IncomeExpensePanel type="expense" data={expense} clients={clients} matters={matters} vatRate={organization.vat_rate} onRefresh={() => router.refresh()} />)}
        {tab === 'invoices' && gated(<InvoicesPanel invoices={invoices} clients={clients} matters={matters} onRefresh={() => router.refresh()} />)}
        {tab === 'collection' && gated(<CollectionPanel invoices={invoices} clients={clients} onRefresh={() => router.refresh()} />)}
        {tab === 'forecast' && gated(<ForecastPanel forecast={forecast} totals={totals} settings={organization} />)}
        {tab === 'team' && <TeamPanel team={team} onRefresh={() => router.refresh()} />}
        {tab === 'deadlines' && <DeadlinesPanel deadlines={deadlines} />}
        {tab === 'settings' && <SettingsPanel organization={organization} onRefresh={() => router.refresh()} />}
        {tab === 'my_collection' && <MyCollectionPanel matters={matters} invoices={invoices} profile={profile} />}
      </main>

      {chatOpen && <AIAdvisor ctx={ctx} onClose={() => setChatOpen(false)} profile={profile} />}
    </div>
  );
}

// ============================================================================
// Cockpit
// ============================================================================
function Cockpit({ ctx, setTab }) {
  const { totals, forecast, invoices, deadlines, alerts, gmailPending, profile, matters, timesheet } = ctx;
  const isAdmin = profile.role === 'admin' || profile.role === 'accountant';
  const openInv = invoices.filter(i => i.status !== 'paid');
  const totalOpen = openInv.reduce((a, b) => a + Number(b.amount || 0), 0);
  const next = deadlines[0];

  // Personal data for non-admin lawyers
  const myMatters = matters.filter(m => m.responsible_lawyer_id === profile.id);
  const myHoursThisMonth = timesheet
    .filter(t => t.lawyer_id === profile.id && t.date?.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((a, b) => a + Number(b.hours || 0), 0);
  const urgentMatters = myMatters.filter(m => {
    if (!m.delivery_date) return false;
    const days = Math.round((new Date(m.delivery_date) - new Date()) / 86400000);
    return days >= 0 && days <= 14;
  });

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-sky-700 via-sky-800 to-slate-800 text-white rounded-xl p-6 md:p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-xs text-slate-400 tracking-widest uppercase mb-1">קוקפיט יומי</div>
            <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">
              {getGreeting()} {profile.full_name?.split(' ')[0]}
            </h2>
            <p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          {next && (
            <div className="text-left">
              <div className="text-xs text-slate-400 mb-1">דדליין הבא</div>
              <div className="text-xl font-bold">{daysBetween(today(), next.date)} ימים</div>
              <div className="text-xs text-slate-400">{next.label}</div>
            </div>
          )}
        </div>

        {/* Admin: gmail alert */}
        {isAdmin && gmailPending.length > 0 && (
          <button onClick={() => setTab('gmail')} className="w-full text-right p-3 mb-2 rounded-lg border bg-blue-900/30 border-blue-800 hover:bg-blue-900/50 transition-colors flex items-start gap-3">
            <Mail className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-sm">{gmailPending.length} פריטים חדשים מהמייל ממתינים לאישור</div>
              <div className="text-xs text-sky-100 mt-0.5">המערכת זיהתה חשבוניות, תקבולים והתראות בנק. עבור על הרשימה.</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 mt-1" />
          </button>
        )}

        {/* Admin: system alerts */}
        {isAdmin && (alerts.length === 0 && gmailPending.length === 0 ? (
          <div className="bg-emerald-900/30 border border-emerald-800 rounded-lg p-4 text-sm">
            <Check className="inline w-4 h-4 ml-1" /> הכל נקי. אין התראות חריגות.
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 3).map((a) => (
              <div key={a.id} className={`p-3 rounded-lg border ${
                a.level === 'high' ? 'bg-rose-900/30 border-rose-800'
                : a.level === 'medium' ? 'bg-amber-900/30 border-amber-800'
                : 'bg-slate-700 border-slate-600'
              }`}>
                <div className="font-semibold text-sm">{a.title}</div>
                {a.description && <div className="text-xs text-sky-100 mt-0.5">{a.description}</div>}
              </div>
            ))}
          </div>
        ))}

        {/* Non-admin: personal summary */}
        {!isAdmin && (
          <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-300">תיקים שלי</span><span className="font-bold">{myMatters.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-300">דחופים (14 יום)</span><span className={`font-bold ${urgentMatters.length > 0 ? 'text-orange-300' : ''}`}>{urgentMatters.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-300">שעות החודש</span><span className="font-bold">{myHoursThisMonth.toFixed(1)}</span></div>
          </div>
        )}
      </div>

      {/* Admin-only: financial KPIs + tax forecast */}
      {isAdmin && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="הכנסות חודשי" value={forecast.monthlyIncome} icon={TrendingUp} accent="emerald" />
            <KPI label="הוצאות חודשי" value={forecast.monthlyExpense} icon={TrendingDown} accent="rose" />
            <KPI label="רווח נקי" value={forecast.monthlyNet} icon={Wallet} accent={forecast.monthlyNet >= 0 ? 'sky' : 'red'} />
            <KPI label="חשבוניות פתוחות" value={totalOpen} icon={FileText} accent="indigo" subtext={`${openInv.length} חשבוניות`} />
          </div>
          <div className="bg-white border border-sky-100 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">לחץ מס צפוי — 3 חודשים קדימה</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div><div className="text-xs text-slate-500 mb-1">מע״מ הבא</div><div className="text-2xl font-bold text-rose-700">{fmtMoney(forecast.nextVatPayment)}</div></div>
              <div><div className="text-xs text-slate-500 mb-1">מקדמת מ״ה (חודשי)</div><div className="text-2xl font-bold text-orange-700">{fmtMoney(forecast.monthlyIncomeTax)}</div></div>
              <div><div className="text-xs text-slate-500 mb-1">בל״ל (חודשי)</div><div className="text-2xl font-bold text-amber-700">{fmtMoney(forecast.monthlyBituach)}</div></div>
              <div><div className="text-xs text-slate-500 mb-1">סה״כ ל-3 חודשים</div><div className="text-2xl font-bold">{fmtMoney(forecast.next3Months)}</div></div>
            </div>
          </div>
        </>
      )}

      {/* Non-admin: urgent matters */}
      {!isAdmin && urgentMatters.length > 0 && (
        <div className="bg-white border border-orange-100 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">⚠️ תיקים דחופים שלי</h3>
          <div className="space-y-2">
            {urgentMatters.map(m => {
              const days = Math.round((new Date(m.delivery_date) - new Date()) / 86400000);
              return (
                <div key={m.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                  <span className="font-medium">{m.clients?.name || m.title}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${days <= 3 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                    {days === 0 ? 'היום' : `${days} ימים`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Non-admin: their cases list */}
      {!isAdmin && (
        <div className="bg-white border border-sky-100 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">📋 התיקים שלי</h3>
          {myMatters.length === 0
            ? <p className="text-sm text-slate-400">אין תיקים משויכים אליך</p>
            : <div className="space-y-2">
                {myMatters.slice(0, 6).map(m => (
                  <div key={m.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                    <span>{m.clients?.name || m.title}</span>
                    <span className="text-xs text-slate-400">{m.property_address || ''}</span>
                  </div>
                ))}
                {myMatters.length > 6 && <p className="text-xs text-slate-400 mt-1">ועוד {myMatters.length - 6} תיקים נוספים</p>}
              </div>
          }
        </div>
      )}

      {/* Non-admin: My Day widget */}
      {!isAdmin && <MyDayWidget profileId={profile.id} />}
    </div>
  );
}

function MyDayWidget({ profileId }) {
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingT, setLoadingT] = useState(true);
  const [loadingE, setLoadingE] = useState(true);
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetch(`/api/tasks?assigned_to=${profileId}`)
      .then(r => r.ok ? r.json() : { tasks: [] })
      .then(d => setTasks((d.tasks || []).filter(t => t.status === 'open' || t.status === 'in_progress').slice(0, 5)))
      .catch(() => {})
      .finally(() => setLoadingT(false));
  }, [profileId]);

  useEffect(() => {
    fetch(`/api/calendar?start=${todayStr}&end=${todayStr}`)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(d => setEvents(d.events || []))
      .catch(() => {})
      .finally(() => setLoadingE(false));
  }, [todayStr]);

  const markDone = async (taskId) => {
    await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: taskId, status: 'done' }) });
    setTasks(ts => ts.filter(t => t.id !== taskId));
  };

  const priorityColor = (p) => p === 'high' ? 'bg-red-100 text-red-700' : p === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
  const priorityLabel = (p) => p === 'high' ? 'דחוף' : p === 'medium' ? 'בינוני' : 'רגיל';

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Tasks */}
      <div className="bg-white border border-sky-100 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">✅ המשימות שלי</h3>
          <Link href="/tasks" className="text-xs text-sky-600 hover:underline">כל המשימות ←</Link>
        </div>
        {loadingT ? <p className="text-sm text-slate-400">טוען...</p> : tasks.length === 0 ? (
          <p className="text-sm text-slate-400">אין משימות פתוחות. כל הכבוד!</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map(t => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <button onClick={() => markDone(t.id)} className="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 flex-shrink-0 hover:border-green-500 transition-colors" title="סמן הושלם" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{t.title || t.description}</p>
                  {t.due_date && <p className="text-xs text-slate-500">{t.due_date}</p>}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${priorityColor(t.priority)}`}>{priorityLabel(t.priority)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Today's calendar events */}
      <div className="bg-white border border-sky-100 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">📅 אירועי היום</h3>
          <Link href="/calendar" className="text-xs text-sky-600 hover:underline">יומן ←</Link>
        </div>
        {loadingE ? <p className="text-sm text-slate-400">טוען...</p> : events.length === 0 ? (
          <p className="text-sm text-slate-400">אין אירועים מתוכננים להיום</p>
        ) : (
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.id} className="flex gap-3 text-sm border-r-2 border-sky-400 pr-2">
                <div>
                  <p className="font-medium text-slate-800">{e.title}</p>
                  {(e.start_time || e.start_date) && (
                    <p className="text-xs text-slate-500">{e.start_time || e.start_date}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value, icon: Icon, accent = 'sky', subtext }) {
  const colors = { emerald: 'text-emerald-700', rose: 'text-rose-700', sky: 'text-sky-700', red: 'text-red-700', indigo: 'text-indigo-700' };
  return (
    <div className="bg-white border border-sky-100 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className={`text-xl font-bold ${colors[accent]}`}>{fmtMoney(value)}</div>
      {subtext && <div className="text-xs text-slate-400 mt-1">{subtext}</div>}
    </div>
  );
}

// ============================================================================
// Gmail Panel — review pending items, connect Gmail
// ============================================================================
function GmailPanel({ ctx, onRefresh }) {
  const { gmailPending, organization } = ctx;
  const [syncing, setSyncing] = useState(false);
  const supabase = createClient();

  const connectGmail = () => {
    window.location.href = '/api/auth/google/connect';
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' });
      const data = await res.json();
      alert(`סונכרן: ${data.processed} מיילים חדשים, ${data.imported} יובאו`);
      onRefresh();
    } catch (e) {
      alert('שגיאה: ' + e.message);
    }
    setSyncing(false);
  };

  const approveItem = async (item) => {
    const targetTable = item.classification === 'bank-notification' ? 'bank_transactions'
      : item.extracted_amount && (item.classification === 'invoice') ? 'expense'
      : 'income';

    if (targetTable === 'bank_transactions') {
      await supabase.from('bank_transactions').insert({
        organization_id: organization.id,
        date: item.extracted_date,
        amount: item.extracted_amount,
        description: item.extracted_description,
        source: 'gmail',
      });
    } else {
      await supabase.from(targetTable).insert({
        organization_id: organization.id,
        date: item.extracted_date,
        description: item.extracted_description,
        amount: item.extracted_amount,
        vat: item.extracted_amount * (organization.vat_rate / (100 + organization.vat_rate)),
        source: 'gmail',
        source_ref: item.gmail_message_id,
      });
    }
    await supabase.from('gmail_processed').update({ status: 'imported' }).eq('id', item.id);
    onRefresh();
  };

  const ignoreItem = async (item) => {
    await supabase.from('gmail_processed').update({ status: 'ignored' }).eq('id', item.id);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">חיבור למייל</h2>
          <p className="text-sm text-slate-500 mt-1">
            {organization.gmail_connected
              ? `מחובר ל-${organization.gmail_email} • סנכרון אחרון: ${organization.last_gmail_sync ? fmt(organization.last_gmail_sync) : 'אף פעם'}`
              : 'לא מחובר עדיין'}
          </p>
        </div>
        <div className="flex gap-2">
          {organization.gmail_connected ? (
            <button onClick={triggerSync} disabled={syncing} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md flex items-center gap-2 disabled:opacity-50">
              {syncing ? <><Loader2 className="w-4 h-4 animate-spin" /> מסנכרן...</> : <><MailCheck className="w-4 h-4" /> סנכרון עכשיו</>}
            </button>
          ) : (
            <button onClick={connectGmail} className="px-4 py-2 bg-blue-700 text-white text-sm rounded-md hover:bg-blue-800">
              חבר Gmail
            </button>
          )}
        </div>
      </div>

      {!organization.gmail_connected && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 text-sm text-blue-900 space-y-2">
          <div className="font-semibold">איך זה עובד:</div>
          <ol className="mr-5 list-decimal space-y-1">
            <li>לחץ "חבר Gmail" — תופנה לגוגל לאישור הרשאה</li>
            <li>תופיע אזהרה "Google hasn't verified this app" — לחץ Advanced → Continue (זה האפליקציה שלך)</li>
            <li>אשר את ההרשאות הדרושות (קריאה ובחינה של מיילים)</li>
            <li>המערכת תסרוק את הדואר אחת ביום (06:00) ותחלץ אוטומטית: התראות בנק, אישורי ביט, חשבוניות בצרופות</li>
            <li>פריטים שדורשים אישור יופיעו כאן לסקירה</li>
          </ol>
        </div>
      )}

      {gmailPending.length === 0 ? (
        <div className="bg-white border border-sky-100 rounded-lg p-8 text-center text-slate-400">
          {organization.gmail_connected ? 'אין פריטים שדורשים אישור' : 'חבר את Gmail כדי להתחיל'}
        </div>
      ) : (
        <div className="space-y-2">
          {gmailPending.map(item => (
            <div key={item.id} className="bg-white border border-sky-100 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 bg-sky-50 rounded">{item.classification}</span>
                    <span className="text-xs text-slate-500">דיוק: {item.ai_confidence}</span>
                    <span className="text-xs text-slate-400">{fmt(item.date)}</span>
                  </div>
                  <div className="text-sm font-medium">{item.subject}</div>
                  <div className="text-xs text-slate-500 mt-1">מאת: {item.from_email}</div>
                  {item.extracted_amount && (
                    <div className="mt-2 text-sm">
                      <span className="font-semibold">{fmtMoney(item.extracted_amount)}</span>
                      {item.extracted_description && <span className="text-slate-600"> • {item.extracted_description}</span>}
                    </div>
                  )}
                  {item.ai_notes && <div className="text-xs text-slate-400 italic mt-1">{item.ai_notes}</div>}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => approveItem(item)} className="px-3 py-1 bg-emerald-700 text-white text-xs rounded">אשר וייבא</button>
                  <button onClick={() => ignoreItem(item)} className="px-3 py-1 bg-sky-50 text-slate-700 text-xs rounded">דלג</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Generic CRUD panels — clients, matters, etc.
// ============================================================================
function ClientsPanel({ clients, matters, invoices, onRefresh, canEdit }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'individual', id_number: '', phone: '', email: '', address: '', notes: '' });
  const supabase = createClient();

  const submit = async () => {
    if (!form.name) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
    await supabase.from('clients').insert({ ...form, organization_id: profile.organization_id, created_by: user.id });
    setForm({ name: '', type: 'individual', id_number: '', phone: '', email: '', address: '', notes: '' });
    setShowForm(false);
    onRefresh();
  };

  const getStats = (id) => {
    const cInvoices = invoices.filter(i => i.client_id === id);
    const billed = cInvoices.reduce((a, b) => a + Number(b.amount || 0), 0);
    const paid = cInvoices.filter(i => i.status === 'paid').reduce((a, b) => a + Number(b.amount || 0), 0);
    return { mattersCount: matters.filter(m => m.client_id === id).length, billed, open: billed - paid };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">לקוחות</h2>
          <p className="text-sm text-slate-500 mt-1">{clients.length} לקוחות</p>
        </div>
        {canEdit && <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md">{showForm ? 'סגור' : '+ לקוח'}</button>}
      </div>

      {showForm && (
        <div className="bg-white border border-sky-100 rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="שם" value={form.name} onChange={v => setForm({ ...form, name: v })} />
            <SelectField label="סוג" value={form.type} onChange={v => setForm({ ...form, type: v })} options={[{value:'individual',label:'אדם'},{value:'company',label:'חברה'}]} />
            <Field label="ת.ז./ח.פ." value={form.id_number} onChange={v => setForm({ ...form, id_number: v })} />
            <Field label="טלפון" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
            <Field label="אימייל" value={form.email} onChange={v => setForm({ ...form, email: v })} />
            <Field label="כתובת" value={form.address} onChange={v => setForm({ ...form, address: v })} />
          </div>
          <button onClick={submit} className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-md">שמור</button>
        </div>
      )}

      <div className="bg-white border border-sky-100 rounded-lg overflow-hidden">
        {clients.length === 0 ? <div className="p-12 text-center text-slate-400">אין לקוחות</div> : (
          <table className="w-full">
            <thead className="bg-cream-50 border-b border-sky-100">
              <tr><Th>שם</Th><Th>סוג</Th><Th>תיקים</Th><Th align="left">חויב</Th><Th align="left">פתוח</Th></tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const s = getStats(c.id);
                return (
                  <tr key={c.id} className="border-b border-sky-50">
                    <Td className="font-medium">{c.name}</Td>
                    <Td>{c.type === 'company' ? 'חברה' : 'אדם'}</Td>
                    <Td>{s.mattersCount}</Td>
                    <Td align="left">{fmtMoney(s.billed)}</Td>
                    <Td align="left" className={s.open > 0 ? 'text-rose-700 font-semibold' : 'text-slate-400'}>{fmtMoney(s.open)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MattersPanel({ matters, clients, team, onRefresh, canEdit }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', client_id: '', type: 'sale', status: 'active', responsible_lawyer_id: '', agreed_fee: '', start_date: new Date().toISOString().slice(0,10), description: '', property_address: '' });
  const supabase = createClient();

  const submit = async () => {
    if (!form.title || !form.client_id) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
    const payload = { ...form, organization_id: profile.organization_id, created_by: user.id, agreed_fee: parseFloat(form.agreed_fee) || null };
    if (!payload.responsible_lawyer_id) delete payload.responsible_lawyer_id;
    await supabase.from('matters').insert(payload);
    setForm({ title: '', client_id: '', type: 'sale', status: 'active', responsible_lawyer_id: '', agreed_fee: '', start_date: new Date().toISOString().slice(0,10), description: '', property_address: '' });
    setShowForm(false);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">תיקים</h2>
          <p className="text-sm text-slate-500 mt-1">{matters.filter(m => m.status === 'active').length} פעילים מתוך {matters.length}</p>
        </div>
        {canEdit && <button onClick={() => setShowForm(!showForm)} disabled={clients.length === 0} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md disabled:opacity-50">{showForm ? 'סגור' : '+ תיק'}</button>}
      </div>

      {showForm && (
        <div className="bg-white border border-sky-100 rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="שם התיק" value={form.title} onChange={v => setForm({ ...form, title: v })} />
            <SelectField label="לקוח" value={form.client_id} onChange={v => setForm({ ...form, client_id: v })} options={[{value:'',label:'— בחר —'}, ...clients.map(c => ({value:c.id, label:c.name}))]} />
            <SelectField label="סוג" value={form.type} onChange={v => setForm({ ...form, type: v })} options={MATTER_TYPES.map(t => ({value:t.id,label:t.label}))} />
            <SelectField label="סטטוס" value={form.status} onChange={v => setForm({ ...form, status: v })} options={MATTER_STATUS.map(s => ({value:s.id,label:s.label}))} />
            <SelectField label="עו״ד אחראי" value={form.responsible_lawyer_id} onChange={v => setForm({ ...form, responsible_lawyer_id: v })} options={[{value:'',label:'— ללא —'}, ...team.filter(t=>t.role==='lawyer'||t.role==='admin').map(t => ({value:t.id,label:t.full_name}))]} />
            <Field label="שכ״ט מוסכם" type="number" value={form.agreed_fee} onChange={v => setForm({ ...form, agreed_fee: v })} />
            <Field label="כתובת הנכס" value={form.property_address} onChange={v => setForm({ ...form, property_address: v })} />
          </div>
          <button onClick={submit} className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-md">שמור</button>
        </div>
      )}

      <div className="bg-white border border-sky-100 rounded-lg overflow-hidden">
        {matters.length === 0 ? <div className="p-12 text-center text-slate-400">אין תיקים</div> : (
          <table className="w-full">
            <thead className="bg-cream-50 border-b border-sky-100">
              <tr><Th>תיק</Th><Th>לקוח</Th><Th>סוג</Th><Th>אחראי</Th><Th>סטטוס</Th><Th align="left">שכ״ט</Th></tr>
            </thead>
            <tbody>
              {matters.map(m => {
                const client = clients.find(c => c.id === m.client_id);
                const lawyer = team.find(t => t.id === m.responsible_lawyer_id);
                const type = MATTER_TYPES.find(t => t.id === m.type);
                const status = MATTER_STATUS.find(s => s.id === m.status);
                return (
                  <tr key={m.id} className="border-b border-sky-50">
                    <Td className="font-medium">{m.title}</Td>
                    <Td>{client?.name || '—'}</Td>
                    <Td>{type?.label}</Td>
                    <Td>{lawyer?.full_name || '—'}</Td>
                    <Td><span className={`text-xs px-2 py-1 bg-${status?.color}-100 text-${status?.color}-800 rounded`}>{status?.label}</span></Td>
                    <Td align="left" className="font-semibold">{fmtMoney(m.agreed_fee)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TimesheetPanel({ timesheet, matters, team, clients, profile, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), matter_id: '', hours: '', description: '', billable: true });
  const supabase = createClient();

  const submit = async () => {
    if (!form.matter_id || !form.hours) return;
    await supabase.from('timesheet').insert({
      ...form, organization_id: profile.organization_id, lawyer_id: profile.id,
      hours: parseFloat(form.hours),
    });
    setForm({ date: new Date().toISOString().slice(0,10), matter_id: '', hours: '', description: '', billable: true });
    setShowForm(false);
    onRefresh();
  };

  const filtered = timesheet.filter(t => t.lawyer_id === profile.id || profile.role === 'admin');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">שעתון</h2>
          <p className="text-sm text-slate-500 mt-1">{filtered.reduce((a,b)=>a+Number(b.hours||0),0).toFixed(1)} שעות</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} disabled={matters.length === 0} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md disabled:opacity-50">{showForm ? 'סגור' : '+ רישום'}</button>
      </div>

      {showForm && (
        <div className="bg-white border border-sky-100 rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="תאריך" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} />
            <SelectField label="תיק" value={form.matter_id} onChange={v => setForm({ ...form, matter_id: v })} options={[{value:'',label:'— בחר —'}, ...matters.filter(m=>m.status==='active').map(m => ({value:m.id,label:m.title}))]} />
            <Field label="שעות" type="number" value={form.hours} onChange={v => setForm({ ...form, hours: v })} />
            <label className="flex items-center gap-2 mt-5">
              <input type="checkbox" checked={form.billable} onChange={e => setForm({ ...form, billable: e.target.checked })} />
              <span className="text-sm">לחיוב</span>
            </label>
          </div>
          <Field label="פירוט" value={form.description} onChange={v => setForm({ ...form, description: v })} />
          <button onClick={submit} className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-md">רשום</button>
        </div>
      )}

      <div className="bg-white border border-sky-100 rounded-lg overflow-hidden">
        {filtered.length === 0 ? <div className="p-12 text-center text-slate-400">אין רישומים</div> : (
          <table className="w-full">
            <thead className="bg-cream-50 border-b border-sky-100"><tr><Th>תאריך</Th><Th>עו״ד</Th><Th>תיק</Th><Th>פירוט</Th><Th align="left">שעות</Th></tr></thead>
            <tbody>
              {filtered.map(t => {
                const lawyer = team.find(x => x.id === t.lawyer_id);
                const matter = matters.find(m => m.id === t.matter_id);
                return (
                  <tr key={t.id} className="border-b border-sky-50">
                    <Td>{fmt(t.date)}</Td>
                    <Td>{lawyer?.full_name || '—'}</Td>
                    <Td>{matter?.title || '—'}</Td>
                    <Td className="text-slate-500 text-xs">{t.description} {!t.billable && '(לא לחיוב)'}</Td>
                    <Td align="left" className="font-semibold">{Number(t.hours).toFixed(1)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function IncomeExpensePanel({ type, data, clients, matters, vatRate, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), description: '', amount: '', vat: '', category: '', client_id: '', matter_id: '' });
  const supabase = createClient();

  const handleAmount = (val) => {
    const a = parseFloat(val) || 0;
    setForm({ ...form, amount: val, vat: (a * vatRate / (100 + vatRate)).toFixed(2) });
  };

  const submit = async () => {
    if (!form.description || !form.amount) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
    const payload = {
      ...form, organization_id: profile.organization_id, created_by: user.id,
      amount: parseFloat(form.amount), vat: parseFloat(form.vat) || 0,
    };
    if (!payload.client_id) delete payload.client_id;
    if (!payload.matter_id) delete payload.matter_id;
    await supabase.from(type).insert(payload);
    setForm({ date: new Date().toISOString().slice(0,10), description: '', amount: '', vat: '', category: '', client_id: '', matter_id: '' });
    setShowForm(false);
    onRefresh();
  };

  const total = data.reduce((a, b) => a + Number(b.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">{type === 'income' ? 'הכנסות' : 'הוצאות'}</h2>
          <p className="text-sm text-slate-500 mt-1">סה״כ {fmtMoney(total)}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md">{showForm ? 'סגור' : '+ חדש'}</button>
      </div>

      {showForm && (
        <div className="bg-white border border-sky-100 rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="תאריך" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} />
            <Field label="תיאור" value={form.description} onChange={v => setForm({ ...form, description: v })} />
            <Field label="סכום כולל" type="number" value={form.amount} onChange={handleAmount} />
            <Field label="מע״מ" type="number" value={form.vat} onChange={v => setForm({ ...form, vat: v })} />
            <Field label="קטגוריה" value={form.category} onChange={v => setForm({ ...form, category: v })} />
            <SelectField label="לקוח" value={form.client_id} onChange={v => setForm({ ...form, client_id: v, matter_id: '' })} options={[{value:'',label:'—'}, ...clients.map(c => ({value:c.id,label:c.name}))]} />
            <SelectField label="תיק" value={form.matter_id} onChange={v => setForm({ ...form, matter_id: v })} options={[{value:'',label:'—'}, ...matters.filter(m => !form.client_id || m.client_id === form.client_id).map(m => ({value:m.id,label:m.title}))]} />
          </div>
          <button onClick={submit} className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-md">שמור</button>
        </div>
      )}

      <div className="bg-white border border-sky-100 rounded-lg overflow-hidden">
        {data.length === 0 ? <div className="p-12 text-center text-slate-400">אין רשומות</div> : (
          <table className="w-full">
            <thead className="bg-cream-50 border-b border-sky-100"><tr><Th>תאריך</Th><Th>תיאור</Th><Th>לקוח</Th><Th>מקור</Th><Th align="left">סכום</Th></tr></thead>
            <tbody>
              {data.map(item => {
                const client = clients.find(c => c.id === item.client_id);
                return (
                  <tr key={item.id} className="border-b border-sky-50">
                    <Td>{fmt(item.date)}</Td>
                    <Td className="font-medium">{item.description}</Td>
                    <Td>{client?.name || '—'}</Td>
                    <Td className="text-xs text-slate-400">{item.source === 'gmail' ? '📧' : item.source === 'document-upload' ? '📷' : '✍️'}</Td>
                    <Td align="left" className="font-semibold">{fmtMoney(item.amount)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InvoicesPanel({ invoices, clients, matters, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ number: '', client_id: '', matter_id: '', amount: '', issue_date: new Date().toISOString().slice(0,10), due_date: new Date(Date.now()+30*86400000).toISOString().slice(0,10) });
  const supabase = createClient();

  const submit = async () => {
    if (!form.number || !form.client_id || !form.amount) return;
    const client = clients.find(c => c.id === form.client_id);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
    const payload = {
      ...form, organization_id: profile.organization_id, created_by: user.id,
      client_name: client.name, amount: parseFloat(form.amount), status: 'open',
    };
    if (!payload.matter_id) delete payload.matter_id;
    await supabase.from('invoices').insert(payload);
    setForm({ number: '', client_id: '', matter_id: '', amount: '', issue_date: new Date().toISOString().slice(0,10), due_date: new Date(Date.now()+30*86400000).toISOString().slice(0,10) });
    setShowForm(false);
    onRefresh();
  };

  const togglePaid = async (id, current) => {
    await supabase.from('invoices').update({
      status: current === 'paid' ? 'open' : 'paid',
      paid_date: current === 'paid' ? null : new Date().toISOString().slice(0,10),
    }).eq('id', id);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">חשבוניות</h2>
          <p className="text-sm text-slate-500 mt-1">{invoices.filter(i=>i.status!=='paid').length} פתוחות מתוך {invoices.length}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md">{showForm ? 'סגור' : '+ חשבונית'}</button>
      </div>

      {showForm && (
        <div className="bg-white border border-sky-100 rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="מספר" value={form.number} onChange={v => setForm({ ...form, number: v })} />
            <SelectField label="לקוח" value={form.client_id} onChange={v => setForm({ ...form, client_id: v })} options={[{value:'',label:'—'}, ...clients.map(c => ({value:c.id,label:c.name}))]} />
            <Field label="סכום" type="number" value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
            <Field label="פירעון" type="date" value={form.due_date} onChange={v => setForm({ ...form, due_date: v })} />
          </div>
          <button onClick={submit} className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-md">שמור</button>
        </div>
      )}

      <div className="bg-white border border-sky-100 rounded-lg overflow-hidden">
        {invoices.length === 0 ? <div className="p-12 text-center text-slate-400">אין חשבוניות</div> : (
          <table className="w-full">
            <thead className="bg-cream-50 border-b border-sky-100"><tr><Th>#</Th><Th>לקוח</Th><Th>פירעון</Th><Th>סטטוס</Th><Th align="left">סכום</Th><Th></Th></tr></thead>
            <tbody>
              {invoices.map(inv => {
                const b = agingBucket(inv);
                return (
                  <tr key={inv.id} className="border-b border-sky-50">
                    <Td>{inv.number}</Td>
                    <Td className="font-medium">{inv.client_name}</Td>
                    <Td>{fmt(inv.due_date)}</Td>
                    <Td>{inv.status === 'paid' ? <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-800 rounded">שולם</span> : b && <span className={`text-xs px-2 py-1 bg-${b.color}-100 text-${b.color}-800 rounded`}>{b.label}</span>}</Td>
                    <Td align="left" className="font-semibold">{fmtMoney(inv.amount)}</Td>
                    <Td align="left"><button onClick={() => togglePaid(inv.id, inv.status)} className="text-xs text-slate-600 hover:text-slate-900">{inv.status === 'paid' ? 'בטל' : 'שולם'}</button></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CollectionPanel({ invoices, clients, onRefresh }) {
  const open = invoices.filter(i => i.status !== 'paid');
  const grouped = {};
  open.forEach(inv => {
    const b = agingBucket(inv);
    if (!b) return;
    if (!grouped[b.label]) grouped[b.label] = { items: [], color: b.color };
    grouped[b.label].items.push(inv);
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">גבייה</h2>
        <p className="text-sm text-slate-500 mt-1">חשבוניות פתוחות לפי גיל</p>
      </div>
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-8 text-center text-emerald-800">
          <Check className="w-8 h-8 mx-auto mb-2" /> אין חשבוניות פתוחות
        </div>
      ) : Object.entries(grouped).map(([label, { items, color }]) => (
        <div key={label} className="bg-white border border-sky-100 rounded-lg overflow-hidden">
          <div className={`px-5 py-3 bg-${color}-50 border-b border-${color}-100 font-semibold text-${color}-800`}>
            {label} ימים • {items.length} חשבוניות • {fmtMoney(items.reduce((a,b) => a+Number(b.amount), 0))}
          </div>
          <table className="w-full">
            <tbody>
              {items.map(inv => {
                const client = clients.find(c => c.id === inv.client_id);
                return (
                  <tr key={inv.id} className="border-b border-sky-50">
                    <Td>{inv.client_name}</Td>
                    <Td className="text-xs text-slate-500">#{inv.number} • פירעון {fmt(inv.due_date)}</Td>
                    <Td align="left" className="font-semibold">{fmtMoney(inv.amount)}</Td>
                    <Td align="left">
                      {client?.email && (
                        <a href={`mailto:${client.email}?subject=${encodeURIComponent(`תזכורת — חשבונית ${inv.number}`)}&body=${encodeURIComponent(`שלום,\n\nתזכורת שטרם שולמה חשבונית מס׳ ${inv.number} בסך ${fmtMoney(inv.amount)}.\nתאריך פירעון: ${fmt(inv.due_date)}.\n\nתודה`)}`} className="text-xs px-2 py-1 bg-sky-50 hover:bg-sky-100 rounded">תזכורת</a>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ForecastPanel({ forecast, totals, settings }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">תחזיות מס</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-rose-50 border-2 border-rose-200 rounded-lg p-5">
          <div className="text-xs uppercase tracking-wider text-slate-600 mb-1">מע״מ הבא</div>
          <div className="text-3xl font-bold text-rose-700">{fmtMoney(forecast.nextVatPayment)}</div>
        </div>
        <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-5">
          <div className="text-xs uppercase tracking-wider text-slate-600 mb-1">מקדמת מ״ה</div>
          <div className="text-3xl font-bold text-orange-700">{fmtMoney(forecast.monthlyIncomeTax)}</div>
        </div>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-5">
          <div className="text-xs uppercase tracking-wider text-slate-600 mb-1">בל״ל</div>
          <div className="text-3xl font-bold text-amber-700">{fmtMoney(forecast.monthlyBituach)}</div>
        </div>
      </div>
    </div>
  );
}

function TeamPanel({ team, onRefresh }) {
  return (
    <div className="space-y-6">
      <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">צוות</h2>
      <div className="bg-white border border-sky-100 rounded-lg overflow-hidden">
        {team.length === 0 ? <div className="p-12 text-center text-slate-400">אין צוות</div> : (
          <table className="w-full">
            <thead className="bg-cream-50 border-b border-sky-100"><tr><Th>שם</Th><Th>תפקיד</Th><Th>אימייל</Th><Th align="left">שכר</Th><Th align="left">תעריף</Th></tr></thead>
            <tbody>
              {team.map(t => (
                <tr key={t.id} className="border-b border-sky-50">
                  <Td className="font-medium">{t.full_name}</Td>
                  <Td>{ROLE_LABELS[t.role]}</Td>
                  <Td className="text-slate-500 text-xs">{t.email}</Td>
                  <Td align="left">{fmtMoney(t.monthly_salary)}</Td>
                  <Td align="left">{fmtMoney(t.hourly_rate)}/ש'</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        כדי להוסיף עובד חדש: שלח לו את כתובת המערכת. כשירשם, היכנס ל-Supabase Dashboard → Table Editor → profiles, ועדכן את ה-organization_id שלו לזה של המשרד, ואת התפקיד שלו. הוא יראה את המערכת ברגע שתעדכן.
      </div>
    </div>
  );
}

function DeadlinesPanel({ deadlines }) {
  return (
    <div className="space-y-6">
      <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">דדליינים</h2>
      <div className="bg-white border border-sky-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-cream-50 border-b border-sky-100"><tr><Th>סוג</Th><Th>פירוט</Th><Th>תאריך</Th><Th align="left">ימים</Th></tr></thead>
          <tbody>
            {deadlines.map((d, i) => {
              const days = daysBetween(today(), d.date);
              return (
                <tr key={i} className="border-b border-sky-50">
                  <Td><span className={`text-xs px-2 py-1 bg-${d.color}-100 text-${d.color}-800 rounded`}>{d.type}</span></Td>
                  <Td className="font-medium">{d.label}</Td>
                  <Td>{fmt(d.date)}</Td>
                  <Td align="left" className={`font-semibold ${days <= 7 ? 'text-rose-700' : ''}`}>{days} ימים</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// My Collection Panel — lawyer sees only their clients who haven't paid
// ============================================================================
function MyCollectionPanel({ matters, invoices, profile }) {
  const myMatters = matters.filter(m => m.responsible_lawyer_id === profile.id);
  const myClientIds = new Set(myMatters.map(m => m.client_id).filter(Boolean));

  // Unpaid invoices for my clients
  const unpaid = invoices.filter(inv =>
    inv.status !== 'paid' && inv.status !== 'cancelled' && myClientIds.has(inv.client_id)
  );

  // Group by client
  const byClient = {};
  for (const inv of unpaid) {
    const key = inv.client_id || inv.client_name;
    if (!byClient[key]) byClient[key] = { name: inv.client_name, invoices: [] };
    byClient[key].invoices.push(inv);
  }

  // Also: matters with agreed_fee but not fully collected
  const unchargedMatters = myMatters.filter(m =>
    m.agreed_fee && Number(m.agreed_fee) > 0 &&
    (!m.collected_amount || Number(m.collected_amount) < Number(m.agreed_fee)) &&
    m.payment_status !== 'שולם'
  );

  return (
    <div className="space-y-6" dir="rtl">
      <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">💳 גבייה שלי</h2>

      {/* Unpaid invoices */}
      <div className="bg-white border border-sky-100 rounded-lg p-6">
        <h3 className="font-semibold text-slate-700 mb-4">חשבוניות פתוחות — לקוחות שלי</h3>
        {unpaid.length === 0 ? (
          <p className="text-slate-400 text-sm">אין חשבוניות פתוחות ללקוחות שלך</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">לקוח</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">חשבונית</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">סכום</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">תאריך</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">גיל</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.map(inv => {
                const days = Math.round((new Date() - new Date(inv.issue_date)) / 86400000);
                return (
                  <tr key={inv.id} className={`border-b ${days > 30 ? 'bg-red-50' : days > 14 ? 'bg-yellow-50' : ''}`}>
                    <td className="px-3 py-2 font-medium">{inv.client_name}</td>
                    <td className="px-3 py-2 text-gray-500">{inv.number || inv.invoice_number || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-rose-700">{fmtMoney(inv.amount)}</td>
                    <td className="px-3 py-2 text-gray-500">{inv.issue_date}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${days > 30 ? 'bg-red-100 text-red-700' : days > 14 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                        {days} ימים
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Uncharged matters */}
      <div className="bg-white border border-sky-100 rounded-lg p-6">
        <h3 className="font-semibold text-slate-700 mb-4">תיקים עם שכר טרחה שלא שולם</h3>
        {unchargedMatters.length === 0 ? (
          <p className="text-slate-400 text-sm">כל שכר הטרחה שולם</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">לקוח</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">נכס</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">שכ"ט מוסכם</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">שולם</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">יתרה</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">שלב</th>
              </tr>
            </thead>
            <tbody>
              {unchargedMatters.map(m => {
                const agreed = Number(m.agreed_fee || 0);
                const collected = Number(m.collected_amount || 0);
                const balance = agreed - collected;
                return (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{m.clients?.name || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{m.property_address || '—'}</td>
                    <td className="px-3 py-2">{fmtMoney(agreed)}</td>
                    <td className="px-3 py-2 text-green-700">{fmtMoney(collected)}</td>
                    <td className="px-3 py-2 font-bold text-rose-700">{fmtMoney(balance)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{m.stage || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-gray-600">סה"כ יתרה לגביה:</td>
                <td className="px-3 py-2 text-rose-700">{fmtMoney(unchargedMatters.reduce((a, m) => a + Number(m.agreed_fee||0) - Number(m.collected_amount||0), 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ organization, onRefresh }) {
  const [form, setForm] = useState({ name: organization.name || '', vat_rate: organization.vat_rate || 18, filing_freq: organization.filing_freq || 'bimonthly' });
  const [pinForm, setPinForm]   = useState({ newPin: '', confirmPin: '' });
  const [pinMsg, setPinMsg]     = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [showPin, setShowPin]   = useState(false);
  const supabase = createClient();

  const save = async () => {
    await supabase.from('organizations').update(form).eq('id', organization.id);
    onRefresh();
    alert('נשמר');
  };

  const savePin = async () => {
    setPinMsg('');
    if (!/^\d{4,8}$/.test(pinForm.newPin)) { setPinMsg('❌ הקוד חייב להיות 4–8 ספרות'); return; }
    if (pinForm.newPin !== pinForm.confirmPin) { setPinMsg('❌ הקודים אינם תואמים'); return; }
    setPinLoading(true);
    try {
      const res  = await fetch('/api/admin/cases-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinForm.newPin }),
      });
      const json = await res.json();
      if (json.ok) {
        setPinMsg('✅ הקוד עודכן בהצלחה');
        setPinForm({ newPin: '', confirmPin: '' });
      } else {
        setPinMsg('❌ ' + (json.error || 'שגיאה'));
      }
    } catch { setPinMsg('❌ שגיאת רשת'); }
    setPinLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold">הגדרות</h2>

      {/* General settings */}
      <div className="bg-white border border-sky-100 rounded-lg p-6 space-y-4 max-w-2xl">
        <h3 className="font-semibold text-gray-700">כללי</h3>
        <Field label="שם המשרד" value={form.name} onChange={v => setForm({ ...form, name: v })} />
        <Field label="שיעור מע״מ" type="number" value={form.vat_rate} onChange={v => setForm({ ...form, vat_rate: parseFloat(v) || 0 })} />
        <SelectField label="תדירות דיווח" value={form.filing_freq} onChange={v => setForm({ ...form, filing_freq: v })} options={[{value:'bimonthly',label:'דו-חודשי'},{value:'monthly',label:'חודשי'}]} />
        <button onClick={save} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md">שמור</button>
      </div>

      {/* Cases access PIN */}
      <div className="bg-white border border-sky-100 rounded-lg p-6 space-y-4 max-w-2xl">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔒</span>
          <h3 className="font-semibold text-gray-700">קוד גישה לניהול תיקים</h3>
        </div>
        <p className="text-sm text-gray-500">
          הקוד מגן על עמוד ניהול התיקים. עורכי הדין יתבקשו להזין אותו בכל כניסה חדשה (נזכר 8 שעות).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">קוד חדש (4–8 ספרות)</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={8}
                value={pinForm.newPin}
                onChange={e => setPinForm(p => ({ ...p, newPin: e.target.value.replace(/\D/g,'') }))}
                placeholder="••••"
                className="w-full border rounded-md px-3 py-2 text-sm pr-10 focus:outline-none focus:border-blue-400"
              />
              <button type="button" onClick={() => setShowPin(s => !s)}
                className="absolute left-2 top-2 text-gray-400 hover:text-gray-600 text-xs">
                {showPin ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">אישור קוד</label>
            <input
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={8}
              value={pinForm.confirmPin}
              onChange={e => setPinForm(p => ({ ...p, confirmPin: e.target.value.replace(/\D/g,'') }))}
              placeholder="••••"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
        {pinMsg && <p className={`text-sm ${pinMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{pinMsg}</p>}
        <button
          onClick={savePin}
          disabled={pinLoading || !pinForm.newPin}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm rounded-md transition-colors"
        >
          {pinLoading ? 'שומר...' : 'עדכן קוד גישה'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// AI Advisor Chat
// ============================================================================
function AIAdvisor({ ctx, onClose, profile }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('chat_messages').select('*').eq('user_id', profile.id).order('created_at').limit(50);
      if (data && data.length > 0) {
        setMessages(data.map(m => ({ role: m.role, content: m.content })));
      } else {
        setMessages([{ role: 'assistant', content: `שלום ${profile.full_name?.split(' ')[0]}. אני היועץ העסקי שלך — אני מכיר את כל הנתונים של המשרד.\n\nשאל אותי כל שאלה: מצב כספי, גבייה, מסים, רווחיות לפי תיק/עו״ד, וכו'.` }]);
      }
    })();
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      const final = [...newMessages, { role: 'assistant', content: data.text }];
      setMessages(final);
      // persist
      await supabase.from('chat_messages').insert([
        { user_id: profile.id, organization_id: profile.organization_id, role: 'user', content: input },
        { user_id: profile.id, organization_id: profile.organization_id, role: 'assistant', content: data.text },
      ]);
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: 'שגיאה: ' + e.message }]);
    }
    setSending(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-6 md:bottom-6 md:right-auto md:w-[420px] h-[600px] max-h-[80vh] bg-white border border-sky-200 rounded-t-xl md:rounded-xl shadow-2xl z-40 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-sky-100 bg-slate-800 text-white rounded-t-xl">
        <div className="flex items-center gap-2"><Sparkles className="w-4 h-4" /><span className="font-semibold text-sm">יועץ AI</span></div>
        <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-slate-800 text-white' : 'bg-sky-50'}`}>{m.content}</div>
          </div>
        ))}
        {sending && <div className="flex justify-end"><div className="bg-sky-50 text-slate-500 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> חושב...</div></div>}
        <div ref={endRef} />
      </div>
      <div className="border-t border-sky-100 p-3">
        <div className="flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="שאל אותי..." rows={2} className="flex-1 px-3 py-2 border border-sky-200 rounded-md text-sm resize-none focus:outline-none focus:border-sky-600" />
          <button onClick={send} disabled={sending || !input.trim()} className="px-3 bg-slate-800 text-white rounded-md disabled:opacity-50"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Reusable form components
// ============================================================================
function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1 block">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1 block">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const Th = ({ children, align = 'right' }) => <th className={`px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-${align}`}>{children}</th>;
const Td = ({ children, align = 'right', className = '' }) => <td className={`px-4 py-3 text-sm text-slate-800 text-${align} ${className}`}>{children}</td>;
