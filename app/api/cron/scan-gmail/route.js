/**
 * GET /api/cron/scan-gmail
 * Legacy cron entry-point — now delegates to the unified scanOrg engine.
 * Kept for backwards-compatibility with vercel.json cron schedule.
 */
import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { scanOrgAll } from '@/lib/expenseGmailScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  if (!validateCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return runScan();
}

export async function POST(request) {
  if (!validateCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return runScan();
}

async function runScan() {
  const sb = createServiceClient();
  // Any org with at least one connected Gmail mailbox (primary or second).
  const { data: orgs, error } = await sb.from('organizations')
    .select('id,gmail_refresh_token,gmail2_refresh_token,office_card_last4,drive_expenses_folder_id')
    .or('gmail_refresh_token.not.is.null,gmail2_refresh_token.not.is.null');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const org of orgs || []) {
    results.push({ org_id: org.id, ...(await scanOrgAll(sb, org, 7).catch(e => ({ error: e.message }))) });
  }
  return Response.json({ ok: true, orgs: orgs?.length || 0, results });
}
