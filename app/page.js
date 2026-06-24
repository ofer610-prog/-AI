import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CARDS = [
  { href: '/cases',          title: 'תיקי נדל"ן',     desc: 'כל התיקים הפעילים, שלבים, מסירות ושכ"ט', icon: '🏠', primary: true },
  { href: '/tasks',          title: 'משימות',          desc: 'מטלות פתוחות ומעקב ביצוע',               icon: '✅' },
  { href: '/calendar',       title: 'יומן',            desc: 'פגישות, דיונים ואירועים',               icon: '📅' },
  { href: '/my-schedule',    title: 'הלוז שלי',        desc: 'סדר היום האישי',                         icon: '🗓️' },
  { href: '/time',           title: 'שעות',            desc: 'דיווח שעות ושעתון',                      icon: '⏱' },
  { href: '/expenses/receipts', title: 'הוצאות וחשבוניות', desc: 'סריקת Gmail, קבלות וניהול הוצאות',  icon: '💸' },
  { href: '/expense-docs',   title: 'צירוף הוצאה',     desc: 'העלאת קבלה או חשבונית',                  icon: '🧾' },
  { href: '/dashboard',      title: 'המשרד שלי',       desc: 'גבייה, הכנסות, חשבוניות ותחזיות',        icon: '💼' },
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-8">
          <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-4xl font-bold text-slate-900">
            ⚖️ ספרי משרד
          </h1>
          <p className="text-slate-500 mt-2">ברוך הבא — בחר לאן להמשיך</p>
        </header>

        {/* Primary call to action — real estate cases */}
        <Link href="/cases"
          className="block bg-gradient-to-l from-indigo-700 to-blue-600 text-white rounded-2xl shadow-lg p-8 mb-8 hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-4">
            <span className="text-5xl">🏠</span>
            <div>
              <div className="text-2xl font-bold">תיקי נדל"ן</div>
              <div className="text-white/80 mt-1">כניסה לטבלת התיקים — פתיחת תיק חדש, שלבים, מסירות ושכ"ט</div>
            </div>
            <span className="mr-auto text-3xl">←</span>
          </div>
        </Link>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {CARDS.filter(c => !c.primary).map(c => (
            <Link key={c.href} href={c.href}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 hover:shadow-md transition-all">
              <div className="text-3xl mb-3">{c.icon}</div>
              <div className="font-bold text-slate-900">{c.title}</div>
              <div className="text-xs text-slate-500 mt-1 leading-snug">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
