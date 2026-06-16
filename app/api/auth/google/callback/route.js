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

  console.log('OAuth callback:', { has_code: !!code, error, has_state: !!stateParam });

  if (error) {
    console.error('OAuth callback: Google error:', error);
    return back(request, { gmail_error: error });
  }
  if (!code) {
    return back(request, { gmail_error: 'no_code' });
  }

  let orgId = null;
  const stateData = verifyState(stateParam);
  if (stateData?.org_id) {
    orgId = stateData.org_id;
    console.log('OAuth callback: org_id from state:', orgId);
  } else {
    console.warn('OAuth callback: no valid state, falling back to session');
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('OAuth callback: no user in session and no state');
        return back(request, { gmail_error: 'session_lost' });
      }
      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single();
      orgId = profile?.organization_id;
    } catch (e) {
      console.error('OAuth callback: session fallback failed:', e.message);
    }
  }

  if (!orgId) {
    return back(request, { gmail_error: 'no_org' });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const gmailEmail = userInfo.data.email;

    const updates = { gmail_connected: true, gmail_email: gmailEmail };
    if (tokens.refresh_token) {
      updates.gmail_refresh_token = tokens.refresh_token;
    } else {
      console.warn('OAuth callback: no refresh_token returned by Google');
    }

    const sb = createServiceClient();
    const { error: updateError } = await sb
      .from('organizations')
      .update(updates)
      .eq('id', orgId);

    if (updateError) {
      console.error('OAuth callback: org update failed:', updateError);
      return back(request, { gmail_error: updateError.message });
    }

    console.log('OAuth callback: success for org', orgId, '| email:', gmailEmail, '| has_refresh:', !!tokens.refresh_token);
    return back(request, { connected: '1' });
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    return back(request, { gmail_error: e.message });
  }
}
