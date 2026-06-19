import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient, getEmailDetails, getAttachmentData } from '@/lib/gmail';
import { extractDriveFileId, moveFileToTopicFolder, uploadToMonthFolder, safeDriveFileName } from '@/lib/drive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isGmailLink(url) {
  const s = String(url || '');
  return s.startsWith('gmail:') || s.includes('mail.google.com');
}

function decodeGmail(data) {
  return Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function gmailIdFromUrl(url) {
  const s = String(url || '');
  if (s.startsWith('gmail:')) return s.replace('gmail:', '');
  const m = s.match(/[#/]([0-9a-f]{16,})/);
  return m?.[1] || null;
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();

  // Fetch org credentials
  const { data: org } = await sb.from('organizations')
    .select('gmail_refresh_token, drive_expenses_folder_id')
    .eq('id', profile.organization_id).single();

  if (!org?.gmail_refresh_token) {
    return Response.json({ error: 'Google לא מחובר' }, { status: 400 });
  }

  const rootFolderId = org.drive_expenses_folder_id || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID;

  // Get ALL documents with file_url
  const { data: docs, error } = await sb.from('expense_documents')
    .select('id, file_url, file_name, expense_item, expense_section, expense_year, expense_month_num, status, vendor, amount, doc_date, gmail_message_id')
    .eq('organization_id', profile.organization_id)
    .not('file_url', 'is', null)
    .order('doc_date', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Detect duplicates (same gmail_message_id)
  const seenGmailIds = new Map();
  const duplicates = [];
  for (const doc of docs) {
    if (!doc.gmail_message_id) continue;
    if (seenGmailIds.has(doc.gmail_message_id)) {
      duplicates.push({ id: doc.id, gmail_id: doc.gmail_message_id, duplicate_of: seenGmailIds.get(doc.gmail_message_id) });
    } else {
      seenGmailIds.set(doc.gmail_message_id, doc.id);
    }
  }

  // Remove duplicates from processing
  const duplicateIds = new Set(duplicates.map(d => d.id));
  const toProcess = docs.filter(d => !duplicateIds.has(d.id));

  const gmail = getGmailClient(org.gmail_refresh_token);
  const moved = [];
  const uploaded = [];
  const skipped = [];
  const errors = [];

  for (const doc of toProcess) {
    const year  = doc.expense_year  || new Date(doc.doc_date || '').getFullYear() || new Date().getFullYear();
    const month = doc.expense_month_num || new Date(doc.doc_date || '').getMonth() + 1 || new Date().getMonth() + 1;
    const topic = doc.expense_item || 'לא מסווג';

    try {
      // Case 1: already a Drive file → move to correct topic folder
      const driveFileId = extractDriveFileId(doc.file_url);
      if (driveFileId) {
        await moveFileToTopicFolder({
          refreshToken: org.gmail_refresh_token,
          rootFolderId,
          fileId: driveFileId,
          year,
          month,
          topic,
        });
        moved.push({ id: doc.id, vendor: doc.vendor, topic });
        continue;
      }

      // Case 2: Gmail link → download attachment → upload to Drive
      if (isGmailLink(doc.file_url)) {
        const gmailId = doc.gmail_message_id || gmailIdFromUrl(doc.file_url);
        if (!gmailId) { skipped.push({ id: doc.id, reason: 'no_gmail_id' }); continue; }

        const details = await getEmailDetails(gmail, gmailId);
        const att = (details.attachments || []).find(
          a => String(a.mimeType || '').includes('pdf') || String(a.filename || '').toLowerCase().endsWith('.pdf')
        ) || details.attachments?.[0];

        if (!att?.attachmentId) { skipped.push({ id: doc.id, reason: 'no_attachment', gmail_id: gmailId }); continue; }

        const raw = await getAttachmentData(gmail, gmailId, att.attachmentId);
        const buffer = decodeGmail(raw);
        if (!buffer.length) { skipped.push({ id: doc.id, reason: 'empty_buffer' }); continue; }

        const amountStr = doc.amount ? `${doc.amount} שח` : null;
        const ext = String(att.filename || '').toLowerCase().endsWith('.pdf') ? '.pdf' : ` - ${att.filename || 'invoice'}`;
        const fileName = safeDriveFileName([doc.doc_date, doc.vendor || topic, amountStr]) + ext;

        const driveFile = await uploadToMonthFolder({
          refreshToken: org.gmail_refresh_token,
          rootFolderId,
          buffer,
          fileName,
          mimeType: att.mimeType || 'application/pdf',
          year,
          month,
          topic,
        });

        // Update DB: replace Gmail link with Drive link
        await sb.from('expense_documents').update({
          file_url: driveFile.webViewLink,
          file_name: driveFile.name,
          file_type: 'drive_receipt',
        }).eq('id', doc.id);

        uploaded.push({ id: doc.id, vendor: doc.vendor, topic, drive_url: driveFile.webViewLink, folder_url: driveFile.topicFolderUrl });
        continue;
      }

      skipped.push({ id: doc.id, reason: 'unknown_url_type', url: doc.file_url?.slice(0, 40) });
    } catch (e) {
      errors.push({ id: doc.id, vendor: doc.vendor, error: e.message?.slice(0, 100) });
    }
  }

  return Response.json({
    ok: true,
    total: docs.length,
    uploaded: uploaded.length,
    moved: moved.length,
    skipped: skipped.length,
    errors: errors.length,
    duplicates: duplicates.length,
    details: { uploaded, moved, skipped, errors, duplicates },
  });
}
