/**
 * GET /api/auth/outlook/connect
 * Redirects the user to Microsoft OAuth consent screen.
 */
import { getOutlookAuthUrl } from '@/lib/outlookClient';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const STATE_SECRET = process.env.NEXTAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'oauth-state-secret';

export async function GET(request) {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return new Response('Microsoft OAuth לא מוגדר. הוסף MICROSOFT_CLIENT_ID לסביבה.', { status: 501 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.redirect(new URL('/login', request.url), 302);

  const sb = createServiceClient();
  const { data: profile } = await sb.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile?.organization_id) return new Response('No organization', { status: 400 });

  const url = new URL(request.url);
  const returnTo = url.searchParams.get('return_to') || '/command';

  const payload = Buffer.from(JSON.stringify({
    org_id: profile.organization_id,
    user_id: user.id,
    return_to: returnTo,
    ts: Date.now(),
  })).toString('base64url');

  const sig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  const state = `${payload}.${sig}`;

  return Response.redirect(getOutlookAuthUrl(state), 302);
}
