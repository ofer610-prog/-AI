import { createServiceClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Demo mode — auth bypassed. Uses service client to load first organization.
  const supabase = createServiceClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) {
    return <NoOrg />;
  }

  const fakeProfile = {
    id: 'demo-user',
    full_name: 'משתמש הדגמה',
    role: 'admin',
    organization_id: org.id,
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
    supabase.from('clients').select('*').eq('organization_id', org.id).order('name'),
    supabase.from('matters').select('*').eq('organization_id', org.id).order('created_at', { ascending: false }),
    supabase.from('income').select('*').eq('organization_id', org.id).order('date', { ascending: false }).limit(500),
    supabase.from('expense').select('*').eq('organization_id', org.id).order('date', { ascending: false }).limit(500),
    supabase.from('invoices').select('*').eq('organization_id', org.id).order('issue_date', { ascending: false }),
    supabase.from('timesheet').select('*').eq('organization_id', org.id).order('date', { ascending: false }).limit(500),
    supabase.from('profiles').select('*').eq('organization_id', org.id).eq('is_active', true).order('full_name'),
    supabase.from('alerts').select('*').eq('organization_id', org.id).eq('is_read', false).order('created_at', { ascending: false }).limit(20),
    supabase.from('gmail_processed').select('*').eq('organization_id', org.id).eq('status', 'pending-review').order('processed_at', { ascending: false }).limit(50),
  ]);

  return (
    <DashboardClient
      profile={fakeProfile}
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
