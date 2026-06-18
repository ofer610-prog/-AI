import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { getDriveClient } from '@/lib/drive';

export const dynamic = 'force-dynamic';

function extractDriveFileId(url) {
  const s = String(url || '');
  let m = s.match(/\/file\/d\/([^/]+)/);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]id=([^&]+)/);
  if (m?.[1]) return m[1];
  return null;
}

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'חסר מזהה חשבונית' }, { status: 400 });

  const sb = createServiceClient();
  const { data: doc, error: docError } = await sb.from('expense_documents')
    .select('id,file_url')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single();
  if (docError || !doc) return Response.json({ error: 'חשבונית לא נמצאה' }, { status: 404 });

  const fileId = extractDriveFileId(doc.file_url);
  if (!fileId) return Response.json({ error: 'הקובץ אינו קובץ Google Drive ולכן אין תיקיית Drive להצגה' }, { status: 400 });

  const { data: org, error: orgError } = await sb.from('organizations')
    .select('gmail_refresh_token')
    .eq('id', profile.organization_id)
    .single();
  if (orgError || !org?.gmail_refresh_token) return Response.json({ error: 'Google לא מחובר' }, { status: 400 });

  const drive = getDriveClient(org.gmail_refresh_token);
  const file = await drive.files.get({ fileId, fields: 'id,name,parents', supportsAllDrives: true });
  const parentId = file.data.parents?.[0];
  if (!parentId) return Response.json({ error: 'לא נמצאה תיקיית אב לקובץ' }, { status: 404 });

  const folder = await drive.files.get({ fileId: parentId, fields: 'id,name,webViewLink', supportsAllDrives: true });
  return Response.json({ ok: true, file_id: fileId, folder_id: folder.data.id, folder_name: folder.data.name, folder_url: folder.data.webViewLink });
}
