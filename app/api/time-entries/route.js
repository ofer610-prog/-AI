import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getProfile() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles').select('id, organization_id').eq('id', user.id).single();
  return profile ? { ...profile, userId: user.id } : null;
}

/** GET /api/time-entries?date=2026-06-10&matter_id=... */
export async function GET(request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date       = searchParams.get('date');        // YYYY-MM-DD
  const matterId   = searchParams.get('matter_id');
  const userId     = searchParams.get('user_id');     // show specific user's hours
  const thisMonth  = searchParams.get('this_month');  // 'true' → current calendar month
  const mine       = !userId && searchParams.get('mine') !== 'false'; // default true unless user_id given

  const sb = createServiceClient();
  let q = sb
    .from('time_entries')
    .select('*, profiles!user_id(full_name), matters(case_number, title)')
    .eq('organization_id', profile.organization_id)
    .order('started_at', { ascending: false });

  if (mine)   q = q.eq('user_id', profile.id);
  if (userId) q = q.eq('user_id', userId);

  if (thisMonth === 'true') {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    q = q.gte('started_at', monthStart).lte('started_at', monthEnd);
  }
  if (date) {
    q = q.gte('started_at', `${date}T00:00:00+00:00`)
         .lte('started_at', `${date}T23:59:59+00:00`);
  }
  if (matterId) q = q.eq('matter_id', matterId);

  const { data, error } = await q.limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // active timer = entry with no ended_at belonging to current user
  const active = (data || []).find(e => !e.ended_at && e.user_id === profile.id) || null;
  return Response.json({ entries: data || [], active });
}

/** POST /api/time-entries — start a new timer (stops any active one first) */
export async function POST(request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sb = createServiceClient();

  // Stop any active timer for this user
  await sb.from('time_entries')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .is('ended_at', null);

  const { data, error } = await sb.from('time_entries').insert({
    organization_id: profile.organization_id,
    user_id: profile.id,
    matter_id: body.matter_id || null,
    description: body.description?.trim() || null,
    billable: body.billable !== false,
    started_at: new Date().toISOString(),
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, entry: data });
}

/** PATCH /api/time-entries — stop timer or update description/matter */
export async function PATCH(request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { id, stop, description, matter_id, billable } = body;

  const sb = createServiceClient();
  const updates = {};
  if (stop) updates.ended_at = new Date().toISOString();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (matter_id !== undefined) updates.matter_id = matter_id || null;
  if (billable !== undefined) updates.billable = billable;

  // If no id, stop the active timer
  let q = sb.from('time_entries').update(updates).eq('user_id', profile.id);
  if (id) {
    q = q.eq('id', id);
  } else if (stop) {
    q = q.is('ended_at', null);
  } else {
    return Response.json({ error: 'id required' }, { status: 400 });
  }

  const { data, error } = await q.select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, entry: data });
}

/** DELETE /api/time-entries?id=... */
export async function DELETE(request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const sb = createServiceClient();
  const { error } = await sb.from('time_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', profile.id); // can only delete own entries

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
