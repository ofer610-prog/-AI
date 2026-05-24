'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search, Loader2, Trash2 } from 'lucide-react';

const fmtMoney = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;
const fmt = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const STATUS_LABELS = {
  draft: { label: 'טיוטה', cls: 'bg-slate-100 text-slate-700' },
  sent: { label: 'נשלחה', cls: 'bg-blue-100 text-blue-800' },
  paid: { label: 'שולמה', cls: 'bg-emerald-100 text-emerald-800' },
  overdue: { label: 'פיגור', cls: 'bg-red-100 text-red-800' },
  open: { label: 'פתוחה', cls: 'bg-orange-100 text-orange-800' },
  cancelled: { label: 'בוטלה', cls: 'bg-slate-100 text-slate-500' },
};

const STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'draft', label: 'טיוטה' },
  { value: 'sent', label: 'נשלחה' },
  { value: 'open', label: 'פתוחה' },
  { value: 'paid', label: 'שולמה' },
  { value: 'overdue', label: 'פיגור' },
  { value: 'cancelled', label: 'בוטלה' },
];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/invoices?${params}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => loadInvoices(), 300);
    return () => clearTimeout(timer);
  }, [loadInvoices]);

  const handleDelete = async (id) => {
    if (!confirm('למחוק את החשבונית?')) return;
    setDeleting(id);
    await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    setDeleting(null);
    loadInvoices();
  };

  const handleStatusChange = async (id, newStatus) => {
    await fetch(`/api/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    loadInvoices();
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div dir="rtl" className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="border-b border-sky-100 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/finance" className="text-slate-400 hover:text-slate-700 text-sm ml-2">← כספים</Link>
            <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-2xl font-bold">חשבוניות</h1>
            {!loading && <span className="text-sm text-slate-400">{invoices.length} חשבוניות</span>}
          </div>
          <Link
            href="/finance/invoices/new"
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md flex items-center gap-2 hover:bg-slate-900"
          >
            <Plus className="w-4 h-4" /> חשבונית חדשה
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Status filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  statusFilter === f.value
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-sky-200 text-slate-600 hover:bg-sky-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חפש לפי לקוח או מספר חשבונית..."
              className="w-full pr-9 pl-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-sky-100 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              {search || statusFilter ? 'לא נמצאו חשבוניות התואמות לחיפוש' : 'אין חשבוניות עדיין'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-sky-100">
                <tr>
                  <Th>#</Th>
                  <Th>לקוח</Th>
                  <Th>תיק</Th>
                  <Th>תאריך הנפקה</Th>
                  <Th>תאריך פירעון</Th>
                  <Th>סטטוס</Th>
                  <Th align="left">סכום</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const isOverdue = inv.due_date && inv.due_date < todayStr && inv.status !== 'paid' && inv.status !== 'cancelled';
                  const s = STATUS_LABELS[inv.status] || { label: inv.status, cls: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={inv.id} className={`border-b border-sky-50 ${isOverdue ? 'bg-red-50/20' : 'hover:bg-sky-50/50'}`}>
                      <Td className="text-slate-500 font-mono text-xs">{inv.invoice_number || inv.number}</Td>
                      <Td className={`font-medium ${isOverdue ? 'text-red-800' : ''}`}>{inv.client_name}</Td>
                      <Td className="text-slate-500 text-xs">{inv.matters?.title || '—'}</Td>
                      <Td className="text-slate-500">{fmt(inv.issue_date)}</Td>
                      <Td className={isOverdue ? 'text-red-700 font-semibold' : ''}>{fmt(inv.due_date)}</Td>
                      <Td>
                        <select
                          value={inv.status}
                          onChange={e => handleStatusChange(inv.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded border-0 cursor-pointer ${s.cls}`}
                        >
                          {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </Td>
                      <Td align="left" className={`font-semibold ${isOverdue ? 'text-red-700' : ''}`}>{fmtMoney(inv.amount)}</Td>
                      <Td align="left">
                        <button
                          onClick={() => handleDelete(inv.id)}
                          disabled={deleting === inv.id}
                          className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                        >
                          {deleting === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

const Th = ({ children, align = 'right' }) => (
  <th className={`px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-${align}`}>{children}</th>
);
const Td = ({ children, align = 'right', className = '' }) => (
  <td className={`px-4 py-3 text-sm text-slate-800 text-${align} ${className}`}>{children}</td>
);
