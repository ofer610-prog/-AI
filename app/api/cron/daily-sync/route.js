import { createServiceClient } from '@/lib/supabase/server';
import { runGmailSync, generateAlerts } from '@/lib/sync';
import { runWhatsappScan } from '@/lib/whatsapp-scan';
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

      // Scan WhatsApp group for unmatched bank transfer confirmations
      const waResult = await runWhatsappScan().catch((e) => ({ error: e.message }));

      // Scan for unmatched bank credits and include in daily report
      const bankSummary = await getUnmatchedBankSummary(supabase, org.id);

      // Get pending WhatsApp alerts count for the report
      const { count: waAlertCount } = await supabase
        .from('whatsapp_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .eq('status', 'pending')
        .eq('has_invoice', false)
        .then((r) => r)
        .catch(() => ({ count: 0 }));

      // Send daily report email to admin
      await sendDailyReport(supabase, org.id, syncResult, bankSummary, waAlertCount || 0);

      results.push({ org: org.name, ...syncResult, ...alertResult, bankSummary, waResult });
    } catch (e) {
      console.error(`Sync failed for ${org.id}:`, e);
      results.push({ org: org.name, error: e.message });
    }
  }

  return Response.json({ ok: true, results });
}

async function getUnmatchedBankSummary(supabase, orgId) {
  try {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('id, amount, date, description')
      .eq('organization_id', orgId)
      .gt('amount', 0)
      .is('matched_invoice_id', null)
      .is('matched_income_id', null)
      .neq('alert_status', 'dismissed')
      .order('date', { ascending: false })
      .limit(50);

    if (error) return { count: 0, total: 0 };
    const list = data || [];
    return {
      count: list.length,
      total: list.reduce((s, r) => s + Number(r.amount), 0),
      items: list.slice(0, 5),
    };
  } catch {
    return { count: 0, total: 0 };
  }
}

async function sendDailyReport(supabase, organizationId, syncResult, bankSummary = {}, waAlertCount = 0) {
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
        ${bankSummary.count > 0 ? `
        <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:12px;margin-top:16px;">
          <strong style="color:#c2410c;">⚠️ ${bankSummary.count} הכנסות בנק ללא חשבונית</strong>
          <p style="color:#92400e;margin:4px 0 0;">סכום כולל: ₪${Math.round(bankSummary.total).toLocaleString('he-IL')}</p>
          <p style="color:#92400e;font-size:13px;">יש להוציא חשבוניות או לקשר את התנועות הקיימות.</p>
        </div>` : ''}
        ${waAlertCount > 0 ? `
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-top:16px;">
          <strong style="color:#15803d;">💬 ${waAlertCount} אישורי העברה ב-WhatsApp ללא חשבונית</strong>
          <p style="color:#166534;font-size:13px;">התקבלו אישורי תשלום מלקוחות בקבוצת WhatsApp שלא שויכו לחשבוניות.</p>
        </div>` : ''}
        <p>היכנס למערכת לסקור את הפריטים: <a href="${process.env.NEXT_PUBLIC_APP_URL}/finance">פתח כספים</a></p>
      </div>
    `,
  });
}
