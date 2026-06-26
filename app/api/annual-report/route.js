/**
 * GET /api/annual-report?year=2026
 * Returns comprehensive annual financial data:
 * income (invoices), expenses (office_expenses + expense_documents),
 * matters pipeline, VAT summary, and expense categorization.
 * Uses israeli-financial-reports + israeli-expense-categorizer skills.
 */
import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Israeli expense categorizer: maps item names → category + deduction %
const EXPENSE_CATEGORIES = {
  // Vehicle (higher-of rule: 45% or running-minus-use-value)
  'דלק': { cat: 'vehicle', cat_he: 'רכב ודלק', deduct_pct: 45, account: 64, vat_pct: 67, note: 'כלל הגבוה מבין 45% לבין הוצאות פחות שווי שימוש' },
  'כביש 6': { cat: 'vehicle', cat_he: 'רכב ודלק', deduct_pct: 45, account: 64, vat_pct: 67 },
  'מנהרות הכרמל': { cat: 'vehicle', cat_he: 'רכב ודלק', deduct_pct: 45, account: 64, vat_pct: 67 },
  'פנגו': { cat: 'vehicle', cat_he: 'רכב ודלק', deduct_pct: 45, account: 64, vat_pct: 67 },
  'רישון רכב': { cat: 'vehicle', cat_he: 'רכב ודלק', deduct_pct: 45, account: 64, vat_pct: 0 },
  'ביטוח רכב': { cat: 'vehicle', cat_he: 'רכב ודלק', deduct_pct: 45, account: 64, vat_pct: 0 },
  // Telecom (mobile: 50% disallowance floor per תקנות 1972)
  '019 מובייל': { cat: 'telecom', cat_he: 'תקשורת', deduct_pct: 50, account: 65, vat_pct: 100, note: 'טלפון נייד — תקרת 50% לפי תקנות ניכוי הוצאות מסויימות' },
  'סלקום': { cat: 'telecom', cat_he: 'תקשורת', deduct_pct: 50, account: 65, vat_pct: 100 },
  'גולן טלקום': { cat: 'telecom', cat_he: 'תקשורת', deduct_pct: 50, account: 65, vat_pct: 100 },
  'נט וישן - אינטרנט': { cat: 'telecom', cat_he: 'תקשורת', deduct_pct: 100, account: 65, vat_pct: 100, note: 'אינטרנט — לפי חלק עסקי' },
  // Software / SaaS (100%)
  'google גיבוי': { cat: 'software', cat_he: 'תוכנה ושירותי ענן', deduct_pct: 100, account: 65, vat_pct: 0, note: 'ספק זר — ריברס צ׳ארג׳' },
  'google': { cat: 'software', cat_he: 'תוכנה ושירותי ענן', deduct_pct: 100, account: 65, vat_pct: 0, note: 'ספק זר — ריברס צ׳ארג׳' },
  'קלוד AI בינה': { cat: 'software', cat_he: 'תוכנה ושירותי ענן', deduct_pct: 100, account: 65, vat_pct: 0, note: 'ספק זר — ריברס צ׳ארג׳' },
  // Office supplies (100%)
  'אופיס דיו': { cat: 'office', cat_he: 'ציוד משרדי', deduct_pct: 100, account: 65, vat_pct: 100 },
  'קליגל': { cat: 'office', cat_he: 'ציוד משרדי', deduct_pct: 100, account: 65, vat_pct: 100 },
  'סופר': { cat: 'office', cat_he: 'כיבוד קל', deduct_pct: 80, account: 66, vat_pct: 100, note: 'כיבוד קל — 80% לפי תקנות' },
  'דואר': { cat: 'office', cat_he: 'ציוד משרדי', deduct_pct: 100, account: 65, vat_pct: 0 },
  // Legal / professional fees (100%)
  'אגרות טאבו': { cat: 'professional', cat_he: 'אגרות ממשלתיות', deduct_pct: 100, account: 67, vat_pct: 0 },
  'דמי נוטריון': { cat: 'professional', cat_he: 'שירותים מקצועיים', deduct_pct: 100, account: 67, vat_pct: 100 },
  'בן גיגי': { cat: 'professional', cat_he: 'שירותים מקצועיים', deduct_pct: 100, account: 67, vat_pct: 100 },
  'אליף חדאד אסעד': { cat: 'professional', cat_he: 'שירותים מקצועיים', deduct_pct: 100, account: 67, vat_pct: 100 },
  // Insurance (100%)
  'ביטוח לידור': { cat: 'insurance', cat_he: 'ביטוח', deduct_pct: 100, account: 65, vat_pct: 0 },
  'ביטוח עופר': { cat: 'insurance', cat_he: 'ביטוח', deduct_pct: 100, account: 65, vat_pct: 0 },
  'ביטוח פולינה': { cat: 'insurance', cat_he: 'ביטוח', deduct_pct: 100, account: 65, vat_pct: 0 },
  // Membership fees (100%)
  'דמי חבר לידור': { cat: 'professional', cat_he: 'דמי חבר', deduct_pct: 100, account: 67, vat_pct: 100 },
  'דמי חבר עופר': { cat: 'professional', cat_he: 'דמי חבר', deduct_pct: 100, account: 67, vat_pct: 100 },
  'דמי חבר פולינה': { cat: 'professional', cat_he: 'דמי חבר', deduct_pct: 100, account: 67, vat_pct: 100 },
  // Personal (0% deductible for office section)
  'ארנונה נכס 03': { cat: 'property', cat_he: 'ארנונה נכסים', deduct_pct: 0, account: 63, vat_pct: 0, section: 'personal' },
  'ארנונה נכס 04': { cat: 'property', cat_he: 'ארנונה נכסים', deduct_pct: 0, account: 63, vat_pct: 0, section: 'personal' },
  'ארנונה נכס 05': { cat: 'property', cat_he: 'ארנונה נכסים', deduct_pct: 0, account: 63, vat_pct: 0, section: 'personal' },
  'ארנונה בית חלקי 5': { cat: 'property', cat_he: 'ארנונה נכסים', deduct_pct: 0, account: 63, vat_pct: 0, section: 'personal' },
  'חשמל בית חלקי 5': { cat: 'property', cat_he: 'ארנונה נכסים', deduct_pct: 0, account: 63, vat_pct: 0, section: 'personal' },
  'חשמל צ\'רכי': { cat: 'property', cat_he: 'ארנונה נכסים', deduct_pct: 0, account: 63, vat_pct: 0, section: 'personal' },
  'מים בית חלקי 5': { cat: 'property', cat_he: 'ארנונה נכסים', deduct_pct: 0, account: 63, vat_pct: 0, section: 'personal' },
  'שכירות - עופר': { cat: 'rent', cat_he: 'שכירות', deduct_pct: 100, account: 63, vat_pct: 0, section: 'personal' },
};

const VAT_RATE = 0.18;
const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function categorize(item_name) {
  const key = Object.keys(EXPENSE_CATEGORIES).find(k =>
    item_name?.includes(k) || k.includes(item_name || '')
  );
  return key ? EXPENSE_CATEGORIES[key] : { cat: 'general', cat_he: 'הוצאות כלליות', deduct_pct: 100, account: 65, vat_pct: 100 };
}

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year') || new Date().getFullYear());
  const sb = createServiceClient();

  const [invoicesRes, expensesRes, docsRes, mattersRes] = await Promise.all([
    sb.from('invoices')
      .select('amount,subtotal,vat_amount,vat_rate,issue_date,status,client_name,matter_id')
      .eq('organization_id', profile.organization_id)
      .gte('issue_date', `${year}-01-01`)
      .lte('issue_date', `${year}-12-31`),
    sb.from('office_expenses')
      .select('section,item_name,month,year,amount,is_recurring')
      .eq('organization_id', profile.organization_id)
      .eq('year', year),
    sb.from('expense_documents')
      .select('vendor,category,amount,doc_date,status,expense_month_num,expense_year')
      .eq('organization_id', profile.organization_id)
      .or(`expense_year.eq.${year},and(doc_date.gte.${year}-01-01,doc_date.lte.${year}-12-31)`),
    sb.from('matters')
      .select('agreed_fee,collected_amount,balance_amount,status,type,payment_status')
      .eq('organization_id', profile.organization_id),
  ]);

  const invoices = invoicesRes.data || [];
  const expenses = expensesRes.data || [];
  const docs = docsRes.data || [];
  const matters = mattersRes.data || [];

  // ── Monthly income ──────────────────────────────────────────────────────────
  const monthlyIncome = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, month_he: MONTHS_HE[i + 1],
    total: 0, paid: 0, unpaid: 0, invoices: 0, vat: 0,
  }));
  for (const inv of invoices) {
    const m = new Date(inv.issue_date).getMonth(); // 0-indexed
    monthlyIncome[m].total += Number(inv.amount || 0);
    monthlyIncome[m].invoices++;
    if (inv.status === 'paid') monthlyIncome[m].paid += Number(inv.amount || 0);
    else monthlyIncome[m].unpaid += Number(inv.amount || 0);
    // Estimate VAT: if invoices don't store it, derive 18/118 of total
    const vat = Number(inv.vat_amount || 0) || Number(inv.amount || 0) * VAT_RATE / (1 + VAT_RATE);
    monthlyIncome[m].vat += vat;
  }

  // ── Monthly expenses (categorized) ─────────────────────────────────────────
  const monthlyExpenses = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, month_he: MONTHS_HE[i + 1],
    office: 0, personal: 0, salary: 0, pension: 0, vat_payment: 0, income_tax: 0, total: 0, deductible: 0,
  }));
  // category totals
  const byCat = {};
  for (const exp of expenses) {
    const m = (exp.month || 1) - 1;
    const amt = Number(exp.amount || 0);
    if (exp.section === 'office') monthlyExpenses[m].office += amt;
    else if (exp.section === 'personal') monthlyExpenses[m].personal += amt;
    else if (exp.section === 'salary') monthlyExpenses[m].salary += amt;
    else if (exp.section === 'pension') monthlyExpenses[m].pension += amt;
    else if (exp.section === 'vat_payment') monthlyExpenses[m].vat_payment += amt;
    else if (exp.section === 'income_tax') monthlyExpenses[m].income_tax += amt;
    else monthlyExpenses[m].personal += amt;
    monthlyExpenses[m].total += amt;
    const catInfo = categorize(exp.item_name);
    const deductible = amt * catInfo.deduct_pct / 100;
    monthlyExpenses[m].deductible += deductible;
    const catKey = catInfo.cat;
    if (!byCat[catKey]) byCat[catKey] = { cat: catKey, cat_he: catInfo.cat_he, total: 0, deductible: 0, account: catInfo.account, items: [] };
    byCat[catKey].total += amt;
    byCat[catKey].deductible += deductible;
    byCat[catKey].items.push({ name: exp.item_name, month: exp.month, amount: amt, deduct_pct: catInfo.deduct_pct, note: catInfo.note });
  }

  // ── VAT bi-monthly summary (Jan-Feb, Mar-Apr, May-Jun, ...) ────────────────
  const vatPeriods = [];
  for (let p = 0; p < 6; p++) {
    const m1 = p * 2 + 1, m2 = p * 2 + 2;
    const incomeInPeriod = invoices.filter(inv => {
      const m = new Date(inv.issue_date).getMonth() + 1;
      return m === m1 || m === m2;
    });
    const outputVat = incomeInPeriod.reduce((s, inv) => {
      const total = Number(inv.amount || 0);
      return s + (Number(inv.vat_amount || 0) || total * VAT_RATE / (1 + VAT_RATE));
    }, 0);
    const expInPeriod = expenses.filter(e => e.month === m1 || e.month === m2);
    let inputVat = 0;
    for (const exp of expInPeriod) {
      const amt = Number(exp.amount || 0);
      const catInfo = categorize(exp.item_name);
      inputVat += amt * (catInfo.vat_pct / 100) * VAT_RATE;
    }
    const hasData = incomeInPeriod.length > 0 || expInPeriod.length > 0;
    vatPeriods.push({
      period: `${MONTHS_HE[m1]}-${MONTHS_HE[m2]}`,
      output_vat: outputVat, input_vat: inputVat,
      net_vat: outputVat - inputVat,
      due_date: `19 ל${MONTHS_HE[m2 + 1] || 'ינואר ' + (year + 1)}`,
      has_data: hasData,
    });
  }

  // ── Pipeline (matters) ─────────────────────────────────────────────────────
  const pipeline = {
    total_matters: matters.length,
    total_agreed: matters.reduce((s, m) => s + Number(m.agreed_fee || 0), 0),
    total_collected: matters.reduce((s, m) => s + Number(m.collected_amount || 0), 0),
    total_balance: matters.reduce((s, m) => s + Number(m.balance_amount || 0), 0),
    active: matters.filter(m => m.status === 'active').length,
    closed: matters.filter(m => m.status === 'closed').length,
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalIncome = monthlyIncome.reduce((s, m) => s + m.total, 0);
  const totalPaid = monthlyIncome.reduce((s, m) => s + m.paid, 0);
  const totalUnpaid = monthlyIncome.reduce((s, m) => s + m.unpaid, 0);
  const totalExpenses = monthlyExpenses.reduce((s, m) => s + m.total, 0);
  const totalOfficeExp = monthlyExpenses.reduce((s, m) => s + m.office, 0);
  const totalPersonalExp = monthlyExpenses.reduce((s, m) => s + m.personal, 0);
  const totalSalary = monthlyExpenses.reduce((s, m) => s + m.salary, 0);
  const totalPension = monthlyExpenses.reduce((s, m) => s + m.pension, 0);
  const totalVatPayments = monthlyExpenses.reduce((s, m) => s + m.vat_payment, 0);
  const totalIncomeTax = monthlyExpenses.reduce((s, m) => s + m.income_tax, 0);
  const totalDeductible = monthlyExpenses.reduce((s, m) => s + m.deductible, 0);
  const netProfit = totalIncome - totalExpenses;
  const grossMarginPct = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : 0;

  return Response.json({
    year,
    summary: {
      total_income: totalIncome, total_paid: totalPaid, total_unpaid: totalUnpaid,
      total_expenses: totalExpenses,
      office_expenses: totalOfficeExp,
      personal_expenses: totalPersonalExp,
      salary_total: totalSalary,
      pension_total: totalPension,
      vat_payments_total: totalVatPayments,
      income_tax_total: totalIncomeTax,
      total_deductible: totalDeductible,
      net_profit: netProfit,
      gross_margin_pct: grossMarginPct,
      invoice_count: invoices.length,
    },
    monthly_income: monthlyIncome,
    monthly_expenses: monthlyExpenses,
    monthly_combined: monthlyIncome.map((inc, i) => ({
      month: inc.month, month_he: inc.month_he,
      income: inc.total, paid: inc.paid, unpaid: inc.unpaid, invoices: inc.invoices,
      expenses: monthlyExpenses[i].total,
      office_exp: monthlyExpenses[i].office,
      personal_exp: monthlyExpenses[i].personal,
      net: inc.total - monthlyExpenses[i].total,
    })),
    expense_by_category: Object.values(byCat).sort((a, b) => b.total - a.total),
    vat_periods: vatPeriods,
    pipeline,
    docs_pending: docs.filter(d => d.status !== 'approved').length,
    docs_approved: docs.filter(d => d.status === 'approved').length,
  });
}
