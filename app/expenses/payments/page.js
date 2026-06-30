'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Page() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const res = await fetch(`/api/expenses/payment-events?year=${year}`);
    const data = await res.json();
    setRows(data.events || []);
  }

  useEffect(() => { load(); }, [year]);

  async function submit() {
    setBusy(true);
    const res = await fetch('/api/expenses/payment-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Imported ${data.imported?.length || 0}` : (data.error || 'Error'));
    if (res.ok) setText('');
    await load();
    setBusy(false);
  }

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const missing = rows.filter(r => r.match_status === 'missing_document').length;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-20">
      <header className="sticky top-0 z-40 bg-slate-900 text-white p-4">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <Link href="/expenses" className="text-slate-300 text-sm">Back</Link>
          <h1 className="font-bold text-xl">Payment Events</h1>
          <div className="flex-1" />
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-slate-700 rounded-xl px-2 py-1">
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <section className="bg-white rounded-3xl border p-4">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={7} placeholder="Paste text rows here" className="w-full border rounded-2xl p-3 text-sm" />
          <button onClick={submit} disabled={busy || !text.trim()} className="mt-3 w-full bg-sky-600 text-white rounded-2xl py-3 font-semibold disabled:opacity-50">
            {busy ? 'Importing...' : 'Import'}
          </button>
          {message && <div className="mt-3 text-sm text-slate-600">{message}</div>}
        </section>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-3xl border p-4 text-center"><div className="text-xs">Total</div><div className="text-xl font-bold">{total.toLocaleString('he-IL')}</div></div>
          <div className="bg-white rounded-3xl border p-4 text-center"><div className="text-xs">Missing</div><div className="text-xl font-bold">{missing}</div></div>
        </div>
        <section className="space-y-3">
          {rows.map(r => <div key={r.id} className="bg-white rounded-2xl border p-4">
            <div className="flex gap-3"><div className="flex-1"><div className="font-bold">{r.merchant_name}</div><div className="text-sm text-slate-500">{r.event_date} · {r.category || '-'}</div></div><div className="font-bold">{Number(r.amount || 0).toLocaleString('he-IL')}</div></div>
            <div className="mt-2 text-xs rounded-full border px-3 py-1 inline-block">{r.match_status}</div>
          </div>)}
        </section>
      </main>
    </div>
  );
}
