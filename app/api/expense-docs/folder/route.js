import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { getDriveClient, getOrCreateFolder, extractDriveFileId } from '@/lib/drive';

export const dynamic = 'force-dynamic';

const HEBREW_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

async function getOrgAndDrive(sb, orgId) {
  const { data: org } = await sb.from('organizations')
    .select('gmail_refresh_token, drive_expenses_folder_id')
    .eq('id', orgId).single();
  if (!org?.gmail_refresh_token) throw new Error('Google לא מחובר');
  const drive = getDriveClient(org.gmail_refresh_token);
  const root = org.drive_expenses_folder_id || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID;
  return { org, drive, root };
}

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const docId  = searchParams.get('id');
  const year   = searchParams.get('year');
  const month  = searchParams.get('month');
  const topic  = searchParams.get('topic');

  const sb = createServiceClient();

  // Mode 1: open folder by topic/month (no doc id needed)
  if ((year || month || topic) && !docId) {
    try {
      const { drive, root } = await getOrgAndDrive(sb, profile.organization_id);

      let targetId = root;
      let label = 'תיקיית הוצאות';

      if (year) {
        targetId = await getOrCreateFolder(drive, targetId, String(year));
        label = String(year);
      }
      if (year && month) {
        const m = Number(month);
        const monthPad = String(m).padStart(2, '0');
        const monthLabel = `${monthPad} ${HEBREW_MONTHS[m - 1]}`;
        targetId = await getOrCreateFolder(drive, targetId, monthLabel);
        label = `${HEBREW_MONTHS[m - 1]} ${year}`;
      }
      if (topic) {
        targetId = await getOrCreateFolder(drive, targetId, topic);
        label = topic;
      }

      const folderUrl = `https://drive.google.com/drive/folders/${targetId}`;
      return Response.json({ ok: true, folder_id: targetId, folder_name: label, folder_url: folderUrl });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  // Mode 2: open parent folder of a specific document
  if (!docId) return Response.json({ error: 'חסר מזהה חשבונית' }, { status: 400 });

  const { data: doc, error: docError } = await sb.from('expense_documents')
    .select('id,file_url,expense_item,expense_year,expense_month_num')
    .eq('id', docId)
    .eq('organization_id', profile.organization_id)
    .single();
  if (docError || !doc) return Response.json({ error: 'חשבונית לא נמצאה' }, { status: 404 });

  const fileId = extractDriveFileId(doc.file_url);
  if (!fileId) return Response.json({ error: 'הקובץ אינו קובץ Google Drive' }, { status: 400 });

  try {
    const { drive } = await getOrgAndDrive(sb, profile.organization_id);
    const file = await drive.files.get({ fileId, fields: 'id,name,parents', supportsAllDrives: true });
    const parentId = file.data.parents?.[0];
    if (!parentId) return Response.json({ error: 'לא נמצאה תיקיית אב' }, { status: 404 });

    const folder = await drive.files.get({ fileId: parentId, fields: 'id,name,webViewLink', supportsAllDrives: true });
    return Response.json({
      ok: true,
      file_id: fileId,
      folder_id: folder.data.id,
      folder_name: folder.data.name,
      folder_url: folder.data.webViewLink,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
