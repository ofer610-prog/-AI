'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const fmtMoney = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;

const emptyItem = () => ({ id: Date.now(), description: '', quantity: '1', unit_price: '' });

export default function NewInvoicePage() {
  const router = useRouter();
  const supabase = createClient();

  const [clients, setClients] = useState([]);
  const [matters, setMatters] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    client_id: '',
    matter_id: '',
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    vat_rate: 18,
    notes: '',
  });

  const [items, setItems] = useState([emptyItem()]);

  useEffect(() => {
    (async () => {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (!org) return;

      const [{ data: c }, { data: m }] = await Promise.all([
        supabase.from('clients').select('id, name').eq('organization_id', org.id).order('name'),
        supabase.from('matters').select('id, title, client_id').eq('organization_id', org.id).order('title'),
      ]);
      setClients(c || []);
      setMatters(m || []);
    })();
  }, []);

  // Filtered matters by selected client
  const filteredMatters = form.client_id
    ? matters.filter(m => m.client_id === form.client_id)
    : matters;

  // Calculate totals
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  }, 0);
  const vatAmount = Math.round(subtotal * form.vat_rate) / 100;
  const total = subtotal + vatAmount;

  const setItem = (id, field, value) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (id) => setItems(prev => prev.filter(item => item.id !== id));

  const handleSave = async (status) => {
    setError('');
    if (!form.client_id) { setError('יש לבחור לקוח'); return; }
    if (items.every(i => !i.description)) { setError('יש להוסיף לפחות שורת פריט אחת'); return; }

    setSaving(true);
    try {
      const client = clients.find(c => c.id === form.client_id);
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          client_name: client?.name || '',
          subtotal,
          vat_amount: vatAmount,
          status,
          items: items.filter(i => i.description),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'שגיאה בשמירה');
      }
      router.push('/finance/invoices');
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="border-b border-sky-100 bg-white sticky top-12 z-30">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/finance/invoices" className="text-slate-400 hover:text-slate-700 text-sm ml-2">← חשבוניות</Link>
            <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-2xl font-bold">חשבונית חדשה</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSave('draft')}
              disabled={saving}
              className="px-4 py-2 border border-sky-300 text-slate-700 text-sm rounded-md hover:bg-sky-50 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'שמור טיוטה'}
            </button>
            <button
              onClick={() => handleSave('sent')}
              disabled={saving}
              className="px-4 py-2 bg-slate-800 text-white text-sm rounded-md hover:bg-slate-900 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'הפק חשבונית'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        {/* Client & Matter */}
        <div className="bg-white border border-sky-100 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-slate-800 text-base border-b border-sky-100 pb-3">פרטי לקוח ותיק</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectField
              label="לקוח *"
              value={form.client_id}
              onChange={v => setForm({ ...form, client_id: v, matter_id: '' })}
              options={[{ value: '', label: '— בחר לקוח —' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
            />
            <SelectField
              label="תיק"
              value={form.matter_id}
              onChange={v => setForm({ ...form, matter_id: v })}
              options={[
                { value: '', label: '— ללא תיק —' },
                ...filteredMatters.map(m => ({ value: m.id, label: m.title })),
              ]}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="bg-white border border-sky-100 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-slate-800 text-base border-b border-sky-100 pb-3">תאריכים</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field
              label="תאריך הנפקה"
              type="date"
              value={form.issue_date}
              onChange={v => setForm({ ...form, issue_date: v })}
            />
            <Field
              label="תאריך פירעון"
              type="date"
              value={form.due_date}
              onChange={v => setForm({ ...form, due_date: v })}
            />
            <Field
              label="שיעור מע״מ (%)"
              type="number"
              value={form.vat_rate}
              onChange={v => setForm({ ...form, vat_rate: Number(v) || 0 })}
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white border border-sky-100 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-slate-800 text-base border-b border-sky-100 pb-3">פריטים</h2>

          <div className="space-y-2">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 text-xs text-slate-500 px-1">
              <div className="col-span-6">תיאור</div>
              <div className="col-span-2 text-left">כמות</div>
              <div className="col-span-2 text-left">מחיר יחידה</div>
              <div className="col-span-1 text-left">סה״כ</div>
              <div className="col-span-1"></div>
            </div>

            {items.map((item) => {
              const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
              return (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => setItem(item.id, 'description', e.target.value)}
                      placeholder="תיאור השירות / הפריט"
                      className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => setItem(item.id, 'quantity', e.target.value)}
                      min="0"
                      step="0.5"
                      className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={e => setItem(item.id, 'unit_price', e.target.value)}
                      min="0"
                      placeholder="₪"
                      className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div className="col-span-1 text-sm font-medium text-slate-700 text-left">
                    {fmtMoney(lineTotal)}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={addItem}
            className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-800 mt-2"
          >
            <Plus className="w-4 h-4" /> הוסף שורה
          </button>

          {/* Totals */}
          <div className="border-t border-sky-100 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">סכום לפני מע״מ</span>
              <span className="font-medium">{fmtMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">מע״מ ({form.vat_rate}%)</span>
              <span className="font-medium">{fmtMoney(vatAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-sky-100 pt-2">
              <span>סה״כ לתשלום</span>
              <span className="text-sky-700">{fmtMoney(total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-sky-100 rounded-xl p-6">
          <h2 className="font-semibold text-slate-800 text-base border-b border-sky-100 pb-3 mb-4">הערות</h2>
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={3}
            placeholder="הערות נוספות לחשבונית..."
            className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600 resize-none"
          />
        </div>

        {/* Action buttons (bottom) */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-6 py-3 border border-sky-300 text-slate-700 rounded-lg hover:bg-sky-50 disabled:opacity-50"
          >
            שמור טיוטה
          </button>
          <button
            onClick={() => handleSave('sent')}
            disabled={saving}
            className="px-6 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            הפק חשבונית
          </button>
          <Link
            href="/finance/invoices"
            className="px-6 py-3 text-slate-500 hover:text-slate-800"
          >
            ביטול
          </Link>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1 block">{label}</span>
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
        className="w-full px-3 py-2 border border-sky-200 rounded-md text-sm focus:outline-none focus:border-sky-600 bg-white"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
