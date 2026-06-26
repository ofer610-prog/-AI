/**
 * GET /api/annual-report/export?year=2026
 * Exports the annual report as CSV (Israeli accounting format, UTF-8 BOM for Excel).
 * Uses israeli-financial-reports skill column structure.
 */
import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const VAT_RATE = 0.18;

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year') || new Date().getFullYear());

  const sb = createServiceClient();
  const [invRes, expRes] = await Promise.all([
    sb.from('invoices')
      .select('amount,vat_amount,issue_date,status,client_name')
      .eq('organization_id', profile.organization_id)
      .gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`),
    sb.from('office_expenses')
      .select('section,item_name,month,year,amount')
      .eq('organization_id', profile.organization_id).eq('year', year),
  ]);

  const invoices = invRes.data || [];
  const expenses = expRes.data || [];

  // Monthly aggregates
  const months = Array.from({ length: 12 }, (_, i) => ({
    m: i + 1, income: 0, paid: 0, unpaid: 0, invoices: 0,
    office: 0, personal: 0, salary: 0, pension: 0, vat_payment: 0, income_tax: 0,
  }));

  for (const inv of invoices) {
    const mi = new Date(inv.issue_date).getMonth();
    months[mi].income += Number(inv.amount || 0);
    months[mi].invoices++;
    if (inv.status === 'paid') months[mi].paid += Number(inv.amount || 0);
    else months[mi].unpaid += Number(inv.amount || 0);
  }
  for (const exp of expenses) {
    const mi = (exp.month || 1) - 1;
    const amt = Number(exp.amount || 0);
    const sec = exp.section || 'office';
    if (sec === 'salary') months[mi].salary += amt;
    else if (sec === 'pension') months[mi].pension += amt;
    else if (sec === 'vat_payment') months[mi].vat_payment += amt;
    else if (sec === 'income_tax') months[mi].income_tax += amt;
    else if (sec === 'office') months[mi].office += amt;
    else months[mi].personal += amt;
  }

  // Build CSV
  const rows = [
    [`דוח שנתי ${year} — ספרי משרד`],
    [],
    ['חודש', 'חשבוניות', 'הכנסות (₪)', 'גבוי (₪)', 'פתוח (₪)',
     'הוצ׳ משרד (₪)', 'הוצ׳ אישיות (₪)', 'שכר (₪)', 'פנסיה (₪)',
     'מע"מ שולם (₪)', 'מס הכנסה (₪)', 'רווח נקי (₪)', 'מרווח %'],
  ];

  let totals = { income: 0, paid: 0, unpaid: 0, invoices: 0, office: 0, personal: 0, salary: 0, pension: 0, vat_payment: 0, income_tax: 0 };
  for (const m of months) {
    const totalExp = m.office + m.personal + m.salary + m.pension + m.vat_payment + m.income_tax;
    if (m.income === 0 && totalExp === 0) continue;
    const net = m.income - totalExp;
    const margin = m.income > 0 ? ((net / m.income) * 100).toFixed(1) : '';
    rows.push([MONTHS_HE[m.m], m.invoices, fmt(m.income), fmt(m.paid), fmt(m.unpaid),
      fmt(m.office), fmt(m.personal), fmt(m.salary), fmt(m.pension), fmt(m.vat_payment), fmt(m.income_tax),
      fmt(net), margin]);
    for (const k of Object.keys(totals)) totals[k] += m[k] || 0;
  }
  const totalAllExp = totals.office + totals.personal + totals.salary + totals.pension + totals.vat_payment + totals.income_tax;
  const totalNet = totals.income - totalAllExp;
  rows.push([`סה"כ ${year}`, totals.invoices, fmt(totals.income), fmt(totals.paid), fmt(totals.unpaid),
    fmt(totals.office), fmt(totals.personal), fmt(totals.salary), fmt(totals.pension), fmt(totals.vat_payment), fmt(totals.income_tax),
    fmt(totalNet), totals.income > 0 ? ((totalNet / totals.income) * 100).toFixed(1) : '']);

  // VAT summary — bi-monthly periods per israeli-financial-reports skill
  rows.push([], ['--- דוח מע"מ דו-חודשי ---']);
  rows.push(['תקופה', 'מע"מ עסקאות (פלט) ₪', 'מע"מ תשומות (קנייה) ₪', 'מע"מ לתשלום ₪', 'מועד הגשה']);
  for (let p = 0; p < 6; p++) {
    const m1 = p * 2 + 1, m2 = p * 2 + 2;
    const outputVat = invoices
      .filter(inv => { const m = new Date(inv.issue_date).getMonth() + 1; return m === m1 || m === m2; })
      .reduce((s, inv) => s + (Number(inv.vat_amount || 0) || Number(inv.amount || 0) * VAT_RATE / (1 + VAT_RATE)), 0);
    const inputVat = expenses
      .filter(e => e.month === m1 || e.month === m2)
      .reduce((s, e) => s + Number(e.amount || 0) * VAT_RATE * 0.8, 0); // simplified ~80% eligible
    if (outputVat === 0 && inputVat === 0) continue;
    const dueMonth = m2 === 12 ? `ינואר ${year + 1}` : MONTHS_HE[m2 + 1];
    rows.push([`${MONTHS_HE[m1]}-${MONTHS_HE[m2]} ${year}`, fmt(outputVat), fmt(inputVat), fmt(outputVat - inputVat), `19 ל${dueMonth}`]);
  }

  // Expense categories note
  rows.push([], ['--- הערות סיווג לפי פקודת מס הכנסה ---']);
  rows.push(['רכב: כלל הגבוה 45% או הוצ׳ פחות שווי שימוש | טלפון נייד: תקרת 50% | אירוח לקוחות ישראלים: 0% | כיבוד קל: 80%']);

  const BOM = '﻿';
  const csv = BOM + rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="annual-report-${year}.csv"`,
    },
  });
}

function fmt(n) { return Number(n || 0).toFixed(2); }
