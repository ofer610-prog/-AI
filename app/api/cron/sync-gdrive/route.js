import { createServiceClient } from '@/lib/supabase/server';
import { readDriveFile } from '@/lib/gdrive';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/cron/sync-gdrive  – called by Vercel cron (hourly)
 * POST /api/cron/sync-gdrive  – manual trigger (authenticated user)
 *
 * Reads the Excel/Sheets file directly from Google Drive via service account
 * and syncs all rows into the events table.
 */
export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

export async function POST(request) {
  const { createClient } = await import('@/lib/supabase/server');
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return runSync();
}

async function runSync() {
  const fileId = process.env.GDRIVE_FILE_ID;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return Response.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }, { status: 503 });
  }
  if (!fileId) {
    return Response.json({ error: 'GDRIVE_FILE_ID not configured' }, { status: 503 });
  }

  let rows;
  try {
    rows = await readDriveFile(fileId);
  } catch (err) {
    console.error('Drive read error:', err.message);
    return Response.json({ error: `Drive error: ${err.message}` }, { status: 502 });
  }

  if (!rows.length) {
    return Response.json({ ok: true, synced: 0, message: 'File is empty' });
  }

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  const { data: profiles } = await sb
    .from('profiles').select('id, full_name').eq('organization_id', org.id);
  const profileByName = Object.fromEntries(
    (profiles || []).map((p) => [(p.full_name || '').trim().toLowerCase(), p.id])
  );

  const toUpsert = rows
    .map((row, i) => parseRow(row, org.id, profileByName, i + 2))
    .filter(Boolean);

  if (!toUpsert.length) {
    return Response.json({ ok: true, synced: 0, message: 'No parseable rows' });
  }

  // Full replace: delete all sheet-sourced events, re-insert
  await sb.from('events')
    .delete()
    .eq('organization_id', org.id)
    .not('sheet_row_id', 'is', null);

  const { data: inserted, error } = await sb.from('events').insert(toUpsert).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  console.log(`GDrive sync: ${inserted?.length || 0} events from ${rows.length} rows`);
  return Response.json({ ok: true, synced: inserted?.length || 0, total_rows: rows.length });
}

// ─── Row parser ──────────────────────────────────────────────────────────────

const TYPE_MAP = {
  'פגישה':'meeting','meeting':'meeting','פגישות':'meeting',
  'דיון':'court','court':'court','בית משפט':'court','ביהמ"ש':'court',
  'שיחה':'call','call':'call','טלפון':'call',
  'מועד אחרון':'deadline','deadline':'deadline','דדליין':'deadline',
};

function toISO(dateVal, timeVal) {
  if (!dateVal && dateVal !== 0) return null;
  let iso;
  if (dateVal instanceof Date) {
    iso = dateVal.toISOString().slice(0, 10);
  } else {
    const s = String(dateVal).trim();
    const dmy = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      iso = `${y.length === 2 ? '20' + y : y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      iso = s.slice(0, 10);
    } else return null;
  }
  if (timeVal !== undefined && timeVal !== '') {
    if (timeVal instanceof Date) {
      const hh = String(timeVal.getHours()).padStart(2,'0');
      const mm = String(timeVal.getMinutes()).padStart(2,'0');
      return `${iso}T${hh}:${mm}:00`;
    }
    const t = String(timeVal).trim().replace('.', ':').replace(/[^\d:]/g, '');
    if (t) return `${iso}T${t.padStart(5,'0')}:00`;
  }
  return iso + 'T00:00:00';
}

function g(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseRow(row, orgId, profileByName, rowNum) {
  const dateVal = row['תאריך'] ?? row['date'] ?? row['Date'] ?? row['תאריך פגישה'] ?? '';
  const title   = g(row, 'כותרת','נושא','title','subject','פגישה','אירוע','תיאור');
  if (!dateVal && !title) return null;

  const empName = g(row, 'עובד','שם עובד','assigned_to','employee','לעובד').toLowerCase();

  return {
    organization_id: orgId,
    sheet_row_id:    String(rowNum),
    title:           title || '(ללא כותרת)',
    start_time:      toISO(dateVal, row['שעת התחלה'] ?? row['שעת_התחלה'] ?? row['start_time'] ?? row['שעה'] ?? row['שעת פגישה']),
    end_time:        toISO(dateVal, row['שעת סיום'] ?? row['שעת_סיום'] ?? row['end_time'] ?? row['סיום']) || null,
    event_type:      TYPE_MAP[g(row,'סוג','type','event_type','סוג אירוע')] || 'meeting',
    attendee_name:   g(row,'שם משתתף','משתתף','attendee_name','לקוח','שם לקוח') || null,
    attendee_phone:  g(row,'טלפון','phone','attendee_phone') || null,
    location:        g(row,'מיקום','location','כתובת') || null,
    notes:           g(row,'הערות','notes','פרטים','תיאור') || null,
    assigned_to:     empName ? (profileByName[empName] || null) : null,
  };
}
