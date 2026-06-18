import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { getGmailClient, classifyEmail } from '@/lib/gmail';
import { safeDriveFileName, uploadToMonthFolder } from '@/lib/drive';
import { getEmailDetails, getAttachmentData } from '@/lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/scan-gmail — called by Vercel cron
export async function GET(request) {
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runGmailScanAllOrgs();
}

// POST /api/cron/scan-gmail — manual trigger by admin (no user session needed)
export async function POST(request) {
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runGmailScanAllOrgs();
}

async function runGmailScanAllOrgs() {
  const sb = createServiceClient();

  // Find all orgs with active Gmail connection
  const { data: orgs, error } = await sb.from('organizations')
    .select('id, gmail_refresh_token, gmail_email, office_card_last4, drive_expenses_folder_id')
    .eq('gmail_connected', true)
    .not('gmail_refresh_token', 'is', null);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!orgs?.length) return Response.json({ ok: true, message: 'אין ארגונים מחוברים לגימייל', orgs: 0 });

  const results = [];
  for (const org of orgs) {
    try {
      const result = await scanOrgGmail(sb, org);
      results.push({ org_id: org.id, email: org.gmail_email, ...result });
    } catch (e) {
      console.error('CRON_GMAIL org_error', org.id, e.message);
      results.push({ org_id: org.id, email: org.gmail_email, error: e.message });
    }
  }

  console.log('CRON_GMAIL done', JSON.stringify(results));
  return Response.json({ ok: true, orgs: orgs.length, results });
}

async function scanOrgGmail(sb, org) {
  const gmail = getGmailClient(org.gmail_refresh_token);
  const officeCards = org.office_card_last4 || [];

  // Get known expense items for vendor matching
  const { data: items } = await sb.from('office_expenses')
    .select('item_name').eq('organization_id', org.id);
  const vendors = [...new Set((items || []).map(i => i.item_name.trim()))];

  // Search last 3 days (cron runs multiple times/day so no need for 60 days)
  const since = new Date(Date.now() - 3 * 86400000);
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const hebrewTerms = 'חשבונית OR חשבון OR קבלה OR תשלום OR חיוב OR ספק';
  const engTerms = 'invoice OR receipt OR billing OR payment';
  const query = `after:${sinceUnix} (${hebrewTerms} OR ${engTerms} OR has:attachment filename:(pdf OR jpg))`;

  const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 30 });
  const messages = res.data.messages || [];

  // Skip already imported
  const { data: existing } = await sb.from('expense_documents')
    .select('gmail_message_id')
    .eq('organization_id', org.id)
    .not('gmail_message_id', 'is', null);
  const importedIds = new Set((existing || []).map(d => d.gmail_message_id));

  const decodePart = (data) => Buffer.from((data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  const getFullText = (payload) => {
    let text = '';
    const walk = (p) => {
      if (!p) return;
      if ((p.mimeType === 'text/html' || p.mimeType === 'text/plain') && p.body?.data) text += decodePart(p.body.data) + ' ';
      (p.parts || []).forEach(walk);
    };
    walk(payload);
    return text;
  };

  let imported = 0, needsReview = 0, skipped = 0;

  for (const msg of messages.slice(0, 15)) {
    if (importedIds.has(msg.id)) { skipped++; continue; }

    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const date    = headers.find(h => h.name === 'Date')?.value || '';
      const fromLow = from.toLowerCase();

      let docDate = null;
      try { docDate = new Date(date).toISOString().slice(0, 10); } catch {}

      const isGovPayment = fromLow.includes('egovpayments') || fromLow.includes('ecom.gov.il')
        || subject.includes('שירותי הפנייה') || subject.includes('אישור תשלום');

      let suggestion;

      if (isGovPayment) {
        const body = getFullText(detail.data.payload);
        let amount = null, cardLast4 = null, description = '';
        const amtM = body.match(/סה[""]?כ\s*שולם[:\s<\/bu>]*([\d,]+\.?\d*)/i) || body.match(/מחיר[:\s<\/b>]*([\d,]+\.?\d*)\s*₪/);
        if (amtM) amount = parseFloat(amtM[1].replace(/,/g, ''));
        const cardM = body.match(/4 ספרות אחרונות[^:]*:\s*<\/b>\s*(\d{4})/) || body.match(/(\d{4})(?=[^\d]{0,40}אישור מחברת האשראי)/);
        if (cardM) cardLast4 = cardM[1];
        const descM = body.match(/תיאור התשלום[:\s<\/b>]*([^<\n]{1,40})/);
        description = descM ? descM[1].trim() : 'תשלום ממשלתי';
        const isOffice = cardLast4 ? officeCards.includes(cardLast4) : true;
        if (!isOffice) { skipped++; continue; }
        suggestion = { gmail_id: msg.id, subject, from, date: docDate, amount, matched_vendor: 'אגרות טאבו', description, payer: 'office', needs_review: false };
      } else {
        const body = getFullText(detail.data.payload).slice(0, 10000);
        let aiResult = null;
        try { aiResult = await classifyEmail({ id: msg.id, subject, from, date, body }); } catch {}
        if (aiResult && !aiResult.is_relevant) { skipped++; continue; }

        const isNeedsReview = !aiResult || aiResult.confidence === 'low' || aiResult.classification === 'other';
        const subjectLow = subject.toLowerCase();
        const matchedVendor = vendors.find(v => subjectLow.includes(v.toLowerCase()) || fromLow.includes(v.toLowerCase()))
          || (aiResult?.from_party && aiResult.from_party !== 'לא ידוע' ? aiResult.from_party : null);

        suggestion = {
          gmail_id: msg.id, subject, from,
          date: docDate || aiResult?.date || null,
          amount: aiResult?.amount || null,
          matched_vendor: matchedVendor,
          description: aiResult?.description || subject,
          payer: 'office',
          needs_review: isNeedsReview,
        };
      }

      // Save to DB
      await saveSuggestion(sb, org, suggestion);
      suggestion.needs_review ? needsReview++ : imported++;
    } catch (e) {
      console.warn('CRON_GMAIL msg_error', msg.id, e.message?.slice(0, 60));
    }
  }

  return { scanned: messages.length, imported, needs_review: needsReview, skipped };
}

async function saveSuggestion(sb, org, row) {
  const gmailId = row.gmail_id;
  const gmailLink = `https://mail.google.com/mail/#all/${gmailId}`;
  const isNeedsReview = !!row.needs_review;

  const item = row.matched_vendor || 'חשבוניות מספקים';
  const section = 'office';
  const d = row.date ? new Date(row.date) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const docDate = safe.toISOString().slice(0, 10);
  const year = safe.getFullYear();
  const month = safe.getMonth() + 1;

  // Try Drive upload if there's an attachment
  let fileUrl = gmailLink;
  let fileName = row.subject || gmailId;
  try {
    const gmail = getGmailClient(org.gmail_refresh_token);
    const details = await getEmailDetails(gmail, gmailId);
    const att = (details.attachments || []).find(a =>
      String(a.mimeType || '').includes('pdf') || String(a.filename || '').toLowerCase().endsWith('.pdf')
    ) || details.attachments?.[0];
    if (att?.attachmentId) {
      const raw = await getAttachmentData(gmail, gmailId, att.attachmentId);
      const buffer = Buffer.from(String(raw || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      if (buffer.length) {
        const cleanName = safeDriveFileName([docDate, row.matched_vendor || row.description, row.amount ? `${row.amount} שח` : null])
          + (String(att.filename || '').toLowerCase().endsWith('.pdf') ? '.pdf' : ` - ${att.filename || 'invoice'}`);
        const d = docDate ? new Date(docDate) : new Date();
        const driveFile = await uploadToMonthFolder({
          refreshToken: org.gmail_refresh_token,
          rootFolderId: org.drive_expenses_folder_id || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID,
          buffer, fileName: cleanName, mimeType: att.mimeType || 'application/pdf',
          year: d.getFullYear(), month: d.getMonth() + 1,
        });
        fileUrl = driveFile.webViewLink || gmailLink;
        fileName = driveFile.name || fileName;
      }
    }
  } catch {}

  const description = [
    row.description || row.subject || 'קבלה מגימייל',
    row.from ? `שולח: ${row.from}` : null,
    `קישור למייל: ${gmailLink}`,
  ].filter(Boolean).join('\n');

  const { error } = await sb.from('expense_documents').insert({
    organization_id: org.id,
    amount: Number(row.amount || 0),
    vendor: row.matched_vendor || null,
    description,
    category: 'general',
    doc_date: docDate,
    month: docDate.slice(0, 7),
    status: isNeedsReview ? 'needs_review' : 'linked',
    file_url: fileUrl,
    file_name: fileName,
    file_type: fileUrl === gmailLink ? 'gmail_receipt' : 'drive_receipt',
    expense_item: isNeedsReview ? null : item,
    expense_section: isNeedsReview ? null : section,
    expense_year: year,
    expense_month_num: month,
    gmail_message_id: gmailId,
    payer: row.payer || 'office',
  });

  if (!error && !isNeedsReview) {
    // Recompute cell total
    const { data: allDocs } = await sb.from('expense_documents')
      .select('amount, payer')
      .eq('organization_id', org.id)
      .eq('expense_section', section)
      .eq('expense_item', item)
      .eq('expense_year', year)
      .eq('expense_month_num', month);
    const total = (allDocs || []).filter(r => (r.payer || 'office') === 'office').reduce((s, r) => s + Number(r.amount || 0), 0);
    await sb.from('office_expenses').upsert({
      organization_id: org.id, section, item_name: item, year, month, amount: total, is_itemized: true,
    }, { onConflict: 'organization_id,section,item_name,year,month' });
  }
}
