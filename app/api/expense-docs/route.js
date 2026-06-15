import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id, role').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');

  let q = sb.from('expense_documents')
    .select('*, profiles!uploaded_by(full_name)')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false });

  // Employees may attach expense receipts but see only their own uploads —
  // aggregated accounting data is reserved for admin/accountant.
  if (!['admin', 'accountant'].includes(profile.role)) {
    q = q.eq('uploaded_by', user.id);
  }

  if (month) q = q.eq('month', month);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ docs: data || [] });
}

export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { file_url, file_name, file_type, amount, vendor, description, category, doc_date } = body;

  if (!file_url || !file_name) return Response.json({ error: 'file_url and file_name required' }, { status: 400 });

  const dateStr = doc_date || new Date().toISOString().slice(0, 10);
  const month   = dateStr.slice(0, 7);

  const { expense_item, expense_section, expense_year, expense_month_num, gmail_message_id } = body;

  const { data, error } = await sb.from('expense_documents').insert({
    organization_id: profile.organization_id,
    uploaded_by:     user.id,
    file_url, file_name, file_type,
    amount: amount ? Number(amount) : null,
    vendor:      vendor      || null,
    description: description || null,
    category:    category    || 'general',
    doc_date:    dateStr,
    month,
    expense_item:      expense_item      || null,
    expense_section:   expense_section   || null,
    expense_year:      expense_year      ? Number(expense_year)      : null,
    expense_month_num: expense_month_num ? Number(expense_month_num) : null,
    gmail_message_id:  gmail_message_id  || null,
  }).select('*, profiles!uploaded_by(full_name)').single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ doc: data }, { status: 201 });
}

export async function PATCH(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id, role').eq('id', user.id).single();
  if (!['admin','accountant'].includes(profile?.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id, status, accountant_notes } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates = {};
  if (status)            updates.status            = status;
  if (accountant_notes !== undefined) updates.accountant_notes = accountant_notes;

  const { data, error } = await sb.from('expense_documents').update(updates)
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ doc: data });
}
