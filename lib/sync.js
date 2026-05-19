import { createServiceClient } from '@/lib/supabase/server';
import {
  getGmailClient, searchRelevantEmails, getEmailDetails, getAttachmentData,
  classifyEmail, ensureProcessedLabel, markAsProcessed,
} from '@/lib/gmail';

// Run Gmail sync for a single organization
export async function runGmailSync(organizationId) {
  const supabase = createServiceClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();

  if (!org || !org.gmail_connected || !org.gmail_refresh_token) {
    return { error: 'Gmail not connected' };
  }

  const gmail = getGmailClient(org.gmail_refresh_token);

  // Search since last sync (or 7 days ago for first sync)
  const sinceDate = org.last_gmail_sync
    ? new Date(org.last_gmail_sync)
    : new Date(Date.now() - 7 * 86400000);

  const messages = await searchRelevantEmails(gmail, sinceDate);
  const labelId = await ensureProcessedLabel(gmail);

  let processed = 0;
  let imported = 0;
  let pendingReview = 0;

  for (const msg of messages.slice(0, 50)) { // Cap at 50 per run to keep within limits
    // Skip if already processed
    const { data: existing } = await supabase
      .from('gmail_processed')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('gmail_message_id', msg.id)
      .maybeSingle();

    if (existing) continue;

    try {
      const details = await getEmailDetails(gmail, msg.id);

      // If has image attachment, fetch first one for vision
      if (details.attachments.length > 0) {
        const firstImg = details.attachments.find(a => a.mimeType.startsWith('image/'));
        if (firstImg) {
          try {
            const data = await getAttachmentData(gmail, msg.id, firstImg.attachmentId);
            details.firstImageData = data;
            details.firstImageMimeType = firstImg.mimeType;
          } catch (e) {
            console.error('Attachment fetch failed:', e.message);
          }
        }
      }

      const result = await classifyEmail(details);

      const direction = result.direction; // income / expense / neutral
      const isAmount = result.amount && Number(result.amount) > 0;

      // High confidence + amount + clear direction => auto-import
      const autoImport = result.is_relevant && result.confidence === 'high' && isAmount && direction !== 'neutral';

      const status = autoImport ? 'imported' : (result.is_relevant ? 'pending-review' : 'ignored');

      let importedRef = {};
      if (autoImport) {
        const targetTable = direction === 'income' ? 'income' : 'expense';
        const { data: inserted } = await supabase.from(targetTable).insert({
          organization_id: organizationId,
          date: result.date || new Date().toISOString().slice(0, 10),
          description: result.description || details.subject,
          amount: parseFloat(result.amount),
          vat: parseFloat(result.amount) * (org.vat_rate / (100 + org.vat_rate)),
          source: 'gmail',
          source_ref: msg.id,
          notes: `מאת: ${result.from_party || details.from}`,
          needs_review: false,
        }).select().single();
        if (inserted) {
          if (direction === 'income') importedRef.related_income_id = inserted.id;
          else importedRef.related_expense_id = inserted.id;
          imported++;
        }
      } else if (result.is_relevant) {
        pendingReview++;
      }

      await supabase.from('gmail_processed').insert({
        organization_id: organizationId,
        gmail_message_id: msg.id,
        subject: details.subject,
        from_email: details.from,
        date: details.date ? new Date(details.date) : new Date(),
        classification: result.classification,
        extracted_amount: result.amount ? parseFloat(result.amount) : null,
        extracted_date: result.date || null,
        extracted_description: result.description,
        status,
        ai_confidence: result.confidence,
        ai_notes: result.reasoning,
        ...importedRef,
      });

      // Mark as processed in Gmail
      await markAsProcessed(gmail, msg.id, labelId);
      processed++;
    } catch (e) {
      console.error('Error processing message:', msg.id, e.message);
    }
  }

  // Update last sync time
  await supabase
    .from('organizations')
    .update({ last_gmail_sync: new Date().toISOString() })
    .eq('id', organizationId);

  return { processed, imported, pendingReview };
}

// Generate alerts based on data
export async function generateAlerts(organizationId) {
  const supabase = createServiceClient();
  const now = new Date();

  // Clear old alerts
  await supabase.from('alerts').delete().eq('organization_id', organizationId).lt('expires_at', now.toISOString());

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('organization_id', organizationId)
    .neq('status', 'paid');

  const overdue = (invoices || []).filter(i => new Date(i.due_date) < now);
  if (overdue.length > 0) {
    const total = overdue.reduce((a, b) => a + Number(b.amount || 0), 0);
    await supabase.from('alerts').insert({
      organization_id: organizationId,
      level: 'high',
      type: 'overdue-invoice',
      title: `${overdue.length} חשבוניות באיחור`,
      description: `סך ${Math.round(total).toLocaleString('he-IL')} ₪. שלח תזכורות.`,
      expires_at: new Date(Date.now() + 24 * 86400000).toISOString(),
    });
  }

  return { alertsGenerated: overdue.length > 0 ? 1 : 0 };
}
