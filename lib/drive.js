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

// Get file's current parent folder ID from Drive
export async function getFileParentId(drive, fileId) {
  try {
    const res = await drive.files.get({ fileId, fields: 'parents', supportsAllDrives: true });
    return res.data.parents?.[0] || null;
  } catch { return null; }
}

// Extract Drive file ID from a webViewLink or sharing URL
export function extractDriveFileId(url) {
  const s = String(url || '');
  let m = s.match(/\/file\/d\/([^/?#]+)/);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]id=([^&]+)/);
  return m?.[1] || null;
}

// Upload a buffer into a structured folder hierarchy:
//   rootFolder / year / "MM monthName" / [topic /] fileName
// Returns { id, name, webViewLink, monthFolderId, monthFolderUrl, topicFolderId? }
export async function uploadToMonthFolder({ refreshToken, rootFolderId, buffer, fileName, mimeType, year, month, topic }) {
  if (!refreshToken) throw new Error('Missing Google refresh token');
  if (!buffer?.length) throw new Error('Missing file buffer');

  const drive = getDriveClient(refreshToken);
  const root = rootFolderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;

  const yearFolderId = await getOrCreateFolder(drive, root, String(year));

  const monthPad = String(month).padStart(2, '0');
  const monthLabel = `${monthPad} ${HEBREW_MONTHS[month - 1]}`;
  const monthFolderId = await getOrCreateFolder(drive, yearFolderId, monthLabel);

  // If topic provided, create a subfolder: month / topicName
  let targetFolderId = monthFolderId;
  let topicFolderId = null;
  if (topic) {
    topicFolderId = await getOrCreateFolder(drive, monthFolderId, topic);
    targetFolderId = topicFolderId;
  }

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [targetFolderId] },
    media: { mimeType: mimeType || 'application/pdf', body: bufferToStream(buffer) },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  return {
    ...res.data,
    monthFolderId,
    monthFolderUrl: `https://drive.google.com/drive/folders/${monthFolderId}`,
    topicFolderId,
    topicFolderUrl: topicFolderId ? `https://drive.google.com/drive/folders/${topicFolderId}` : null,
  };
}

// Move an existing Drive file into year/month/topic folder hierarchy.
// The file URL (webViewLink) stays unchanged — only parent folder changes.
export async function moveFileToTopicFolder({ refreshToken, rootFolderId, fileId, year, month, topic }) {
  if (!refreshToken || !fileId) return null;

  const drive = getDriveClient(refreshToken);
  const root = rootFolderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;

  const yearFolderId = await getOrCreateFolder(drive, root, String(year));
  const monthPad = String(month).padStart(2, '0');
  const monthLabel = `${monthPad} ${HEBREW_MONTHS[month - 1]}`;
  const monthFolderId = await getOrCreateFolder(drive, yearFolderId, monthLabel);

  let targetFolderId = monthFolderId;
  let topicFolderId = null;
  if (topic) {
    topicFolderId = await getOrCreateFolder(drive, monthFolderId, topic);
    targetFolderId = topicFolderId;
  }

  // Get current parent to remove it
  const currentParentId = await getFileParentId(drive, fileId);

  await drive.files.update({
    fileId,
    addParents: targetFolderId,
    removeParents: currentParentId || undefined,
    fields: 'id,parents',
    supportsAllDrives: true,
  });

  return {
    topicFolderId,
    monthFolderId,
    topicFolderUrl: topicFolderId ? `https://drive.google.com/drive/folders/${topicFolderId}` : null,
    monthFolderUrl: `https://drive.google.com/drive/folders/${monthFolderId}`,
  };
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
