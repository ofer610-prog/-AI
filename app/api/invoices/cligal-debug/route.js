import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// We persist diagnostics as a single special row in the `invoices` table
// (which exists in the live DB), keyed by this invoice_number. It is deleted
// and rewritten on every POST, and can be cleared via DELETE.
const DEBUG_KEY = '__CLIGAL_DEBUG__';

async function getOrgId(sb) {
  const { data: orgs } = await sb.from('organizations').select('id').limit(1);
  return orgs?.[0]?.id || null;
}

/**
 * POST /api/invoices/cligal-debug
 * Receives diagnostic info from the Playwright scraper and stores it in a
 * dedicated invoices row (invoice_number='__CLIGAL_DEBUG__', notes=<json>).
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
  const orgId = await getOrgId(sb);
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 500 });

  const payload = JSON.stringify({ captured_at: new Date().toISOString(), ...body });

  // Remove any prior debug row, then insert fresh. Uses only base-schema
  // columns ('number', not 'invoice_number', which lives in a migration that
  // hasn't been applied to the live DB).
  await sb.from('invoices').delete().eq('organization_id', orgId).eq('number', DEBUG_KEY);

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await sb.from('invoices').insert({
    organization_id: orgId,
    number: DEBUG_KEY,
    client_name: '__debug__',
    amount: 0,
    issue_date: today,
    due_date: today,
    status: 'open',
    notes: payload,
  });

  if (error) {
    console.log('CLIGAL_DB_ERR:', error.message);
    return NextResponse.json({ received: false, dbError: error.message }, { status: 200 });
  }

  return NextResponse.json({ received: true, bytes: payload.length });
}

/**
 * GET /api/invoices/cligal-debug?secret=...
 *   &probe=1   -> report which tables exist + organizations columns
 * Otherwise returns the most recent diagnostics captured by the scraper.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const orgId = await getOrgId(sb);
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 500 });

  if (url.searchParams.get('probe') === '1') {
    const probe = { orgId, tables: {} };
    const candidates = ['whatsapp_alerts', 'integration_settings', 'invoices', 'clients', 'matters', 'payments'];
    for (const t of candidates) {
      const r = await sb.from(t).select('*').limit(1);
      probe.tables[t] = r.error ? r.error.message : `ok (${r.data?.length ?? 0} rows sampled)`;
    }
    return NextResponse.json({ probe });
  }

  const { data } = await sb
    .from('invoices')
    .select('notes, created_at')
    .eq('organization_id', orgId)
    .eq('number', DEBUG_KEY)
    .maybeSingle();

  if (!data?.notes) return NextResponse.json({ error: 'No diagnostics captured yet' });

  try {
    return NextResponse.json(JSON.parse(data.notes));
  } catch {
    return NextResponse.json({ raw: data.notes });
  }
}

/** DELETE /api/invoices/cligal-debug?secret=...  removes the debug row. */
export async function DELETE(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sb = createServiceClient();
  const orgId = await getOrgId(sb);
  if (orgId) {
    await sb.from('invoices').delete().eq('organization_id', orgId).eq('number', DEBUG_KEY);
  }
  return NextResponse.json({ deleted: true });
}
