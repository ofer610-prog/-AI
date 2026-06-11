/**
 * Role-based authorization helpers for API routes.
 * Financial / accounting endpoints must be admin-or-accountant only —
 * regular employees never receive accounting data from the server.
 */
import { createClient, createServiceClient } from '@/lib/supabase/server';

/** Current user's profile (id, role, organization_id) or null. */
export async function getProfile() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('id, full_name, role, organization_id')
    .eq('id', user.id)
    .single();
  return profile || null;
}

/** Returns the profile only if the user is admin/accountant, else null. */
export async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || !['admin', 'accountant'].includes(profile.role)) return null;
  return profile;
}

export function forbidden() {
  return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
}
