'use client';
import { useState, useEffect } from 'react';

const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.round((target - today) / 86400000);
}

function nextVatDeadline(filingFreq, fromDate = new Date()) {
  const d = new Date(fromDate);
  const month = d.getMonth();
  const year = d.getFullYear();
  if (filingFreq === 'monthly') {
    // 19th of next month
    let nm = month + 1;
    let ny = year;
    if (nm > 11) { nm = 0; ny++; }
    return { date: `${ny}-${String(nm + 1).padStart(2, '0')}-19`, period: MONTH_NAMES[month] };
  } else {
    // bi-monthly: periods are Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec
    // deadline: 19th of the month AFTER the 2-month period ends
    const periodStart = Math.floor(month / 2) * 2;
    const periodEnd = periodStart + 1;
    let deadlineMonth = periodEnd + 1;
    let deadlineYear = year;
    if (deadlineMonth > 11) { deadlineMonth = 0; deadlineYear++; }
    const dateStr = `${deadlineYear}-${String(deadlineMonth + 1).padStart(2, '0')}-19`;
    const days = daysUntil(dateStr);
    if (days < 0) {
      // already passed, get next period
      const nextPeriodStart = periodStart + 2 > 11 ? 0 : periodStart + 2;
      const nextPeriodEnd = nextPeriodStart + 1;
      let nm = nextPeriodEnd + 1;
      let ny = nextPeriodEnd + 1 > 11 ? year + 1 : year;
      if (nm > 11) { nm = 0; }
      return {
        date: `${ny}-${String(nm + 1).padStart(2, '0')}-19`,
        period: `${MONTH_NAMES[nextPeriodStart]}-${MONTH_NAMES[Math.min(nextPeriodEnd, 11)]}`,
      };
    }
    return {
      date: dateStr,
      period: `${MONTH_NAMES[periodStart]}-${MONTH_NAMES[Math.min(periodEnd, 11)]}`,
    };
  }
}

function getDeadlines(filingFreq, estimates) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const deadlines = [];

  // VAT deadline
  const vat = nextVatDeadline(filingFreq, today);
  deadlines.push({
    id: 'vat',
    type: 'מע"מ',
    icon: '🧾',
    color: 'blue',
    date: vat.date,
    period: vat.period,
    amount: estimates?.estimatedVat || 0,
    description: `דוח מע"מ לתקופה ${vat.period}`,
    checklist: [
      'ריכוז כל חשבוניות הכנסה',
      'ריכוז כל חשבוניות ההוצאה',
      'אישור יתרת מע"מ',
      'הכנת טופס 83',
      'תשלום לרשות המסים',
    ],
  });

  // Income tax advance — 15th of each month
  let itMonth = month + 1;
  let itYear = year;
  if (itMonth > 11) { itMonth = 0; itYear++; }
  const itDate = `${itYear}-${String(itMonth + 1).padStart(2, '0')}-15`;
  deadlines.push({
    id: 'income_tax',
    type: 'מקדמת מס הכנסה',
    icon: '💰',
    color: 'amber',
    date: itDate,
    period: MONTH_NAMES[month],
    amount: estimates?.estimatedIncomeTax || 0,
    description: `מקדמת מס הכנסה חודש ${MONTH_NAMES[month]}`,
    checklist: [
      'עדכון דוח הכנסות חודשי',
      'חישוב מקדמה לפי אחוז שנקבע',
      'תשלום דרך שע"מ',
    ],
  });

  // National insurance — 15th of each month
  deadlines.push({
    id: 'bituach',
    type: 'ביטוח לאומי',
    icon: '🏥',
    color: 'green',
    date: itDate,
    period: MONTH_NAMES[month],
    amount: estimates?.estimatedBituach || 0,
    description: `תשלום ביטוח לאומי חודש ${MONTH_NAMES[month]}`,
    checklist: [
      'הכנת פירוט שכר',
      'חישוב דמי ביטוח עובדים ומעסיק',
      'תשלום לביטוח לאומי',
    ],
  });

  return deadlines.sort((a, b) => a.date.localeCompare(b.date));
}

function buildAnnualCalendar(filingFreq, year) {
  const events = [];
  for (let m = 0; m < 12; m++) {
    // Income tax advance
    events.push({ month: m, day: 15, type: 'מס הכנסה', color: 'amber', short: 'מ.מ' });
    // Bituach leumi
    events.push({ month: m, day: 15, type: 'ביטוח לאומי', color: 'green', short: 'ב.ל' });
    // VAT
    if (filingFreq === 'monthly') {
      events.push({ month: m, day: 19, type: 'מע"מ חודשי', color: 'blue', short: 'מע"מ' });
    } else {
      if (m % 2 === 1) {
        events.push({ month: m, day: 19, type: 'מע"מ דו-חודשי', color: 'blue', short: 'מע"מ' });
      }
    }
  }
  // Annual income tax return — April 30
  events.push({ month: 3, day: 30, type: 'דוח שנתי מס הכנסה', color: 'rose', short: 'שנתי' });
  return events;
}

const COLOR_CLASSES = {
  blue:  { card: 'border-blue-500 bg-blue-50',  badge: 'bg-blue-100 text-blue-800',  dot: 'bg-blue-500',  num: 'text-blue-600' },
  amber: { card: 'border-amber-500 bg-amber-50', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', num: 'text-amber-600' },
  green: { card: 'border-green-500 bg-green-50', badge: 'bg-green-100 text-green-800', dot: 'bg-green-500', num: 'text-green-600' },
  rose:  { card: 'border-rose-500 bg-rose-50',  badge: 'bg-rose-100 text-rose-800',  dot: 'bg-rose-500',  num: 'text-rose-600' },
};

function DeadlineCard({ d }) {
  const [open, setOpen] = useState(false);
  const days = daysUntil(d.date);
  const c = COLOR_CLASSES[d.color] || COLOR_CLASSES.blue;
  const urgency = days <= 3 ? 'text-red-600 font-bold animate-pulse' : days <= 7 ? 'text-orange-600 font-bold' : days <= 14 ? 'text-amber-600' : 'text-slate-500';

  return (
    <div className={`border-r-4 rounded-xl p-4 shadow-sm cursor-pointer ${c.card}`} onClick={() => setOpen(o => !o)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{d.icon}</span>
          <div>
            <p className="font-bold text-slate-800">{d.type}</p>
            <p className="text-sm text-slate-600">{d.description}</p>
          </div>
        </div>
        <div className="text-left min-w-max">
          <p className={`text-sm ${urgency}`}>{days < 0 ? 'עבר המועד' : days === 0 ? 'היום!' : `עוד ${days} ימים`}</p>
          <p className="text-xs text-slate-500">{d.date}</p>
        </div>
      </div>

      {d.amount > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-500">הערכת תשלום:</span>
          <span className={`text-base font-bold ${c.num}`}>₪{d.amount.toLocaleString()}</span>
          <span className="text-xs text-slate-400">(ממוצע 3 חודשים)</span>
        </div>
      )}

      {open && (
        <div className="mt-4 border-t pt-3">
          <p className="text-sm font-semibold text-slate-700 mb-2">רשימת הכנה:</p>
          <ul className="space-y-1">
            {d.checklist.map((item, i) => (
              <CheckItem key={i} text={item} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CheckItem({ text }) {
  const [checked, setChecked] = useState(false);
  return (
    <li
      className="flex items-center gap-2 text-sm cursor-pointer select-none"
      onClick={e => { e.stopPropagation(); setChecked(c => !c); }}
    >
      <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300'}`}>
        {checked && '✓'}
      </span>
      <span className={checked ? 'line-through text-slate-400' : 'text-slate-700'}>{text}</span>
    </li>
  );
}

export default function TaxPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetch('/api/tax')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => setError('שגיאה בטעינת נתוני מס'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-500 text-lg">טוען נתוני מס...</div>
    </div>
  );

  if (error) return (
    <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-red-500">{error}</div>
    </div>
  );

  const filingFreq = data?.org?.filing_freq || 'bimonthly';
  const estimates = data?.estimates || {};
  const deadlines = getDeadlines(filingFreq, estimates);
  const annualEvents = buildAnnualCalendar(filingFreq, activeYear);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <div className="sticky top-12 z-30 bg-white border-b shadow-sm px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">📅 לוח מס וחובות</h1>
            <p className="text-sm text-slate-500">
              תדירות דיווח מע"מ: <strong>{filingFreq === 'monthly' ? 'חודשי' : 'דו-חודשי'}</strong>
            </p>
          </div>
          <div className="text-left text-sm text-slate-500">
            <p>ממוצע הכנסה חודשי: <strong className="text-slate-800">₪{Math.round(estimates.avgIncome || 0).toLocaleString()}</strong></p>
            <p>ממוצע הוצאה חודשי: <strong className="text-slate-800">₪{Math.round(estimates.avgExpense || 0).toLocaleString()}</strong></p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-8">
        {/* Upcoming deadlines */}
        <section>
          <h2 className="text-lg font-bold text-slate-700 mb-4">מועדים קרובים</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {deadlines.map(d => <DeadlineCard key={d.id} d={d} />)}
          </div>
        </section>

        {/* Summary estimates */}
        <section>
          <h2 className="text-lg font-bold text-slate-700 mb-4">הערכות תשלום (לפי ממוצע 3 חודשים)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'מע"מ לתשלום', value: estimates.estimatedVat, color: 'text-blue-600', bg: 'bg-blue-50', icon: '🧾' },
              { label: 'מקדמת מס הכנסה', value: estimates.estimatedIncomeTax, color: 'text-amber-600', bg: 'bg-amber-50', icon: '💰' },
              { label: 'ביטוח לאומי', value: estimates.estimatedBituach, color: 'text-green-600', bg: 'bg-green-50', icon: '🏥' },
              { label: 'סה"כ חובות חודשי', value: (estimates.estimatedVat || 0) + (estimates.estimatedIncomeTax || 0) + (estimates.estimatedBituach || 0), color: 'text-slate-800', bg: 'bg-slate-100', icon: '📊' },
            ].map(item => (
              <div key={item.label} className={`rounded-xl p-4 ${item.bg}`}>
                <p className="text-2xl mb-1">{item.icon}</p>
                <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                <p className={`text-xl font-bold ${item.color}`}>₪{(item.value || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Annual calendar */}
        <section>
          <h2 className="text-lg font-bold text-slate-700 mb-4">לוח שנתי — {activeYear}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {MONTH_NAMES.map((name, mi) => {
              const monthEvents = annualEvents.filter(e => e.month === mi);
              const today = new Date();
              const isCurrentMonth = today.getFullYear() === activeYear && today.getMonth() === mi;
              return (
                <div key={mi} className={`rounded-xl p-3 border ${isCurrentMonth ? 'border-sky-400 bg-sky-50 shadow-md' : 'border-slate-200 bg-white'}`}>
                  <p className={`font-bold text-sm mb-2 ${isCurrentMonth ? 'text-sky-700' : 'text-slate-700'}`}>
                    {name} {isCurrentMonth && <span className="text-xs text-sky-500 font-normal">← עכשיו</span>}
                  </p>
                  <div className="space-y-1">
                    {monthEvents.map((ev, ei) => (
                      <div key={ei} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          ev.color === 'blue' ? 'bg-blue-500' :
                          ev.color === 'amber' ? 'bg-amber-500' :
                          ev.color === 'green' ? 'bg-green-500' : 'bg-rose-500'
                        }`} />
                        <span className="text-xs text-slate-600">{ev.day} — {ev.short}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3">
            {[
              { color: 'bg-blue-500', label: 'מע"מ' },
              { color: 'bg-amber-500', label: 'מקדמת מס הכנסה' },
              { color: 'bg-green-500', label: 'ביטוח לאומי' },
              { color: 'bg-rose-500', label: 'דוח שנתי' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-sm text-slate-600">
                <span className={`w-3 h-3 rounded-full ${l.color}`} />
                {l.label}
              </div>
            ))}
          </div>
        </section>

        {/* YTD real numbers */}
        {data?.ytd && (
          <section>
            <h2 className="text-lg font-bold text-slate-700 mb-4">נתונים אמיתיים — {activeYear} עד כה</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'הכנסות חשבוניות', value: data.ytd.income, color: 'text-emerald-700', bg: 'bg-emerald-50', icon: '📄' },
                { label: 'גבוי בפועל', value: data.ytd.paid, color: 'text-sky-700', bg: 'bg-sky-50', icon: '✅' },
                { label: 'חוב פתוח', value: data.ytd.unpaid, color: 'text-rose-600', bg: 'bg-rose-50', icon: '⏳' },
                { label: 'מע"מ עסקאות (חישוב)', value: data.ytd.vat_output, color: 'text-blue-700', bg: 'bg-blue-50', icon: '🧾' },
                { label: 'מע"מ ששולם בפועל', value: data.ytd.vat_paid, color: data.ytd.vat_paid > 0 ? 'text-green-700' : 'text-slate-400', bg: 'bg-green-50', icon: '💳' },
                { label: 'מס הכנסה ששולם', value: data.ytd.income_tax_paid, color: data.ytd.income_tax_paid > 0 ? 'text-amber-700' : 'text-slate-400', bg: 'bg-amber-50', icon: '💰' },
              ].map(item => (
                <div key={item.label} className={`rounded-xl p-3 ${item.bg} border border-transparent`}>
                  <p className="text-xl mb-1">{item.icon}</p>
                  <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>₪{Math.round(item.value || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
            {data.ytd.vat_paid === 0 && (
              <p className="text-xs text-slate-400 mt-2">💡 כדי לעקוב אחרי תשלומי מע"מ ומס הכנסה בפועל — הזן אותם בלשונית "שכר ומסים" בדוח השנתי.</p>
            )}
          </section>
        )}

        {/* Notes */}
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="font-bold text-amber-800 mb-2">⚠️ הערות חשובות</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>ההערכות מבוססות על ממוצע 3 החודשים האחרונים בלבד — ייתכנו שינויים.</li>
            <li>מועד הגשת מע"מ הוא ה-19 לחודש שלאחר תום התקופה (אם הוא יום עסקים).</li>
            <li>מקדמות מס הכנסה וביטוח לאומי — ה-15 לכל חודש.</li>
            <li>דוח שנתי מס הכנסה — עד 30 באפריל (נדחה אם חל בשבת/חג).</li>
            <li>יש לאמת את הנתונים מול רואה החשבון לפני כל תשלום.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
