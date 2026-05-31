import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = url.searchParams.get('email');
  const password = url.searchParams.get('password');
  if (!email || !password) {
    return Response.json({ error: 'Provide ?email=...&password=...' }, { status: 400 });
  }

  const sb = createServiceClient();
  const result = { project_url: process.env.NEXT_PUBLIC_SUPABASE_URL, log: [] };

  // 1. Report which key tables exist in THIS (live) database
  const tablesToCheck = ['organizations', 'profiles', 'clients', 'matters', 'invoices', 'invoice_items', 'payments', 'expenses', 'whatsapp_alerts', 'integration_settings'];
  const tableStatus = {};
  for (const t of tablesToCheck) {
    const { error } = await sb.from(t).select('id', { count: 'exact', head: true });
    tableStatus[t] = error ? `MISSING (${error.message})` : 'OK';
  }
  result.tables = tableStatus;

  // 2. Find the organization
  const { data: orgs } = await sb.from('organizations').select('id').limit(1);
  const orgId = orgs?.[0]?.id || null;
  result.organization_id = orgId;

  // 3. Create or update the admin auth user
  let userId = null;
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'מנהל מערכת' },
  });

  if (createErr) {
    // User likely exists — find and reset password
    const { data: list } = await sb.auth.admin.listUsers();
    const found = list?.users?.find((u) => u.email === email);
    if (found) {
      userId = found.id;
      await sb.auth.admin.updateUserById(userId, { password, email_confirm: true });
      result.log.push(`✓ עודכנה סיסמה למשתמש קיים: ${email}`);
    } else {
      return Response.json({ ...result, error: 'createUser failed: ' + createErr.message }, { status: 500 });
    }
  } else {
    userId = created.user.id;
    result.log.push(`✓ נוצר משתמש חדש: ${email}`);
  }

  // 4. Ensure a profile row exists for this user (if profiles table & org exist)
  if (orgId && tableStatus.profiles === 'OK') {
    const { data: existingProfile } = await sb.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!existingProfile) {
      const { error: profErr } = await sb.from('profiles').insert({
        id: userId,
        organization_id: orgId,
        full_name: 'מנהל מערכת',
        role: 'admin',
        email,
        is_active: true,
      });
      if (profErr) result.log.push(`⚠ profile: ${profErr.message}`);
      else result.log.push('✓ נוצר פרופיל מנהל');
    } else {
      result.log.push('· פרופיל כבר קיים');
    }
  }

  result.success = true;
  result.login_with = { email, password: '(הסיסמה שהזנת)' };
  return Response.json(result);
}
