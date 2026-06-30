'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function GoogleExpenseConnect() {
  const pathname = usePathname() || '';
  const [state, setState] = useState({ loading: true, usable: false });

  useEffect(() => {
    if (!pathname.startsWith('/expenses')) return;
    let active = true;
    fetch('/api/auth/google/status', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (active) setState({ loading: false, usable: !!data.usable, email: data.gmail_email || '' });
      })
      .catch(() => {
        if (active) setState({ loading: false, usable: false, email: '' });
      });
    return () => { active = false; };
  }, [pathname]);

  if (!pathname.startsWith('/expenses')) return null;

  const isOk = !!state.usable;
  const text = state.loading ? 'בודק חיבור Google' : isOk ? 'Google מחובר' : 'Google לא מחובר';
  const color = state.loading ? 'bg-slate-600' : isOk ? 'bg-emerald-600' : 'bg-red-600';
  // גם כשמחובר — מאפשרים חיבור מחדש (טוקן עלול לפוג תוקף בלי לעדכן את הסטטוס)
  const hint = state.loading ? '' : isOk ? 'לחץ לחיבור מחדש' : 'לחץ לחיבור';

  const body = (
    <span dir="rtl" className={`inline-flex flex-col items-center gap-0.5 rounded-2xl ${color} px-6 py-2.5 text-base font-extrabold text-white shadow-2xl ring-2 ring-white min-w-[230px] justify-center`}>
      <span className="inline-flex items-center gap-3">
        <span className="h-4 w-4 rounded-full bg-white" />
        <span>{text}</span>
      </span>
      {hint && <span className="text-[11px] font-medium opacity-90">{hint}</span>}
    </span>
  );

  return (
    <div className="fixed top-16 left-1/2 z-[9999] -translate-x-1/2 sm:top-4 sm:left-5 sm:translate-x-0">
      {state.loading ? body : (
        <a href="/api/auth/google/connect?return_to=/expenses/receipts">
          {body}
        </a>
      )}
    </div>
  );
}
