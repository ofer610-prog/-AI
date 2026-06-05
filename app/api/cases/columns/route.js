import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getOrgAndProfile(sb) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return {};
  const { data: profile } = await sb.from('profiles').select('organization_id, role').eq('id', user.id).single();
  return { user, profile };
}

export async function GET(request) {
  const sb = await createClient();
  const { profile } = await getOrgAndProfile(sb);
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('case_custom_columns')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('position');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ columns: data || [] });
}

export async function POST(request) {
  const sb = await createClient();
  const { profile } = await getOrgAndProfile(sb);
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, col_type = 'text', options } = body;
  if (!name) return Response.json({ error: 'name required' }, { status: 400 });

  // get next position
  const { count } = await sb
    .from('case_custom_columns')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id);

  const { data, error } = await sb.from('case_custom_columns').insert({
    organization_id: profile.organization_id,
    name, col_type,
    options: options || null,
    position: (count || 0),
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ column: data }, { status: 201 });
}

export async function DELETE(request) {
  const sb = await createClient();
  const { profile } = await getOrgAndProfile(sb);
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin','accountant'].includes(profile.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { error } = await sb.from('case_custom_columns').delete()
    .eq('id', id).eq('organization_id', profile.organization_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
