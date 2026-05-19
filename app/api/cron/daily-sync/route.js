import { createServiceClient } from '@/lib/supabase/server';
import { runGmailSync, generateAlerts } from '@/lib/sync';
import { Resend } from 'resend';

// Vercel cron sends Authorization header with secret
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all orgs that connected Gmail
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, gmail_connected')
    .eq('gmail_connected', true);

  const results = [];
  for (const org of orgs || []) {
    try {
      const syncResult = await runGmailSync(org.id);
      const alertResult = await generateAlerts(org.id);

      // Send daily report email to admin
      await sendDailyReport(supabase, org.id, syncResult);

      results.push({ org: org.name, ...syncResult, ...alertResult });
    } catch (e) {
      console.error(`Sync failed for ${org.id}:`, e);
      results.push({ org: org.name, error: e.message });
    }
  }

  return Response.json({ ok: true, results });
}

async function sendDailyReport(supabase, organizationId, syncResult) {
  if (!process.env.RESEND_API_KEY) return; // skip if not configured

  const { data: admins } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('organization_id', organizationId)
    .eq('role', 'admin');

  if (!admins || admins.length === 0) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const adminEmails = admins.map(a => a.email);
  const today = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  await resend.emails.send({
    from: `ספרי משרד <${fromEmail}>`,
    to: adminEmails,
    subject: `דו"ח יומי — ${today}`,
    html: `
      <div dir="rtl" style="font-family: Heebo, Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
        <h1 style="color: #1c1917;">דו"ח יומי</h1>
        <p>בוקר טוב,</p>
        <p>סנכרון Gmail הסתיים:</p>
        <ul>
          <li>${syncResult.processed || 0} מיילים חדשים נסרקו</li>
          <li>${syncResult.imported || 0} פריטים יובאו אוטומטית</li>
          <li>${syncResult.pendingReview || 0} פריטים ממתינים לאישור ידני</li>
        </ul>
        <p>היכנס למערכת לסקור את הפריטים: <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">פתח דשבורד</a></p>
      </div>
    `,
  });
}
