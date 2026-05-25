import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request) {
  try {
    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';

    const { data: orgs } = await sb.from('organizations').select('id');
    const orgId = orgs?.[0]?.id;
    if (!orgId) return NextResponse.json({ alerts: [] });

    let query = sb
      .from('whatsapp_alerts')
      .select('*')
      .eq('organization_id', orgId)
      .order('message_timestamp', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: alerts, error } = await query;
    if (error) throw error;

    return NextResponse.json({ alerts: alerts || [] });
  } catch (err) {
    console.error('whatsapp/alerts GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const sb = createServiceClient();
    const body = await request.json();
    const { id, status } = body;

    if (!id || !['resolved', 'dismissed', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid id or status' }, { status: 400 });
    }

    const { error } = await sb
      .from('whatsapp_alerts')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('whatsapp/alerts PATCH error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
