'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Unified mailbox-connection panel for the expenses pages.
 *
 * The office scans TWO Gmail inboxes by the same credit-card last-4 rule:
 *   - primary  (slot 1) — the office mailbox
 *   - second   (slot 2) — a dedicated invoices mailbox
 * Hotmail/Outlook scanning has been retired, so it is not shown here.
 *
 * Gmail scanning is delegated to the page (which renders results/suggestions)
 * via the optional onScanGmail callback; that scan covers both mailboxes.
 *
 * All OAuth links carry return_to so the user lands back on the page they
 * started from (defaults to /expenses; the receipts page passes its own).
 */
export default function ExpenseConnections({ onScanGmail, scanningGmail = false, returnTo = '/expenses' }) {
  const RETURN_TO = encodeURIComponent(returnTo);
  const [gmail, setGmail] = useState({ loading: true });

  const loadGmail = useCallback(() => {
    fetch('/api/auth/google/status', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setGmail({ loading: false, ...d }))
      .catch(() => setGmail({ loading: false, usable: false, second: {} }));
  }, []);

  useEffect(() => { loadGmail(); }, [loadGmail]);

  // Reflect ?connected / ?gmail_error params after the OAuth redirect
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has('connected') || p.has('gmail_error')) loadGmail();
  }, [loadGmail]);

  const chip = (ok, loading) =>
    `h-2.5 w-2.5 rounded-full ${loading ? 'bg-slate-300' : ok ? 'bg-emerald-400' : 'bg-red-400'}`;

  const loading = gmail.loading;
  const p = { ok: !!gmail.usable, email: gmail.gmail_email };
  const s = { ok: !!gmail.second?.usable, email: gmail.second?.gmail_email, hasToken: !!gmail.second?.has_refresh_token };

  const Row = ({ icon, title, ok, email, slot }) => {
    const label = loading ? 'בודק…'
      : ok ? `${title} מחובר${email ? `: ${email}` : ''}`
      : `${title} לא מחובר`;
    const href = `/api/auth/google/connect?return_to=${RETURN_TO}${slot === 2 ? '&slot=2' : ''}`;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 font-bold text-white min-w-[240px]">
          <span className={chip(ok, loading)} />
          {icon} {label}
        </span>
        <a href={href}
          className="rounded-lg bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 text-xs whitespace-nowrap">
          {ok ? 'חיבור מחדש' : `🔗 חבר ${title}`}
        </a>
      </div>
    );
  };

  return (
    <div dir="rtl" className="bg-slate-800 rounded-xl px-4 py-3 flex flex-col gap-2 text-sm">
      <Row icon="📧" title="Gmail משרד" ok={p.ok} email={p.email} slot={1} />
      <Row icon="🧾" title="Gmail חשבוניות" ok={s.ok} email={s.email} slot={2} />

      {onScanGmail && (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={onScanGmail} disabled={scanningGmail || (!p.ok && !s.ok)}
            className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-3 py-1.5 text-xs whitespace-nowrap">
            {scanningGmail ? '⏳ סורק…' : '📥 סרוק שתי התיבות'}
          </button>
          <span className="text-[11px] text-slate-400">הסריקה עוברת על שתי תיבות ה-Gmail לפי מספרי כרטיס האשראי</span>
        </div>
      )}
    </div>
  );
}
