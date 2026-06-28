import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, forbidden } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const profile = await requireAdmin();
  if (!profile) return forbidden();
  const supabase = createServiceClient();
  const { id } = await params;

  const orgId = profile.organization_id;
  if (!orgId) return Response.json({ error: 'No organization' }, { status: 404 });

  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients(name, email, phone), matters(title), invoice_items(*)')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });

  return Response.json({ invoice: data });
}

export async function PATCH(request, { params }) {
  const profile = await requireAdmin();
  if (!profile) return forbidden();
  const supabase = createServiceClient();
  const { id } = await params;
  const body = await request.json();

  const orgId = profile.organization_id;
  if (!orgId) return Response.json({ error: 'No organization' }, { status: 404 });

  const allowed = ['status', 'notes', 'due_date', 'paid_date', 'amount'];
  const update = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({ invoice: data });
}

export async function DELETE(request, { params }) {
  const profile = await requireAdmin();
  if (!profile) return forbidden();
  const supabase = createServiceClient();
  const { id } = await params;

  const orgId = profile.organization_id;
  if (!orgId) return Response.json({ error: 'No organization' }, { status: 404 });

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
