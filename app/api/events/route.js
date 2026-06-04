import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');

  const mine = searchParams.get('mine') === 'true';

  let q = sb
    .from('events')
    .select('*, clients(name, phone), profiles!assigned_to(id, full_name)')
    .eq('organization_id', profile.organization_id)
    .order('start_time', { ascending: true });

  if (from)  q = q.gte('start_time', from);
  if (to)    q = q.lte('start_time', to);
  if (mine)  q = q.eq('assigned_to', user.id);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ events: data || [] });
}

export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const body = await request.json();
  const { title, description, start_time, end_time, all_day, location,
          client_id, matter_id, attendee_name, attendee_phone, event_type, notes } = body;

  if (!title || !start_time) {
    return Response.json({ error: 'title and start_time are required' }, { status: 400 });
  }

  const { data, error } = await sb.from('events').insert({
    organization_id: profile.organization_id,
    title, description, start_time, end_time, all_day: all_day || false,
    location, client_id: client_id || null, matter_id: matter_id || null,
    attendee_name, attendee_phone, event_type: event_type || 'meeting',
    notes, created_by: user.id,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ event: data });
}

export async function PATCH(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await sb.from('events').update(updates).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ event: data });
}

export async function DELETE(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
