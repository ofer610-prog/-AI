import { validateCronSecret } from '@/lib/security';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendAccountantReport } from '@/lib/accountantReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET  /api/cron/accountant-report — monthly cron (CRON_SECRET).
 *      Sends the PREVIOUS month's expense report to the accountant.
 * POST /api/cron/accountant-report — manual send (session auth).
 *      Body: { year?, month?, accountant_email? } — saving the email is supported here too.
 */

function prevMonth() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const m = now.getMonth(); // 0-based: current month; 0 → previous is December
  return m === 0 ? { year: now.getFullYear() - 1, month: 12 } : { year: now.getFullYear(), month: m };
}

export async function GET(request) {
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('id').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  const { year, month } = prevMonth();
  const result = await sendAccountantReport(sb, org.id, year, month);
  console.log('Accountant report:', result);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

export async function POST(request) {
  const authSb = await createClient();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data: profile } = await sb
    .from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const body = await request.json().catch(() => ({}));

  // Save accountant email if provided
  if (body.accountant_email !== undefined) {
    const email = String(body.accountant_email).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 });
    }
    await sb.from('organizations')
      .update({ accountant_email: email || null })
      .eq('id', profile.organization_id);
    if (!body.send) return Response.json({ ok: true, saved: true });
  }

  const def = prevMonth();
  const year = Number(body.year) || def.year;
  const month = Number(body.month) || def.month;
  if (month < 1 || month > 12) return Response.json({ error: 'invalid month' }, { status: 400 });

  const result = await sendAccountantReport(sb, profile.organization_id, year, month);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
