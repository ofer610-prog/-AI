import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/command — everything the office manager needs in one call:
 *  - per-lawyer workload: open tasks (overdue flagged), active cases by stage
 *  - collections: unpaid balances ranked
 *  - invoices: open / overdue
 *  - office expenses: current month + YTD
 *  - upcoming deliveries / events this week
 */
export async function GET() {
  const authSb = await createClient();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data: profile } = await sb
    .from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });
  const orgId = profile.organization_id;

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString();

  const [
    { data: lawyers },
    { data: tasks },
    { data: matters },
    { data: invoices },
    { data: expenses },
    { data: events },
    { data: timeEntries },
  ] = await Promise.all([
    sb.from('profiles').select('id, full_name, role').eq('organization_id', orgId).eq('is_active', true),
    sb.from('tasks')
      .select('id, description, assigned_to, due_date, status, priority')
      .eq('organization_id', orgId).neq('status', 'done').neq('status', 'cancelled'),
    sb.from('matters')
      .select('id, title, stage, case_category, responsible_lawyer_id, balance_amount, collected_amount, delivery_date, payment_status, clients(name)')
      .eq('organization_id', orgId).eq('status', 'active'),
    sb.from('invoices')
      .select('id, client_name, amount, due_date, status')
      .eq('organization_id', orgId).not('status', 'in', '("paid","cancelled")'),
    sb.from('office_expenses')
      .select('section, item_name, month, amount')
      .eq('organization_id', orgId).eq('year', year),
    sb.from('events')
      .select('id, title, start_time, event_type, assigned_to, attendee_name')
      .eq('organization_id', orgId)
      .gte('start_time', new Date().toISOString()).lte('start_time', weekAhead)
      .order('start_time').limit(20),
    sb.from('time_entries')
      .select('user_id, started_at, ended_at')
      .eq('organization_id', orgId)
      .gte('started_at', `${today}T00:00:00+00:00`)
      .not('ended_at', 'is', null),
  ]);

  // ── Per-lawyer workload ──
  const byLawyer = (lawyers || []).map((l) => {
    const myTasks = (tasks || []).filter((t) => t.assigned_to === l.id);
    const overdue = myTasks.filter((t) => t.due_date && t.due_date < today);
    const myCases = (matters || []).filter((m) => m.responsible_lawyer_id === l.id);
    const stages = {};
    myCases.forEach((m) => { const s = m.stage || 'אחר'; stages[s] = (stages[s] || 0) + 1; });
    const toCollect = myCases.reduce((s, m) => s + Number(m.balance_amount || 0), 0);
    const deliveriesSoon = myCases.filter((m) =>
      m.delivery_date && m.delivery_date >= today &&
      m.delivery_date <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    const myTimeEntries = (timeEntries || []).filter((e) => e.user_id === l.id);
    const todayMinutes = myTimeEntries.reduce((s, e) => {
      if (!e.ended_at) return s;
      return s + Math.floor((new Date(e.ended_at) - new Date(e.started_at)) / 60000);
    }, 0);
    return {
      id: l.id, name: l.full_name, role: l.role,
      open_tasks: myTasks.length,
      overdue_tasks: overdue.length,
      overdue_list: overdue.slice(0, 5).map((t) => ({ id: t.id, description: t.description, due_date: t.due_date })),
      active_cases: myCases.length,
      stages,
      to_collect: Math.round(toCollect),
      deliveries_14d: deliveriesSoon.map((m) => ({ id: m.id, title: m.title, date: m.delivery_date })),
      today_minutes: todayMinutes,
    };
  });

  // Unassigned open tasks
  const unassigned = (tasks || []).filter((t) => !t.assigned_to);

  // ── Collections ──
  const collections = (matters || [])
    .filter((m) => Number(m.balance_amount || 0) > 0)
    .sort((a, b) => Number(b.balance_amount) - Number(a.balance_amount))
    .slice(0, 15)
    .map((m) => ({
      id: m.id, title: m.title, client: m.clients?.name || m.title,
      balance: Math.round(Number(m.balance_amount)),
      collected: Math.round(Number(m.collected_amount || 0)),
      lawyer_id: m.responsible_lawyer_id,
      payment_status: m.payment_status,
    }));
  const totalToCollect = (matters || []).reduce((s, m) => s + Number(m.balance_amount || 0), 0);

  // ── Invoices ──
  const overdueInvoices = (invoices || []).filter((i) => i.due_date && i.due_date < today);

  // ── Office expenses ──
  const monthExpenses = (expenses || []).filter((e) => e.month === month);
  const expMonthTotal = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const expYtdTotal = (expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const expBySection = {};
  monthExpenses.forEach((e) => {
    expBySection[e.section] = (expBySection[e.section] || 0) + Number(e.amount || 0);
  });

  return Response.json({
    today,
    lawyers: byLawyer,
    unassigned_tasks: unassigned.length,
    collections: {
      total: Math.round(totalToCollect),
      top: collections,
    },
    invoices: {
      open: (invoices || []).length,
      open_amount: Math.round((invoices || []).reduce((s, i) => s + Number(i.amount || 0), 0)),
      overdue: overdueInvoices.length,
      overdue_amount: Math.round(overdueInvoices.reduce((s, i) => s + Number(i.amount || 0), 0)),
      overdue_list: overdueInvoices.slice(0, 10),
    },
    expenses: {
      month_total: Math.round(expMonthTotal),
      ytd_total: Math.round(expYtdTotal),
      by_section: expBySection,
    },
    week_events: events || [],
  });
}
