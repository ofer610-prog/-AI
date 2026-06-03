import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id, id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const mine   = searchParams.get('mine') === 'true';
  const stage  = searchParams.get('stage');
  const search = searchParams.get('q');

  let q = sb.from('matters')
    .select(`*, clients(id, name, phone, address),
      profiles!responsible_lawyer_id(id, full_name)`)
    .eq('organization_id', profile.organization_id)
    .order('delivery_date', { ascending: true, nullsFirst: false });

  if (mine)   q = q.eq('responsible_lawyer_id', profile.id);
  if (stage)  q = q.eq('stage', stage);
  if (search) q = q.ilike('title', `%${search}%`);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ matters: data || [] });
}

export async function PATCH(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  delete updates.organization_id;
  delete updates.sheet_row_id;

  const { data, error } = await sb.from('matters').update(updates).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ matter: data });
}
