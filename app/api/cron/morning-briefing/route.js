import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsappToOffice, buildMorningBriefing } from '@/lib/notifications';
import { israelToday, israelDayRange } from '@/lib/helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/morning-briefing
 * Called daily at 08:00 (Israel time) by Vercel cron.
 * Sends a WhatsApp morning briefing to the office group.
 */
export async function GET(request) {
  
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations').select('id, name').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  const { start: todayStart, end: todayEnd } = israelDayRange();
  const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  // Today's events
  const { data: todayEvents } = await sb
    .from('events')
    .select('id, title, start_time, end_time, all_day, attendee_name, attendee_phone, clients(name)')
    .eq('organization_id', org.id)
    .neq('status', 'cancelled')
    .gte('start_time', todayStart.toISOString())
    .lte('start_time', todayEnd.toISOString())
    .order('start_time', { ascending: true });

  // Overdue invoices
  const today = israelToday();
  const { data: overdueInvoices } = await sb
    .from('invoices')
    .select('id, number, client_name, amount, due_date')
    .eq('organization_id', org.id)
    .in('status', ['open', 'sent'])
    .lt('due_date', today)
    .order('due_date', { ascending: true })
    .limit(10);

  // Open invoices total
  const { data: openInvs } = await sb
    .from('invoices')
    .select('amount')
    .eq('organization_id', org.id)
    .in('status', ['open', 'sent']);
  const openInvoicesTotal = (openInvs || []).reduce((s, i) => s + Number(i.amount), 0);

  // Unmatched bank credits
  const { count: unmatchedCredits } = await sb
    .from('bank_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .gt('amount', 0)
    .is('matched_invoice_id', null)
    .neq('alert_status', 'dismissed');

  // Payments this week
  const { data: weekPayments } = await sb
    .from('payments')
    .select('amount')
    .eq('organization_id', org.id)
    .gte('payment_date', weekStart.toISOString().slice(0, 10));
  const paymentsThisWeek = (weekPayments || []).reduce((s, p) => s + Number(p.amount), 0);

  const msg = buildMorningBriefing({
    officeName:       org.name,
    todayEvents:      (todayEvents || []).map((e) => ({ ...e, client_name: e.clients?.name })),
    overdueInvoices:  overdueInvoices || [],
    openInvoicesTotal,
    openInvoicesCount: (openInvs || []).length,
    unmatchedCredits: unmatchedCredits || 0,
    paymentsThisWeek,
  });

  const sent = await sendWhatsappToOffice(msg);

  return Response.json({ ok: true, sent, events: (todayEvents || []).length, overdue: (overdueInvoices || []).length });
}
