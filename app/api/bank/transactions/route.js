import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function requireAdminAuth(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };
  const { data: profile } = await sb.from('profiles').select('organization_id, role').eq('id', user.id).single();
  if (!profile || !['admin','accountant'].includes(profile.role)) return { error: 'Forbidden', status: 403 };
  return { user, profile, orgId: profile.organization_id };
}

export async function GET(request) {
  try {
    const auth = await requireAdminAuth(request);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const limit       = Math.min(Number(searchParams.get('limit') || 100), 500);
    const offset      = Number(searchParams.get('offset') || 0);
    const creditsOnly = searchParams.get('credits_only') === 'true';
    const alertStatus = searchParams.get('alert_status');

    let q = sb
      .from('bank_transactions')
      .select('*', { count: 'exact' })
      .eq('organization_id', auth.orgId)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (creditsOnly) q = q.gt('amount', 0);
    if (alertStatus) q = q.eq('alert_status', alertStatus);

    const { data, error, count } = await q;
    if (error) return Response.json({ transactions: [], total: 0 });
    return Response.json({ transactions: data || [], total: count || 0 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAdminAuth(request);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const sb  = createServiceClient();
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'נדרש id' }, { status: 400 });

    // Scope delete to org
    const { error } = await sb.from('bank_transactions').delete()
      .eq('id', id).eq('organization_id', auth.orgId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
