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

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const stateParam = url.searchParams.get('state');

  console.log('OAuth callback:', { has_code: !!code, error, has_state: !!stateParam });

  if (error) {
    console.error('OAuth callback: Google error:', error);
    return Response.redirect(new URL(`/dashboard?gmail_error=${error}`, request.url));
  }
  if (!code) {
    return Response.redirect(new URL('/dashboard?gmail_error=no_code', request.url));
  }

  // Resolve org_id: from signed state (mobile-safe) OR from session cookies (desktop fallback)
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
        return Response.redirect(new URL('/dashboard?gmail_error=session_lost', request.url));
      }
      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single();
      orgId = profile?.organization_id;
    } catch (e) {
      console.error('OAuth callback: session fallback failed:', e.message);
    }
  }

  if (!orgId) {
    return Response.redirect(new URL('/dashboard?gmail_error=no_org', request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      console.warn('OAuth callback: no refresh_token returned by Google');
    }

    // Best-effort: read the connected Gmail address via the Gmail profile
    // endpoint (works with gmail.readonly, which we already have). This must
    // NOT block token storage — oauth2.userinfo.get() would throw here because
    // we never request the userinfo/openid scope.
    let gmailEmail = null;
    try {
      const oauth2Client = getOAuthClient();
      oauth2Client.setCredentials(tokens);
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const prof = await gmail.users.getProfile({ userId: 'me' });
      gmailEmail = prof.data.emailAddress || null;
    } catch (e) {
      console.warn('OAuth callback: could not read gmail address:', e.message);
    }

    const updates = { gmail_connected: true };
    if (gmailEmail) updates.gmail_email = gmailEmail;
    if (tokens.refresh_token) updates.gmail_refresh_token = tokens.refresh_token;

    const sb = createServiceClient();
    const { error: updateError } = await sb
      .from('organizations')
      .update(updates)
      .eq('id', orgId);

    if (updateError) {
      console.error('OAuth callback: org update failed:', updateError);
      return Response.redirect(new URL(`/dashboard?gmail_error=${encodeURIComponent(updateError.message)}`, request.url));
    }

    console.log('OAuth callback: success for org', orgId, '| email:', gmailEmail, '| has_refresh:', !!tokens.refresh_token);
    return Response.redirect(new URL('/expenses?connected=1', request.url));
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    return Response.redirect(new URL(`/dashboard?gmail_error=${encodeURIComponent(e.message)}`, request.url));
  }
}
