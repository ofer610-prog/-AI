import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { readDriveFileAllSheets } from '@/lib/gdrive';
import { importSheets } from '@/lib/casesImport';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/cron/sync-gdrive  – called by Vercel cron (daily)
 * POST /api/cron/sync-gdrive  – manual trigger (authenticated admin/accountant)
 *
 * Reads ניהול_תיקי_משרד Excel from Google Drive and syncs cases/tasks/events.
 */

export async function GET(request) {
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

export async function POST(request) {
  // Accept cases PIN as auth (same PIN that unlocks editing on /cases)
  const body = await request.json().catch(() => ({}));
  const pin = body.pin || request.headers.get('x-cases-pin');
  const correctPin = process.env.CASES_ACCESS_PIN;

  // If PIN is configured, verify it
  if (correctPin) {
    if (!pin || String(pin) !== String(correctPin)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return runSync();
}

async function runSync() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return Response.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }, { status: 503 });
  }
  const fileId = process.env.GDRIVE_FILE_ID;
  if (!fileId) {
    return Response.json({ error: 'GDRIVE_FILE_ID not configured' }, { status: 503 });
  }

  let sheets;
  try {
    sheets = await readDriveFileAllSheets(fileId);
  } catch (err) {
    console.error('Drive read error:', err.message);
    return Response.json({ error: `Drive error: ${err.message}` }, { status: 502 });
  }

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  const stats = await importSheets(sb, org.id, sheets);
  console.log('GDrive sync complete:', stats);
  return Response.json({ ok: true, ...stats });
}
