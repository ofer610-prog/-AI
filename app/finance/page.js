'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp, Wallet, FileText, AlertCircle, Plus, CreditCard, Loader2,
  MessageSquare, RefreshCw, CheckCircle, XCircle, Upload, Landmark,
  Send, Mail, Phone,
} from 'lucide-react';

const fmtMoney = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;
const fmt = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

function getUpcomingDeadlines() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-based
  // VAT bi-monthly: report due 19th of month after period ends (odd months)
  // PCN874 filers: 23rd
  const deadlines = [];
  // Next VAT deadline: 19th of next odd month
  const vatMonth = m % 2 === 0 ? m + 1 : m + 2;
  const vatDate = new Date(y, vatMonth - 1, 19);
  const daysTillVat = Math.round((vatDate - now) / 86400000);
  if (daysTillVat >= 0 && daysTillVat <= 30) {
    deadlines.push({ label: 'מע"מ דו-חודשי', date: vatDate, days: daysTillVat, urgent: daysTillVat <= 7 });
  }
  // Bituach Leumi advance: 15th of each month
  const blDate = new Date(y, m - 1, 15);
  const daysTillBL = Math.round((blDate - now) / 86400000);
  if (daysTillBL >= 0 && daysTillBL <= 20) {
    deadlines.push({ label: 'מקדמת ביטוח לאומי', date: blDate, days: daysTillBL, urgent: daysTillBL <= 5 });
  }
  // Income tax advance: 15th of each month
  const itDate = new Date(y, m - 1, 15);
  const daysTillIT = Math.round((itDate - now) / 86400000);
  if (daysTillIT >= 0 && daysTillIT <= 20) {
    deadlines.push({ label: 'מקדמת מס הכנסה', date: itDate, days: daysTillIT, urgent: daysTillIT <= 5 });
  }
  return deadlines;
}

const METHOD_LABELS = {
  bank_transfer: 'העברה בנקאית',
  check: "צ'ק",
  cash: 'מזומן',
  credit_card: 'כרטיס אשראי',
};

export default function FinancePage() {
  const [summary, setSummary] = useState(null);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [whatsappAlerts, setWhatsappAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cligalSyncing, setCligalSyncing] = useState(false);
  const [cligalResult, setCligalResult] = useState(null);
  const [bankAlerts, setBankAlerts] = useState([]);
  const [bankAlertsLoading, setBankAlertsLoading] = useState(false);
  const [showBankImport, setShowBankImport] = useState(false);
  const [bankImportResult, setBankImportResult] = useState(null);
  const [sendModal, setSendModal] = useState(null); // { invoice }
  const [monthExpenses, setMonthExpenses] = useState(null);
  const router = useRouter();

  useEffect(() => {
    loadData();
    loadAlerts();
    loadBankAlerts();
    loadMonthExpenses();
  }, []);

  const loadMonthExpenses = async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    try {
      const res = await fetch(`/api/office-expenses?year=${year}`);
      const data = await res.json();
      const entries = data.entries || [];
      const thisMonth = entries.filter(e => Number(e.month) === month);
      const total = thisMonth.reduce((s, e) => s + Number(e.amount || 0), 0);
      const bySection = {};
      for (const e of thisMonth) {
        if (!bySection[e.section]) bySection[e.section] = 0;
        bySection[e.section] += Number(e.amount || 0);
      }
      setMonthExpenses({ total, bySection, month, year });
    } catch {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, invoicesRes] = await Promise.all([
        fetch('/api/finance/summary'),
        fetch('/api/invoices?status=open'),
      ]);
      const summaryData = await summaryRes.json();
      const invoicesData = await invoicesRes.json();
      setSummary(summaryData);

      // Also fetch sent+overdue invoices
      const [sentRes, overdueRes] = await Promise.all([
        fetch('/api/invoices?status=sent'),
        fetch('/api/invoices?status=overdue'),
      ]);
      const sentData = await sentRes.json();
      const overdueData = await overdueRes.json();

      const allOpen = [
        ...(invoicesData.invoices || []),
        ...(sentData.invoices || []),
        ...(overdueData.invoices || []),
      ];
      // Sort by due_date ascending
      allOpen.sort((a, b) => (a.due_date || '') < (b.due_date || '') ? -1 : 1);
      setOpenInvoices(allOpen);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch('/api/whatsapp/alerts?status=pending');
      const data = await res.json();
      setWhatsappAlerts(data.alerts || []);
    } catch (e) {
      console.error('loadAlerts error:', e);
    }
    setAlertsLoading(false);
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await fetch('/api/whatsapp/scan', { method: 'POST' });
      await loadAlerts();
    } catch (e) {
      console.error('scan error:', e);
    }
    setScanning(false);
  };

  const loadBankAlerts = async () => {
    setBankAlertsLoading(true);
    try {
      const res = await fetch('/api/bank/unmatched');
      const data = await res.json();
      setBankAlerts(data.alerts || []);
    } catch (e) {
      console.error('loadBankAlerts error:', e);
    }
    setBankAlertsLoading(false);
  };

  const handleBankAction = async (id, action, invoiceId) => {
    try {
      await fetch('/api/bank/unmatched', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, invoice_id: invoiceId }),
      });
      setBankAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error('handleBankAction error:', e);
    }
  };

  const handleCligalSync = async () => {
    setCligalSyncing(true);
    setCligalResult(null);
    try {
      const res = await fetch('/api/invoices/trigger-cligal-sync', { method: 'POST' });
      const data = await res.json();
      setCligalResult(data);
      if (data.success) loadData();
    } catch (e) {
      setCligalResult({ error: e.message });
    }
    setCligalSyncing(false);
  };

  const updateAlertStatus = async (id, status) => {
    try {
      await fetch('/api/whatsapp/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      setWhatsappAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error('updateAlertStatus error:', e);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-cream-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="border-b border-sky-100 bg-white sticky top-12 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm ml-2">← לוח בקרה</Link>
            <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-2xl font-bold">כספים</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPaymentModal(true)}
              className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-md flex items-center gap-2 hover:bg-emerald-800"
            >
              <CreditCard className="w-4 h-4" /> רשום תשלום
            </button>
            <Link
              href="/finance/invoices/new"
              className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md flex items-center gap-2 hover:bg-slate-900"
            >
              <Plus className="w-4 h-4" /> חשבונית חדשה
            </Link>
            <button
              onClick={handleCligalSync}
              disabled={cligalSyncing}
              className="px-4 py-2 border border-blue-300 text-blue-700 text-sm rounded-md hover:bg-blue-50 flex items-center gap-2 disabled:opacity-50"
            >
              {cligalSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              סנכרן מקליגל
            </button>
            <button
              onClick={() => { setShowBankImport(true); setBankImportResult(null); }}
              className="px-4 py-2 border border-indigo-200 text-indigo-700 text-sm rounded-md hover:bg-indigo-50 flex items-center gap-2"
            >
              <Landmark className="w-4 h-4" /> ייבוא דף חשבון
            </button>
            <Link
              href="/finance/import"
              className="px-4 py-2 border border-sky-200 text-slate-700 text-sm rounded-md hover:bg-sky-50 flex items-center gap-2"
            >
              ייבוא מקליגל 📥
            </Link>
            <Link
              href="/finance/invoices"
              className="px-4 py-2 border border-sky-200 text-slate-700 text-sm rounded-md hover:bg-sky-50"
            >
              כל החשבוניות
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Upcoming tax deadlines banner */}
        {(() => {
          const deadlines = getUpcomingDeadlines();
          if (!deadlines.length) return null;
          return (
            <div className="flex flex-wrap gap-2">
              {deadlines.map((d, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${d.urgent ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  ⏰ <span>{d.label}</span>
                  <span className="font-bold">{d.days === 0 ? 'היום!' : `בעוד ${d.days} ימים`}</span>
                  <span className="opacity-70">({fmt(d.date.toISOString())})</span>
                  <Link href="/tax-calendar" className="underline opacity-80 hover:opacity-100">לוח מועדים ←</Link>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Cligal sync result */}
        {cligalResult && (
          <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-3 ${cligalResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {cligalResult.error
              ? <><XCircle className="w-4 h-4 shrink-0" /> שגיאת סנכרון: {cligalResult.error}</>
              : <><CheckCircle className="w-4 h-4 shrink-0" /> סנכרון הצליח — נוספו {cligalResult.inserted || 0}, עודכנו {cligalResult.updated || 0} חשבוניות</>
            }
            <button onClick={() => setCligalResult(null)} className="mr-auto text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Monthly P&L mini-panel */}
        {monthExpenses && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">הכנסות החודש (גבייה)</p>
              <p className="text-2xl font-bold text-emerald-700">{fmtMoney(summary?.month_income)}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">הוצאות החודש</p>
              <p className="text-2xl font-bold text-red-700">{fmtMoney(monthExpenses.total)}</p>
              <p className="text-xs text-slate-400 mt-1">{Object.entries(monthExpenses.bySection).slice(0,3).map(([s,v]) => `${s}: ₪${Math.round(v).toLocaleString('he-IL')}`).join(' · ')}</p>
            </div>
            <div className={`border rounded-xl p-4 ${(summary?.month_income || 0) - monthExpenses.total >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <p className="text-xs text-slate-500 mb-1">רווח נקי (הכנסות פחות הוצאות)</p>
              <p className={`text-2xl font-bold ${(summary?.month_income || 0) - monthExpenses.total >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {fmtMoney((summary?.month_income || 0) - monthExpenses.total)}
              </p>
              <Link href="/annual-report" className="text-xs text-slate-400 underline hover:text-slate-600">דוח שנתי מלא ←</Link>
            </div>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="הכנסה היום"
            value={fmtMoney(summary?.today_income)}
            icon={TrendingUp}
            borderColor="border-emerald-400"
            textColor="text-emerald-700"
          />
          <StatCard
            label="הכנסה החודש"
            value={fmtMoney(summary?.month_income)}
            icon={Wallet}
            borderColor="border-sky-400"
            textColor="text-sky-700"
          />
          <StatCard
            label="חשבוניות פתוחות"
            value={fmtMoney(summary?.open_invoices_total)}
            icon={FileText}
            borderColor="border-orange-400"
            textColor="text-orange-700"
            subtext={`${summary?.open_invoices_count || 0} חשבוניות`}
          />
          <StatCard
            label="חשבוניות בפיגור"
            value={fmtMoney(summary?.overdue_total)}
            icon={AlertCircle}
            borderColor="border-red-400"
            textColor="text-red-700"
            subtext={`${summary?.overdue_count || 0} חשבוניות`}
          />
        </div>

        {/* Recent Payments */}
        <div className="bg-white border border-sky-100 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-sky-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-lg">תשלומים אחרונים</h2>
            <span className="text-xs text-slate-400">10 אחרונים</span>
          </div>
          {!summary?.recent_payments?.length ? (
            <div className="p-12 text-center text-slate-400">אין תשלומים עדיין</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-sky-100">
                <tr>
                  <Th>תאריך</Th>
                  <Th>לקוח</Th>
                  <Th>אמצעי תשלום</Th>
                  <Th align="left">סכום</Th>
                </tr>
              </thead>
              <tbody>
                {summary.recent_payments.map((p) => (
                  <tr key={p.id} className="border-b border-sky-50 hover:bg-sky-50/50">
                    <Td>{fmt(p.payment_date)}</Td>
                    <Td className="font-medium">{p.client_name}</Td>
                    <Td className="text-slate-500">{METHOD_LABELS[p.method] || p.method}</Td>
                    <Td align="left" className="font-semibold text-emerald-700">{fmtMoney(p.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Open Invoices */}
        <div className="bg-white border border-sky-100 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-sky-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-lg">חשבוניות פתוחות</h2>
            <Link href="/finance/invoices" className="text-sm text-sky-600 hover:text-sky-800">הצג הכל</Link>
          </div>
          {!openInvoices.length ? (
            <div className="p-12 text-center text-slate-400">אין חשבוניות פתוחות</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-sky-100">
                <tr>
                  <Th>#</Th>
                  <Th>לקוח</Th>
                  <Th>תאריך פירעון</Th>
                  <Th>סטטוס</Th>
                  <Th align="left">סכום</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((inv) => {
                  const isOverdue = inv.due_date && inv.due_date < todayStr;
                  return (
                    <tr key={inv.id} className={`border-b border-sky-50 ${isOverdue ? 'bg-red-50/30' : 'hover:bg-sky-50/50'}`}>
                      <Td className="text-slate-500">{inv.invoice_number || inv.number}</Td>
                      <Td className={`font-medium ${isOverdue ? 'text-red-800' : ''}`}>{inv.client_name}</Td>
                      <Td className={isOverdue ? 'text-red-700 font-semibold' : ''}>{fmt(inv.due_date)}</Td>
                      <Td><StatusBadge status={inv.status} /></Td>
                      <Td align="left" className={`font-semibold ${isOverdue ? 'text-red-700' : ''}`}>{fmtMoney(inv.amount)}</Td>
                      <Td align="left">
                        <div className="flex items-center gap-2 justify-end">
                          <Link href={`/finance/invoices`} className="text-xs text-sky-600 hover:text-sky-800">פרטים</Link>
                          <button
                            onClick={() => setSendModal({ invoice: inv })}
                            className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" /> שלח
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>


        {/* Bank import result */}
        {bankImportResult && (
          <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-3 ${bankImportResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
            {bankImportResult.error
              ? <><XCircle className="w-4 h-4 shrink-0" /> {bankImportResult.error}</>
              : <><CheckCircle className="w-4 h-4 shrink-0" /> יובאו {bankImportResult.imported} תנועות (דולגו {bankImportResult.skipped} כפולות)</>
            }
            <button onClick={() => setBankImportResult(null)} className="mr-auto text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Bank Unmatched Alerts */}
        <div className="bg-white border border-indigo-100 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Landmark className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-slate-800 text-lg">הכנסות בנק ללא חשבונית</h2>
              {bankAlerts.length > 0 && (
                <span className="inline-flex items-center justify-center w-6 h-6 bg-orange-500 text-white text-xs font-bold rounded-full">
                  {bankAlerts.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadBankAlerts}
                disabled={bankAlertsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-indigo-200 text-indigo-700 rounded-md hover:bg-indigo-50 disabled:opacity-50"
              >
                {bankAlertsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                רענן
              </button>
              <button
                onClick={() => { setShowBankImport(true); setBankImportResult(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                <Upload className="w-3.5 h-3.5" /> ייבא CSV
              </button>
            </div>
          </div>

          {bankAlertsLoading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : !bankAlerts.length ? (
            <div className="p-12 text-center text-slate-400">
              <Landmark className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>אין הכנסות בנק ללא חשבונית</p>
              <p className="text-xs mt-1">ייבא דף חשבון בנק (CSV) כדי לזהות הכנסות חסרות חשבוניות</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-indigo-100">
                <tr>
                  <Th>תאריך</Th>
                  <Th>תיאור</Th>
                  <Th>אסמכתא</Th>
                  <Th align="left">סכום</Th>
                  <Th>חשבוניות מוצעות</Th>
                  <Th align="left">פעולה</Th>
                </tr>
              </thead>
              <tbody>
                {bankAlerts.map((alert) => (
                  <tr key={alert.id} className={`border-b border-indigo-50 hover:bg-indigo-50/30 ${!alert.has_match_candidate ? 'bg-orange-50/20' : ''}`}>
                    <Td className="text-slate-500 whitespace-nowrap">{fmt(alert.date)}</Td>
                    <Td>
                      <span className="text-xs text-slate-700 line-clamp-2 max-w-xs block" title={alert.description}>
                        {alert.description?.length > 60 ? alert.description.slice(0, 60) + '...' : (alert.description || '—')}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-400">{alert.reference || '—'}</Td>
                    <Td align="left" className="font-semibold text-emerald-700 whitespace-nowrap">{fmtMoney(alert.amount)}</Td>
                    <Td>
                      {alert.candidate_invoices?.length ? (
                        <div className="flex flex-col gap-1">
                          {alert.candidate_invoices.map((inv) => (
                            <button
                              key={inv.id}
                              onClick={() => handleBankAction(alert.id, 'match', inv.id)}
                              className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100 text-right"
                              title={`קשר לחשבונית ${inv.number}`}
                            >
                              #{inv.number} — {inv.client_name} — {fmtMoney(inv.amount)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded">אין חשבונית מתאימה</span>
                      )}
                    </Td>
                    <Td align="left">
                      <button
                        onClick={() => handleBankAction(alert.id, 'dismiss')}
                        className="text-xs px-2 py-1 border border-slate-200 text-slate-500 rounded hover:bg-slate-50"
                      >
                        התעלם
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* WhatsApp Alerts */}
        <div className="bg-white border border-green-100 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-green-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-green-600" />
              <h2 className="font-semibold text-slate-800 text-lg">התראות WhatsApp - העברות בנקאיות</h2>
              {whatsappAlerts.length > 0 && (
                <span className="inline-flex items-center justify-center w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full">
                  {whatsappAlerts.length}
                </span>
              )}
            </div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {scanning
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              {scanning ? 'סורק...' : 'סרוק עכשיו'}
            </button>
          </div>

          {alertsLoading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : !whatsappAlerts.length ? (
            <div className="p-12 text-center text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>אין התראות ממתינות</p>
              <p className="text-xs mt-1">לחץ "סרוק עכשיו" כדי לסרוק הודעות WhatsApp</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-green-100">
                <tr>
                  <Th>הודעה</Th>
                  <Th>לקוח שזוהה</Th>
                  <Th>סכום</Th>
                  <Th>תאריך</Th>
                  <Th>חשבונית</Th>
                  <Th align="left">פעולה</Th>
                </tr>
              </thead>
              <tbody>
                {whatsappAlerts.map((alert) => (
                  <tr key={alert.id} className={`border-b border-green-50 hover:bg-green-50/30 ${!alert.has_invoice ? 'bg-red-50/20' : ''}`}>
                    <Td>
                      <span className="text-xs text-slate-600 line-clamp-2 max-w-xs block" title={alert.message_text}>
                        {alert.message_text.length > 80
                          ? alert.message_text.slice(0, 80) + '...'
                          : alert.message_text}
                      </span>
                    </Td>
                    <Td className={alert.detected_client ? 'font-medium' : 'text-slate-400 italic'}>
                      {alert.detected_client || 'לא זוהה'}
                    </Td>
                    <Td className="font-semibold text-emerald-700">
                      {alert.detected_amount ? fmtMoney(alert.detected_amount) : '—'}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {fmt(alert.message_timestamp)}
                    </Td>
                    <Td>
                      {alert.has_invoice ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                          <CheckCircle className="w-3 h-3" /> קיימת
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                          <XCircle className="w-3 h-3" /> חסרה
                        </span>
                      )}
                    </Td>
                    <Td align="left">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => updateAlertStatus(alert.id, 'resolved')}
                          className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                          פתור
                        </button>
                        <button
                          onClick={() => updateAlertStatus(alert.id, 'dismissed')}
                          className="text-xs px-2 py-1 border border-slate-200 text-slate-500 rounded hover:bg-slate-50"
                        >
                          התעלם
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showPaymentModal && (
        <PaymentModal
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); loadData(); }}
        />
      )}
      {showBankImport && (
        <BankImportModal
          onClose={() => setShowBankImport(false)}
          onImported={(result) => {
            setBankImportResult(result);
            setShowBankImport(false);
            loadBankAlerts();
          }}
        />
      )}
      {sendModal && (
        <SendInvoiceModal
          invoice={sendModal.invoice}
          onClose={() => setSendModal(null)}
          onSent={() => { setSendModal(null); loadData(); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, borderColor, textColor, subtext }) {
  return (
    <div className={`bg-white border-2 ${borderColor} rounded-xl p-5`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${textColor}`} />
      </div>
      <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
      {subtext && <div className="text-xs text-slate-400 mt-1">{subtext}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft: { label: 'טיוטה', cls: 'bg-slate-100 text-slate-700' },
    sent: { label: 'נשלחה', cls: 'bg-blue-100 text-blue-800' },
    paid: { label: 'שולמה', cls: 'bg-emerald-100 text-emerald-800' },
    overdue: { label: 'פיגור', cls: 'bg-red-100 text-red-800' },
    open: { label: 'פתוחה', cls: 'bg-orange-100 text-orange-800' },
    cancelled: { label: 'בוטלה', cls: 'bg-slate-100 text-slate-500' },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
  return <span className={`text-xs px-2 py-1 rounded ${s.cls}`}>{s.label}</span>;
}

function PaymentModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    method: 'bank_transfer',
    reference: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount) { setError('יש להזין סכום'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      if (!res.ok) throw new Error('שגיאה בשמירה');
      onSaved();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-sky-100 flex items-center justify-between">
          <h3 className="font-semibold text-lg">רישום תשלום</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded">{error}</div>}
          <Field label="סכום (₪)" type="number" value={form.amount} onChange={v => setForm({ ...form, amount: v })} required />
          <Field label="תאריך תשלום" type="date" value={form.payment_date} onChange={v => setForm({ ...form, payment_date: v })} />
          <SelectField
            label="אמצעי תשלום"
            value={form.method}
            onChange={v => setForm({ ...form, method: v })}
            options={[
              { value: 'bank_transfer', label: 'העברה בנקאית' },
              { value: 'check', label: "צ'ק" },
              { value: 'cash', label: 'מזומן' },
              { value: 'credit_card', label: 'כרטיס אשראי' },
            ]}
          />
          <Field label="אסמכתא" value={form.reference} onChange={v => setForm({ ...form, reference: v })} />
          <Field label="הערות" value={form.notes} onChange={v => setForm({ ...form, notes: v })} />
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-emerald-700 text-white rounded-md text-sm disabled:opacity-50">
              {saving ? 'שומר...' : 'שמור תשלום'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-sky-200 text-slate-700 rounded-md text-sm">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1 block">{label}{required && ' *'}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1 block">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function SendInvoiceModal({ invoice, onClose, onSent }) {
  const [method, setMethod] = useState('whatsapp');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/invoices/send-to-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          method,
          phone:  phone  || undefined,
          email:  email  || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) setTimeout(onSent, 1200);
    } catch (e) { setResult({ success: false, errors: [e.message] }); }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" dir="rtl">
        <div className="px-6 py-4 border-b border-sky-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-lg">שלח חשבונית ללקוח</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-slate-700">חשבונית #{invoice.number}</p>
            <p className="text-slate-500">{invoice.client_name} — {`₪${Math.round(Number(invoice.amount) || 0).toLocaleString('he-IL')}`}</p>
          </div>

          {/* Method selector */}
          <div>
            <p className="text-xs text-slate-500 mb-2">שיטת שליחה</p>
            <div className="flex gap-2">
              {[
                { v: 'whatsapp', label: 'WhatsApp', icon: Phone },
                { v: 'email',    label: 'מייל',     icon: Mail },
                { v: 'both',     label: 'שניהם',    icon: Send },
              ].map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  onClick={() => setMethod(v)}
                  className={`flex-1 py-2 text-sm rounded-md border flex items-center justify-center gap-1.5 transition-colors ${
                    method === v
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          {(method === 'whatsapp' || method === 'both') && (
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">מספר טלפון (ללא 0 בהתחלה, כגון 972501234567)</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="972501234567"
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600"
              />
            </label>
          )}

          {(method === 'email' || method === 'both') && (
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">כתובת מייל</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600"
              />
            </label>
          )}

          {result && (
            <div className={`text-sm rounded-lg px-3 py-2 ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {result.success
                ? <><CheckCircle className="w-4 h-4 inline ml-1" /> החשבונית נשלחה בהצלחה!</>
                : result.errors?.join(', ') || 'שגיאה בשליחה'}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> שולח...</> : <><Send className="w-4 h-4" /> שלח עכשיו</>}
            </button>
            <button onClick={onClose} className="px-4 py-2 border border-sky-200 text-slate-700 rounded-md text-sm">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankImportModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('יש לבחור קובץ CSV'); return; }
    setImporting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/bank/import-csv', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה בייבוא');
      onImported(data);
    } catch (e) {
      setError(e.message);
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" dir="rtl">
        <div className="px-6 py-4 border-b border-indigo-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-lg">ייבוא דף חשבון בנק</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <div className="p-6">
          <div className="bg-indigo-50 rounded-lg p-4 text-sm text-indigo-800 mb-4 space-y-1">
            <p className="font-medium">פורמטים נתמכים:</p>
            <ul className="list-disc list-inside text-xs space-y-0.5 text-indigo-700">
              <li>בנק הפועלים — CSV מהאזור האישי</li>
              <li>לאומי — קובץ גיליון תנועות</li>
              <li>דיסקונט / מזרחי טפחות / אוצר החייל</li>
              <li>כל CSV עם עמודות תאריך + זכות/חובה</li>
            </ul>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded">{error}</div>}
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block">בחר קובץ CSV *</span>
              <input
                type="file"
                accept=".csv,.txt,.xls,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-700 file:ml-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </label>
            <p className="text-xs text-slate-400">
              המערכת תזהה אוטומטית את פורמט הבנק, תייבא הכנסות (זיכויים) ותסמן אותן לבדיקה.
              תנועות כפולות ידולגו.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={importing || !file}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> מייבא...</> : <><Upload className="w-4 h-4" /> ייבא</>}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 border border-sky-200 text-slate-700 rounded-md text-sm">ביטול</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const Th = ({ children, align = 'right' }) => (
  <th className={`px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-${align}`}>{children}</th>
);
const Td = ({ children, align = 'right', className = '' }) => (
  <td className={`px-4 py-3 text-sm text-slate-800 text-${align} ${className}`}>{children}</td>
);
