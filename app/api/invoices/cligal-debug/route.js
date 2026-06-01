import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/cligal-debug
 * Receives diagnostic info from the Playwright scraper and stores it in the DB
 * (integration_settings, provider='cligal_debug') so we can read it back.
 */
export async function POST(request) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('=== CLIGAL DEBUG DIAGNOSTICS ===');
  console.log(JSON.stringify(body).slice(0, 1000));

  const sb = createServiceClient();
  const { data: orgs } = await sb.from('organizations').select('id').limit(1);
  const orgId = orgs?.[0]?.id;

  if (orgId) {
    const payload = { captured_at: new Date().toISOString(), ...body };
    const { data: existing } = await sb
      .from('integration_settings')
      .select('id')
      .eq('organization_id', orgId)
      .eq('provider', 'cligal_debug')
      .maybeSingle();

    if (existing) {
      await sb.from('integration_settings')
        .update({ config: payload, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await sb.from('integration_settings')
        .insert({ organization_id: orgId, provider: 'cligal_debug', config: payload, is_active: false });
    }
  }

  return NextResponse.json({ received: true });
}

/**
 * GET /api/invoices/cligal-debug?secret=...
 * Returns the most recent diagnostics captured by the scraper.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data: orgs } = await sb.from('organizations').select('id').limit(1);
  const orgId = orgs?.[0]?.id;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 500 });

  const { data } = await sb
    .from('integration_settings')
    .select('config, updated_at')
    .eq('organization_id', orgId)
    .eq('provider', 'cligal_debug')
    .maybeSingle();

  return NextResponse.json(data?.config || { error: 'No diagnostics captured yet' });
}
