import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // During static generation (no env vars), return a no-op stub so the build succeeds.
  // At runtime in the browser, env vars are always present.
  if (!url || !key) {
    return {
      from: () => ({ select: () => ({ eq: () => ({ order: () => ({ data: null, error: null }) }), data: null, error: null }) }),
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    };
  }
  return createBrowserClient(url, key);
}
