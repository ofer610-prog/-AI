import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const supabase = createServiceClient();
  const { id } = await params;

  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients(name, email, phone), matters(title), invoice_items(*)')
    .eq('id', id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });

  return Response.json({ invoice: data });
}

export async function PATCH(request, { params }) {
  const supabase = createServiceClient();
  const { id } = await params;
  const body = await request.json();

  const allowed = ['status', 'notes', 'due_date', 'paid_date', 'subtotal', 'vat_rate', 'vat_amount', 'amount'];
  const update = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ invoice: data });
}

export async function DELETE(request, { params }) {
  const supabase = createServiceClient();
  const { id } = await params;

  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
