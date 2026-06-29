'use client';

import { usePathname } from 'next/navigation';

export default function InvoiceScanSourceNotice() {
  const pathname = usePathname() || '';
  if (!pathname.startsWith('/expenses/receipts')) return null;

  return (
    <div dir="rtl" className="fixed bottom-4 left-4 z-[9998] max-w-md rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-xl">
      <div className="font-extrabold mb-1">סריקת חשבוניות פעילה במסלול אחד בלבד</div>
      <div>
        Gmail ו־Hotmail מועברים ל־<b>oferlaw12@gmail.com</b>, והסינון הקבוע הוא לפי <b>1626</b> או <b>9434</b> בלבד.
      </div>
      <div className="mt-1 text-xs text-emerald-700">האתר מציג ומנהל חשבוניות. הסריקה עצמה מתבצעת ב־Google Apps Script.</div>
    </div>
  );
}
