/**
 * GET /api/auth/outlook/callback
 * Receives the OAuth authorization code from Microsoft and stores tokens.
 */
import { exchangeOutlookCode, getOutlookUserEmail } from '@/lib/outlookClient';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const STATE_SECRET = process.env.NEXTAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'oauth-state-secret';

function verifyState(stateParam) {
  if (!stateParam || !stateParam.includes('.')) return null;
  const lastDot = stateParam.lastIndexOf('.');
  const payload = stateParam.slice(0, lastDot);
  const sig = stateParam.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
}

function back(request, returnTo, params = {}) {
  const target = new URL(returnTo || '/command', request.url);
  Object.entries(params).forEach(([k, v]) => target.searchParams.set(k, String(v)));
  return Response.redirect(target, 302);
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const stateParam = url.searchParams.get('state');
  const stateData = verifyState(stateParam);
  const returnTo = stateData?.return_to || '/command';

  if (error) return back(request, returnTo, { outlook_error: error });
  if (!code) return back(request, returnTo, { outlook_error: 'no_code' });

  let orgId = stateData?.org_id || null;

  // Fallback: get orgId from session if state was lost
  if (!orgId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return back(request, returnTo, { outlook_error: 'session_lost' });
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      orgId = profile?.organization_id;
    } catch {}
  }

  if (!orgId) return back(request, returnTo, { outlook_error: 'no_org' });

  try {
    const tokens = await exchangeOutlookCode(code);

    // tokens.refresh_token might be absent if user already consented — check existing
    const sb = createServiceClient();
    const { data: existing } = await sb.from('organizations')
      .select('outlook_refresh_token').eq('id', orgId).single();

    if (!tokens.refresh_token && !existing?.outlook_refresh_token) {
      await sb.from('organizations').update({ outlook_connected: false }).eq('id', orgId);
      return back(request, returnTo, { outlook_error: 'no_refresh_token' });
    }

    // Get connected email address
    let outlookEmail = null;
    try {
      outlookEmail = await getOutlookUserEmail(tokens.access_token);
    } catch (e) {
      console.warn('Outlook email lookup failed:', e.message);
    }

    const updates = { outlook_connected: true };
    if (outlookEmail) updates.outlook_email = outlookEmail;
    if (tokens.refresh_token) updates.outlook_refresh_token = tokens.refresh_token;

    const { error: updateError } = await sb.from('organizations').update(updates).eq('id', orgId);
    if (updateError) return back(request, returnTo, { outlook_error: updateError.message });

    return back(request, returnTo, { outlook_connected: '1' });
  } catch (e) {
    console.error('Outlook callback error:', e.message);
    return back(request, returnTo, { outlook_error: e.message });
  }
}
