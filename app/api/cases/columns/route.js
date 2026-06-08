import { createServiceClient } from '@/lib/supabase/server';
import { validatePin, getPinFromRequest, getOrgId } from '@/lib/pinAuth';

export const dynamic = 'force-dynamic';

async function authOrg(request) {
  const pin = await getPinFromRequest(request);
  const ok  = await validatePin(pin);
  if (!ok) return null;
  return await getOrgId();
}

export async function GET(request) {
  const pin = await getPinFromRequest(request);
  const ok  = await validatePin(pin);
  // GET is open — no PIN required for viewing
  const orgId = await getOrgId();
  if (!orgId) return Response.json({ columns: [] });

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('case_custom_columns').select('*')
    .eq('organization_id', orgId).order('position');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ columns: data || [] });
}

export async function POST(request) {
  const orgId = await authOrg(request);
  if (!orgId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.clone().json().catch(() => ({}));
  const { name, col_type = 'text', options } = body;
  if (!name) return Response.json({ error: 'name required' }, { status: 400 });

  const sb = createServiceClient();
  const { count } = await sb.from('case_custom_columns')
    .select('*', { count: 'exact', head: true }).eq('organization_id', orgId);

  const { data, error } = await sb.from('case_custom_columns').insert({
    organization_id: orgId, name, col_type,
    options: options || null, position: count || 0,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ column: data }, { status: 201 });
}

export async function DELETE(request) {
  const orgId = await authOrg(request);
  if (!orgId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const sb = createServiceClient();
  const { error } = await sb.from('case_custom_columns').delete()
    .eq('id', id).eq('organization_id', orgId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
