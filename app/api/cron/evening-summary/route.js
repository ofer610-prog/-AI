import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsappToOffice, buildEveningSummary } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/evening-summary
 * Called daily at 19:00 (Israel time) by Vercel cron.
 */
export async function GET(request) {
  
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations').select('id, name').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const today      = new Date().toISOString().slice(0, 10);

  // Today's events (mark past ones as completed automatically)
  const { data: todayEvents } = await sb
    .from('events')
    .select('id, title, start_time, end_time, all_day, attendee_name, status')
    .eq('organization_id', org.id)
    .neq('status', 'cancelled')
    .gte('start_time', todayStart.toISOString())
    .lte('start_time', todayEnd.toISOString())
    .order('start_time', { ascending: true });

  // Payments received today
  const { data: todayPayments } = await sb
    .from('payments')
    .select('amount')
    .eq('organization_id', org.id)
    .eq('payment_date', today);
  const paymentsToday = (todayPayments || []).reduce((s, p) => s + Number(p.amount), 0);

  // New clients today
  const { count: newClients } = await sb
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .gte('created_at', todayStart.toISOString());

  const completedEvents = (todayEvents || []).filter(
    (e) => e.status === 'completed' || new Date(e.start_time) < new Date()
  );

  const msg = buildEveningSummary({
    officeName:      org.name,
    completedEvents,
    paymentsToday,
    newClients:      newClients || 0,
  });

  const sent = await sendWhatsappToOffice(msg);

  return Response.json({ ok: true, sent, completedEvents: completedEvents.length, paymentsToday });
}
