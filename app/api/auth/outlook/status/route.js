/**
 * GET  /api/auth/outlook/status  — returns connection state
 * POST /api/auth/outlook/status  — disconnects Outlook
 */
import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('outlook_connected,outlook_email,last_outlook_sync')
    .eq('id', profile.organization_id).single();

  return Response.json({
    connected: !!org?.outlook_connected,
    email: org?.outlook_email || null,
    last_sync: org?.last_outlook_sync || null,
    configured: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  });
}

export async function POST() {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  await sb.from('organizations').update({
    outlook_connected: false,
    outlook_refresh_token: null,
    outlook_email: null,
  }).eq('id', profile.organization_id);

  return Response.json({ ok: true, disconnected: true });
}
