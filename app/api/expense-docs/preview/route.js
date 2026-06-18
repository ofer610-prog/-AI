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

  const { data: org } = await sb.from('organizations')
    .select('gmail_refresh_token')
    .eq('id', profile.organization_id)
    .single();
  if (!org?.gmail_refresh_token) return Response.json({ error: 'Google לא מחובר' }, { status: 400 });

  const fileId = driveFileId(doc.file_url);
  if (fileId) {
    const drive = getDriveClient(org.gmail_refresh_token);
    const meta = await drive.files.get({ fileId, fields: 'name,mimeType', supportsAllDrives: true });
    const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data);
    const mimeType = meta.data.mimeType || mimeFromName(meta.data.name || doc.file_name);
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  if (doc.gmail_message_id) {
    const gmail = getGmailClient(org.gmail_refresh_token);
    const details = await getEmailDetails(gmail, doc.gmail_message_id);
    const attachments = details.attachments || [];
    const att = attachments.find(a => String(a.filename || '').toLowerCase().endsWith('.pdf')) || attachments[0];
    if (!att?.attachmentId) return Response.json({ error: 'לא נמצא קובץ מצורף במייל' }, { status: 404 });
    const raw = await getAttachmentData(gmail, doc.gmail_message_id, att.attachmentId);
    const buffer = decodeGmail(raw);
    const mimeType = att.mimeType || mimeFromName(att.filename);
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  return Response.json({ error: 'אין קובץ להצגה' }, { status: 404 });
}
