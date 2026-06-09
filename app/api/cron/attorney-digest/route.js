import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import {
  sendWhatsappToPhone, sendEmail,
  buildAttorneyDigest, buildAttorneyDigestEmail,
  isWhatsappEnabled,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/cron/attorney-digest  — Vercel cron, runs every morning Sun–Thu 07:00 Israel
 * POST /api/cron/attorney-digest  — manual trigger (admin, PIN-protected)
 *   body: { pin, lawyerId? }  — if lawyerId supplied, sends only to that attorney
 */

export async function GET(request) {
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runDigest({});
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const pin  = body.pin || request.headers.get('x-cases-pin');
  if (!pin || String(pin) !== String(process.env.CASES_ACCESS_PIN || '')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runDigest({ lawyerId: body.lawyerId || null });
}

async function runDigest({ lawyerId }) {
  const sb = createServiceClient();

  // Get org
  const { data: org } = await sb
    .from('organizations').select('id, name').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  // Get all active attorneys (optionally filtered to one)
  let lawyerQ = sb.from('profiles')
    .select('id, full_name, phone, email')
    .eq('organization_id', org.id)
    .eq('is_active', true);
  if (lawyerId) lawyerQ = lawyerQ.eq('id', lawyerId);
  const { data: lawyers } = await lawyerQ;
  if (!lawyers?.length) return Response.json({ ok: true, sent: 0, skipped: 'no active lawyers' });

  const today = new Date().toISOString().slice(0, 10);
  const in14  = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  // Load all data once for the org, then filter per attorney
  const [
    { data: allTasks },
    { data: allMatters },
  ] = await Promise.all([
    sb.from('tasks')
      .select('id, task_number, task_type, description, due_date, status, priority, notes, assigned_to, matter_id, matters(id, title, case_number, property_address), profiles!assigned_to(id, full_name)')
      .eq('organization_id', org.id)
      .eq('status', 'open')
      .order('due_date', { ascending: true, nullsFirst: false }),

    sb.from('matters')
      .select('id, title, type, stage, delivery_date, balance_amount, collected_amount, fee_text, responsible_lawyer_id, clients(id, name, phone), profiles!responsible_lawyer_id(id, full_name)')
      .eq('organization_id', org.id)
      .neq('stage', 'closed'),
  ]);

  const results = [];

  for (const lawyer of lawyers) {
    // Filter tasks for this attorney
    const myTasks        = (allTasks || []).filter(t => t.assigned_to === lawyer.id);
    const overdueTasks   = myTasks.filter(t => t.due_date && t.due_date < today);
    const openTasks      = myTasks.filter(t => !t.due_date || t.due_date >= today);

    // Filter matters for this attorney
    const myMatters           = (allMatters || []).filter(m => m.responsible_lawyer_id === lawyer.id);
    const overdueDeliveries   = myMatters.filter(m => m.delivery_date && m.delivery_date < today);
    const upcomingDeliveries  = myMatters.filter(m => m.delivery_date && m.delivery_date >= today && m.delivery_date <= in14);
    const collectionCases     = myMatters
      .filter(m => Number(m.balance_amount || 0) > 0)
      .sort((a, b) => Number(b.balance_amount) - Number(a.balance_amount));

    // Skip if nothing to report
    const hasContent = overdueTasks.length || openTasks.filter(t => {
      if (!t.due_date) return false;
      return (new Date(t.due_date) - new Date()) / 86400000 <= 7;
    }).length || overdueDeliveries.length || upcomingDeliveries.length || collectionCases.length;

    if (!hasContent) {
      results.push({ lawyer: lawyer.full_name, sent: false, reason: 'nothing to report' });
      continue;
    }

    const params = { lawyerName: lawyer.full_name, overdueTasks, openTasks, upcomingDeliveries, collectionCases, overdueDeliveries };

    // Send WhatsApp if phone is set
    let waSent = false;
    if (lawyer.phone && isWhatsappEnabled()) {
      const msg = buildAttorneyDigest(params);
      waSent    = await sendWhatsappToPhone(lawyer.phone, msg);
    }

    // Send email if email is set
    let emailSent = false;
    if (lawyer.email) {
      const html    = buildAttorneyDigestEmail({ ...params, officeName: org.name });
      const subject = `סיכום בוקר — ${new Date().toLocaleDateString('he-IL')}`;
      emailSent     = await sendEmail({ to: lawyer.email, subject, html });
    }

    // Log the digest send
    await sb.from('attorney_digests').insert({
      organization_id:   org.id,
      lawyer_id:         lawyer.id,
      sent_at:           new Date().toISOString(),
      overdue_tasks:     overdueTasks.length,
      open_tasks:        openTasks.length,
      upcoming_deliveries: upcomingDeliveries.length,
      overdue_deliveries:  overdueDeliveries.length,
      collection_cases:  collectionCases.length,
      wa_sent:           waSent,
      email_sent:        emailSent,
    }).then(() => {}).catch(() => {}); // table may not exist yet, ignore

    results.push({ lawyer: lawyer.full_name, waSent, emailSent, overdueTasks: overdueTasks.length, openTasks: openTasks.length });
  }

  return Response.json({ ok: true, results });
}
