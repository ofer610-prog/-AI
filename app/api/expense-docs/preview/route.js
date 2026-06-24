import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { getDriveClient } from '@/lib/drive';
import { getGmailClient, getEmailDetails, getAttachmentData } from '@/lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function decodeGmail(data) {
  return Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function driveFileId(url) {
  const s = String(url || '');
  let m = s.match(/\/file\/d\/([^/]+)/);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]id=([^&]+)/);
  return m?.[1] || null;
}

function mimeFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/pdf';
}

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderEmailReceipt(details, doc) {
  const body = esc(details.body || 'לא נמצא תוכן להצגה בגוף המייל').replace(/\n/g, '<br/>');
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(details.subject || doc.file_name || 'קבלה')}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; direction: rtl; }
  .wrap { max-width: 900px; margin: 24px auto; background: white; border: 1px solid #e2e8f0; border-radius: 18px; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  .meta { background: #f1f5f9; border-radius: 12px; padding: 12px; margin-bottom: 18px; line-height: 1.8; }
  .body { white-space: normal; line-height: 1.7; font-size: 15px; }
  .note { margin-top: 18px; background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; border-radius: 12px; padding: 12px; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${esc(details.subject || doc.file_name || 'קבלה מתוך מייל')}</h1>
    <div class="meta">
      <div><b>מאת:</b> ${esc(details.from)}</div>
      <div><b>תאריך:</b> ${esc(details.date)}</div>
      <div><b>מקור:</b> גוף המייל, ללא קובץ מצורף</div>
    </div>
    <div class="body">${body}</div>
    <div class="note">החשבונית/קבלה הזו לא הגיעה כ־PDF מצורף, ולכן מוצג תוכן המייל עצמו.</div>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
    },
  });
}

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'חסר מזהה חשבונית' }, { status: 400 });

  const sb = createServiceClient();
  const { data: doc, error: docError } = await sb.from('expense_documents')
    .select('id,file_url,file_name,gmail_message_id')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single();
  if (docError || !doc) return Response.json({ error: 'חשבונית לא נמצאה' }, { status: 404 });

  const { data: org, error: orgError } = await sb.from('organizations')
    .select('gmail_refresh_token')
    .eq('id', profile.organization_id)
    .single();
  if (orgError || !org?.gmail_refresh_token) return Response.json({ error: 'Google לא מחובר' }, { status: 400 });

  const fileId = driveFileId(doc.file_url);
  if (fileId) {
    const drive = getDriveClient(org.gmail_refresh_token);
    const meta = await drive.files.get({ fileId, fields: 'name,mimeType', supportsAllDrives: true });
    const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data);
    return new Response(buffer, {
      headers: {
        'Content-Type': meta.data.mimeType || mimeFromName(meta.data.name || doc.file_name),
        'Content-Disposition': `inline; filename="${encodeURIComponent(meta.data.name || doc.file_name || 'invoice.pdf')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  if (doc.gmail_message_id) {
    const gmail = getGmailClient(org.gmail_refresh_token);
    const details = await getEmailDetails(gmail, doc.gmail_message_id);
    const attachments = details.attachments || [];
    const att = attachments.find(a => String(a.filename || '').toLowerCase().endsWith('.pdf')) || attachments[0];
    if (!att?.attachmentId) return renderEmailReceipt(details, doc);
    const raw = await getAttachmentData(gmail, doc.gmail_message_id, att.attachmentId);
    const buffer = decodeGmail(raw);
    return new Response(buffer, {
      headers: {
        'Content-Type': att.mimeType || mimeFromName(att.filename),
        'Content-Disposition': `inline; filename="${encodeURIComponent(att.filename || doc.file_name || 'invoice.pdf')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  return Response.json({ error: 'אין קובץ להצגה' }, { status: 404 });
}
