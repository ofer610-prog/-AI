import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // pending | matched | dismissed
  const month = searchParams.get('month');   // YYYY-MM

  const sb = createServiceClient();
  let q = sb
    .from('credit_charges')
    .select('*, expense_documents(vendor, file_url, doc_date)')
    .eq('organization_id', profile.organization_id)
    .order('charge_date', { ascending: false });

  if (status) q = q.eq('alert_status', status);
  if (month) q = q.gte('charge_date', `${month}-01`).lte('charge_date', `${month}-31`);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ charges: data || [] });
}
