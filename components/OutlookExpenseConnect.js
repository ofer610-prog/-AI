'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Floating Outlook connection indicator — shown on /annual-report.
 * (On /expenses the unified ExpenseConnections panel handles this instead.)
 * Clicking when disconnected initiates the Microsoft OAuth flow.
 */
export default function OutlookExpenseConnect() {
  const pathname = usePathname() || '';
  const [state, setState] = useState({ loading: true });
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const relevant = pathname.startsWith('/annual-report');

  useEffect(() => {
    if (!relevant) return;
    let active = true;
    fetch('/api/auth/outlook/status', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (active) setState({ loading: false, ...d }); })
      .catch(() => { if (active) setState({ loading: false, connected: false, configured: false }); });
    return () => { active = false; };
  }, [pathname, relevant]);

  if (!relevant) return null;
  // Hide if Microsoft OAuth not configured yet
  if (!state.loading && !state.configured && !state.connected) return null;

  const isConnected = !!state.connected;
  const email = state.email || '';

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/cron/scan-outlook?days=30', { method: 'POST', cache: 'no-store' });
      const data = await res.json();
      setScanResult(data);
    } catch { setScanResult({ error: 'שגיאה בסריקה' }); }
    setScanning(false);
  };

  const handleDisconnect = async () => {
    if (!confirm('לנתק את Outlook?')) return;
    await fetch('/api/auth/outlook/status', { method: 'POST' });
    setState(s => ({ ...s, connected: false, email: null }));
  };

  if (state.loading) return null;

  return (
    <div className="fixed bottom-5 left-5 z-[9990] flex flex-col gap-2 items-start">
      {/* Status chip */}
      {isConnected ? (
        <div className="flex gap-2 items-center">
          <span className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-xl">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Outlook מחובר{email ? `: ${email}` : ''}
          </span>
          <button onClick={handleScan} disabled={scanning}
            className="rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-3 py-2 text-xs font-bold text-white shadow-xl">
            {scanning ? '⏳ סורק…' : '📧 סרוק'}
          </button>
          <button onClick={handleDisconnect}
            className="rounded-2xl bg-slate-600 hover:bg-slate-500 px-3 py-2 text-xs text-white shadow-xl">
            נתק
          </button>
        </div>
      ) : (
        <a href="/api/auth/outlook/connect?return_to=/expenses/receipts">
          <span className="inline-flex items-center gap-2 rounded-2xl bg-blue-800 hover:bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-xl cursor-pointer">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            חבר Outlook / Hotmail
          </span>
        </a>
      )}
      {/* Scan result */}
      {scanResult && (
        <div className={`rounded-xl px-3 py-2 text-xs text-white shadow-lg max-w-xs ${scanResult.error ? 'bg-red-700' : 'bg-emerald-700'}`}>
          {scanResult.error
            ? scanResult.error
            : `נמצאו ${scanResult.found || 0} | יובאו ${scanResult.auto_imported || 0} | לסיווג ${scanResult.pending_review || 0}`}
          <button onClick={() => setScanResult(null)} className="mr-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
