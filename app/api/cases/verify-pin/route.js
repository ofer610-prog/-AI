import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { pin } = await request.json().catch(() => ({}));

  // Check Supabase first (admin can change it), fall back to env var
  let correct = process.env.CASES_ACCESS_PIN || null;

  try {
    const sb = createServiceClient();
    const { data: org } = await sb.from('organizations')
      .select('id').order('created_at', { ascending: true }).limit(1).single();
    if (org) {
      const { data: setting } = await sb.from('integration_settings')
        .select('config').eq('organization_id', org.id).eq('provider', 'cases_pin').single();
      if (setting?.config?.pin) correct = String(setting.config.pin);
    }
  } catch { /* fall through to env var */ }

  if (!correct) return Response.json({ ok: true }); // not configured yet

  if (!pin || String(pin) !== correct) {
    return Response.json({ ok: false }, { status: 401 });
  }

  return Response.json({ ok: true });
}
