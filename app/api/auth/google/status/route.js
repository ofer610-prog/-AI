import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data: org, error } = await sb
    .from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email')
    .eq('id', profile.organization_id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    ok: true,
    gmail_connected: !!org?.gmail_connected,
    has_refresh_token: !!org?.gmail_refresh_token,
    gmail_email: org?.gmail_email || null,
    usable: !!org?.gmail_connected && !!org?.gmail_refresh_token,
  });
}
