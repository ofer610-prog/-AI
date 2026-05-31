import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Verify the authenticated user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // Use service client for data queries
  const serviceSupabase = createServiceClient();

  // Load the user's profile and organization
  const { data: profile } = await serviceSupabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('id', user.id)
    .single();

  // Fallback: if no profile yet, load first organization
  let org = profile?.organizations;
  if (!org) {
    const { data: firstOrg } = await serviceSupabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    org = firstOrg;
  }

  if (!org) {
    return <NoOrg />;
  }

  const orgId = org.id;

  const resolvedProfile = profile
    ? { ...profile, organizations: org }
    : {
        id: user.id,
        full_name: user.email,
        role: 'admin',
        organization_id: orgId,
        organizations: org,
        is_active: true,
      };

  const [
    { data: clients },
    { data: matters },
    { data: income },
    { data: expense },
    { data: invoices },
    { data: timesheet },
    { data: team },
    { data: alerts },
    { data: gmailPending },
  ] = await Promise.all([
    serviceSupabase.from('clients').select('*').eq('organization_id', orgId).order('name'),
    serviceSupabase.from('matters').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    serviceSupabase.from('income').select('*').eq('organization_id', orgId).order('date', { ascending: false }).limit(500),
    serviceSupabase.from('expense').select('*').eq('organization_id', orgId).order('date', { ascending: false }).limit(500),
    serviceSupabase.from('invoices').select('*').eq('organization_id', orgId).order('issue_date', { ascending: false }),
    serviceSupabase.from('timesheet').select('*').eq('organization_id', orgId).order('date', { ascending: false }).limit(500),
    serviceSupabase.from('profiles').select('*').eq('organization_id', orgId).eq('is_active', true).order('full_name'),
    serviceSupabase.from('alerts').select('*').eq('organization_id', orgId).eq('is_read', false).order('created_at', { ascending: false }).limit(20),
    serviceSupabase.from('gmail_processed').select('*').eq('organization_id', orgId).eq('status', 'pending-review').order('processed_at', { ascending: false }).limit(50),
  ]);

  return (
    <DashboardClient
      profile={resolvedProfile}
      organization={org}
      clients={clients || []}
      matters={matters || []}
      income={income || []}
      expense={expense || []}
      invoices={invoices || []}
      timesheet={timesheet || []}
      team={team || []}
      alerts={alerts || []}
      gmailPending={gmailPending || []}
    />
  );
}

function NoOrg() {
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white border border-sky-100 rounded-xl p-8 max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">לא נמצא משרד</h1>
        <p className="text-slate-600">יש ליצור רשומת ארגון ב-Supabase תחילה.</p>
      </div>
    </div>
  );
}
