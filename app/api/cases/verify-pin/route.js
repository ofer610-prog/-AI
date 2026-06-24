import { createServiceClient } from '@/lib/supabase/server';
import { isRateLimited } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  if (isRateLimited(`pin:${ip}`, 8, 60_000)) {
    return Response.json({ ok: false, error: 'יותר מדי ניסיונות — נסה שוב בעוד דקה' }, { status: 429 });
  }

  const { pin } = await request.json().catch(() => ({}));
  const submitted = String(pin || '').replace(/\D/g, '');

  // Default internal office PIN. Can be overridden by env or Supabase setting.
  let correct = String(process.env.CASES_ACCESS_PIN || '9745');

  try {
    const sb = createServiceClient();
    const { data: org } = await sb.from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (org) {
      const { data: setting } = await sb.from('integration_settings')
        .select('config')
        .eq('organization_id', org.id)
        .eq('provider', 'cases_pin')
        .single();
      if (setting?.config?.pin) correct = String(setting.config.pin).replace(/\D/g, '');
    }
  } catch {
    // If DB setting cannot be read, keep env/default PIN.
  }

  if (!submitted || submitted !== correct) {
    return Response.json({ ok: false, error: 'קוד שגוי' }, { status: 401 });
  }

  return Response.json({ ok: true });
}
