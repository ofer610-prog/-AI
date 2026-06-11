'use client';

import { useState, useEffect } from 'react';

/**
 * PIN gate for the protected office-management area (finance, collections,
 * expenses, command center). Verifies against the org PIN server-side and
 * remembers the unlock for the browser session only.
 */
const GATE_KEY = 'office_gate_ok';

export default function PinGate({ children, title = 'אזור ניהול משרד' }) {
  const [unlocked, setUnlocked] = useState(null); // null = checking
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUnlocked(sessionStorage.getItem(GATE_KEY) === '1');
  }, []);

  const submit = async (e) => {
    e?.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/cases/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        sessionStorage.setItem(GATE_KEY, '1');
        setUnlocked(true);
      } else {
        setError(j.error || 'קוד שגוי');
        setPin('');
      }
    } catch {
      setError('שגיאת רשת — נסה שוב');
    } finally {
      setBusy(false);
    }
  };

  if (unlocked === null) return null;
  if (unlocked) return children;

  return (
    <div dir="rtl" className="min-h-[70vh] flex items-center justify-center px-4 bg-cream-50">
      <form onSubmit={submit} className="bg-white border border-sky-100 rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="text-5xl mb-3">🔐</div>
        <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-2xl font-bold mb-1">{title}</h1>
        <p className="text-sm text-slate-500 mb-6">אזור מוגן — הזן קוד גישה כדי להמשיך</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          maxLength={8}
          placeholder="••••"
          className="w-full text-center text-2xl tracking-[0.5em] border border-slate-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-sky-500"
          dir="ltr"
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !pin}
          className="w-full bg-slate-900 text-white rounded-lg py-3 font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {busy ? 'בודק…' : 'כניסה'}
        </button>
      </form>
    </div>
  );
}
