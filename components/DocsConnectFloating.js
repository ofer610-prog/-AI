'use client';

import { usePathname } from 'next/navigation';

export default function DocsConnectFloating() {
  const pathname = usePathname() || '';
  if (!pathname.startsWith('/expenses')) return null;

  return (
    <a
      href="/api/google/connect"
      dir="rtl"
      className="fixed left-5 bottom-24 z-[9999] rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-emerald-500"
    >
      🔐 חיבור מסמכים
    </a>
  );
}
