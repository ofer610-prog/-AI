import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Load profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('id', user.id)
    .single();

  if (!profile) {
    // First-time user — needs to create org & profile
    return <NeedsSetup user={user} />;
  }

  // Parallel data loading
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
    supabase.from('clients').select('*').order('name'),
    supabase.from('matters').select('*').order('created_at', { ascending: false }),
    supabase.from('income').select('*').order('date', { ascending: false }).limit(500),
    supabase.from('expense').select('*').order('date', { ascending: false }).limit(500),
    supabase.from('invoices').select('*').order('issue_date', { ascending: false }),
    supabase.from('timesheet').select('*').order('date', { ascending: false }).limit(500),
    supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
    supabase.from('alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(20),
    supabase.from('gmail_processed').select('*').eq('status', 'pending-review').order('processed_at', { ascending: false }).limit(50),
  ]);

  return (
    <DashboardClient
      profile={profile}
      organization={profile.organizations}
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

function NeedsSetup({ user }) {
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white border border-stone-200 rounded-xl p-8 max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">ברוך הבא!</h1>
        <p className="text-stone-600 mb-4">החשבון שלך נוצר. צריך להגדיר את המשרד.</p>
        <p className="text-xs text-stone-500 mb-4">
          הקובץ <code>SETUP.md</code> מסביר איך לבצע הגדרה ראשונית במסד הנתונים.
        </p>
        <p className="text-xs text-stone-400">המייל שלך: {user.email}</p>
      </div>
    </div>
  );
}
