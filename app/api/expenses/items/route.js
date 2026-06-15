import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * Line items for ITEMIZED expense rows (e.g. אגרות טאבו) — many individual
 * fees per month that accumulate into one matrix cell.
 *
 * Backed by expense_documents (linked via expense_item/section/year/month_num).
 * Each line may optionally carry an invoice file. After every change we
 * recompute office_expenses.amount = SUM(line amounts) so the matrix totals
 * and the accountant report stay correct.
 */

async function recomputeCell(sb, orgId, section, item, year, month) {
  // Only OFFICE-paid fees count toward the expense cell. Client-card fees
  // (e.g. אגרת רישום שהלקוח שילם) are tracked but excluded from our expenses.
  const { data: lines } = await sb.from('expense_documents')
    .select('amount, payer')
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);

  const sum = (lines || [])
    .filter(l => (l.payer || 'office') === 'office')
    .reduce((s, l) => s + Number(l.amount || 0), 0);

  await sb.from('office_expenses').upsert({
    organization_id: orgId,
    section, item_name: item, year, month,
    amount: sum,
  }, { onConflict: 'organization_id,section,item_name,year,month' });

  return sum;
}

/** GET /api/expenses/items?section=&item=&year=&month= — list cell line items */
export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section');
  const item    = searchParams.get('item');
  const year    = Number(searchParams.get('year'));
  const month   = Number(searchParams.get('month'));
  if (!section || !item || !year || !month) {
    return Response.json({ error: 'section, item, year, month required' }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb.from('expense_documents')
    .select('id, amount, vendor, description, doc_date, file_url, file_name, file_type, status, gmail_message_id, payer')
    .eq('organization_id', profile.organization_id)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month)
    .order('doc_date', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const officeTotal = (data || []).filter(l => (l.payer || 'office') === 'office').reduce((s, l) => s + Number(l.amount || 0), 0);
  const clientTotal = (data || []).filter(l => l.payer === 'client').reduce((s, l) => s + Number(l.amount || 0), 0);
  return Response.json({ items: data || [], total: officeTotal, officeTotal, clientTotal });
}

/** POST /api/expenses/items — add one line item, returns new cell total */
export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { section, item, year, month } = body;
  if (!section || !item || !year || !month) {
    return Response.json({ error: 'section, item, year, month required' }, { status: 400 });
  }

  const sb = createServiceClient();
  const docDate = body.doc_date || `${year}-${String(month).padStart(2, '0')}-01`;

  const { data, error } = await sb.from('expense_documents').insert({
    organization_id:  profile.organization_id,
    uploaded_by:      profile.id,
    expense_section:  section,
    expense_item:     item,
    expense_year:     Number(year),
    expense_month_num: Number(month),
    amount:       body.amount ? Number(body.amount) : 0,
    vendor:       body.vendor || null,
    description:  body.description || null,
    payer:        body.payer === 'client' ? 'client' : 'office',
    doc_date:     docDate,
    month:        docDate.slice(0, 7),
    category:     'legal',
    file_url:     body.file_url  || null,
    file_name:    body.file_name || null,
    file_type:    body.file_type || null,
    gmail_message_id: body.gmail_message_id || null,
  }).select('id, amount, vendor, description, doc_date, file_url, file_name').single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const total = await recomputeCell(sb, profile.organization_id, section, item, Number(year), Number(month));
  return Response.json({ item: data, total }, { status: 201 });
}

/** PATCH /api/expenses/items — edit one line's amount/description */
export async function PATCH(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { id } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates = {};
  if (body.amount !== undefined)      updates.amount = Number(body.amount) || 0;
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.vendor !== undefined)      updates.vendor = body.vendor || null;
  if (body.doc_date !== undefined)    updates.doc_date = body.doc_date || null;
  if (body.payer !== undefined)       updates.payer = body.payer === 'client' ? 'client' : 'office';

  const sb = createServiceClient();
  const { data, error } = await sb.from('expense_documents').update(updates)
    .eq('id', id).eq('organization_id', profile.organization_id)
    .select('expense_section, expense_item, expense_year, expense_month_num').single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const total = await recomputeCell(sb, profile.organization_id,
    data.expense_section, data.expense_item, data.expense_year, data.expense_month_num);
  return Response.json({ ok: true, total });
}

/** DELETE /api/expenses/items?id= — remove one line, recompute cell */
export async function DELETE(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const sb = createServiceClient();
  // Find the cell before deleting so we can recompute
  const { data: doc } = await sb.from('expense_documents')
    .select('expense_section, expense_item, expense_year, expense_month_num')
    .eq('id', id).eq('organization_id', profile.organization_id).single();

  const { error } = await sb.from('expense_documents').delete()
    .eq('id', id).eq('organization_id', profile.organization_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let total = 0;
  if (doc) {
    total = await recomputeCell(sb, profile.organization_id,
      doc.expense_section, doc.expense_item, doc.expense_year, doc.expense_month_num);
  }
  return Response.json({ ok: true, total });
}
