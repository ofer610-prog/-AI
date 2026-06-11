import { createClient, createServiceClient } from '@/lib/supabase/server';
import { validatePin, getPinFromRequest, getOrgId } from '@/lib/pinAuth';

export const dynamic = 'force-dynamic';

const MATTER_SELECT = `
  id, title, type, stage, status, responsible_lawyer_id,
  property_address, parcel, delivery_date,
  other_lawyer, broker, agreed_fee, fee_text, collected_amount, balance_amount,
  payment_status, mortgage, capital_gains, committee_status, municipality_status,
  case_category, sheet_order, rami_status, referral_source, case_number,
  open_date, target_date, documents, days_to_delivery,
  description, start_date, created_at, extra_data,
  clients(id, name, phone, id_number, address),
  profiles!responsible_lawyer_id(id, full_name)
`;

/** Returns { orgId, sb } from either Supabase session or PIN */
async function resolveAuth(request) {
  // Try PIN first (cases page flow)
  const pin = await getPinFromRequest(request);
  if (pin) {
    const ok = await validatePin(pin);
    if (ok) {
      const orgId = await getOrgId();
      return orgId ? { orgId, sb: createServiceClient(), userId: null } : null;
    }
  }

  // Fall back to Supabase session (dashboard flow)
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data: profile } = await sb.from('profiles').select('organization_id, id').eq('id', user.id).single();
    if (!profile) return null;
    return { orgId: profile.organization_id, sb, userId: user.id };
  } catch {
    return null;
  }
}

export async function GET(request) {
  const auth = await resolveAuth(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId, sb } = auth;

  const { searchParams } = new URL(request.url);
  const stage    = searchParams.get('stage');
  const search   = searchParams.get('q');
  const type     = searchParams.get('type');
  const category = searchParams.get('category'); // 'realestate' | 'other'

  // Newest first: follow the workbook row order (sheet_order asc = top of sheet),
  // with manually-added matters (no sheet_order) shown first by creation time.
  let q = sb.from('matters')
    .select(MATTER_SELECT)
    .eq('organization_id', orgId)
    .order('sheet_order', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (category) q = q.eq('case_category', category);
  if (stage)  q = q.eq('stage', stage);
  if (type)   q = q.eq('type', type);
  if (search) {
    const { data: matchedClients } = await sb.from('clients')
      .select('id').eq('organization_id', orgId).ilike('name', `%${search}%`);
    const clientIds = (matchedClients || []).map(c => c.id);
    const clientFilter = clientIds.length ? `,client_id.in.(${clientIds.join(',')})` : '';
    q = q.or(`title.ilike.%${search}%,property_address.ilike.%${search}%,parcel.ilike.%${search}%${clientFilter}`);
  }

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: lawyers } = await sb.from('profiles')
    .select('id, full_name').eq('organization_id', orgId).eq('is_active', true);

  return Response.json({ matters: data || [], lawyers: lawyers || [] });
}

export async function POST(request) {
  const auth = await resolveAuth(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId, sb, userId } = auth;

  const body = await request.clone().json().catch(() => ({}));

  let clientId = body.client_id;
  if (!clientId && body.client_name) {
    const { data: existing } = await sb.from('clients')
      .select('id').eq('organization_id', orgId)
      .ilike('name', body.client_name.trim()).limit(1).single();

    if (existing) {
      clientId = existing.id;
    } else {
      const { data: newClient } = await sb.from('clients').insert({
        organization_id: orgId,
        name: body.client_name.trim(),
        phone: body.client_phone || null,
        id_number: body.client_id_number || null,
        created_by: userId,
      }).select('id').single();
      clientId = newClient?.id;
    }
  }

  if (!clientId) return Response.json({ error: 'client_id or client_name required' }, { status: 400 });

  const { data, error } = await sb.from('matters').insert({
    organization_id:      orgId,
    client_id:            clientId,
    title:                body.title || body.client_name || 'תיק חדש',
    type:                 body.type || 'other',
    stage:                body.stage || 'draft',
    status:               'active',
    property_address:     body.property_address || null,
    parcel:               body.parcel || null,
    delivery_date:        body.delivery_date || null,
    other_lawyer:         body.other_lawyer || null,
    broker:               body.broker || null,
    agreed_fee:           body.agreed_fee || null,
    collected_amount:     body.collected_amount || null,
    balance_amount:       body.balance_amount || null,
    payment_status:       body.payment_status || null,
    mortgage:             body.mortgage || null,
    capital_gains:        body.capital_gains || null,
    committee_status:     body.committee_status || null,
    municipality_status:  body.municipality_status || null,
    case_category:        body.case_category || 'realestate',
    rami_status:          body.rami_status || null,
    referral_source:      body.referral_source || null,
    case_number:          body.case_number || null,
    open_date:            body.open_date || null,
    target_date:          body.target_date || null,
    fee_text:             body.fee_text || null,
    description:          body.description || null,
    responsible_lawyer_id: body.responsible_lawyer_id || null,
    created_by:           userId,
  }).select(MATTER_SELECT).single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ matter: data }, { status: 201 });
}

export async function PATCH(request) {
  const auth = await resolveAuth(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId, sb } = auth;

  const body = await request.clone().json().catch(() => ({}));
  const { id, client_name, client_phone, client_id_number, pin, ...updates } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  delete updates.organization_id;
  delete updates.sheet_row_id;
  delete updates.created_at;
  delete updates.clients;
  delete updates.profiles;

  const { data, error } = await sb.from('matters')
    .update(updates).eq('id', id).eq('organization_id', orgId)
    .select(MATTER_SELECT).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });

  if (data?.client_id && (client_name || client_phone || client_id_number)) {
    const clientUpdates = {};
    if (client_name)      clientUpdates.name      = client_name;
    if (client_phone)     clientUpdates.phone     = client_phone;
    if (client_id_number) clientUpdates.id_number = client_id_number;
    await sb.from('clients').update(clientUpdates).eq('id', data.client_id);
  }

  return Response.json({ matter: data });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const auth = await resolveAuth(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { sb, orgId } = auth;

  // Delete linked client too if this is the only matter for that client
  const { data: matter } = await sb.from('matters')
    .select('id, client_id').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (!matter) return Response.json({ error: 'Not found' }, { status: 404 });

  const { error } = await sb.from('matters').delete().eq('id', id).eq('organization_id', orgId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Clean up orphan client (no other matters linked to it)
  if (matter.client_id) {
    const { data: siblings } = await sb.from('matters')
      .select('id').eq('client_id', matter.client_id).limit(1);
    if (!siblings?.length) {
      await sb.from('clients').delete().eq('id', matter.client_id).eq('organization_id', orgId);
    }
  }

  return Response.json({ ok: true });
}
