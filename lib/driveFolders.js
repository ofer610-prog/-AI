import { getDriveClient, DEFAULT_EXPENSES_DRIVE_FOLDER_ID, safeDriveFileName } from '@/lib/drive';

const HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function cleanFolderName(value, fallback = 'כללי') {
  const name = safeDriveFileName([value || fallback]) || fallback;
  return name.split("'").join('').trim() || fallback;
}

async function getOrCreateChildFolder(drive, parentId, name) {
  const folderName = cleanFolderName(name);
  const q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='" + folderName + "' and '" + parentId + "' in parents";
  const found = await drive.files.list({
    q,
    fields: 'files(id,name,webViewLink)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (found.data.files && found.data.files.length) return found.data.files[0];
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });
  return created.data;
}

export async function getOrCreateExpenseTopicFolder({ refreshToken, rootFolderId, topic }) {
  if (!refreshToken) throw new Error('Missing Google refresh token');
  const drive = getDriveClient(refreshToken);
  const parent = rootFolderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;
  return getOrCreateChildFolder(drive, parent, topic || 'כללי');
}

export async function getOrCreateExpenseDateTopicFolder({ refreshToken, rootFolderId, year, month, topic }) {
  if (!refreshToken) throw new Error('Missing Google refresh token');
  const drive = getDriveClient(refreshToken);
  const root = rootFolderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;
  const y = String(year || new Date().getFullYear());
  const mNum = Number(month || (new Date().getMonth() + 1));
  const monthName = `${String(mNum).padStart(2, '0')} - ${HEB_MONTHS[mNum - 1] || 'חודש'}`;
  const yearFolder = await getOrCreateChildFolder(drive, root, y);
  const monthFolder = await getOrCreateChildFolder(drive, yearFolder.id, monthName);
  const topicFolder = await getOrCreateChildFolder(drive, monthFolder.id, topic || 'כללי');
  return { root, yearFolder, monthFolder, topicFolder, folder: topicFolder };
}
