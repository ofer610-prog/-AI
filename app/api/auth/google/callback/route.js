import { exchangeCodeForTokens, getOAuthClient } from '@/lib/gmail';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';


export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect(new URL(`/dashboard?gmail_error=${error}`, request.url));
  }

  if (!code) {
    return Response.redirect(new URL('/dashboard?gmail_error=no_code', request.url));
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    const tokens = await exchangeCodeForTokens(code);

    // Get the email address
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const gmailEmail = userInfo.data.email;

    // Save to org
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return Response.redirect(new URL('/dashboard?gmail_error=no_profile', request.url));
    }

    const updates = {
      gmail_connected: true,
      gmail_email: gmailEmail,
    };
    if (tokens.refresh_token) updates.gmail_refresh_token = tokens.refresh_token;

    const sb = createServiceClient();
    await sb
      .from('organizations')
      .update(updates)
      .eq('id', profile.organization_id);

    return Response.redirect(new URL('/expenses?connected=1', request.url));
  } catch (e) {
    console.error('OAuth callback error:', e);
    return Response.redirect(new URL(`/dashboard?gmail_error=${encodeURIComponent(e.message)}`, request.url));
  }
}
