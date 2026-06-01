import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DEBUG_MESSAGE_ID = '__cligal_debug__';

/**
 * POST /api/invoices/cligal-debug
 * Receives diagnostic info from the Playwright scraper and stores it in the
 * whatsapp_alerts table (status='debug', message_id='__cligal_debug__') so we
 * can read it back via GET. whatsapp_alerts has a free-form TEXT column with
 * no constraints, which makes it a reliable store for arbitrary diagnostics.
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

  const sb = createServiceClient();
  const { data: orgs } = await sb.from('organizations').select('id').limit(1);
  const orgId = orgs?.[0]?.id;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 500 });

  const payload = JSON.stringify({ captured_at: new Date().toISOString(), ...body });

  // Remove any prior debug row, then insert fresh
  await sb.from('whatsapp_alerts').delete().eq('organization_id', orgId).eq('message_id', DEBUG_MESSAGE_ID);

  const { error } = await sb.from('whatsapp_alerts').insert({
    organization_id: orgId,
    message_id: DEBUG_MESSAGE_ID,
    message_text: payload,
    message_timestamp: new Date().toISOString(),
    status: 'debug',
  });

  if (error) {
    console.log('CLIGAL_DB_ERR:', error.message);
    return NextResponse.json({ received: false, dbError: error.message }, { status: 200 });
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
    .from('whatsapp_alerts')
    .select('message_text, created_at')
    .eq('organization_id', orgId)
    .eq('message_id', DEBUG_MESSAGE_ID)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'No diagnostics captured yet' });

  try {
    return NextResponse.json(JSON.parse(data.message_text));
  } catch {
    return NextResponse.json({ raw: data.message_text });
  }
}
