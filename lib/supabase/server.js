import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component cookie setter throws — ignore.
          }
        },
      },
    }
  );
}

// Service role client (used only in cron jobs / API routes that need elevated access)
import { createClient as createSupaClient } from '@supabase/supabase-js';

export function createServiceClient() {
  return createSupaClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Returns the logged-in Supabase user, or null. For protecting API routes. */
export async function getSessionUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user || null;
}
