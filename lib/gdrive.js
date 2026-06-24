/**
 * Google Drive helper — reads xlsx/csv files from Drive using a service account.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  – full JSON key string
 *   GDRIVE_FILE_ID               – file ID from the Google Drive share URL
 */

import { google } from 'googleapis';
import * as XLSX from 'xlsx';

function getAuth(write = false) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const key = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: write
      ? ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
      : ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

/**
 * Update (overwrite) the content of an existing Drive file with an XLSX buffer.
 * The service account must have Editor access to the file.
 */
export async function writeDriveFile(fileId, xlsxBuffer, filename = 'ניהול_תיקי_משרד.xlsx') {
  if (!fileId) throw new Error('GDRIVE_FILE_ID not provided');
  const auth  = getAuth(true);
  const drive = google.drive({ version: 'v3', auth });

  const { Readable } = await import('stream');
  const stream = new Readable();
  stream.push(xlsxBuffer);
  stream.push(null);

  await drive.files.update({
    fileId,
    requestBody: { name: filename },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: stream,
    },
  });
}

async function downloadBuffer(fileId) {
  const auth  = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  const meta = await drive.files.get({ fileId, fields: 'name,mimeType' });
  const mime = meta.data.mimeType || '';
  const name = (meta.data.name || '').toLowerCase();

  let buffer;
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    const res = await drive.files.export(
      { fileId, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { responseType: 'arraybuffer' }
    );
    buffer = Buffer.from(res.data);
  } else {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    buffer = Buffer.from(res.data);
  }
  return { buffer, name, mime };
}

/**
 * Returns the first sheet as an array of row objects.
 */
export async function readDriveFile(fileId) {
  if (!fileId) throw new Error('GDRIVE_FILE_ID not provided');
  const { buffer, name, mime } = await downloadBuffer(fileId);

  if (name.endsWith('.csv') || mime === 'text/csv') {
    return parseCSVBuffer(buffer);
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

/**
 * Returns all sheets as { [sheetName]: rows[] }.
 */
export async function readDriveFileAllSheets(fileId) {
  if (!fileId) throw new Error('GDRIVE_FILE_ID not provided');
  const { buffer, name, mime } = await downloadBuffer(fileId);

  if (name.endsWith('.csv') || mime === 'text/csv') {
    return { sheet1: parseCSVBuffer(buffer) };
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const result = {};
  for (const sheetName of wb.SheetNames) {
    try {
      const ws = wb.Sheets[sheetName];
      result[sheetName] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    } catch {
      result[sheetName] = [];
    }
  }
  return result;
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
