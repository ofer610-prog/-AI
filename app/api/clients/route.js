import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('clients')
    .select('id, name, phone, email')
    .eq('organization_id', profile.organization_id)
    .order('name');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ clients: data || [] });
}
