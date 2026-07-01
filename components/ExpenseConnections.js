'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Unified mailbox-connection panel for the expenses page.
 * Replaces the scattered floating widgets — shows Gmail + Hotmail/Outlook
 * connection status side by side with connect / reconnect / scan actions.
 *
 * Gmail scanning is delegated to the page (which renders the suggestions
 * panel) via the onScanGmail callback; Outlook scanning is handled here.
 *
 * All OAuth links carry return_to=/expenses so the user lands back here.
 */
const RETURN_TO = '/expenses';

export default function ExpenseConnections({ onScanGmail, scanningGmail = false }) {
  const [gmail, setGmail]     = useState({ loading: true });
  const [outlook, setOutlook] = useState({ loading: true });
  const [outlookScanning, setOutlookScanning] = useState(false);
  const [outlookResult, setOutlookResult]     = useState(null);

  const loadGmail = useCallback(() => {
    fetch('/api/auth/google/status', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setGmail({ loading: false, ...d }))
      .catch(() => setGmail({ loading: false, usable: false }));
  }, []);

  const loadOutlook = useCallback(() => {
    fetch('/api/auth/outlook/status', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setOutlook({ loading: false, ...d }))
      .catch(() => setOutlook({ loading: false, connected: false, configured: false }));
  }, []);

  useEffect(() => { loadGmail(); loadOutlook(); }, [loadGmail, loadOutlook]);

  // Reflect ?connected / ?outlook_connected / ?*_error params after OAuth redirect
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has('connected') || p.has('gmail_error')) loadGmail();
    if (p.has('outlook_connected') || p.has('outlook_error')) loadOutlook();
  }, [loadGmail, loadOutlook]);

  const scanOutlook = async () => {
    setOutlookScanning(true); setOutlookResult(null);
    try {
      const res = await fetch('/api/cron/scan-outlook?days=30', { method: 'POST', cache: 'no-store' });
      const d = await res.json();
      setOutlookResult(res.ok
        ? { ok: true, text: `נמצאו ${d.found || 0} · יובאו ${d.auto_imported || 0} · לסיווג ${d.pending_review || 0}` }
        : { error: d.error || 'שגיאה בסריקה' });
    } catch { setOutlookResult({ error: 'שגיאת רשת' }); }
    setOutlookScanning(false);
  };

  const disconnectOutlook = async () => {
    if (!confirm('לנתק את Outlook / Hotmail?')) return;
    await fetch('/api/auth/outlook/status', { method: 'POST' }).catch(() => {});
    setOutlook(s => ({ ...s, connected: false, email: null }));
  };

  // ── Gmail row state ──
  const gLoading = gmail.loading;
  const gOk      = !!gmail.usable;
  const gLabel   = gLoading ? 'בודק…' : gOk ? `Gmail מחובר${gmail.gmail_email ? `: ${gmail.gmail_email}` : ''}` : 'Gmail לא מחובר';

  // ── Outlook row state ──
  const oLoading    = outlook.loading;
  const oConfigured = !!outlook.configured || !!outlook.connected;
  const oOk         = !!outlook.connected;
  const oLabel      = oLoading ? 'בודק…'
    : !oConfigured ? 'Hotmail לא מוגדר בשרת'
    : oOk ? `Hotmail מחובר${outlook.email ? `: ${outlook.email}` : ''}` : 'Hotmail לא מחובר';

  const chip = (ok, loading) =>
    `h-2.5 w-2.5 rounded-full ${loading ? 'bg-slate-300' : ok ? 'bg-emerald-400' : 'bg-red-400'}`;

  return (
    <div dir="rtl" className="bg-slate-800 rounded-xl px-4 py-3 flex flex-col gap-2 text-sm">
      {/* ── Gmail ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 font-bold text-white min-w-[220px]">
          <span className={chip(gOk, gLoading)} />
          📧 {gLabel}
        </span>
        <a href={`/api/auth/google/connect?return_to=${RETURN_TO}`}
          className="rounded-lg bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 text-xs whitespace-nowrap">
          {gOk ? 'חיבור מחדש' : '🔗 חבר Gmail'}
        </a>
        <button onClick={onScanGmail} disabled={scanningGmail || !gOk}
          className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-3 py-1.5 text-xs whitespace-nowrap">
          {scanningGmail ? '⏳ סורק…' : '📥 סרוק Gmail'}
        </button>
      </div>

      {/* ── Hotmail / Outlook ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 font-bold text-white min-w-[220px]">
          <span className={chip(oOk, oLoading)} />
          📨 {oLabel}
        </span>
        {oConfigured ? (
          <>
            <a href={`/api/auth/outlook/connect?return_to=${RETURN_TO}`}
              className="rounded-lg bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 text-xs whitespace-nowrap">
              {oOk ? 'חיבור מחדש' : '🔗 חבר Hotmail'}
            </a>
            <button onClick={scanOutlook} disabled={outlookScanning || !oOk}
              className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 text-xs whitespace-nowrap">
              {outlookScanning ? '⏳ סורק…' : '📥 סרוק Hotmail'}
            </button>
            {oOk && (
              <button onClick={disconnectOutlook}
                className="rounded-lg bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 text-xs">
                נתק
              </button>
            )}
          </>
        ) : (
          <span className="text-xs text-slate-400">
            יש להגדיר MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET בסביבה כדי לאפשר חיבור Hotmail
          </span>
        )}
      </div>

      {/* ── Outlook scan result ── */}
      {outlookResult && (
        <div className={`rounded-lg px-3 py-1.5 text-xs text-white ${outlookResult.error ? 'bg-red-700' : 'bg-emerald-700'}`}>
          {outlookResult.error || outlookResult.text}
          <button onClick={() => setOutlookResult(null)} className="mr-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
