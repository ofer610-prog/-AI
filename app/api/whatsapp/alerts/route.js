import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(request) {
  try {
    const authSb = await createClient();
    const { data: { user } } = await authSb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await authSb
      .from('profiles').select('organization_id, role').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 });

    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';

    const orgId = profile.organization_id;
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
    // whatsapp_alerts table may not exist yet
    if (error) return NextResponse.json({ alerts: [] });

    return NextResponse.json({ alerts: alerts || [] });
  } catch (err) {
    console.error('whatsapp/alerts GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const authSb = await createClient();
    const { data: { user } } = await authSb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await authSb
      .from('profiles').select('organization_id, role').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 });

    const sb = createServiceClient();
    const body = await request.json();
    const { id, status } = body;

    if (!id || !['resolved', 'dismissed', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid id or status' }, { status: 400 });
    }

    const { error } = await sb
      .from('whatsapp_alerts')
      .update({ status })
      .eq('id', id)
      .eq('organization_id', profile.organization_id);

    if (error) return NextResponse.json({ error: 'whatsapp_alerts table not available' }, { status: 503 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('whatsapp/alerts PATCH error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
