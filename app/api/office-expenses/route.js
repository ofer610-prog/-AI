import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

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

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();

  const sb = createServiceClient();
  const { data, error } = await sb.from('office_expenses')
    .select('id, section, item_name, year, month, amount, notes, sort_order, is_recurring, is_itemized')
    .eq('organization_id', profile.organization_id)
    .eq('year', year)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('item_name');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: org } = await sb.from('organizations')
    .select('accountant_email').eq('id', profile.organization_id).single();

  const { data: docs } = await sb.from('expense_documents')
    .select('id, file_url, file_name, file_type, amount, vat, vendor, description, doc_date, doc_number, currency, original_amount, status, expense_item, expense_section, expense_year, expense_month_num, gmail_message_id, category, payer')
    .eq('organization_id', profile.organization_id)
    .neq('status', 'removed')
    .or(`expense_year.eq.${year},status.eq.needs_review`)
    .order('doc_date', { ascending: false });

  return Response.json({ entries: data || [], docs: docs || [], year, accountant_email: org?.accountant_email || '' });
}

export async function PATCH(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { section, item_name, year } = body;
  if (!section || !item_name || !year) return Response.json({ error: 'section, item_name, year required' }, { status: 400 });
  const updates = {};
  if (body.is_recurring !== undefined) updates.is_recurring = !!body.is_recurring;
  if (body.is_itemized !== undefined) updates.is_itemized = !!body.is_itemized;
  if (!Object.keys(updates).length) return Response.json({ error: 'no flags to update' }, { status: 400 });
  const sb = createServiceClient();
  const { error } = await sb.from('office_expenses').update(updates).eq('organization_id', profile.organization_id).eq('section', section).eq('item_name', item_name).eq('year', Number(year));
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { section = 'office', item_name, year, month } = body;
  if (!item_name || !year || !month) return Response.json({ error: 'item_name, year, month required' }, { status: 400 });
  const sb = createServiceClient();
  const { data, error } = await sb.from('office_expenses').upsert({
    organization_id: profile.organization_id,
    section,
    item_name: String(item_name).trim(),
    year: Number(year),
    month: Number(month),
    amount: Number(body.amount) || 0,
    notes: body.notes || null,
    sort_order: body.sort_order ?? null,
    is_recurring: body.is_recurring ?? false,
  }, { onConflict: 'organization_id,section,item_name,year,month' }).select('id').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, id: data?.id });
}

export async function DELETE(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const item = searchParams.get('item');
  const section = searchParams.get('section') || 'office';
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  if (!item) return Response.json({ error: 'item required' }, { status: 400 });
  const sb = createServiceClient();
  const { error } = await sb.from('office_expenses').delete().eq('organization_id', profile.organization_id).eq('section', section).eq('item_name', item).eq('year', year);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
