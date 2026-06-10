import { createServiceClient, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!(await getSessionUser())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
    .from('invoices')
    .select('*, clients(name), matters(title)')
    .eq('organization_id', org.id)
    .order('issue_date', { ascending: false });

  const status = searchParams.get('status');
  if (status) query = query.eq('status', status);

  const search = searchParams.get('search');
  if (search) query = query.or(`number.ilike.%${search}%,client_name.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ invoices: data || [] });
}

export async function POST(request) {
  if (!(await getSessionUser())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const body = await request.json();

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) return Response.json({ error: 'No organization' }, { status: 404 });

  // Generate invoice number from sequence
  const { data: seqData } = await supabase.rpc('nextval', { sequence_name: 'invoice_number_seq' }).single().catch(() => ({ data: null }));
  const invoiceNumber = body.invoice_number || `INV-${Date.now()}`;

  // Get client name snapshot
  let clientName = body.client_name || '';
  if (body.client_id && !clientName) {
    const { data: client } = await supabase.from('clients').select('name').eq('id', body.client_id).single();
    clientName = client?.name || '';
  }

  const subtotal = Number(body.subtotal) || 0;
  const vatRate = Number(body.vat_rate) || 18;
  const vatAmount = Math.round(subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  const payload = {
    organization_id: org.id,
    client_id: body.client_id || null,
    matter_id: body.matter_id || null,
    number: invoiceNumber,
    client_name: clientName,
    amount: body.amount != null ? Number(body.amount) : total,
    issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
    due_date: body.due_date || new Date().toISOString().slice(0, 10),
    status: ['open', 'paid', 'cancelled'].includes(body.status) ? body.status : 'open',
    notes: body.notes || null,
  };

  const { data: invoice, error } = await supabase.from('invoices').insert(payload).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Insert line items if provided (table exists only after accounting migration)
  if (body.items && body.items.length > 0) {
    const items = body.items
      .filter(i => i.description)
      .map(i => ({
        invoice_id: invoice.id,
        description: i.description,
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price) || 0,
      }));
    if (items.length > 0) {
      await supabase.from('invoice_items').insert(items).catch(() => null);
    }
  }

  return Response.json({ invoice }, { status: 201 });
}
