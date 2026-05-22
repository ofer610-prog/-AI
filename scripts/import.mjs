import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wldiyjuujyxzktscfney.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZGl5anV1anl4emt0c2NmbmV5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTIxMDA4MCwiZXhwIjoyMDk0Nzg2MDgwfQ.uBTf3VGkc6n8Ybrvel3zKQnsX1gIcUJLr6FSzM9XwtY';

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let { data: orgs } = await sb.from('organizations').select('id, name');
let orgId;
if (!orgs?.length) {
  const { data: created, error } = await sb.from('organizations').insert({
    name: 'משרד עו"ד כהן-רוגוזינסקי',
    vat_rate: 18,
    filing_freq: 'bimonthly',
  }).select().single();
  if (error) { console.error('Create org failed:', error.message); process.exit(1); }
  orgId = created.id;
  console.log('✓ נוצר ארגון חדש:', orgId);
} else {
  orgId = orgs[0].id;
  await sb.from('organizations').update({ name: 'משרד עו"ד כהן-רוגוזינסקי' }).eq('id', orgId);
  console.log('✓ עודכן שם הארגון:', orgId);
}

const profilesData = [
  { full_name: 'לידור', role: 'lawyer', email: 'lidor@meshrad.co.il' },
  { full_name: 'פולינה', role: 'lawyer', email: 'polina@meshrad.co.il' },
  { full_name: 'צופית', role: 'lawyer', email: 'tzofit@meshrad.co.il' },
  { full_name: 'עופר', role: 'admin', email: 'ofer@meshrad.co.il' },
];

for (const p of profilesData) {
  const { data: existing } = await sb.from('profiles').select('id').eq('organization_id', orgId).eq('full_name', p.full_name);
  if (existing?.length) { console.log('· קיים:', p.full_name); continue; }
  const { error } = await sb.from('profiles').insert({
    id: crypto.randomUUID(),
    organization_id: orgId,
    full_name: p.full_name,
    role: p.role,
    email: p.email,
    is_active: true,
  });
  if (error) console.error('Profile error:', p.full_name, error.message);
  else console.log('✓ צוות:', p.full_name);
}

console.log('\nשלב 1 הושלם!');
