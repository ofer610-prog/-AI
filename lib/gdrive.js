/**
 * Google Drive helper — reads a file (xlsx/csv) from Drive using a service account.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  – full JSON key string (paste the downloaded JSON as-is)
 *   GDRIVE_FILE_ID               – the file ID from the Google Drive share URL
 */

import { google } from 'googleapis';
import XLSX from 'xlsx';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const key = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

/**
 * Download an xlsx/csv file from Google Drive and return its rows as
 * an array of objects (first row = column headers).
 */
export async function readDriveFile(fileId) {
  if (!fileId) throw new Error('GDRIVE_FILE_ID not provided');

  const auth   = getAuth();
  const drive  = google.drive({ version: 'v3', auth });

  // Get file metadata to know the MIME type
  const meta = await drive.files.get({ fileId, fields: 'name,mimeType' });
  const mime = meta.data.mimeType || '';
  const name = (meta.data.name || '').toLowerCase();

  let buffer;

  if (mime === 'application/vnd.google-apps.spreadsheet') {
    // Native Google Sheets → export as xlsx
    const res = await drive.files.export(
      { fileId, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { responseType: 'arraybuffer' }
    );
    buffer = Buffer.from(res.data);
  } else {
    // Regular file (xlsx, csv, etc.) → download directly
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    buffer = Buffer.from(res.data);
  }

  // Parse
  if (name.endsWith('.csv') || mime === 'text/csv') {
    return parseCSVBuffer(buffer);
  }

  // Default: parse as xlsx
  const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function parseCSVBuffer(buffer) {
  const text  = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const parse = (line) => {
    const cells = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
      else if (ch===','&&!inQ){cells.push(cur);cur='';}
      else cur+=ch;
    }
    cells.push(cur);
    return cells;
  };
  const headers = parse(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parse(line);
    return Object.fromEntries(headers.map((h, i) => [h, (cells[i]||'').trim()]));
  }).filter((r) => Object.values(r).some((v) => v));
}
