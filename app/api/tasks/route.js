import { createClient, createServiceClient } from '@/lib/supabase/server';
import { validatePin, getPinFromRequest, getOrgId } from '@/lib/pinAuth';

export const dynamic = 'force-dynamic';

const TASK_SELECT = `
  id, task_number, task_type, description, due_date, completed_at,
  status, priority, notes, matter_id, assigned_to, created_at,
  profiles!assigned_to(id, full_name),
  matters(id, title, case_number, property_address)
`;

/** Returns { orgId, sb, userId } from either PIN or Supabase session */
async function resolveAuth(request) {
  const pin = await getPinFromRequest(request);
  if (pin) {
    const ok = await validatePin(pin);
    if (ok) {
      const orgId = await getOrgId();
      return orgId ? { orgId, sb: createServiceClient(), userId: null } : null;
    }
  }
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data: profile } = await sb.from('profiles').select('organization_id, id').eq('id', user.id).single();
    if (!profile) return null;
    return { orgId: profile.organization_id, sb, userId: profile.id };
  } catch {
    return null;
  }
}

export async function GET(request) {
  const auth = await resolveAuth(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId, sb, userId } = auth;

  const { searchParams } = new URL(request.url);
  const mine   = searchParams.get('mine') === 'true';
  const status = searchParams.get('status');

  let q = sb.from('tasks')
    .select(TASK_SELECT)
    .eq('organization_id', orgId)
    .order('status', { ascending: true })          // open before done
    .order('due_date', { ascending: true, nullsFirst: false });

  if (mine && userId) q = q.eq('assigned_to', userId);
  if (status)         q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: lawyers } = await sb.from('profiles')
    .select('id, full_name').eq('organization_id', orgId).eq('is_active', true);

  return Response.json({ tasks: data || [], lawyers: lawyers || [] });
}

export async function POST(request) {
  const auth = await resolveAuth(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId, sb } = auth;

  const body = await request.clone().json().catch(() => ({}));
  if (!body.description) return Response.json({ error: 'description required' }, { status: 400 });

  const { data, error } = await sb.from('tasks').insert({
    organization_id: orgId,
    task_number:  body.task_number || null,
    task_type:    body.task_type || null,
    description:  body.description,
    assigned_to:  body.assigned_to || null,
    due_date:     body.due_date || null,
    status:       body.status || 'open',
    priority:     body.priority || 'medium',
    notes:        body.notes || null,
    matter_id:    body.matter_id || null,
  }).select(TASK_SELECT).single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // New assigned task → in-app notification (popup on the assignee's screen)
  if (data?.assigned_to) {
    const service = createServiceClient();
    await service.from('notifications').insert({
      organization_id: orgId,
      user_id: data.assigned_to,
      kind: 'task',
      title: '📋 משימה חדשה',
      body: data.description + (data.due_date ? ` (יעד: ${new Date(data.due_date).toLocaleDateString('he-IL')})` : ''),
      link: '/tasks',
      task_id: data.id,
    });
  }

  return Response.json({ task: data }, { status: 201 });
}

export async function PATCH(request) {
  const auth = await resolveAuth(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId, sb } = auth;

  const body = await request.clone().json().catch(() => ({}));
  const { id, pin, ...updates } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  delete updates.organization_id;
  delete updates.sheet_row_id;
  delete updates.created_at;
  delete updates.profiles;
  delete updates.matters;

  const { data, error } = await sb.from('tasks')
    .update(updates).eq('id', id).eq('organization_id', orgId)
    .select(TASK_SELECT).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({ task: data });
}
