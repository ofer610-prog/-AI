import { createServiceClient } from '@/lib/supabase/server';
import seedData from '@/lib/seed-data.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const log = [];

  // Step 1: organization
  let { data: orgs } = await sb.from('organizations').select('id');
  let orgId;
  if (!orgs?.length) {
    const { data: created, error } = await sb.from('organizations').insert({
      name: seedData.organization,
      vat_rate: 18,
      filing_freq: 'bimonthly',
    }).select().single();
    if (error) return Response.json({ error: 'Org create failed: ' + error.message }, { status: 500 });
    orgId = created.id;
    log.push(`✓ נוצר ארגון: ${orgId}`);
  } else {
    orgId = orgs[0].id;
    await sb.from('organizations').update({ name: seedData.organization }).eq('id', orgId);
    log.push(`✓ עודכן ארגון: ${orgId}`);
  }

  // Step 2: team (create auth users + profiles)
  for (const p of seedData.team) {
    const { data: existing } = await sb.from('profiles').select('id').eq('organization_id', orgId).eq('full_name', p.full_name);
    if (existing?.length) { log.push(`· קיים: ${p.full_name}`); continue; }

    // Create auth user first
    const tempPassword = crypto.randomUUID().slice(0, 16) + 'A1!';
    const { data: authUser, error: authErr } = await sb.auth.admin.createUser({
      email: p.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: p.full_name },
    });
    if (authErr) {
      // User might already exist
      const { data: list } = await sb.auth.admin.listUsers();
      const found = list?.users?.find(u => u.email === p.email);
      if (!found) { log.push(`✗ auth ${p.full_name}: ${authErr.message}`); continue; }
      authUser.user = found;
    }

    const { error } = await sb.from('profiles').insert({
      id: authUser.user.id,
      organization_id: orgId,
      full_name: p.full_name,
      role: p.role,
      email: p.email,
      is_active: true,
    });
    if (error) log.push(`✗ profile ${p.full_name}: ${error.message}`);
    else log.push(`✓ צוות: ${p.full_name} (${p.email})`);
  }

  // Step 3: load profile lookup
  const { data: profiles } = await sb.from('profiles').select('id, full_name').eq('organization_id', orgId);
  const profileByName = Object.fromEntries(profiles.map(p => [p.full_name, p.id]));

  // Step 4: clients (unique)
  const uniqueClients = [...new Set(seedData.matters.filter(m => m.client_name).map(m => m.client_name))];
  const { data: existingClients } = await sb.from('clients').select('id, name').eq('organization_id', orgId);
  const existingClientNames = new Set((existingClients || []).map(c => c.name));

  // Build clientByName incrementally (from existing + newly inserted)
  const clientByName = Object.fromEntries((existingClients || []).map(c => [c.name, c.id]));
  let clientsAdded = 0, clientErrors = 0;
  for (const name of uniqueClients) {
    if (clientByName[name]) continue;
    const { data: inserted, error } = await sb.from('clients').insert({
      organization_id: orgId,
      name,
    }).select('id').single();
    if (!error && inserted) {
      clientsAdded++;
      clientByName[name] = inserted.id;
    } else {
      clientErrors++;
      log.push(`✗ client ${name}: ${error?.message}`);
    }
  }
  log.push(`✓ לקוחות חדשים: ${clientsAdded} (מתוך ${uniqueClients.length})`);

  // Step 6: matters
  let mattersAdded = 0, matterErrors = 0;
  for (const m of seedData.matters) {
    if (!m.client_name) continue;
    const clientId = clientByName[m.client_name];
    if (!clientId) { matterErrors++; log.push(`✗ no client for: ${m.client_name}`); continue; }

    const title = (m.client_name + (m.address ? ` - ${m.address}` : '')).slice(0, 200);
    const responsibleLawyer = m.lawyer ? profileByName[m.lawyer.split(' ')[0]] || null : null;

    // Skip if matter with same title already exists
    const { data: existingMatter } = await sb.from('matters')
      .select('id').eq('organization_id', orgId).eq('title', title).maybeSingle();
    if (existingMatter) continue;

    const { error } = await sb.from('matters').insert({
      organization_id: orgId,
      client_id: clientId,
      title,
      type: m.type,
      status: m.status,
      agreed_fee: m.fee,
      description: m.notes,
      property_address: m.address || null,
      responsible_lawyer_id: responsibleLawyer,
    });
    if (error) { matterErrors++; log.push(`✗ ${title}: ${error.message}`); }
    else mattersAdded++;
  }
  log.push(`✓ תיקים חדשים: ${mattersAdded} (שגיאות: ${matterErrors})`);

  return Response.json({
    success: true,
    organization_id: orgId,
    log,
    summary: {
      clients_total: uniqueClients.length,
      clients_added: clientsAdded,
      matters_added: mattersAdded,
      matter_errors: matterErrors,
    },
  });
}
