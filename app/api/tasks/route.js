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
  const status = searchParams.get('status');

  let q = sb.from('tasks')
    .select(`*, matters(id, title, property_address),
      profiles!assigned_to(id, full_name)`)
    .eq('organization_id', profile.organization_id)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (mine)   q = q.eq('assigned_to', profile.id);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tasks: data || [] });
}

export async function PATCH(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  delete updates.organization_id;
  delete updates.sheet_row_id;

  const { data, error } = await sb.from('tasks').update(updates)
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ task: data });
}
