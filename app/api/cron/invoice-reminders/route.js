import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsappToOffice, sendWhatsappToPhone, buildOverdueReminderMessage } from '@/lib/notifications';
import { israelToday } from '@/lib/helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/invoice-reminders
 * Called daily at 10:00 (Israel time).
 * Sends WhatsApp reminder to the office about overdue invoices.
 * Also sends reminders to clients (via WhatsApp/email) for invoices
 * that are 7, 14, or 30 days overdue.
 */
export async function GET(request) {
  
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations').select('id, name').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  const today = israelToday();

  // All overdue invoices (not reminded today already)
  const { data: overdue } = await sb
    .from('invoices')
    .select('id, number, client_name, client_id, amount, due_date, last_reminder_sent, reminder_count, clients(phone, email)')
    .eq('organization_id', org.id)
    .in('status', ['open', 'sent'])
    .lt('due_date', today)
    .order('due_date', { ascending: true });

  if (!overdue?.length) {
    return Response.json({ ok: true, reminders: 0 });
  }

  // Filter: don't remind if already reminded today
  const pending = overdue.filter(
    (inv) => !inv.last_reminder_sent || inv.last_reminder_sent < today
  );

  if (!pending.length) {
    return Response.json({ ok: true, reminders: 0, skipped: overdue.length });
  }

  // Send office summary
  await sendWhatsappToOffice(buildOverdueReminderMessage({ invoices: pending }));

  // Per-client reminders: only on milestone days (7, 14, 30 overdue)
  let clientRemindersSent = 0;
  for (const inv of pending) {
    const daysLate = Math.floor((Date.now() - new Date(inv.due_date)) / 86400000);
    const isMilestone = [7, 14, 30].includes(daysLate);
    if (!isMilestone) continue;

    const phone = inv.clients?.phone;
    if (!phone) continue;

    const msg = [
      `שלום ${inv.client_name},`,
      ``,
      `תזכורת ידידותית: חשבונית מס׳ ${inv.number || ''}`,
      `סכום: ₪${Number(inv.amount).toLocaleString('he-IL')}`,
      `תאריך פירעון היה: ${new Date(inv.due_date).toLocaleDateString('he-IL')}`,
      ``,
      `לפרטים ולסיום — אנא צרו קשר עם המשרד.`,
    ].join('\n');

    const ok = await sendWhatsappToPhone(phone, msg);
    if (ok) clientRemindersSent++;

    // Update reminder tracking
    await sb.from('invoices').update({
      last_reminder_sent: today,
      reminder_count: (inv.reminder_count || 0) + 1,
    }).eq('id', inv.id);
  }

  return Response.json({
    ok: true,
    officeReminder: true,
    invoicesOverdue: pending.length,
    clientRemindersSent,
  });
}
