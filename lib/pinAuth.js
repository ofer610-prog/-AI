/**
 * PIN-based auth for the cases module.
 * Routes that serve /cases use this instead of Supabase session auth.
 */
import { createServiceClient } from '@/lib/supabase/server';

export async function validatePin(pinValue) {
  if (!pinValue) return false;

  // Check env var first (fast path)
  const envPin = process.env.CASES_ACCESS_PIN;

  // Also check DB-stored PIN (admin can change it)
  try {
    const sb = createServiceClient();
    const { data: org } = await sb.from('organizations')
      .select('id').order('created_at', { ascending: true }).limit(1).single();
    if (org) {
      const { data: setting } = await sb.from('integration_settings')
        .select('config').eq('organization_id', org.id).eq('provider', 'cases_pin').single();
      if (setting?.config?.pin) {
        return String(pinValue) === String(setting.config.pin);
      }
    }
  } catch { /* fall through */ }

  if (!envPin) return false; // not configured — fail-secure
  return String(pinValue) === String(envPin);
}

/** Extract PIN from request body or x-cases-pin header */
export async function getPinFromRequest(request) {
  const header = request.headers.get('x-cases-pin');
  if (header) return header;
  try {
    const clone = request.clone();
    const body = await clone.json();
    return body?.pin || null;
  } catch {
    return null;
  }
}

/** Get the organization ID (single-org model) */
export async function getOrgId() {
  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('id').order('created_at', { ascending: true }).limit(1).single();
  return org?.id || null;
}
