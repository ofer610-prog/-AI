import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500);
    const offset = Number(searchParams.get('offset') || 0);
    const creditsOnly = searchParams.get('credits_only') === 'true';
    const alertStatus = searchParams.get('alert_status'); // pending | matched | dismissed

    const { data: org } = await sb
      .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
    if (!org) return Response.json({ transactions: [] });
    const orgId = org.id;

    let q = sb
      .from('bank_transactions')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
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
    const sb = createServiceClient();
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'נדרש id' }, { status: 400 });

    const { error } = await sb.from('bank_transactions').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
