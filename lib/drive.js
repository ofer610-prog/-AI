import { google } from 'googleapis';
import { Readable } from 'stream';
import { getOAuthClient } from '@/lib/gmail';

export const DEFAULT_EXPENSES_DRIVE_FOLDER_ID = '1MADX6wcnnrGKAjyR-h9NkeLNdh-80STe';

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
