import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getOrgId() {
  const sb = createServiceClient();
  const { data } = await sb.from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
  return data?.id || null;
}

export async function GET(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'accountant'].includes(profile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = await getOrgId();
  const ssb = createServiceClient();
  const { data: setting } = await ssb.from('integration_settings')
    .select('config').eq('organization_id', orgId).eq('provider', 'cases_pin').single();

  const hasPin = !!(setting?.config?.pin || process.env.CASES_ACCESS_PIN);
  return Response.json({ has_pin: hasPin, source: setting?.config?.pin ? 'db' : 'env' });
}

export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'accountant'].includes(profile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { pin } = await request.json().catch(() => ({}));
  if (!pin || !/^\d{4,8}$/.test(String(pin))) {
    return Response.json({ error: 'קוד חייב להיות 4–8 ספרות' }, { status: 400 });
  }

  const orgId = await getOrgId();
  const ssb = createServiceClient();

  await ssb.from('integration_settings').upsert({
    organization_id: orgId,
    provider: 'cases_pin',
    config: { pin: String(pin) },
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,provider' });

  return Response.json({ ok: true });
}
