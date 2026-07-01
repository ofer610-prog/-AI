import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { verifyGmailToken } from '@/lib/gmail';

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

  // בדיקת חיבור אמיתית: מנסים לקבל access token מה-refresh token.
  // כך "מחובר" ירוק מוצג רק כשהחיבור באמת עובד — ולא כשהטוקן פג (invalid_grant).
  let tokenOk = false;
  let tokenReason = 'no_token';
  if (org?.gmail_refresh_token) {
    const check = await verifyGmailToken(org.gmail_refresh_token);
    tokenOk = check.ok;
    tokenReason = check.reason;
    // אם הטוקן מת — מסמנים את הארגון כמנותק כדי שה-UI ישקף מציאות
    if (!check.ok && check.reason === 'invalid_grant' && org.gmail_connected) {
      await sb.from('organizations').update({ gmail_connected: false }).eq('id', profile.organization_id);
    }
  }

  return Response.json({
    ok: true,
    gmail_connected: !!org?.gmail_connected && tokenOk,
    has_refresh_token: !!org?.gmail_refresh_token,
    gmail_email: org?.gmail_email || null,
    token_status: tokenReason,
    usable: tokenOk,
  });
}
