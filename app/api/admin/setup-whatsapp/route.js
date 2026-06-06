import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const log = [];

  const { data: orgs } = await sb.from('organizations').select('id').limit(1);
  if (!orgs?.length) return NextResponse.json({ error: 'No organization' }, { status: 500 });
  const orgId = orgs[0].id;

  const config = {
    instance_id: process.env.GREENAPI_INSTANCE || '7107631283',
    api_url:     'https://7107.api.greenapi.com',
    token:       process.env.GREENAPI_TOKEN || '',
    target_group_name: 'משרד עורכי דין',
  };

  const { data: existing } = await sb
    .from('integration_settings')
    .select('id')
    .eq('organization_id', orgId)
    .eq('provider', 'greenapi')
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('integration_settings')
      .update({ config, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: 'Update failed: ' + error.message }, { status: 500 });
    log.push('✓ עודכנו הגדרות GREEN-API');
  } else {
    const { error } = await sb.from('integration_settings').insert({
      organization_id: orgId,
      provider: 'greenapi',
      config,
      is_active: true,
    });
    if (error) {
      if (error.message?.includes('relation') && error.message?.includes('integration_settings')) {
        return NextResponse.json({
          error: 'Table integration_settings does not exist. Apply migration first.',
          hint: 'Run the SQL from /supabase/migrations/20260526_integration_settings.sql in Supabase SQL editor.',
        }, { status: 500 });
      }
      return NextResponse.json({ error: 'Insert failed: ' + error.message }, { status: 500 });
    }
    log.push('✓ נוצרו הגדרות GREEN-API');
  }

  return NextResponse.json({
    success: true,
    organization_id: orgId,
    log,
    next_steps: [
      'Test: GET /api/whatsapp/groups',
      'Scan: POST /api/whatsapp/scan',
      'Or wait for cron every 48h',
    ],
  });
}
