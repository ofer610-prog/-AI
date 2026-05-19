import { redirect } from 'next/navigation';
import { getAuthUrl } from '@/lib/gmail';
import { createClient } from '@/lib/supabase/server';

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = getAuthUrl();
  return Response.redirect(url);
}
