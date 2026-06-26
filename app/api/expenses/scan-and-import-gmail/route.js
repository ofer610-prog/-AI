/**
 * POST /api/expenses/scan-and-import-gmail
 * Thin alias for /api/expenses/deep-scan — both use the unified scanOrg engine.
 */
import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { scanOrg } from '@/lib/expenseGmailScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 30, 7), 180);

  const sb = createServiceClient();
  const { data: org, error } = await sb.from('organizations')
    .select('id,gmail_refresh_token,office_card_last4,drive_expenses_folder_id,gmail_connected')
    .eq('id', profile.organization_id).single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!org?.gmail_connected || !org.gmail_refresh_token) {
    return Response.json({ error: 'Gmail לא מחובר.' }, { status: 400 });
  }

  try {
    const result = await scanOrg(sb, org, days);
    return Response.json({ ok: true, days, ...result });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
