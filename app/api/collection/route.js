import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, forbidden } from '@/lib/adminAuth';
import { sendWhatsappToPhone } from '@/lib/notifications';
import { israelToday } from '@/lib/helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/collection — full aging report, grouped by lawyer then by client.
 * Admin/accountant only.
 */
export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return forbidden();

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('id, name, vat_rate, filing_freq')
    .order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 404 });

  const today = israelToday();

  const [{ data: invoices }, { data: matters }, { data: lawyers }] = await Promise.all([
    sb.from('invoices')
      .select('id, number, client_id, client_name, amount, issue_date, due_date, status, notes, last_reminder_sent, reminder_count, clients(name, phone, email), matters(title, responsible_lawyer_id)')
      .eq('organization_id', org.id)
      .in('status', ['open', 'sent'])
      .order('due_date', { ascending: true }),
    sb.from('matters')
      .select('id, title, case_number, agreed_fee, collected_amount, balance_amount, payment_status, responsible_lawyer_id, client_id, clients(name, phone)')
      .eq('organization_id', org.id)
      .gt('balance_amount', 0)
      .order('balance_amount', { ascending: false }),
    sb.from('profiles')
      .select('id, full_name').eq('organization_id', org.id).eq('is_active', true).order('full_name'),
  ]);

  // Enrich invoices with aging bucket
  const enriched = (invoices || []).map(inv => {
    const daysLate = inv.due_date ? Math.floor((Date.now() - new Date(inv.due_date)) / 86400000) : 0;
    const bucket = daysLate <= 0 ? 'current' : daysLate <= 30 ? '1-30' : daysLate <= 60 ? '31-60' : daysLate <= 90 ? '61-90' : '90+';
    const lastReminder = inv.last_reminder_sent;
    const daysSinceReminder = lastReminder ? Math.floor((Date.now() - new Date(lastReminder)) / 86400000) : null;
    return { ...inv, daysLate, bucket, daysSinceReminder };
  });

  const totalOverdue = enriched.filter(i => i.daysLate > 0).reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalOpen    = enriched.reduce((s, i) => s + Number(i.amount || 0), 0);

  return Response.json({
    invoices: enriched,
    matters: matters || [],
    lawyers: lawyers || [],
    summary: { totalOpen, totalOverdue, count: enriched.length, overdueCount: enriched.filter(i => i.daysLate > 0).length },
  });
}
