import { createClient, createServiceClient } from '@/lib/supabase/server';
import { syncGoogleToSupabase } from '@/lib/googleCalendar';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const { data: org } = await service
    .from('organizations')
    .select('gmail_refresh_token, gmail_connected')
    .eq('id', profile.organization_id)
    .single();

  if (!org?.gmail_refresh_token) {
    return Response.json({
      error: 'no_token',
      message: 'יש לחבר חשבון Google תחילה (הרשאת יומן)',
    }, { status: 400 });
  }

  try {
    const stats = await syncGoogleToSupabase(service, profile.organization_id, org.gmail_refresh_token);
    return Response.json({ ok: true, ...stats });
  } catch (err) {
    // Calendar scope not yet granted — prompt re-auth
    if (err.message?.includes('insufficientPermissions') || err.message?.includes('invalid_grant') || err.code === 403) {
      return Response.json({ error: 'no_calendar_scope', message: 'נדרשת הרשאת יומן — אנא חבר מחדש את חשבון Google' }, { status: 403 });
    }
    console.error('Calendar sync error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
