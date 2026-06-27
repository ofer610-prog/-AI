'use client';

import { useState, useMemo } from 'react';

// ─── Deadline data – all 2026 Israeli tax/business deadlines ───────────────

const DEADLINES = [
  // ── E-Invoice allocation number thresholds ──────────────────────────────
  {
    id: 'einvoice-10k',
    name: 'חובת מספר הקצאה – חשבוניות מעל 10,000 ₪',
    date: '2026-01-01',
    category: 'מע"מ',
    description: 'החל מ-1 בינואר 2026, חשבוניות מס (עוסק מורשה) מעל 10,000 ₪ (לפני מע"מ) חייבות לכלול מספר הקצאה מרשות המסים. ללא מספר – הקונה לא יוכל לנכות מס תשומות.',
  },
  // ── VAT bi-monthly (online) – 19th of month after period ─────────────────
  {
    id: 'vat-jan-feb',
    name: 'דוח מע"מ – ינואר–פברואר 2026',
    date: '2026-03-19',
    category: 'מע"מ',
    description: 'הגשת דוח מע"מ דו-חודשי לתקופת ינואר–פברואר 2026. הגשה מקוונת דרך ממן עד השעה 18:30.',
  },
  {
    id: 'vat-mar-apr',
    name: 'דוח מע"מ – מרץ–אפריל 2026',
    date: '2026-05-19',
    category: 'מע"מ',
    description: 'הגשת דוח מע"מ דו-חודשי לתקופת מרץ–אפריל 2026. הגשה מקוונת דרך ממן עד השעה 18:30.',
  },
  {
    id: 'vat-may-jun',
    name: 'דוח מע"מ – מאי–יוני 2026',
    date: '2026-07-19',
    category: 'מע"מ',
    description: 'הגשת דוח מע"מ דו-חודשי לתקופת מאי–יוני 2026. הגשה מקוונת דרך ממן עד השעה 18:30.',
  },
  {
    id: 'vat-jul-aug',
    name: 'דוח מע"מ – יולי–אוגוסט 2026',
    date: '2026-09-19',
    category: 'מע"מ',
    description: 'הגשת דוח מע"מ דו-חודשי לתקופת יולי–אוגוסט 2026. הגשה מקוונת דרך ממן עד השעה 18:30.',
  },
  {
    id: 'vat-sep-oct',
    name: 'דוח מע"מ – ספטמבר–אוקטובר 2026',
    date: '2026-11-19',
    category: 'מע"מ',
    description: 'הגשת דוח מע"מ דו-חודשי לתקופת ספטמבר–אוקטובר 2026. הגשה מקוונת דרך ממן עד השעה 18:30.',
  },
  {
    id: 'vat-nov-dec',
    name: 'דוח מע"מ – נובמבר–דצמבר 2026',
    date: '2027-01-19',
    category: 'מע"מ',
    description: 'הגשת דוח מע"מ דו-חודשי לתקופת נובמבר–דצמבר 2026. הגשה מקוונת דרך ממן עד השעה 18:30.',
  },
  // ── PCN 874 – detailed VAT report (23rd instead of 19th) ─────────────────
  {
    id: 'pcn874-jan-feb',
    name: 'דוח 874 מפורט – ינואר–פברואר 2026',
    date: '2026-03-23',
    category: 'מע"מ',
    description: 'עוסקים עם מחזור מעל 500,000 ₪ מגישים דוח מע"מ מפורט (874) – כל חשבונית בנפרד. מועד: 23 לחודש במקום 19. (תיקון 2026)',
  },
  {
    id: 'pcn874-mar-apr',
    name: 'דוח 874 מפורט – מרץ–אפריל 2026',
    date: '2026-05-23',
    category: 'מע"מ',
    description: 'עוסקים עם מחזור מעל 500,000 ₪ מגישים דוח מע"מ מפורט (874). מועד: 23 לחודש.',
  },
  {
    id: 'pcn874-may-jun',
    name: 'דוח 874 מפורט – מאי–יוני 2026',
    date: '2026-07-23',
    category: 'מע"מ',
    description: 'עוסקים עם מחזור מעל 500,000 ₪ מגישים דוח מע"מ מפורט (874). מועד: 23 לחודש.',
  },
  {
    id: 'pcn874-jul-aug',
    name: 'דוח 874 מפורט – יולי–אוגוסט 2026',
    date: '2026-09-23',
    category: 'מע"מ',
    description: 'עוסקים עם מחזור מעל 500,000 ₪ מגישים דוח מע"מ מפורט (874). מועד: 23 לחודש.',
  },
  {
    id: 'pcn874-sep-oct',
    name: 'דוח 874 מפורט – ספטמבר–אוקטובר 2026',
    date: '2026-11-23',
    category: 'מע"מ',
    description: 'עוסקים עם מחזור מעל 500,000 ₪ מגישים דוח מע"מ מפורט (874). מועד: 23 לחודש.',
  },
  {
    id: 'pcn874-nov-dec',
    name: 'דוח 874 מפורט – נובמבר–דצמבר 2026',
    date: '2027-01-23',
    category: 'מע"מ',
    description: 'עוסקים עם מחזור מעל 500,000 ₪ מגישים דוח מע"מ מפורט (874). מועד: 23 לחודש.',
  },
  // ── E-Invoice threshold drop ─────────────────────────────────────────────
  {
    id: 'einvoice-5k',
    name: 'חובת מספר הקצאה – חשבוניות מעל 5,000 ₪',
    date: '2026-06-01',
    category: 'מע"מ',
    description: 'החל מ-1 ביוני 2026, הסף יורד ל-5,000 ₪. חשבוניות מס מעל סכום זה (לפני מע"מ) חייבות מספר הקצאה.',
  },
  // ── Osek Patur annual ceiling monitoring ────────────────────────────────
  {
    id: 'osek-patur-ceiling',
    name: 'עוסק פטור – בדיקת תקרת מחזור שנתית',
    date: '2026-12-31',
    category: 'מע"מ',
    description: 'תקרת המחזור לעוסק פטור לשנת 2026 היא 122,833 ₪. אם עברת את התקרה – חובה לעבור לעוסק מורשה. יש לוודא שהמחזור בכל שנה אינו עולה על הסכום המעודכן.',
  },
  // ── Bituach Leumi quarterly advances ────────────────────────────────────
  {
    id: 'bl-q1',
    name: 'ביטוח לאומי – מקדמה רבעונית Q1',
    date: '2026-04-15',
    category: 'ביטוח לאומי',
    description: 'תשלום מקדמה רבעונית לביטוח לאומי (עצמאים). הוראת קבע מאריכה את המועד ל-22 לחודש. הסכום נקבע בשומת ביטוח לאומי.',
  },
  {
    id: 'bl-q2',
    name: 'ביטוח לאומי – מקדמה רבעונית Q2',
    date: '2026-07-15',
    category: 'ביטוח לאומי',
    description: 'תשלום מקדמה רבעונית לביטוח לאומי (עצמאים). הוראת קבע מאריכה את המועד ל-22 לחודש.',
  },
  {
    id: 'bl-q3',
    name: 'ביטוח לאומי – מקדמה רבעונית Q3',
    date: '2026-10-15',
    category: 'ביטוח לאומי',
    description: 'תשלום מקדמה רבעונית לביטוח לאומי (עצמאים). הוראת קבע מאריכה את המועד ל-22 לחודש.',
  },
  {
    id: 'bl-q4',
    name: 'ביטוח לאומי – מקדמה רבעונית Q4',
    date: '2027-01-15',
    category: 'ביטוח לאומי',
    description: 'תשלום מקדמה רבעונית לביטוח לאומי (עצמאים) לרבעון האחרון של 2026.',
  },
  // ── Income tax advance payments (mkdamot) – 15th of each month ──────────
  {
    id: 'mkdamot-jan',
    name: 'מקדמת מס הכנסה – ינואר 2026',
    date: '2026-02-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת ינואר 2026. תשלום מקוון מאריך עד ה-19 (עד 18:30).',
  },
  {
    id: 'mkdamot-feb',
    name: 'מקדמת מס הכנסה – פברואר 2026',
    date: '2026-03-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת פברואר 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-mar',
    name: 'מקדמת מס הכנסה – מרץ 2026',
    date: '2026-04-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת מרץ 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-apr',
    name: 'מקדמת מס הכנסה – אפריל 2026',
    date: '2026-05-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת אפריל 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-may',
    name: 'מקדמת מס הכנסה – מאי 2026',
    date: '2026-06-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת מאי 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-jun',
    name: 'מקדמת מס הכנסה – יוני 2026',
    date: '2026-07-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת יוני 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-jul',
    name: 'מקדמת מס הכנסה – יולי 2026',
    date: '2026-08-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת יולי 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-aug',
    name: 'מקדמת מס הכנסה – אוגוסט 2026',
    date: '2026-09-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת אוגוסט 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-sep',
    name: 'מקדמת מס הכנסה – ספטמבר 2026',
    date: '2026-10-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת ספטמבר 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-oct',
    name: 'מקדמת מס הכנסה – אוקטובר 2026',
    date: '2026-11-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת אוקטובר 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-nov',
    name: 'מקדמת מס הכנסה – נובמבר 2026',
    date: '2026-12-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת נובמבר 2026. תשלום מקוון מאריך עד ה-19.',
  },
  {
    id: 'mkdamot-dec',
    name: 'מקדמת מס הכנסה – דצמבר 2026',
    date: '2027-01-15',
    category: 'מס הכנסה',
    description: 'תשלום מקדמת מס הכנסה חודשית לתקופת דצמבר 2026. תשלום מקוון מאריך עד ה-19.',
  },
  // ── Annual income tax report ─────────────────────────────────────────────
  {
    id: 'annual-report-2026',
    name: 'דוח שנתי למס הכנסה – שנת מס 2026',
    date: '2027-04-30',
    category: 'שנתי',
    description: 'הגשת דוח שנתי (טופס 1301) לשנת המס 2026. הגשה מקוונת חובה לרוב הנישומים. הארכות: עד יולי–אוקטובר 2027 בהסדר רואה חשבון עם רשות המסים.',
  },
  // ── Osek Patur annual VAT declaration ───────────────────────────────────
  {
    id: 'osek-patur-annual-decl',
    name: 'עוסק פטור – הצהרת מחזור שנתית 2026',
    date: '2027-03-31',
    category: 'שנתי',
    description: 'עוסק פטור מגיש דיווח שנתי על מחזורו לשנת 2026 לפקיד מע"מ עד 31 במרץ 2027. זה שונה מדוח מס הכנסה השנתי.',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['כל הדדליינים', 'מע"מ', 'ביטוח לאומי', 'מס הכנסה', 'שנתי'];

const CATEGORY_COLORS = {
  'מע"מ':         'bg-purple-100 text-purple-700 border-purple-200',
  'ביטוח לאומי':  'bg-teal-100 text-teal-700 border-teal-200',
  'מס הכנסה':     'bg-blue-100 text-blue-700 border-blue-200',
  'שנתי':         'bg-orange-100 text-orange-700 border-orange-200',
};

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function getUrgencyClasses(days) {
  if (days < 0)  return { card: 'bg-gray-100 border-gray-200 opacity-70', badge: 'bg-gray-200 text-gray-500' };
  if (days <= 7)  return { card: 'bg-red-50 border-red-200',    badge: 'bg-red-500 text-white' };
  if (days <= 30) return { card: 'bg-amber-50 border-amber-200', badge: 'bg-amber-500 text-white' };
  if (days <= 60) return { card: 'bg-blue-50 border-blue-200',   badge: 'bg-blue-500 text-white' };
  return { card: 'bg-slate-50 border-slate-200', badge: 'bg-slate-400 text-white' };
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function CountdownBadge({ days }) {
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-500">
        עבר
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse">
        היום!
      </span>
    );
  }
  const { badge } = getUrgencyClasses(days);
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${badge}`}>
      {days} ימים
    </span>
  );
}

function DeadlineCard({ deadline }) {
  const days = getDaysUntil(deadline.date);
  const { card } = getUrgencyClasses(days);
  const isPast = days < 0;
  const categoryColor = CATEGORY_COLORS[deadline.category] || 'bg-slate-100 text-slate-600';

  return (
    <div className={`rounded-xl border p-5 transition-all hover:shadow-md ${card}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
            className={`text-lg font-bold leading-snug ${isPast ? 'line-through text-gray-400' : 'text-slate-900'}`}
          >
            {deadline.name}
          </h3>
          <p className={`text-sm mt-1 ${isPast ? 'text-gray-400' : 'text-slate-500'}`}>
            {formatDate(deadline.date)}
          </p>
        </div>
        <CountdownBadge days={days} />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${categoryColor}`}>
          {deadline.category}
        </span>
      </div>

      <p className={`text-sm leading-relaxed ${isPast ? 'text-gray-400' : 'text-slate-600'}`}>
        {deadline.description}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TaxCalendarPage() {
  const [activeFilter, setActiveFilter] = useState('כל הדדליינים');

  const today = new Date();
  const todayFormatted = today.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const filtered = useMemo(() => {
    const list = activeFilter === 'כל הדדליינים'
      ? DEADLINES
      : DEADLINES.filter(d => d.category === activeFilter);

    return [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [activeFilter]);

  const upcomingCount = useMemo(
    () => DEADLINES.filter(d => getDaysUntil(d.date) >= 0).length,
    []
  );
  const urgentCount = useMemo(
    () => DEADLINES.filter(d => { const n = getDaysUntil(d.date); return n >= 0 && n <= 30; }).length,
    []
  );

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <header className="mb-8">
          <h1
            style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
            className="text-4xl font-bold text-slate-900 mb-1"
          >
            📅 לוח מועדי מס ישראלי 2026
          </h1>
          <p className="text-slate-500 text-sm">
            כל דדליינים המס והעסקים לשנת 2026 — כולל מע&quot;מ, ביטוח לאומי ומס הכנסה
          </p>
        </header>

        {/* Today's date + summary strip */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6 flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">היום</p>
            <p className="text-xl font-bold text-slate-800">{todayFormatted}</p>
          </div>
          <div className="h-10 w-px bg-slate-200 hidden sm:block" />
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{upcomingCount}</p>
              <p className="text-xs text-slate-500">דדליינים עתידיים</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{urgentCount}</p>
              <p className="text-xs text-slate-500">דחופים (30 יום)</p>
            </div>
          </div>
          {urgentCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700 font-medium">
              ⚠️ יש {urgentCount} דדליינים ב-30 הימים הקרובים
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                activeFilter === cat
                  ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Urgency legend */}
        <div className="flex flex-wrap gap-3 mb-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
            0–7 ימים
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
            8–30 ימים
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />
            31–60 ימים
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-400 inline-block" />
            מעל 60 ימים
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />
            עבר
          </span>
        </div>

        {/* Deadline cards grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🗂️</p>
            <p className="text-lg font-medium">אין דדליינים בקטגוריה זו</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map(deadline => (
              <DeadlineCard key={deadline.id} deadline={deadline} />
            ))}
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 mt-10 leading-relaxed">
          המועדים מבוססים על הנחיות רשות המסים ומוסד לביטוח לאומי לשנת 2026.
          אם המועד חל בשבת או חג — הוא נדחה ליום העסקים הבא.
          יש לוודא עם רואה חשבון את המועדים הרלוונטיים לעסק הספציפי שלך.
        </p>
      </div>
    </main>
  );
}
