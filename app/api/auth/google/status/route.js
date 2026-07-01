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
    .select('gmail_connected, gmail_refresh_token, gmail_email, gmail2_connected, gmail2_refresh_token, gmail2_email')
    .eq('id', profile.organization_id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // בדיקת חיבור אמיתית לכל תיבה: מנסים לקבל access token מה-refresh token.
  // כך "מחובר" ירוק מוצג רק כשהחיבור באמת עובד — ולא כשהטוקן פג (invalid_grant).
  async function checkSlot(refreshToken, connectedFlag, connectedCol) {
    let tokenOk = false;
    let tokenReason = 'no_token';
    if (refreshToken) {
      const check = await verifyGmailToken(refreshToken);
      tokenOk = check.ok;
      tokenReason = check.reason;
      if (!check.ok && check.reason === 'invalid_grant' && connectedFlag) {
        await sb.from('organizations').update({ [connectedCol]: false }).eq('id', profile.organization_id);
      }
    }
    return { tokenOk, tokenReason };
  }

  const [primary, second] = await Promise.all([
    checkSlot(org?.gmail_refresh_token, org?.gmail_connected, 'gmail_connected'),
    checkSlot(org?.gmail2_refresh_token, org?.gmail2_connected, 'gmail2_connected'),
  ]);

  return Response.json({
    ok: true,
    // ── primary office mailbox ──
    gmail_connected: !!org?.gmail_connected && primary.tokenOk,
    has_refresh_token: !!org?.gmail_refresh_token,
    gmail_email: org?.gmail_email || null,
    token_status: primary.tokenReason,
    usable: primary.tokenOk,
    // ── second dedicated invoices mailbox ──
    second: {
      usable: second.tokenOk,
      has_refresh_token: !!org?.gmail2_refresh_token,
      gmail_email: org?.gmail2_email || null,
      token_status: second.tokenReason,
    },
  });
}
