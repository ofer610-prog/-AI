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

  const lawyerId = searchParams.get('lawyer_id');

  let query = supabase
    .from('invoices')
    .select(lawyerId
      ? 'id, number, client_id, client_name, amount, subtotal, issue_date, due_date, status, notes, allocation_number, last_reminder_sent, reminder_count, clients(name, phone, email), matters!inner(title, responsible_lawyer_id)'
      : 'id, number, client_id, client_name, amount, subtotal, issue_date, due_date, status, notes, allocation_number, last_reminder_sent, reminder_count, clients(name, phone, email), matters(title, responsible_lawyer_id)')
    .eq('organization_id', org.id)
    .order('issue_date', { ascending: false });

  const status = searchParams.get('status');
  if (status) query = query.eq('status', status);

  const search = searchParams.get('search');
  if (search) {
    const safe = search.replace(/[%,()]/g, '');
    query = query.or(`number.ilike.%${safe}%,client_name.ilike.%${safe}%,notes.ilike.%${safe}%`);
  }

  const from = searchParams.get('from');
  if (from) query = query.gte('issue_date', from);
  const to = searchParams.get('to');
  if (to) query = query.lte('issue_date', to);

  if (lawyerId) query = query.eq('matters.responsible_lawyer_id', lawyerId);

  const minAmount = searchParams.get('min_amount');
  if (minAmount) query = query.gte('amount', Number(minAmount));

  const [{ data, error }, { data: lawyers }] = await Promise.all([
    query,
    supabase.from('profiles')
      .select('id, full_name')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .order('full_name'),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ invoices: data || [], lawyers: lawyers || [] });
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
    status: ['draft','sent','open', 'paid', 'cancelled', 'overdue'].includes(body.status) ? body.status : 'open',
    notes: body.notes || null,
    subtotal: subtotal || null,
    vat_amount: vatAmount || null,
    vat_rate: vatRate,
    allocation_number: body.allocation_number || null,
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
