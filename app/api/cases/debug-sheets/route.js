import { readDriveFileAllSheets } from '@/lib/gdrive';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cases/debug-sheets
 * TEMPORARY diagnostic — returns sheet names + first rows so we can see
 * the real structure of the Drive Excel file.
 */
export async function GET() {
  const fileId = process.env.GDRIVE_FILE_ID;
  if (!fileId) return Response.json({ error: 'GDRIVE_FILE_ID not set' }, { status: 503 });
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return Response.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not set' }, { status: 503 });
  }

  let sheets;
  try {
    sheets = await readDriveFileAllSheets(fileId);
  } catch (err) {
    return Response.json({ error: `Drive error: ${err.message}` }, { status: 502 });
  }

  const summary = {};
  for (const [name, rows] of Object.entries(sheets)) {
    summary[name] = {
      rowCount: rows.length,
      headers: rows[0] ? Object.keys(rows[0]) : [],
      firstRow: rows[0] || null,
      secondRow: rows[1] || null,
    };
  }

  return Response.json({ sheetNames: Object.keys(sheets), summary });
}
