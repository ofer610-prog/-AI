import { getAuthUrl } from '@/lib/gmail';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

const STATE_SECRET = process.env.NEXTAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'oauth-state-secret';

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const sb = createServiceClient();
  const { data: profile } = await sb
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return new Response('No organization', { status: 400 });

  // Embed org_id in signed state so callback doesn't rely on session cookies
  const payload = Buffer.from(JSON.stringify({
    org_id: profile.organization_id,
    user_id: user.id,
    ts: Date.now(),
  })).toString('base64url');

  const sig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  const state = `${payload}.${sig}`;

  return Response.redirect(getAuthUrl(state));
}
