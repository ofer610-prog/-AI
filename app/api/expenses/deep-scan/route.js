import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { scanOrgAll } from '@/lib/expenseGmailScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/expenses/deep-scan?days=120
 * Admin-triggered comprehensive Gmail backfill for the caller's org.
 * Runs the same logic as the daily cron but for a single org, scoped to
 * the requested history window. Duplicate detection means it is safe to
 * run repeatedly — already-stored receipts are skipped.
 */
export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 120, 7), 180);

  const sb = createServiceClient();
  const { data: org, error } = await sb.from('organizations')
    .select('id,gmail_refresh_token,gmail2_refresh_token,office_card_last4,drive_expenses_folder_id,gmail_connected')
    .eq('id', profile.organization_id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!org?.gmail_refresh_token && !org?.gmail2_refresh_token) {
    return Response.json({ error: 'Gmail לא מחובר. חבר את Gmail תחילה.' }, { status: 400 });
  }

  try {
    const result = await scanOrgAll(sb, org, days);
    return Response.json({ ok: true, days, ...result });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
