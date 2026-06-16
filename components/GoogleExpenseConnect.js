'use client';

import { usePathname } from 'next/navigation';

export default function GoogleExpenseConnect() {
  const pathname = usePathname() || '';
  if (!pathname.startsWith('/expenses')) return null;

  return (
    <a
      href="/api/auth/google/connect?return_to=/expenses/receipts"
      dir="rtl"
      className="fixed left-3 bottom-24 z-[9999] rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-2xl ring-2 ring-white hover:bg-emerald-500 sm:left-5 sm:bottom-6"
    >
      🔐 חבר Google
    </a>
  );
}
