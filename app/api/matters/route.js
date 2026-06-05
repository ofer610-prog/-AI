import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MATTER_SELECT = `
  id, title, type, stage, status,
  property_address, parcel, delivery_date,
  other_lawyer, broker, agreed_fee, collected_amount, balance_amount,
  payment_status, mortgage, capital_gains, committee_status, municipality_status,
  description, start_date, created_at, extra_data,
  clients(id, name, phone, id_number, address),
  profiles!responsible_lawyer_id(id, full_name)
`;

export async function GET(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id, id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const mine   = searchParams.get('mine') === 'true';
  const stage  = searchParams.get('stage');
  const search = searchParams.get('q');
  const type   = searchParams.get('type');

  let q = sb.from('matters')
    .select(MATTER_SELECT)
    .eq('organization_id', profile.organization_id)
    .order('delivery_date', { ascending: true, nullsFirst: false });

  if (mine)   q = q.eq('responsible_lawyer_id', profile.id);
  if (stage)  q = q.eq('stage', stage);
  if (type)   q = q.eq('type', type);
  if (search) {
    // Also find client IDs matching the search
    const { data: matchedClients } = await sb.from('clients')
      .select('id').eq('organization_id', profile.organization_id)
      .ilike('name', `%${search}%`);
    const clientIds = (matchedClients || []).map(c => c.id);
    const clientFilter = clientIds.length
      ? `,client_id.in.(${clientIds.join(',')})`
      : '';
    q = q.or(`title.ilike.%${search}%,property_address.ilike.%${search}%,parcel.ilike.%${search}%${clientFilter}`);
  }

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Also fetch lawyers list for dropdowns
  const { data: lawyers } = await sb.from('profiles')
    .select('id, full_name')
    .eq('organization_id', profile.organization_id)
    .eq('is_active', true);

  return Response.json({ matters: data || [], lawyers: lawyers || [] });
}

export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id, id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const body = await request.json();

  // Upsert or create client
  let clientId = body.client_id;
  if (!clientId && body.client_name) {
    const { data: existing } = await sb.from('clients')
      .select('id').eq('organization_id', profile.organization_id)
      .ilike('name', body.client_name.trim()).limit(1).single();

    if (existing) {
      clientId = existing.id;
    } else {
      const { data: newClient } = await sb.from('clients').insert({
        organization_id: profile.organization_id,
        name: body.client_name.trim(),
        phone: body.client_phone || null,
        id_number: body.client_id_number || null,
        created_by: user.id,
      }).select('id').single();
      clientId = newClient?.id;
    }
  }

  if (!clientId) return Response.json({ error: 'client_id or client_name required' }, { status: 400 });

  const { data, error } = await sb.from('matters').insert({
    organization_id:      profile.organization_id,
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
    description:          body.description || null,
    responsible_lawyer_id: body.responsible_lawyer_id || null,
    created_by:           user.id,
  }).select(MATTER_SELECT).single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ matter: data }, { status: 201 });
}

export async function PATCH(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, client_name, client_phone, client_id_number, ...updates } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  // Forbidden fields
  delete updates.organization_id;
  delete updates.sheet_row_id;
  delete updates.created_at;
  delete updates.clients;
  delete updates.profiles;

  const { data, error } = await sb.from('matters')
    .update(updates).eq('id', id).select(MATTER_SELECT).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Update client fields if provided
  if (data?.client_id && (client_name || client_phone || client_id_number)) {
    const clientUpdates = {};
    if (client_name)      clientUpdates.name      = client_name;
    if (client_phone)     clientUpdates.phone     = client_phone;
    if (client_id_number) clientUpdates.id_number = client_id_number;
    await sb.from('clients').update(clientUpdates).eq('id', data.client_id);
  }

  return Response.json({ matter: data });
}
