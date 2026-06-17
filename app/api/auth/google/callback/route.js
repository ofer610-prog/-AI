import { exchangeCodeForTokens, getOAuthClient } from '@/lib/gmail';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
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
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch { return null; }
}

function back(request, params = {}) {
  const target = new URL('/expenses/receipts', request.url);
  Object.entries(params).forEach(([k, v]) => target.searchParams.set(k, String(v)));
  return Response.redirect(target, 302);
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const stateParam = url.searchParams.get('state');
  const stateData = verifyState(stateParam);

  console.log('GOOGLE_OAUTH_DEBUG callback_start', JSON.stringify({ hasCode: !!code, googleError: error || null, hasState: !!stateParam, validState: !!stateData }));

  if (error) return back(request, { gmail_error: error });
  if (!code) return back(request, { gmail_error: 'no_code' });

  let orgId = stateData?.org_id || null;

  if (!orgId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      console.log('GOOGLE_OAUTH_DEBUG session_fallback', JSON.stringify({ hasUser: !!user }));
      if (!user) return back(request, { gmail_error: 'session_lost' });
      const { data: profile, error: profileError } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single();
      console.log('GOOGLE_OAUTH_DEBUG profile', JSON.stringify({ hasProfile: !!profile, profileError: profileError?.message || null, hasOrg: !!profile?.organization_id }));
      orgId = profile?.organization_id;
    } catch (e) {
      console.error('GOOGLE_OAUTH_DEBUG session_fallback_error', e.message);
    }
  }

  if (!orgId) return back(request, { gmail_error: 'no_org' });

  try {
    const tokens = await exchangeCodeForTokens(code);
    console.log('GOOGLE_OAUTH_DEBUG tokens', JSON.stringify({ hasAccess: !!tokens.access_token, hasRefresh: !!tokens.refresh_token, scope: tokens.scope || null }));

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const gmailEmail = userInfo.data.email || null;

    const sb = createServiceClient();
    const { data: existing, error: existingError } = await sb
      .from('organizations')
      .select('gmail_refresh_token')
      .eq('id', orgId)
      .single();
    console.log('GOOGLE_OAUTH_DEBUG existing', JSON.stringify({ existingError: existingError?.message || null, hadRefresh: !!existing?.gmail_refresh_token }));

    if (!tokens.refresh_token && !existing?.gmail_refresh_token) {
      console.warn('GOOGLE_OAUTH_DEBUG missing_refresh_token');
      await sb.from('organizations').update({ gmail_connected: false, gmail_email: gmailEmail }).eq('id', orgId);
      return back(request, { gmail_error: 'no_refresh_token' });
    }

    const updates = { gmail_connected: true, gmail_email: gmailEmail };
    if (tokens.refresh_token) updates.gmail_refresh_token = tokens.refresh_token;

    const { data: updated, error: updateError } = await sb
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select('id, gmail_connected, gmail_email, gmail_refresh_token')
      .single();

    console.log('GOOGLE_OAUTH_DEBUG update_result', JSON.stringify({ updateError: updateError?.message || null, savedConnected: !!updated?.gmail_connected, savedEmail: updated?.gmail_email || null, savedRefresh: !!updated?.gmail_refresh_token }));

    if (updateError) return back(request, { gmail_error: updateError.message });
    return back(request, { connected: '1' });
  } catch (e) {
    console.error('GOOGLE_OAUTH_DEBUG callback_error', e.message);
    return back(request, { gmail_error: e.message });
  }
}
