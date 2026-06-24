import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { syncGoogleToSupabase } from '@/lib/googleCalendar';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();

  // Sync all orgs that have a Gmail/Calendar refresh token
  const { data: orgs } = await sb
    .from('organizations')
    .select('id, gmail_refresh_token')
    .eq('gmail_connected', true)
    .not('gmail_refresh_token', 'is', null);

  const results = [];
  for (const org of orgs || []) {
    try {
      const stats = await syncGoogleToSupabase(sb, org.id, org.gmail_refresh_token);
      results.push({ org: org.id, ...stats });
    } catch (err) {
      results.push({ org: org.id, error: err.message });
    }
  }

  return Response.json({ ok: true, results });
}
