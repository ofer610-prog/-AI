import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsappToPhone } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/event-reminders
 * Called every hour by GitHub Actions.
 * Sends WhatsApp reminders for events starting in 23–25 hours from now.
 */
export async function GET(request) {
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Window: 23h to 25h from now
  const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const to   = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const sb = createServiceClient();

  const { data: events, error } = await sb
    .from('events')
    .select('id, title, start_time, attendee_name, attendee_phone, location, event_type, organization_id, organizations(name)')
    .is('reminder_sent', null)
    .neq('reminder_sent', true)
    .gte('start_time', from.toISOString())
    .lte('start_time', to.toISOString());

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];

  for (const ev of events || []) {
    if (!ev.attendee_phone) {
      results.push({ id: ev.id, skipped: 'no phone' });
      continue;
    }

    const evDate = new Date(ev.start_time);
    const dateStr = evDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });
    const timeStr = evDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' });
    const officeName = ev.organizations?.name || 'משרד עורכי דין';

    const msg = [
      `שלום${ev.attendee_name ? ` ${ev.attendee_name}` : ''},`,
      ``,
      `📅 *תזכורת: ${ev.title}*`,
      ``,
      `📆 מתי: ${dateStr} בשעה ${timeStr}`,
      ev.location ? `📍 מיקום: ${ev.location}` : null,
      ``,
      `בברכה,`,
      `${officeName}`,
    ].filter(l => l !== null).join('\n');

    const sent = await sendWhatsappToPhone(ev.attendee_phone, msg);

    // Mark as sent regardless — prevents retrying failed sends every hour
    await sb.from('events').update({ reminder_sent: true }).eq('id', ev.id);

    results.push({ id: ev.id, phone: ev.attendee_phone, sent });
  }

  console.log(`Event reminders: ${results.length} events processed`);
  return Response.json({ ok: true, processed: results.length, results });
}
