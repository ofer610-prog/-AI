'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search, Loader2, Trash2, Send, X, CheckCircle, AlertCircle } from 'lucide-react';

const fmtMoney = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;
const fmt = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const STATUS_LABELS = {
  draft:     { label: 'טיוטה',  cls: 'bg-slate-100 text-slate-700' },
  sent:      { label: 'נשלחה',  cls: 'bg-blue-100 text-blue-800' },
  paid:      { label: 'שולמה',  cls: 'bg-emerald-100 text-emerald-800' },
  overdue:   { label: 'פיגור',  cls: 'bg-red-100 text-red-800' },
  open:      { label: 'פתוחה',  cls: 'bg-orange-100 text-orange-800' },
  cancelled: { label: 'בוטלה',  cls: 'bg-slate-100 text-slate-500' },
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
  const [invoices, setInvoices]     = useState([]);
  const [lawyers, setLawyers]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]         = useState('');
  const [lawyerFilter, setLawyerFilter] = useState('');
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [deleting, setDeleting]     = useState(null);
  const [sendTarget, setSendTarget] = useState(null); // invoice being sent

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search)       params.set('search', search);
      if (lawyerFilter) params.set('lawyer_id', lawyerFilter);
      if (fromDate)     params.set('from', fromDate);
      if (toDate)       params.set('to', toDate);
      const res = await fetch(`/api/invoices?${params}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
      if (data.lawyers?.length) setLawyers(data.lawyers);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [statusFilter, search, lawyerFilter, fromDate, toDate]);

  useEffect(() => {
    const t = setTimeout(() => loadInvoices(), 300);
    return () => clearTimeout(t);
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
      <header className="border-b border-sky-100 bg-white sticky top-12 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/finance" className="text-slate-400 hover:text-slate-700 text-sm ml-2">← כספים</Link>
            <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-2xl font-bold">חשבוניות</h1>
            {!loading && <span className="text-sm text-slate-400">{invoices.length} חשבוניות</span>}
          </div>
          <Link href="/finance/invoices/new"
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md flex items-center gap-2 hover:bg-slate-900">
            <Plus className="w-4 h-4" /> חשבונית חדשה
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  statusFilter === f.value ? 'bg-slate-800 text-white' : 'bg-white border border-sky-200 text-slate-600 hover:bg-sky-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חפש לפי לקוח, מספר חשבונית או תיאור..."
              className="w-full pr-9 pl-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600" />
          </div>
        </div>

        {/* Advanced filters */}
        <div className="flex flex-wrap gap-3 items-center bg-white border border-sky-100 rounded-xl px-4 py-3">
          <span className="text-xs font-semibold text-slate-500">סינון מתקדם:</span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">עו"ד מטפל</label>
            <select value={lawyerFilter} onChange={e => setLawyerFilter(e.target.value)}
              className="border border-sky-200 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-sky-600">
              <option value="">— הכל —</option>
              {lawyers.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">מתאריך</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="border border-sky-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-sky-600" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">עד תאריך</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="border border-sky-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-sky-600" />
          </div>
          {(lawyerFilter || fromDate || toDate || statusFilter || search) && (
            <button onClick={() => { setLawyerFilter(''); setFromDate(''); setToDate(''); setStatusFilter(''); setSearch(''); }}
              className="text-xs text-red-500 hover:text-red-700 underline mr-auto">
              ✕ נקה סינון
            </button>
          )}
          {!loading && (
            <span className="text-xs text-slate-400 mr-auto">
              {invoices.length} תוצאות · {fmtMoney(invoices.reduce((s, i) => s + Number(i.amount || 0), 0))}
            </span>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-sky-100 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              {search || statusFilter ? 'לא נמצאו חשבוניות התואמות לחיפוש' : 'אין חשבוניות עדיין'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-sky-100">
                <tr>
                  <Th>#</Th><Th>לקוח</Th><Th>בעבור</Th><Th>תיק / עו"ד</Th>
                  <Th>הנפקה</Th><Th>פירעון</Th><Th>סטטוס</Th>
                  <Th align="left">סכום</Th><Th align="left">פעולות</Th>
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
                      <Td className="text-slate-600 text-xs max-w-[260px]">
                        <span className="line-clamp-2" title={inv.notes || ''}>{inv.notes || '—'}</span>
                      </Td>
                      <Td className="text-slate-500 text-xs">
                        {inv.matters?.title || '—'}
                        {inv.matters?.responsible_lawyer_id && (
                          <div className="text-sky-600">{lawyers.find(l => l.id === inv.matters.responsible_lawyer_id)?.full_name || ''}</div>
                        )}
                      </Td>
                      <Td className="text-slate-500">{fmt(inv.issue_date)}</Td>
                      <Td className={isOverdue ? 'text-red-700 font-semibold' : ''}>{fmt(inv.due_date)}</Td>
                      <Td>
                        <select value={inv.status} onChange={e => handleStatusChange(inv.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded border-0 cursor-pointer ${s.cls}`}>
                          {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </Td>
                      <Td align="left" className={`font-semibold ${isOverdue ? 'text-red-700' : ''}`}>{fmtMoney(inv.amount)}</Td>
                      <Td align="left">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSendTarget(inv)} title="שלח ללקוח"
                            className="text-slate-400 hover:text-blue-600 transition-colors">
                            <Send className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(inv.id)} disabled={deleting === inv.id}
                            title="מחק" className="text-slate-400 hover:text-red-600 disabled:opacity-30">
                            {deleting === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
      </main>

      {/* Send modal */}
      {sendTarget && (
        <SendModal
          invoice={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={() => { setSendTarget(null); loadInvoices(); }}
        />
      )}
    </div>
  );
}

// ─── Send modal ───────────────────────────────────────────────────────────────

function SendModal({ invoice, onClose, onSent }) {
  const [method, setMethod]   = useState('whatsapp');
  const [phone, setPhone]     = useState(invoice.clients?.phone || '');
  const [email, setEmail]     = useState(invoice.clients?.email || invoice.client_email || '');
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null); // { ok, errors, results }

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/invoices/send-to-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          method,
          phone:  phone.trim() || undefined,
          email:  email.trim() || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) setTimeout(onSent, 1800);
    } catch (e) {
      setResult({ success: false, errors: [e.message] });
    }
    setSending(false);
  };

  const needsPhone = method === 'whatsapp' || method === 'both';
  const needsEmail = method === 'email'    || method === 'both';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" dir="rtl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-lg">📤 שליחת חשבונית ללקוח</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              חשבונית #{invoice.invoice_number || invoice.number} · {invoice.client_name} · {fmtMoney(invoice.amount)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Method selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">אמצעי שליחה</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'whatsapp', icon: '💬', label: 'WhatsApp' },
                { val: 'email',    icon: '📧', label: 'מייל' },
                { val: 'both',     icon: '📤', label: 'שניהם' },
              ].map(m => (
                <button key={m.val} onClick={() => setMethod(m.val)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    method === m.val
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}>
                  <span className="text-xl">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Phone field */}
          {needsPhone && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                מספר טלפון <span className="text-slate-400 font-normal">(כולל קידומת מדינה: 972...)</span>
              </label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="0501234567 או 972501234567"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              {needsPhone && !phone.trim() && (
                <p className="text-xs text-amber-600 mt-1">⚠ לא נמצא טלפון ללקוח — הזן ידנית</p>
              )}
            </div>
          )}

          {/* Email field */}
          {needsEmail && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">כתובת מייל</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              {needsEmail && !email.trim() && (
                <p className="text-xs text-amber-600 mt-1">⚠ לא נמצא מייל ללקוח — הזן ידנית</p>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-xl px-4 py-3 text-sm ${result.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              {result.success ? (
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle className="w-4 h-4" /> נשלח בהצלחה!
                  {result.results?.whatsapp === 'sent' && <span>✓ WhatsApp</span>}
                  {result.results?.email === 'sent'    && <span>✓ מייל</span>}
                </div>
              ) : (
                <div className="text-red-700">
                  <div className="flex items-center gap-2 font-medium mb-1">
                    <AlertCircle className="w-4 h-4" /> שגיאה בשליחה
                  </div>
                  {(result.errors || []).map((e, i) => <div key={i} className="text-xs">{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">ביטול</button>
          <button onClick={send} disabled={sending || Boolean(result?.success)}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'שולח...' : 'שלח'}
          </button>
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
