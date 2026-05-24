import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  // Load first org (demo mode)
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) return Response.json({ error: 'No organization found' }, { status: 404 });

  const orgId = org.id;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [
    { data: todayPayments },
    { data: weekPayments },
    { data: monthPayments },
    { data: openInvoices },
    { data: recentPayments },
  ] = await Promise.all([
    supabase
      .from('payments')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('payment_date', todayStr),
    supabase
      .from('payments')
      .select('amount')
      .eq('organization_id', orgId)
      .gte('payment_date', weekStartStr),
    supabase
      .from('payments')
      .select('amount')
      .eq('organization_id', orgId)
      .gte('payment_date', monthStart),
    supabase
      .from('invoices')
      .select('id, amount, due_date, status')
      .eq('organization_id', orgId)
      .in('status', ['open', 'sent', 'draft', 'overdue']),
    supabase
      .from('payments')
      .select('id, amount, payment_date, method, client_id, clients(name)')
      .eq('organization_id', orgId)
      .order('payment_date', { ascending: false })
      .limit(10),
  ]);

  const sum = (arr) => (arr || []).reduce((a, b) => a + Number(b.amount || 0), 0);

  const today_income = sum(todayPayments);
  const week_income = sum(weekPayments);
  const month_income = sum(monthPayments);

  const open = (openInvoices || []).filter(i => i.status !== 'paid' && i.status !== 'cancelled');
  const overdue = open.filter(i => i.due_date && i.due_date < todayStr);

  return Response.json({
    today_income,
    week_income,
    month_income,
    open_invoices_count: open.length,
    open_invoices_total: sum(open),
    overdue_count: overdue.length,
    overdue_total: sum(overdue),
    recent_payments: (recentPayments || []).map(p => ({
      id: p.id,
      amount: p.amount,
      payment_date: p.payment_date,
      method: p.method,
      client_name: p.clients?.name || '—',
    })),
  });
}
