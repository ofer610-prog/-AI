'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Global navigation — a single slim bar shown on every page.
 * Employees see only operational sections; the protected office-management
 * area (finance, collections, expenses, command) appears only for admins
 * and is PIN-gated on entry.
 */
const NAV_ITEMS = [
  { href: '/cases',        label: 'תיקים',        icon: '📁' },
  { href: '/tasks',        label: 'משימות',       icon: '✅' },
  { href: '/calendar',     label: 'יומן',         icon: '📅' },
  { href: '/my-schedule',  label: 'הלוז שלי',     icon: '🗓️' },
  { href: '/time',         label: 'שעות',         icon: '⏱' },
  { href: '/expense-docs', label: 'צירוף הוצאה',  icon: '🧾' },
  { href: '/dashboard',    label: 'המשרד שלי',    icon: '💼' },
];

export default function AppNav() {
  const pathname = usePathname();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.profile) setProfile(j.profile); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!pathname || pathname === '/login' || pathname === '/') return null;

  const isAdmin = profile && ['admin', 'accountant'].includes(profile.role);
  const isActive = (href) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav dir="rtl" className="sticky top-0 z-40 bg-slate-900 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 h-12 overflow-x-auto">
        <span className="text-sm font-bold ml-3 whitespace-nowrap hidden sm:inline" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
          ⚖️ ספרי משרד
        </span>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
              isActive(item.href)
                ? 'bg-sky-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <span className="ml-1">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <div className="flex gap-1 mr-auto">
            <Link href="/collection"
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border ${
                isActive('/collection')
                  ? 'bg-rose-500 border-rose-400 text-white font-bold'
                  : 'border-rose-500/60 text-rose-300 hover:bg-rose-500 hover:text-white'
              }`}>
              💰 גבייה
            </Link>
            <Link href="/expenses"
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border ${
                isActive('/expenses')
                  ? 'bg-emerald-500 border-emerald-400 text-white font-bold'
                  : 'border-emerald-500/60 text-emerald-300 hover:bg-emerald-500 hover:text-white'
              }`}>
              💸 הוצאות
            </Link>
            <Link href="/tax"
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border ${
                isActive('/tax')
                  ? 'bg-teal-500 border-teal-400 text-white font-bold'
                  : 'border-teal-500/60 text-teal-300 hover:bg-teal-500 hover:text-white'
              }`}>
              📅 מס
            </Link>
            <Link href="/command"
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border ${
                isActive('/command') || isActive('/finance') || isActive('/expenses')
                  ? 'bg-amber-500 border-amber-400 text-slate-900 font-bold'
                  : 'border-amber-500/60 text-amber-300 hover:bg-amber-500 hover:text-slate-900'
              }`}>
              🔐 ניהול משרד
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
