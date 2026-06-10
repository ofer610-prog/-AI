import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb
    .from('profiles').select('id, organization_id, role, full_name').eq('id', user.id).single();
  if (!profile) return null;
  return { sb: createServiceClient(), profile, orgId: profile.organization_id };
}

export async function GET(request) {
  const auth = await requireAdmin();
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { sb, orgId } = auth;

  // Lawyers with their stats
  const { data: lawyers } = await sb
    .from('profiles')
    .select('id, full_name, email, phone, role, is_active, monthly_salary, start_date, created_at')
    .eq('organization_id', orgId)
    .order('full_name');

  if (!lawyers?.length) return Response.json({ lawyers: [] });

  // Count tasks per lawyer
  const { data: taskStats } = await sb
    .from('tasks')
    .select('assigned_to, status')
    .eq('organization_id', orgId);

  // Count matters per lawyer
  const { data: matterStats } = await sb
    .from('matters')
    .select('responsible_lawyer_id, stage, balance_amount')
    .eq('organization_id', orgId);

  // Last digest per lawyer
  const { data: digests } = await sb
    .from('attorney_digests')
    .select('lawyer_id, sent_at, wa_sent, email_sent')
    .eq('organization_id', orgId)
    .order('sent_at', { ascending: false });

  const enriched = lawyers.map(l => {
    const myTasks    = (taskStats || []).filter(t => t.assigned_to === l.id);
    const myMatters  = (matterStats || []).filter(m => m.responsible_lawyer_id === l.id);
    const lastDigest = (digests || []).find(d => d.lawyer_id === l.id);
    return {
      ...l,
      open_tasks:      myTasks.filter(t => t.status === 'open').length,
      done_tasks:      myTasks.filter(t => t.status === 'done').length,
      active_matters:  myMatters.filter(m => m.stage !== 'closed').length,
      total_balance:   myMatters.reduce((s, m) => s + Number(m.balance_amount || 0), 0),
      last_digest_at:  lastDigest?.sent_at || null,
      last_digest_wa:  lastDigest?.wa_sent || false,
    };
  });

  return Response.json({ lawyers: enriched });
}

export async function PATCH(request) {
  const auth = await requireAdmin();
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { sb, orgId } = auth;

  const body = await request.json().catch(() => ({}));
  const { id, ...updates } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  // Whitelist updatable fields
  const allowed = ['full_name', 'phone', 'email', 'role', 'is_active', 'monthly_salary'];
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await sb
    .from('profiles').update(safeUpdates)
    .eq('id', id).eq('organization_id', orgId)
    .select('id, full_name, email, phone, role, is_active, monthly_salary').single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ lawyer: data });
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { sb, orgId } = auth;

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  // Manual digest trigger for one or all attorneys
  if (action === 'send-digest') {
    const pin = process.env.CASES_ACCESS_PIN;
    const payload = pin ? { pin, lawyerId: body.lawyerId || undefined } : {};
    const base = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const res  = await fetch(`${base}/api/cron/attorney-digest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return Response.json(json);
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
