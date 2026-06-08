import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb
    .from('profiles')
    .select('id, full_name, role, organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) return Response.json({ error: 'No profile' }, { status: 404 });

  return Response.json({ profile });
}
