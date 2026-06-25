import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '@/lib/googleCalendar';

export const dynamic = 'force-dynamic';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getOrgToken(sb, orgId) {
  const { data } = await sb
    .from('organizations')
    .select('gmail_refresh_token, gmail_connected')
    .eq('id', orgId)
    .single();
  return data?.gmail_connected && data?.gmail_refresh_token ? data.gmail_refresh_token : null;
}

async function getUser(sb) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles').select('organization_id').eq('id', user.id).single();
  return profile ? { user, profile, service } : null;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request) {
  const sb = await createClient();
  const ctx = await getUser(sb);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, profile, service } = ctx;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');
  const mine = searchParams.get('mine') === 'true';

  let q = service
    .from('events')
    .select('*, clients(name, phone), profiles!assigned_to(id, full_name)')
    .eq('organization_id', profile.organization_id)
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true });

  if (from) q = q.gte('start_time', from);
  if (to)   q = q.lte('start_time', to);
  if (mine) q = q.eq('assigned_to', user.id);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ events: data || [] });
}

export async function POST(request) {
  const sb = await createClient();
  const ctx = await getUser(sb);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, profile, service } = ctx;

  const body = await request.json();
  const { title, description, start_time, end_time, all_day, location,
          client_id, matter_id, attendee_name, attendee_phone, event_type, notes } = body;

  if (!title || !start_time) {
    return Response.json({ error: 'title and start_time are required' }, { status: 400 });
  }

  // Save to Supabase first
  const { data, error } = await service.from('events').insert({
    organization_id: profile.organization_id,
    title, description, start_time, end_time, all_day: all_day || false,
    location, client_id: client_id || null, matter_id: matter_id || null,
    attendee_name, attendee_phone, event_type: event_type || 'meeting',
    notes, created_by: user.id,
    assigned_to: body.assigned_to || user.id,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Push to Google Calendar (fire-and-forget, don't fail the request)
  const token = await getOrgToken(service, profile.organization_id);
  if (token) {
    try {
      const gEvent = await createGoogleEvent(token, data);
      if (gEvent?.id) {
        await service.from('events').update({
          google_event_id:    gEvent.id,
          google_calendar_id: 'primary',
        }).eq('id', data.id);
        data.google_event_id = gEvent.id;
      }
    } catch (err) {
      console.warn('Google Calendar create failed:', err.message);
    }
  }

  return Response.json({ event: data });
}

export async function PATCH(request) {
  const sb = await createClient();
  const ctx = await getUser(sb);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { profile, service } = ctx;

  const body = await request.json();
  const { id, ...rest } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const EVENT_FIELDS = ['title', 'description', 'start_time', 'end_time', 'all_day', 'location',
    'client_id', 'matter_id', 'attendee_name', 'attendee_phone', 'event_type', 'notes',
    'status', 'assigned_to', 'reminder_sent'];
  const updates = Object.fromEntries(
    Object.entries(rest).filter(([k]) => EVENT_FIELDS.includes(k))
  );

  const { data, error } = await service.from('events').update(updates)
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data)  return Response.json({ error: 'Not found' }, { status: 404 });

  // Update in Google Calendar
  const token = await getOrgToken(service, profile.organization_id);
  if (token && data.google_event_id) {
    try {
      await updateGoogleEvent(token, data.google_event_id, data);
    } catch (err) {
      console.warn('Google Calendar update failed:', err.message);
    }
  }

  return Response.json({ event: data });
}

export async function DELETE(request) {
  const sb = await createClient();
  const ctx = await getUser(sb);
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { profile, service } = ctx;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  // Get the google_event_id before deleting
  const { data: ev } = await service.from('events')
    .select('google_event_id')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single();

  const { error } = await service.from('events').delete()
    .eq('id', id)
    .eq('organization_id', profile.organization_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Delete from Google Calendar
  const token = await getOrgToken(service, profile.organization_id);
  if (token && ev?.google_event_id) {
    try {
      await deleteGoogleEvent(token, ev.google_event_id);
    } catch (err) {
      console.warn('Google Calendar delete failed:', err.message);
    }
  }

  return Response.json({ ok: true });
}
