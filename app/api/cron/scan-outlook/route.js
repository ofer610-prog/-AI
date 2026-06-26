/**
 * GET/POST /api/cron/scan-outlook
 * Cron: scan all connected Outlook mailboxes for invoices, salary slips, tax payments.
 */
import { validateCronSecret } from '@/lib/security';
import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { scanOutlookOrg } from '@/lib/expenseOutlookScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function runScan(days = 7) {
  const sb = createServiceClient();
  const { data: orgs, error } = await sb.from('organizations')
    .select('id,outlook_refresh_token,outlook_email,outlook_connected,drive_expenses_folder_id')
    .eq('outlook_connected', true)
    .not('outlook_refresh_token', 'is', null);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const org of orgs || []) {
    results.push({
      org_id: org.id,
      email: org.outlook_email,
      ...(await scanOutlookOrg(sb, org, days).catch(e => ({ error: e.message }))),
    });
  }
  return Response.json({ ok: true, orgs: orgs?.length || 0, results });
}

// Cron invocation (CRON_SECRET header)
export async function GET(request) {
  if (!validateCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return runScan(7);
}

// Manual invocation from UI (admin session)
export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get('days') || 30), 7), 180);

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('id,outlook_refresh_token,outlook_email,outlook_connected,drive_expenses_folder_id')
    .eq('id', profile.organization_id).single();

  if (!org?.outlook_connected || !org.outlook_refresh_token) {
    return Response.json({ error: 'Outlook לא מחובר.' }, { status: 400 });
  }

  try {
    const result = await scanOutlookOrg(sb, org, days);
    return Response.json({ ok: true, days, ...result });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
