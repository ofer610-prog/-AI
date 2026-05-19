// ============================================================================
// Shared helpers — formatting, dates, calculations
// ============================================================================

export const today = () => new Date();

export const fmt = (d) =>
  new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const fmtMoney = (n) =>
  `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;

export const daysBetween = (a, b) =>
  Math.ceil((new Date(b) - new Date(a)) / 86400000);

export const adjustForShabbat = (d) => {
  const nd = new Date(d);
  if (nd.getDay() === 6) nd.setDate(nd.getDate() + 1);
  return nd;
};

export const monthName = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

// ============================================================================
// Constants
// ============================================================================
export const MATTER_TYPES = [
  { id: 'sale', label: 'מכר' },
  { id: 'purchase', label: 'רכישה' },
  { id: 'rental', label: 'שכירות' },
  { id: 'tama38', label: 'תמ״א 38' },
  { id: 'pinui', label: 'פינוי-בינוי' },
  { id: 'inheritance', label: 'ירושה / צוואה' },
  { id: 'registration', label: 'רישום בטאבו' },
  { id: 'mortgage', label: 'משכנתא' },
  { id: 'litigation', label: 'התדיינות' },
  { id: 'consulting', label: 'ייעוץ' },
  { id: 'other', label: 'אחר' },
];

export const MATTER_STATUS = [
  { id: 'active', label: 'פעיל', color: 'emerald' },
  { id: 'pending', label: 'ממתין', color: 'amber' },
  { id: 'closed', label: 'סגור', color: 'stone' },
  { id: 'lost', label: 'בוטל', color: 'rose' },
];

export const ROLE_LABELS = {
  admin: 'מנהל/שותף',
  lawyer: 'עו״ד',
  paralegal: 'פראלגל',
  intern: 'מתמחה',
  accountant: 'חשב',
};

export const DEFAULT_RATES = {
  admin: 1000,
  lawyer: 800,
  paralegal: 350,
  intern: 250,
  accountant: 0,
};

// ============================================================================
// Deadlines calculation
// ============================================================================
export function getDeadlines(filingFreq) {
  const now = today();
  const year = now.getFullYear();
  const list = [];
  const periods = filingFreq === 'monthly'
    ? Array.from({ length: 12 }, (_, i) => ({ period: monthName[i], dueMonth: i + 1 }))
    : [
        { period: 'ינואר-פברואר', dueMonth: 2 },
        { period: 'מרץ-אפריל', dueMonth: 4 },
        { period: 'מאי-יוני', dueMonth: 6 },
        { period: 'יולי-אוגוסט', dueMonth: 8 },
        { period: 'ספטמבר-אוקטובר', dueMonth: 10 },
        { period: 'נובמבר-דצמבר', dueMonth: 12 },
      ];

  periods.forEach((p) => {
    let d = adjustForShabbat(new Date(year, p.dueMonth, 15));
    if (d >= now) list.push({ type: 'מע"מ', label: `דו״ח מע״מ ${p.period}`, date: d, color: 'rose' });
  });

  for (let m = 0; m < 12; m++) {
    let d = adjustForShabbat(new Date(year, m, 15));
    if (d >= now) {
      const prevMonth = m === 0 ? 'דצמבר' : monthName[m - 1];
      list.push({ type: 'בל״ל', label: `מקדמת ביטוח לאומי ${prevMonth}`, date: d, color: 'amber' });
    }
  }

  let annual = adjustForShabbat(new Date(year, 3, 30));
  if (annual >= now) list.push({ type: 'דו״ח שנתי', label: `דו״ח שנתי ${year - 1}`, date: annual, color: 'indigo' });

  return list.sort((a, b) => a.date - b.date).slice(0, 10);
}

// ============================================================================
// Aging bucket
// ============================================================================
export function agingBucket(invoice) {
  if (invoice.status === 'paid') return null;
  const days = daysBetween(invoice.due_date, today());
  if (days <= 0) return { label: 'בתוקף', color: 'emerald', priority: 0 };
  if (days <= 30) return { label: '1–30', color: 'amber', priority: 1 };
  if (days <= 60) return { label: '31–60', color: 'orange', priority: 2 };
  if (days <= 90) return { label: '61–90', color: 'rose', priority: 3 };
  return { label: '90+', color: 'red', priority: 4 };
}

// ============================================================================
// Tax forecast (3-month average)
// ============================================================================
export function forecastTaxes(income, expense, settings) {
  const now = today();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const recentInc = income.filter((i) => new Date(i.date) >= cutoff);
  const recentExp = expense.filter((e) => new Date(e.date) >= cutoff);

  const monthsAvg = 3;
  const monthlyIncome = recentInc.reduce((a, b) => a + Number(b.amount || 0), 0) / monthsAvg;
  const monthlyExpense = recentExp.reduce((a, b) => a + Number(b.amount || 0), 0) / monthsAvg;
  const monthlyVatCol = recentInc.reduce((a, b) => a + Number(b.vat || 0), 0) / monthsAvg;
  const monthlyVatPaid = recentExp.reduce((a, b) => a + Number(b.vat || 0), 0) / monthsAvg;
  const monthlyNet = monthlyIncome - monthlyExpense;

  const monthlyIncomeTax = Math.max(0, monthlyNet * 0.30);
  const monthlyBituach = Math.min(Math.max(0, monthlyNet), 50000) * 0.13;

  const vatPeriodMonths = settings?.filing_freq === 'monthly' ? 1 : 2;
  const nextVatPayment = Math.max(0, (monthlyVatCol - monthlyVatPaid) * vatPeriodMonths);

  return {
    monthlyIncome,
    monthlyExpense,
    monthlyNet,
    nextVatPayment,
    monthlyIncomeTax,
    monthlyBituach,
    next3Months: nextVatPayment + monthlyIncomeTax * 3 + monthlyBituach * 3,
  };
}

// ============================================================================
// Greeting
// ============================================================================
export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}
