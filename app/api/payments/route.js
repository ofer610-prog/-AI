import { createServiceClient, getSessionUser } from '@/lib/supabase/server';

import { requireAdmin, forbidden } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!(await requireAdmin())) return forbidden();
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
    .select('*, clients(name), invoices(number)')
    .eq('organization_id', org.id)
    .order('payment_date', { ascending: false });

  const limit = searchParams.get('limit');
  if (limit) query = query.limit(Number(limit));

  const { data, error } = await query;
  // payments table may not exist yet (accounting migration pending)
  if (error) return Response.json({ payments: [] });

  return Response.json({ payments: data || [] });
}

export async function POST(request) {
  if (!(await requireAdmin())) return forbidden();
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
  if (error) return Response.json({ error: 'טבלת תשלומים עדיין לא קיימת במסד הנתונים' }, { status: 503 });

  // If linked to an invoice, mark it as paid
  if (body.invoice_id) {
    await supabase
      .from('invoices')
      .update({ status: 'paid', paid_date: payload.payment_date })
      .eq('id', body.invoice_id);
  }

  return Response.json({ payment }, { status: 201 });
}
