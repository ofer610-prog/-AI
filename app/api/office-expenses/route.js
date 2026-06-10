import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function me() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles').select('id, organization_id').eq('id', user.id).single();
  return profile || null;
}

/** GET /api/office-expenses?year=2026 — full matrix for the year */
export async function GET(request) {
  const profile = await me();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();

  const sb = createServiceClient();
  const { data, error } = await sb.from('office_expenses')
    .select('id, section, item_name, year, month, amount, notes, sort_order')
    .eq('organization_id', profile.organization_id)
    .eq('year', year)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('item_name');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entries: data || [], year });
}

/**
 * POST /api/office-expenses — upsert a single cell
 * Body: { section, item_name, year, month, amount, notes?, sort_order? }
 */
export async function POST(request) {
  const profile = await me();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { section = 'office', item_name, year, month } = body;
  if (!item_name || !year || !month) {
    return Response.json({ error: 'item_name, year, month required' }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb.from('office_expenses')
    .upsert({
      organization_id: profile.organization_id,
      section,
      item_name: String(item_name).trim(),
      year: Number(year),
      month: Number(month),
      amount: Number(body.amount) || 0,
      notes: body.notes || null,
      sort_order: body.sort_order ?? null,
    }, { onConflict: 'organization_id,section,item_name,year,month' })
    .select('id').single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, id: data?.id });
}

/** DELETE /api/office-expenses?item=NAME&section=office&year=2026 — remove a whole row */
export async function DELETE(request) {
  const profile = await me();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const item = searchParams.get('item');
  const section = searchParams.get('section') || 'office';
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  if (!item) return Response.json({ error: 'item required' }, { status: 400 });

  const sb = createServiceClient();
  const { error } = await sb.from('office_expenses')
    .delete()
    .eq('organization_id', profile.organization_id)
    .eq('section', section).eq('item_name', item).eq('year', year);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
