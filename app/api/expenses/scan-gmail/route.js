import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient, classifyEmail, getEmailDetails, getAttachmentData } from '@/lib/gmail';
import { uploadToMonthFolder, safeDriveFileName } from '@/lib/drive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const decodePart = (data) =>
  Buffer.from((data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');

function getEmailBody(payload) {
  let text = '';
  const walk = (p) => {
    if (!p) return;
    if ((p.mimeType === 'text/html' || p.mimeType === 'text/plain') && p.body?.data)
      text += decodePart(p.body.data) + ' ';
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return text;
}

function parseGovPayment(body) {
  let amount = null, cardLast4 = null, description = 'תשלום ממשלתי';
  const amtM = body.match(/סה[""]?כ\s*שולם[:\s<\/bu>]*([\d,]+\.?\d*)/i)
    || body.match(/מחיר[:\s<\/b>]*([\d,]+\.?\d*)\s*₪/);
  if (amtM) amount = parseFloat(amtM[1].replace(/,/g, ''));
  const cardM = body.match(/4 ספרות אחרונות[^:]*:\s*<\/b>\s*(\d{4})/)
    || body.match(/(\d{4})(?=[^\d]{0,40}אישור מחברת האשראי)/);
  if (cardM) cardLast4 = cardM[1];
  const descM = body.match(/תיאור התשלום[:\s<\/b>]*([^<\n]{1,40})/);
  if (descM) description = descM[1].trim();
  return { amount, cardLast4, description };
}

async function tryUploadToDrive({ gmail, gmailId, refreshToken, org, docDate, vendor, description, amount, topic }) {
  try {
    const details = await getEmailDetails(gmail, gmailId);
    const att = (details.attachments || []).find(
      a => String(a.mimeType || '').includes('pdf') || String(a.filename || '').toLowerCase().endsWith('.pdf')
    ) || details.attachments?.[0];
    if (!att?.attachmentId) return null;

    const raw = await getAttachmentData(gmail, gmailId, att.attachmentId);
    const buffer = Buffer.from(String(raw || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (!buffer.length) return null;

    const d = docDate ? new Date(docDate) : new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const amountStr = amount ? `${amount} שח` : null;
    const ext = String(att.filename || '').toLowerCase().endsWith('.pdf') ? '.pdf' : ` - ${att.filename || 'invoice'}`;
    const fileName = safeDriveFileName([docDate, vendor || description, amountStr]) + ext;

    return await uploadToMonthFolder({
      refreshToken,
      rootFolderId: org.drive_expenses_folder_id || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID,
      buffer,
      fileName,
      mimeType: att.mimeType || 'application/pdf',
      year,
      month,
      topic: topic || null,
    });
  } catch {
    return null;
  }
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email, office_card_last4, drive_expenses_folder_id')
    .eq('id', profile.organization_id).single();

  if (!org?.gmail_connected || !org?.gmail_refresh_token) {
    return Response.json({
      error: 'Gmail לא מחובר',
      connected: false,
      connect_url: '/api/auth/google/connect?return_to=/expenses/receipts',
    }, { status: 400 });
  }

  const officeCards = org.office_card_last4 || [];
  const gmail = getGmailClient(org.gmail_refresh_token);

  const { data: items } = await sb.from('office_expenses')
    .select('item_name').eq('organization_id', profile.organization_id);
  const vendors = [...new Set((items || []).map(i => i.item_name.trim()))];

  const since = new Date(Date.now() - 90 * 86400000);
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const query = `after:${sinceUnix} (חשבונית OR חשבון OR קבלה OR תשלום OR חיוב OR ספק OR אגרה OR invoice OR receipt OR billing OR payment OR has:attachment filename:(pdf OR jpg))`;

  let messages = [];
  try {
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 100 });
    messages = res.data.messages || [];
  } catch (e) {
    return Response.json({ error: `שגיאת Gmail: ${e.message}` }, { status: 500 });
  }

  const { data: existing } = await sb.from('expense_documents')
    .select('gmail_message_id')
    .eq('organization_id', profile.organization_id)
    .not('gmail_message_id', 'is', null);
  const importedIds = new Set((existing || []).map(d => d.gmail_message_id));

  const suggestions = [];
  let skippedDuplicate = 0, skippedIrrelevant = 0, skippedPersonal = 0;

  for (const msg of messages.slice(0, 50)) {
    if (importedIds.has(msg.id)) { skippedDuplicate++; continue; }

    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const date    = headers.find(h => h.name === 'Date')?.value || '';
      const fromLow = from.toLowerCase();

      let docDate = null;
      try { docDate = new Date(date).toISOString().slice(0, 10); } catch {}

      const gmailLink = `https://mail.google.com/mail/#all/${msg.id}`;
      // Known senders → direct vendor mapping (no AI needed)
      const KNOWN_SENDERS = [
        { match: 'egovpayments', vendor: 'אגרות טאבו', isGov: true },
        { match: 'ecom.gov.il', vendor: 'אגרות טאבו', isGov: true },
        { match: 'mekarkein@justice.gov.il', vendor: 'אגרות טאבו', isGov: true },
        { match: 'onecity.co.il', vendor: 'ועדה לתכנון ובניה', isGov: false },
        { match: 'milgam.co.il', vendor: 'עיריית מעלות תרשיחא', isGov: false },
        { match: 'maltar.co.il', vendor: 'ועדה לתכנון ובניה', isGov: false },
        { match: 'mail.anthropic.com', vendor: 'Anthropic', isGov: false },
        { match: 'googleplay-noreply', vendor: 'Google', isGov: false },
      ];
      const knownSender = KNOWN_SENDERS.find(s => fromLow.includes(s.match));

      const isGov = knownSender?.isGov
        || fromLow.includes('egovpayments') || fromLow.includes('ecom.gov.il')
        || subject.includes('שירותי הפנייה') || subject.includes('אישור תשלום');

      if (isGov) {
        const body = getEmailBody(detail.data.payload);
        const { amount, cardLast4, description } = parseGovPayment(body);
        if (cardLast4 && !officeCards.includes(cardLast4)) { skippedPersonal++; continue; }

        const driveFile = await tryUploadToDrive({
          gmail, gmailId: msg.id, refreshToken: org.gmail_refresh_token, org,
          docDate, vendor: 'אגרות טאבו', description, amount,
          topic: 'אגרות טאבו',
        });

        suggestions.push({
          gmail_id: msg.id, subject, from, date: docDate,
          amount, matched_vendor: 'אגרות טאבו', description,
          card_last4: cardLast4, payer: 'office',
          is_gov_payment: true, needs_review: false,
          gmail_link: gmailLink,
          file_url: driveFile?.webViewLink || gmailLink,
          file_name: driveFile?.name,
          drive_folder_url: driveFile?.monthFolderUrl,
          saved_to_drive: !!driveFile,
        });
        continue;
      }

      const body = getEmailBody(detail.data.payload).slice(0, 10000);
      let ai = null;
      if (!knownSender) {
        try { ai = await classifyEmail({ id: msg.id, subject, from, date, body }); } catch {}
        if (ai && !ai.is_relevant) { skippedIrrelevant++; continue; }
      }

      const needsReview = !knownSender && (!ai || ai.confidence === 'low' || ai.classification === 'other');
      const subjectLow = subject.toLowerCase();
      const matchedVendor = knownSender?.vendor
        || vendors.find(v => subjectLow.includes(v.toLowerCase()) || fromLow.includes(v.toLowerCase()))
        || (ai?.from_party && ai.from_party !== 'לא ידוע' ? ai.from_party : null);

      const finalDate = docDate || ai?.date || null;
      const amount = ai?.amount || null;

      // Upload to Drive: classified → topic folder, unclassified → "לא מסווג"
      const driveFile = await tryUploadToDrive({
        gmail, gmailId: msg.id, refreshToken: org.gmail_refresh_token, org,
        docDate: finalDate, vendor: matchedVendor, description: ai?.description, amount,
        topic: needsReview ? 'לא מסווג' : (matchedVendor || null),
      });

      suggestions.push({
        gmail_id: msg.id, subject, from,
        date: finalDate, amount, matched_vendor: matchedVendor,
        description: ai?.description || subject,
        card_last4: null, payer: 'office',
        is_gov_payment: false, needs_review: needsReview,
        gmail_link: gmailLink,
        file_url: driveFile?.webViewLink || gmailLink,
        file_name: driveFile?.name,
        drive_folder_url: driveFile?.monthFolderUrl,
        saved_to_drive: !!driveFile,
        ai_classification: ai?.classification,
        ai_confidence: ai?.confidence,
      });
    } catch (e) {
      console.warn('SCAN_GMAIL email_error', msg.id, e.message?.slice(0, 80));
    }
  }

  return Response.json({
    suggestions,
    scanned: messages.length,
    skipped_duplicate: skippedDuplicate,
    skipped_irrelevant: skippedIrrelevant,
    skipped_personal: skippedPersonal,
    connected: true,
  });
}
