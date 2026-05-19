import { createClient, createServiceClient } from '@/lib/supabase/server';
import { runGmailSync } from '@/lib/sync';

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profile.role !== 'admin' && profile.role !== 'accountant') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await runGmailSync(profile.organization_id);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
