import { google } from 'googleapis';
import { Readable } from 'stream';
import { getOAuthClient } from '@/lib/gmail';

export const DEFAULT_EXPENSES_DRIVE_FOLDER_ID = '1MADX6wcnnrGKAjyR-h9NkeLNdh-80STe';

const HEBREW_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

export function getDriveClient(refreshToken) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

function bufferToStream(buffer) {
  return Readable.from(buffer);
}

export function safeDriveFileName(parts = []) {
  return parts
    .filter(Boolean)
    .map(p => String(p).replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' - ')
    .slice(0, 180);
}

// Get or create a subfolder by name under parentId.
// Returns the folder ID (existing or newly created).
export async function getOrCreateFolder(drive, parentId, folderName) {
  const safe = String(folderName).replace(/'/g, "\\'");
  const q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const list = await drive.files.list({
    q,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (list.data.files?.[0]?.id) return list.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id;
}

// Upload a buffer into a year/month subfolder hierarchy:
//   rootFolder / year / "MM monthName" / fileName
// Returns { id, name, webViewLink, monthFolderUrl }
export async function uploadToMonthFolder({ refreshToken, rootFolderId, buffer, fileName, mimeType, year, month }) {
  if (!refreshToken) throw new Error('Missing Google refresh token');
  if (!buffer?.length) throw new Error('Missing file buffer');

  const drive = getDriveClient(refreshToken);
  const root = rootFolderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;

  // Year subfolder: "2026"
  const yearFolderId = await getOrCreateFolder(drive, root, String(year));

  // Month subfolder: "06 יוני"
  const monthPad = String(month).padStart(2, '0');
  const monthLabel = `${monthPad} ${HEBREW_MONTHS[month - 1]}`;
  const monthFolderId = await getOrCreateFolder(drive, yearFolderId, monthLabel);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [monthFolderId],
    },
    media: {
      mimeType: mimeType || 'application/pdf',
      body: bufferToStream(buffer),
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  const monthFolderUrl = `https://drive.google.com/drive/folders/${monthFolderId}`;
  return { ...res.data, monthFolderId, monthFolderUrl };
}

// Legacy flat-folder upload (kept for backwards compatibility)
export async function uploadBufferToDrive({ refreshToken, folderId, buffer, fileName, mimeType }) {
  if (!refreshToken) throw new Error('Missing Google refresh token');
  if (!buffer?.length) throw new Error('Missing file buffer');

  const drive = getDriveClient(refreshToken);
  const targetFolderId = folderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [targetFolderId],
    },
    media: {
      mimeType: mimeType || 'application/pdf',
      body: bufferToStream(buffer),
    },
    fields: 'id,name,webViewLink,webContentLink,mimeType',
    supportsAllDrives: true,
  });

  return res.data;
}
