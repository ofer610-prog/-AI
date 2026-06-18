import { getDriveClient, DEFAULT_EXPENSES_DRIVE_FOLDER_ID, safeDriveFileName } from '@/lib/drive';

export async function getOrCreateExpenseTopicFolder({ refreshToken, rootFolderId, topic }) {
  if (!refreshToken) throw new Error('Missing Google refresh token');
  const drive = getDriveClient(refreshToken);
  const parent = rootFolderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;
  const folderName = safeDriveFileName([topic || 'כללי']) || 'כללי';
  const safeName = folderName.split("'").join('');
  const q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='" + safeName + "' and '" + parent + "' in parents";

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
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  return created.data;
}
