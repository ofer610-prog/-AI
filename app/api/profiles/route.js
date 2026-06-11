import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/profiles — lightweight team list for any authenticated user.
 * Returns only non-sensitive fields (no salary). Used by the global
 * LawyerSidebar so every employee can navigate to a colleague's page.
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await sb
    .from('profiles').select('organization_id').eq('id', user.id).single();
  if (!me) return Response.json({ error: 'No profile' }, { status: 404 });

  const service = createServiceClient();
  const { data: lawyers } = await service
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('organization_id', me.organization_id)
    .eq('is_active', true)
    .order('full_name');

  return Response.json({ lawyers: lawyers || [] });
}
