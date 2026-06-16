import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function PATCH(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, alert_status, matched_doc_id } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates = {};
  if (alert_status) updates.alert_status = alert_status;
  if (matched_doc_id !== undefined) updates.matched_doc_id = matched_doc_id;

  const sb = createServiceClient();
  const { error } = await sb
    .from('credit_charges')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', profile.organization_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
