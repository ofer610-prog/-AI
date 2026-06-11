import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** GET /api/profiles/[id] — public profile (name, role, phone) for any authenticated user. */
export async function GET(request, { params }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await sb.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!me) return Response.json({ error: 'No profile' }, { status: 403 });

  const service = createServiceClient();
  const { data: profile, error } = await service
    .from('profiles')
    .select('id, full_name, role, phone, email, is_active')
    .eq('id', params.id)
    .eq('organization_id', me.organization_id)
    .single();

  if (error || !profile) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ profile });
}
