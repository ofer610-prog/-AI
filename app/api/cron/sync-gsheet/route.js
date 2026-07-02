import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { dmyToISO } from '@/lib/helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/sync-gsheet
 * Fetches the published Google Sheet CSV and syncs events.
 * Requires GSHEET_CSV_URL env var = the "Publish to web → CSV" URL from Google Sheets.
 * Also requires CRON_SECRET.
 *
 * Can also be triggered manually: POST /api/cron/sync-gsheet (authenticated user).
 */
export async function GET(request) {
  
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

export async function POST(request) {
  // Allow authenticated users to trigger manually
  const { createClient } = await import('@/lib/supabase/server');
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return runSync();
}

async function runSync() {
  const csvUrl = process.env.GSHEET_CSV_URL;
  if (!csvUrl) {
    return Response.json({ error: 'GSHEET_CSV_URL env var not set' }, { status: 503 });
  }

  // Fetch the CSV
  let csvText;
  try {
    const res = await fetch(csvUrl, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csvText = await res.text();
  } catch (err) {
    return Response.json({ error: `Failed to fetch sheet: ${err.message}` }, { status: 502 });
  }

  const rows = parseCSV(csvText);
  if (!rows.length) return Response.json({ ok: true, synced: 0, message: 'Empty sheet' });

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  const { data: profiles } = await sb
    .from('profiles').select('id, full_name').eq('organization_id', org.id);
  const profileByName = Object.fromEntries(
    (profiles || []).map((p) => [(p.full_name || '').trim().toLowerCase(), p.id])
  );

  const headers = rows[0];
  const dataRows = rows.slice(1);

  const toUpsert = dataRows
    .map((cells, i) => {
      const row = Object.fromEntries(headers.map((h, j) => [h.trim(), (cells[j] || '').trim()]));
      row.__rowNum = String(i + 2); // spreadsheet row number (1-indexed header + data)
      return parseRow(row, org.id, profileByName);
    })
    .filter(Boolean);

  if (!toUpsert.length) return Response.json({ ok: true, synced: 0 });

  // Delete events that came from the sheet, then re-insert (simple full-replace strategy)
  await sb.from('events')
    .delete()
    .eq('organization_id', org.id)
    .not('sheet_row_id', 'is', null);

  const { data: inserted, error } = await sb.from('events').insert(toUpsert).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, synced: inserted?.length || 0, rows: dataRows.length });
}

// ─── CSV parser (handles quoted fields) ─────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const cells = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  });
}

// ─── Row parser (shared with webhook) ───────────────────────────────────────

function toISO(dateStr, timeStr) {
  return dmyToISO(dateStr, timeStr);
}

const TYPE_MAP = {
  'פגישה':'meeting','meeting':'meeting','פגישות':'meeting',
  'דיון':'court','court':'court','בית משפט':'court',
  'שיחה':'call','call':'call','טלפון':'call',
  'מועד אחרון':'deadline','deadline':'deadline',
};

function parseRow(row, orgId, profileByName) {
  const g = (...keys) => { for (const k of keys) if (row[k]?.trim()) return row[k].trim(); return ''; };
  const dateStr = g('תאריך','date','Date');
  const title   = g('כותרת','נושא','title','subject');
  if (!dateStr && !title) return null;

  const empName = g('עובד','שם עובד','assigned_to','employee').toLowerCase();
  return {
    organization_id: orgId,
    sheet_row_id:    row.__rowNum || null,
    title:           title || '(ללא כותרת)',
    start_time:      toISO(dateStr, g('שעת התחלה','שעת_התחלה','start_time','שעה')),
    end_time:        g('שעת סיום','שעת_סיום','end_time') ? toISO(dateStr, g('שעת סיום','שעת_סיום','end_time')) : null,
    event_type:      TYPE_MAP[g('סוג','type')] || 'meeting',
    attendee_name:   g('שם משתתף','משתתף','attendee_name') || null,
    attendee_phone:  g('טלפון','phone') || null,
    location:        g('מיקום','location') || null,
    notes:           g('הערות','notes') || null,
    assigned_to:     empName ? (profileByName[empName] || null) : null,
  };
}
