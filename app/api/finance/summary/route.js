import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id, role').eq('id', user.id).single();
  if (!profile || !['admin','accountant'].includes(profile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const orgId = profile.organization_id;
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
      .eq('status', 'open'),
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

  const open = openInvoices || [];
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
