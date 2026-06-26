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

  const currentYear = new Date().getFullYear();

  const [
    { data: clients },
    { data: matters },
    { data: rawInvoices },
    { data: officeExpenses },
    { data: timesheet },
    { data: team },
    { data: alerts },
    { data: gmailPending },
  ] = await Promise.all([
    serviceSupabase.from('clients').select('*').eq('organization_id', orgId).order('name'),
    serviceSupabase.from('matters').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    serviceSupabase.from('invoices').select('*').eq('organization_id', orgId).order('issue_date', { ascending: false }),
    serviceSupabase.from('office_expenses').select('*').eq('organization_id', orgId).eq('year', currentYear),
    serviceSupabase.from('timesheet').select('*').eq('organization_id', orgId).order('date', { ascending: false }).limit(500),
    serviceSupabase.from('profiles').select('*').eq('organization_id', orgId).eq('is_active', true).order('full_name'),
    serviceSupabase.from('alerts').select('*').eq('organization_id', orgId).eq('is_read', false).order('created_at', { ascending: false }).limit(20),
    serviceSupabase.from('gmail_processed').select('*').eq('organization_id', orgId).eq('status', 'pending-review').order('processed_at', { ascending: false }).limit(50),
  ]);

  const invoices = rawInvoices || [];
  const VAT_RATE = org.vat_rate || 0.18;

  // Map invoices → income shape expected by DashboardClient
  const income = invoices.map(inv => ({
    ...inv,
    id: inv.id,
    date: inv.issue_date,
    amount: Number(inv.amount || 0),
    vat: Number(inv.vat_amount || 0) || Number(inv.amount || 0) * VAT_RATE / (1 + VAT_RATE),
    description: inv.client_name || '',
    source: 'invoice',
    category: 'שכר טרחה',
  }));

  // Map office_expenses → expense shape expected by DashboardClient
  const expense = (officeExpenses || []).map(exp => ({
    ...exp,
    id: exp.id,
    date: `${exp.year}-${String(exp.month || 1).padStart(2, '0')}-01`,
    amount: Number(exp.amount || 0),
    vat: 0,
    description: exp.item_name || '',
    source: 'office_expense',
    category: exp.section || 'office',
  }));

  // Non-admin employees never receive accounting data — only the invoices
  // of clients on their own matters (needed for "my collection").
  const isAdminRole = ['admin', 'accountant'].includes(resolvedProfile.role);
  let safeIncome = income;
  let safeExpense = expense;
  let safeInvoices = invoices;
  if (!isAdminRole) {
    safeIncome = [];
    safeExpense = [];
    const myClientIds = new Set(
      (matters || [])
        .filter((m) => m.responsible_lawyer_id === resolvedProfile.id)
        .map((m) => m.client_id)
        .filter(Boolean)
    );
    safeInvoices = safeInvoices.filter((inv) => myClientIds.has(inv.client_id));
  }

  return (
    <DashboardClient
      profile={resolvedProfile}
      organization={org}
      clients={clients || []}
      matters={matters || []}
      income={safeIncome}
      expense={safeExpense}
      invoices={safeInvoices}
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
