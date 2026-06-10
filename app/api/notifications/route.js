import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Resolve the logged-in user + org */
async function me() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles').select('id, organization_id').eq('id', user.id).single();
  return profile || null;
}

/** GET /api/notifications — my notifications (newest first, last 50) */
export async function GET() {
  const profile = await me();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data, error } = await sb.from('notifications')
    .select('id, kind, title, body, link, task_id, status, created_at, ack_at')
    .eq('organization_id', profile.organization_id)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const unread = (data || []).filter((n) => n.status === 'new').length;
  return Response.json({ notifications: data || [], unread });
}

/**
 * PATCH /api/notifications — update status
 * Body: { id, status: 'seen' | 'ack' }  or  { all: true, status: 'seen' }
 * Acknowledging a task notification also moves the task to in_progress.
 */
export async function PATCH(request) {
  const profile = await me();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const status = body.status === 'ack' ? 'ack' : 'seen';
  const sb = createServiceClient();

  if (body.all) {
    await sb.from('notifications')
      .update({ status: 'seen' })
      .eq('user_id', profile.id).eq('status', 'new');
    return Response.json({ ok: true });
  }

  if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });

  const { data: notif } = await sb.from('notifications')
    .select('id, task_id').eq('id', body.id).eq('user_id', profile.id).single();
  if (!notif) return Response.json({ error: 'Not found' }, { status: 404 });

  await sb.from('notifications')
    .update({ status, ack_at: status === 'ack' ? new Date().toISOString() : null })
    .eq('id', notif.id);

  // Acknowledged task → mark it in progress so the manager sees it's handled
  if (status === 'ack' && notif.task_id) {
    await sb.from('tasks')
      .update({ status: 'in_progress' })
      .eq('id', notif.task_id).eq('status', 'open');
  }

  return Response.json({ ok: true });
}
