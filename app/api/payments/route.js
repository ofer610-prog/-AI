import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) return Response.json({ error: 'No organization' }, { status: 404 });

  let query = supabase
    .from('payments')
    .select('*, clients(name), invoices(number, invoice_number)')
    .eq('organization_id', org.id)
    .order('payment_date', { ascending: false });

  const limit = searchParams.get('limit');
  if (limit) query = query.limit(Number(limit));

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ payments: data || [] });
}

export async function POST(request) {
  const supabase = createServiceClient();
  const body = await request.json();

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) return Response.json({ error: 'No organization' }, { status: 404 });

  const payload = {
    organization_id: org.id,
    invoice_id: body.invoice_id || null,
    client_id: body.client_id || null,
    amount: Number(body.amount),
    payment_date: body.payment_date || new Date().toISOString().slice(0, 10),
    method: body.method || 'bank_transfer',
    reference: body.reference || null,
    notes: body.notes || null,
  };

  const { data: payment, error } = await supabase.from('payments').insert(payload).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // If linked to an invoice, mark it as paid
  if (body.invoice_id) {
    await supabase
      .from('invoices')
      .update({ status: 'paid', paid_date: payload.payment_date })
      .eq('id', body.invoice_id);
  }

  return Response.json({ payment }, { status: 201 });
}
