import { requireAdmin, forbidden } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { israelToday } from '@/lib/helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tax — tax obligations summary + upcoming deadlines.
 * Returns last 6 months of income/expense for estimation + org settings.
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
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);

  const [{ data: income }, { data: expense }] = await Promise.all([
    sb.from('income').select('amount, vat, date')
      .eq('organization_id', org.id)
      .gte('date', sixMonthsAgo).order('date', { ascending: false }),
    sb.from('expense').select('amount, vat, date')
      .eq('organization_id', org.id)
      .gte('date', sixMonthsAgo).order('date', { ascending: false }),
  ]);

  // Monthly averages (last 3 months)
  const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const rec3Inc = (income || []).filter(i => i.date >= threeMonthsAgo);
  const rec3Exp = (expense || []).filter(e => e.date >= threeMonthsAgo);
  const avgIncome  = rec3Inc.reduce((s, i) => s + Number(i.amount || 0), 0) / 3;
  const avgExpense = rec3Exp.reduce((s, i) => s + Number(i.amount || 0), 0) / 3;
  const avgVatIn   = rec3Inc.reduce((s, i) => s + Number(i.vat || 0), 0) / 3;
  const avgVatOut  = rec3Exp.reduce((s, i) => s + Number(i.vat || 0), 0) / 3;
  const avgNet     = avgIncome - avgExpense;

  const vatPeriodMonths = org.filing_freq === 'monthly' ? 1 : 2;
  const estimatedVat     = Math.round(Math.max(0, (avgVatIn - avgVatOut) * vatPeriodMonths));
  const estimatedIncomeTax = Math.round(Math.max(0, avgNet * 0.30));
  const estimatedBituach   = Math.round(Math.min(Math.max(0, avgNet), 50000) * 0.13);

  return Response.json({
    org: { filing_freq: org.filing_freq, vat_rate: org.vat_rate },
    estimates: { estimatedVat, estimatedIncomeTax, estimatedBituach, avgIncome, avgExpense, avgNet },
    income: income || [],
    expense: expense || [],
  });
}
