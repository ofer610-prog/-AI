'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp, Wallet, FileText, AlertCircle, Plus, CreditCard, Loader2,
} from 'lucide-react';

const fmtMoney = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;
const fmt = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

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
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

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
      <header className="border-b border-sky-100 bg-white sticky top-0 z-30">
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
                        <Link href={`/finance/invoices`} className="text-xs text-sky-600 hover:text-sky-800">פרטים</Link>
                      </Td>
                    </tr>
                  );
                })}
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

const Th = ({ children, align = 'right' }) => (
  <th className={`px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-${align}`}>{children}</th>
);
const Td = ({ children, align = 'right', className = '' }) => (
  <td className={`px-4 py-3 text-sm text-slate-800 text-${align} ${className}`}>{children}</td>
);
