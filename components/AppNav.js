'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Global navigation — קיבוץ פעולות לכפתורים מרכזיים עם תפריטים נפתחים.
 */

const HOME = { href: '/', label: 'בית', icon: '🏠' };
const QUICK = { href: '/expense-docs', label: 'צירוף הוצאה', icon: '🧾' };
const OFFICE = { href: '/dashboard', label: 'המשרד שלי', icon: '💼' };

const CASES_GROUP = {
  label: 'ניהול תיקים', icon: '📁', match: ['/cases', '/tasks', '/calendar', '/my-schedule', '/time'],
  items: [
    { href: '/cases',       label: 'תיקים',      icon: '📁' },
    { href: '/tasks',       label: 'משימות',     icon: '✅' },
    { href: '/calendar',    label: 'יומן',       icon: '📅' },
    { href: '/my-schedule', label: 'הלוז שלי',   icon: '🗓️' },
    { href: '/time',        label: 'שעות',       icon: '⏱' },
  ],
};

const ACCOUNTING_GROUP = {
  label: 'הנהלת חשבונות', icon: '📊',
  match: ['/finance', '/expenses', '/bank-import', '/bank-hapoalim', '/credit-charges', '/collection', '/tax', '/annual-report', '/command'],
  items: [
    { href: '/finance',           label: 'הכנסות',             icon: '📈' },
    { href: '/expenses/receipts', label: 'הוצאות וחשבוניות',   icon: '💸' },
    { href: '/bank-import',       label: 'בדיקת חשבונות עו״ש', icon: '🏦' },
    { href: '/credit-charges',    label: 'ניתוח אשראי',        icon: '💳' },
    { href: '/collection',        label: 'גבייה',              icon: '💰' },
    { href: '/expenses/library',  label: 'ספרייה',             icon: '📚' },
    { href: '/tax',               label: 'מס',                 icon: '📅' },
    { href: '/annual-report',     label: 'דוח שנתי',           icon: '📊' },
  ],
};

export default function AppNav() {
  const pathname = usePathname();
  const [profile, setProfile] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.profile) setProfile(j.profile); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setOpenMenu(null); }, [pathname]);
  useEffect(() => {
    const onClick = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!pathname || pathname === '/login') return null;

  const isAdmin = profile && ['admin', 'accountant'].includes(profile.role);
  const isActive = (href) => pathname === href || pathname.startsWith(href + '/');
  const groupActive = (m) => m.some((h) => isActive(h));

  const directCls = (href) =>
    `px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
      isActive(href) ? 'bg-sky-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`;

  const Dropdown = ({ id, group, accent, align = 'right' }) => {
    const active = groupActive(group.match);
    const open = openMenu === id;
    return (
      <div className="relative shrink-0">
        <button
          onClick={() => setOpenMenu(open ? null : id)}
          className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border flex items-center gap-1 ${
            active || open ? accent.active : accent.idle
          }`}
        >
          <span>{group.icon}</span>
          {group.label}
          <span className="text-[10px] opacity-70">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-2 w-64 max-h-[75vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-[9999] text-slate-800`}>
            {group.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpenMenu(null)}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                  isActive(it.href) ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-base w-5 text-center">{it.icon}</span>
                <span className="whitespace-nowrap">{it.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav dir="rtl" ref={navRef} className="sticky top-0 z-[9000] bg-slate-900 text-white shadow-md overflow-visible">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-1.5 min-h-12 overflow-visible">
        <span className="text-sm font-bold ml-2 whitespace-nowrap hidden sm:inline" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
          ⚖️ ספרי משרד
        </span>

        <Link href={HOME.href} className={directCls(HOME.href)}>
          <span className="ml-1">{HOME.icon}</span>{HOME.label}
        </Link>

        <Dropdown
          id="cases"
          group={CASES_GROUP}
          accent={{
            idle: 'border-sky-500/60 text-sky-300 hover:bg-sky-600 hover:text-white',
            active: 'bg-sky-600 border-sky-400 text-white font-bold',
          }}
        />

        <Link href={QUICK.href} className={directCls(QUICK.href)}>
          <span className="ml-1">{QUICK.icon}</span>{QUICK.label}
        </Link>

        <Link href={OFFICE.href} className={directCls(OFFICE.href)}>
          <span className="ml-1">{OFFICE.icon}</span>{OFFICE.label}
        </Link>

        {isAdmin && (
          <div className="mr-auto flex items-center gap-1.5 shrink-0">
            <Dropdown
              id="accounting"
              group={ACCOUNTING_GROUP}
              align="left"
              accent={{
                idle: 'border-emerald-500/60 text-emerald-300 hover:bg-emerald-500 hover:text-white',
                active: 'bg-emerald-500 border-emerald-400 text-white font-bold',
              }}
            />
            <Link href="/command"
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border ${
                isActive('/command')
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
