import { getGmailClient, getEmailDetails, getAttachmentData } from '@/lib/gmail';
import { DEFAULT_EXPENSES_DRIVE_FOLDER_ID, safeDriveFileName, uploadBufferToDrive } from '@/lib/drive';
import { getOrCreateExpenseDateTopicFolder } from '@/lib/driveFolders';

function decodeGmailBase64(data) {
  return Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pickBestAttachment(attachments = []) {
  const pdf = attachments.find(a => String(a.mimeType || '').includes('pdf') || String(a.filename || '').toLowerCase().endsWith('.pdf'));
  const image = attachments.find(a => String(a.mimeType || '').startsWith('image/'));
  return pdf || image || attachments[0] || null;
}

function htmlReceipt(details, row = {}) {
  const subject = details.subject || row.subject || 'קבלה מתוך מייל';
  const body = esc(details.body || details.snippet || row.description || '').replace(/\n/g, '<br/>');
  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"/><title>${esc(subject)}</title>
<style>
body{font-family:Arial,sans-serif;direction:rtl;background:#f8fafc;color:#0f172a;margin:0;padding:24px}
.wrap{max-width:900px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:18px;padding:24px}
h1{font-size:22px;margin:0 0 16px}.meta{background:#f1f5f9;border-radius:12px;padding:12px;line-height:1.8;margin-bottom:18px}.body{line-height:1.7}.note{margin-top:18px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:12px;padding:12px}
</style></head><body><div class="wrap"><h1>${esc(subject)}</h1><div class="meta"><div><b>מאת:</b> ${esc(details.from)}</div><div><b>תאריך:</b> ${esc(details.date)}</div><div><b>מקור:</b> גוף המייל</div></div><div class="body">${body || 'לא נמצא תוכן להצגה בגוף המייל'}</div><div class="note">הקבלה נשמרה כקובץ HTML משום שלא נמצא קובץ PDF/תמונה מצורף במייל.</div></div></body></html>`;
}

export async function saveGmailReceiptToDrive({ org, gmailId, row = {}, docDate, year, month, topic, vendor }) {
  if (!org?.gmail_refresh_token) return { url: null, fileName: null, note: 'אין refresh token' };
  if (!gmailId) return { url: null, fileName: null, note: 'אין מזהה מייל' };

  const gmail = getGmailClient(org.gmail_refresh_token);
  const details = await getEmailDetails(gmail, gmailId);
  const folderPath = await getOrCreateExpenseDateTopicFolder({
    refreshToken: org.gmail_refresh_token,
    rootFolderId: org.drive_expenses_folder_id || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID,
    year,
    month,
    topic: topic || row.expense_item || row.matched_vendor || 'ממתין לסיווג',
  });

  const attachment = pickBestAttachment(details.attachments || []);
  const amount = Number(row.amount || 0) ? `${Number(row.amount || 0)} שח` : null;
  const baseName = safeDriveFileName([
    docDate,
    vendor || row.vendor || topic,
    row.description || row.subject || details.subject || topic,
    row.card_last4 ? `כרטיס ${row.card_last4}` : null,
    amount,
  ]);

  let buffer;
  let fileName;
  let mimeType;
  let source = 'gmail_body';

  if (attachment?.attachmentId) {
    const raw = await getAttachmentData(gmail, gmailId, attachment.attachmentId);
    buffer = decodeGmailBase64(raw);
    const lower = String(attachment.filename || '').toLowerCase();
    const ext = lower.endsWith('.pdf') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? '' : ` - ${attachment.filename || 'invoice'}`;
    fileName = `${baseName || 'invoice'}${ext || (lower.endsWith('.pdf') ? '.pdf' : lower.endsWith('.png') ? '.png' : lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? '.jpg' : '')}`;
    if (!/\.(pdf|png|jpe?g)$/i.test(fileName)) fileName += '.pdf';
    mimeType = attachment.mimeType || 'application/pdf';
    source = 'gmail_attachment';
  } else {
    buffer = Buffer.from(htmlReceipt(details, row), 'utf-8');
    fileName = `${baseName || 'gmail-receipt'}.html`;
    mimeType = 'text/html';
  }

  const driveFile = await uploadBufferToDrive({
    refreshToken: org.gmail_refresh_token,
    folderId: folderPath.folder.id,
    buffer,
    fileName,
    mimeType,
  });

  return {
    url: driveFile.webViewLink,
    fileName: driveFile.name,
    mimeType,
    source,
    folderId: folderPath.folder.id,
    folderName: folderPath.folder.name,
    folderUrl: folderPath.folder.webViewLink,
    note: null,
  };
}
