import { requireAdmin, forbidden } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { israelToday } from '@/lib/helpers';

export const dynamic = 'force-dynamic';

const VAT_RATE = 0.18;

/**
 * GET /api/tax — tax obligations summary + upcoming deadlines.
 * Uses invoices + office_expenses (the actual live tables) for all estimates.
 */
export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return forbidden();

  const sb = createServiceClient();

  const { data: org } = await sb.from('organizations')
    .select('id, name, vat_rate, filing_freq')
    .eq('id', profile.organization_id).single();
  if (!org) return Response.json({ error: 'No org' }, { status: 404 });

  const today = israelToday();
  const year = new Date(today).getFullYear();
  const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);

  // Use invoices (real income) + office_expenses (real expenses)
  const [invRes, expRes, officeExpRes] = await Promise.all([
    sb.from('invoices')
      .select('amount, vat_amount, issue_date, status')
      .eq('organization_id', profile.organization_id)
      .gte('issue_date', sixMonthsAgo)
      .order('issue_date', { ascending: false }),
    sb.from('office_expenses')
      .select('amount, month, year, section, item_name')
      .eq('organization_id', profile.organization_id)
      .eq('year', year),
    // also get this year's full invoices for YTD
    sb.from('invoices')
      .select('amount, vat_amount, issue_date, status')
      .eq('organization_id', profile.organization_id)
      .gte('issue_date', `${year}-01-01`)
      .lte('issue_date', `${year}-12-31`),
  ]);

  const invoices6m = invRes.data || [];
  const officeExp = expRes.data || [];
  const invoicesYTD = officeExpRes.data || [];

  // Recent 3 months — income from invoices
  const inv3m = invoices6m.filter(i => i.issue_date >= threeMonthsAgo);
  const avgIncome = inv3m.reduce((s, i) => s + Number(i.amount || 0), 0) / 3;
  const avgVatOut = inv3m.reduce((s, i) => {
    return s + (Number(i.vat_amount || 0) || Number(i.amount || 0) * VAT_RATE / (1 + VAT_RATE));
  }, 0) / 3;

  // Recent 3 months — expenses from office_expenses (by month)
  const currentMonth = new Date().getMonth() + 1;
  const recentMonths = [currentMonth - 2, currentMonth - 1, currentMonth].map(m => m <= 0 ? m + 12 : m);
  const exp3m = officeExp.filter(e => recentMonths.includes(e.month) && !['salary','pension','vat_payment','income_tax'].includes(e.section));
  const avgExpense = exp3m.reduce((s, e) => s + Number(e.amount || 0), 0) / 3;
  const avgVatIn = exp3m.reduce((s, e) => s + Number(e.amount || 0) * VAT_RATE * 0.8, 0) / 3; // ~80% eligible

  const avgNet = avgIncome - avgExpense;

  // VAT actual payments this year
  const vatPaid = officeExp
    .filter(e => e.section === 'vat_payment')
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const incomeTaxPaid = officeExp
    .filter(e => e.section === 'income_tax')
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  // YTD income
  const ytdIncome = invoicesYTD.reduce((s, i) => s + Number(i.amount || 0), 0);
  const ytdPaid = invoicesYTD.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0);
  const ytdUnpaid = ytdIncome - ytdPaid;
  const ytdVatOutput = invoicesYTD.reduce((s, i) => {
    return s + (Number(i.vat_amount || 0) || Number(i.amount || 0) * VAT_RATE / (1 + VAT_RATE));
  }, 0);

  const vatPeriodMonths = org.filing_freq === 'monthly' ? 1 : 2;
  const estimatedVat = Math.round(Math.max(0, (avgVatOut - avgVatIn) * vatPeriodMonths));
  // Israeli progressive tax estimate: simplified at ~25% for law firm income levels
  const estimatedIncomeTax = Math.round(Math.max(0, avgNet * 3 * 0.25));
  // Bituach Leumi: ~9.61% on income above minimum (simplified)
  const estimatedBituach = Math.round(Math.min(Math.max(0, avgNet), 45000) * 0.0961);

  return Response.json({
    org: { filing_freq: org.filing_freq || 'bi-monthly', vat_rate: org.vat_rate || VAT_RATE },
    estimates: {
      estimatedVat, estimatedIncomeTax, estimatedBituach,
      avgIncome, avgExpense, avgNet,
    },
    ytd: {
      income: ytdIncome, paid: ytdPaid, unpaid: ytdUnpaid,
      vat_output: ytdVatOutput, vat_paid: vatPaid,
      income_tax_paid: incomeTaxPaid,
      estimated_annual_tax: Math.round(Math.max(0, (ytdIncome - officeExp.reduce((s,e)=>s+Number(e.amount||0),0)) * 0.25)),
    },
    // legacy shape kept for compatibility
    income: inv3m.map(i => ({ amount: i.amount, vat: i.vat_amount || 0, date: i.issue_date })),
    expense: exp3m.map(e => ({ amount: e.amount, vat: 0, date: `${year}-${String(e.month).padStart(2,'0')}-01` })),
  });
}
