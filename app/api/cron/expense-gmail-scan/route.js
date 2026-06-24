import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { scanOrg } from '@/lib/expenseGmailScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  if (!validateCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createServiceClient();
  const { data: orgs, error } = await sb.from('organizations')
    .select('id,gmail_refresh_token,office_card_last4,drive_expenses_folder_id')
    .eq('gmail_connected', true)
    .not('gmail_refresh_token', 'is', null);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const org of orgs || []) results.push({ org_id: org.id, ...(await scanOrg(sb, org).catch(e => ({ error: e.message }))) });
  return Response.json({ ok: true, orgs: orgs?.length || 0, results });
}
