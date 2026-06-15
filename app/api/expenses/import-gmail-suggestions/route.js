import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient, getEmailDetails, getAttachmentData } from '@/lib/gmail';
import { DEFAULT_EXPENSES_DRIVE_FOLDER_ID, safeDriveFileName, uploadBufferToDrive } from '@/lib/drive';

export const dynamic = 'force-dynamic';

async function recomputeCell(sb, orgId, section, item, year, month) {
  const { data } = await sb.from('expense_documents')
    .select('amount, payer')
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);

  const total = (data || [])
    .filter(row => (row.payer || 'office') === 'office')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  await sb.from('office_expenses').upsert({
    organization_id: orgId,
    section,
    item_name: item,
    year,
    month,
    amount: total,
    is_itemized: true,
  }, { onConflict: 'organization_id,section,item_name,year,month' });

  return total;
}

function monthParts(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return {
    docDate: safe.toISOString().slice(0, 10),
    year: safe.getFullYear(),
    month: safe.getMonth() + 1,
  };
}

function decodeGmailBase64(data) {
  return Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function pickBestAttachment(attachments = []) {
  const pdf = attachments.find(a => String(a.mimeType || '').includes('pdf') || String(a.filename || '').toLowerCase().endsWith('.pdf'));
  return pdf || attachments[0] || null;
}

async function tryUploadAttachmentToDrive({ org, gmailId, row, docDate, vendor, item, sb, orgId }) {
  if (!org?.gmail_refresh_token) return { url: null, fileName: null, note: 'אין refresh token' };

  const gmail = getGmailClient(org.gmail_refresh_token);
  const details = await getEmailDetails(gmail, gmailId);
  const attachment = pickBestAttachment(details.attachments || []);
  if (!attachment?.attachmentId) return { url: null, fileName: null, note: 'לא נמצא קובץ מצורף במייל' };

  const raw = await getAttachmentData(gmail, gmailId, attachment.attachmentId);
  const buffer = decodeGmailBase64(raw);
  const amount = Number(row.amount || 0) ? `${Number(row.amount || 0)} שח` : null;
  const cleanName = safeDriveFileName([
    docDate,
    vendor || item,
    row.description || row.subject || item,
    amount,
    row.payment_confirmation ? `אסמכתא ${row.payment_confirmation}` : null,
  ]) + (String(attachment.filename || '').toLowerCase().endsWith('.pdf') ? '.pdf' : ` - ${attachment.filename || 'invoice'}`);

  const driveFile = await uploadBufferToDrive({
    refreshToken: org.gmail_refresh_token,
    folderId: process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID,
    buffer,
    fileName: cleanName,
    mimeType: attachment.mimeType || 'application/pdf',
  });

  return { url: driveFile.webViewLink, fileName: driveFile.name, note: null };
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.suggestions) ? body.suggestions : [];
  if (!rows.length) return Response.json({ error: 'לא התקבלו קבלות לייבוא' }, { status: 400 });

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email')
    .eq('id', profile.organization_id).single();

  const imported = [];
  const skipped = [];
  const errors = [];
  const driveWarnings = [];

  for (const row of rows) {
    const gmailId = row.gmail_id || row.gmail_message_id;
    if (!gmailId) { skipped.push({ reason: 'missing_gmail_id' }); continue; }

    const { data: exists } = await sb.from('expense_documents')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('gmail_message_id', gmailId)
      .maybeSingle();
    if (exists?.id) { skipped.push({ gmail_id: gmailId, reason: 'duplicate' }); continue; }

    const section = row.section || 'office';
    const item = row.item || row.matched_vendor || 'חשבוניות מספקים';
    const { docDate, year, month } = monthParts(row.date || row.doc_date);
    const gmailLink = row.gmail_link || `https://mail.google.com/mail/#all/${gmailId}`;
    const vendor = row.matched_vendor || row.vendor || item;

    let fileUrl = gmailLink;
    let fileName = row.file_name || row.subject || `${gmailId}.gmail`;
    let driveNote = null;

    try {
      const driveResult = await tryUploadAttachmentToDrive({ org, gmailId, row, docDate, vendor, item, sb, orgId: profile.organization_id });
      if (driveResult.url) {
        fileUrl = driveResult.url;
        fileName = driveResult.fileName || fileName;
      } else if (driveResult.note) {
        driveNote = driveResult.note;
        driveWarnings.push({ gmail_id: gmailId, warning: driveResult.note });
      }
    } catch (e) {
      driveNote = `לא נשמר בדרייב: ${e.message}`;
      driveWarnings.push({ gmail_id: gmailId, warning: e.message });
    }

    const description = [
      row.description || row.subject || 'קבלה מגימייל',
      row.payment_confirmation ? `אסמכתא: ${row.payment_confirmation}` : null,
      row.subject ? `נושא: ${row.subject}` : null,
      row.from ? `שולח: ${row.from}` : null,
      driveNote,
      `קישור למייל: ${gmailLink}`,
    ].filter(Boolean).join('\n');

    const { data, error } = await sb.from('expense_documents').insert({
      organization_id: profile.organization_id,
      uploaded_by: profile.id,
      amount: Number(row.amount || 0),
      vendor,
      description,
      category: row.category || 'general',
      doc_date: docDate,
      month: docDate.slice(0, 7),
      status: 'linked',
      file_url: fileUrl,
      file_name: fileName,
      file_type: fileUrl === gmailLink ? 'gmail_receipt' : 'drive_receipt',
      expense_item: item,
      expense_section: section,
      expense_year: year,
      expense_month_num: month,
      gmail_message_id: gmailId,
      payer: 'office',
    }).select('id').single();

    if (error) { errors.push({ gmail_id: gmailId, error: error.message }); continue; }
    await recomputeCell(sb, profile.organization_id, section, item, year, month);
    imported.push({ id: data.id, gmail_id: gmailId, item, amount: Number(row.amount || 0), date: docDate, file_url: fileUrl, saved_to_drive: fileUrl !== gmailLink });
  }

  return Response.json({ imported, skipped, errors, driveWarnings, drive_folder_id: DEFAULT_EXPENSES_DRIVE_FOLDER_ID });
}
