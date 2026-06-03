import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/events/gsheet-webhook
 * Called by a Google Apps Script onEdit trigger whenever the schedule sheet changes.
 * Header: x-gsheet-secret (must match GSHEET_WEBHOOK_SECRET env var)
 *
 * Body: { rows: [ { תאריך, שעת_התחלה, שעת_סיום, כותרת, סוג, שם_משתתף, טלפון, מיקום, הערות, עובד, sheet_row_id } ] }
 *
 * Strategy: full replace for the date range covered by the incoming rows.
 * Each row keeps a stable `sheet_row_id` (= spreadsheet row number) so we can
 * upsert without creating duplicates.
 */
export async function POST(request) {
  const secret = request.headers.get('x-gsheet-secret');
  if (!process.env.GSHEET_WEBHOOK_SECRET || secret !== process.env.GSHEET_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rows = [] } = body;
  if (!rows.length) return Response.json({ ok: true, upserted: 0 });

  // Load profiles for name → id mapping
  const { data: profiles } = await sb
    .from('profiles').select('id, full_name').eq('organization_id', org.id);
  const profileByName = Object.fromEntries(
    (profiles || []).map((p) => [normalizeStr(p.full_name), p.id])
  );

  const toInsert = rows
    .map((row) => parseRow(row, org.id, profileByName))
    .filter(Boolean);

  if (!toInsert.length) return Response.json({ ok: true, upserted: 0 });

  // Upsert by sheet_row_id (stored in notes as a sentinel, or add a dedicated column)
  const { data: upserted, error } = await sb
    .from('events')
    .upsert(toInsert, { onConflict: 'organization_id,sheet_row_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    // Fallback: insert without sheet_row_id constraint (if column doesn't exist yet)
    const { data: inserted } = await sb.from('events').insert(toInsert).select('id');
    return Response.json({ ok: true, upserted: inserted?.length || 0, fallback: true });
  }

  return Response.json({ ok: true, upserted: upserted?.length || 0 });
}

function normalizeStr(s) { return (s || '').trim().toLowerCase(); }

function toISO(dateStr, timeStr) {
  if (!dateStr) return null;
  let iso = dateStr.trim();
  const dmy = iso.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? '20' + y : y;
    iso = `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (timeStr) {
    const t = timeStr.trim().replace('.', ':').replace(/[^\d:]/g, '');
    const padded = t.length <= 5 ? t.padStart(5, '0') : t;
    return `${iso}T${padded.length === 4 ? '0'+padded : padded}:00`;
  }
  return iso + 'T00:00:00';
}

const EVENT_TYPE_MAP = {
  'פגישה':'meeting','meeting':'meeting',
  'דיון':'court','court':'court','בית משפט':'court','ביהמ"ש':'court',
  'שיחה':'call','call':'call','טלפון':'call',
  'מועד אחרון':'deadline','deadline':'deadline','דדליין':'deadline',
};

function parseRow(row, orgId, profileByName) {
  const g = (keys) => {
    for (const k of (Array.isArray(keys) ? keys : [keys])) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
        return String(row[k]).trim();
      }
    }
    return '';
  };

  const dateStr  = g(['תאריך','date','Date']);
  const startStr = g(['שעת התחלה','שעת_התחלה','start_time','start','שעה']);
  const endStr   = g(['שעת סיום','שעת_סיום','end_time','end']);
  const title    = g(['כותרת','נושא','title','subject','פגישה']);
  const rowId    = g(['sheet_row_id','row_id','__rowNum']);

  if (!dateStr && !title) return null;

  const rawType   = g(['סוג','type','event_type']);
  const event_type = EVENT_TYPE_MAP[rawType] || 'meeting';
  const empName   = normalizeStr(g(['עובד','שם עובד','assigned_to','employee']));
  const assigned_to = empName ? (profileByName[empName] || null) : null;

  return {
    organization_id: orgId,
    sheet_row_id:    rowId || null,
    title:           title || '(ללא כותרת)',
    start_time:      toISO(dateStr, startStr),
    end_time:        endStr ? toISO(dateStr, endStr) : null,
    event_type,
    attendee_name:   g(['שם משתתף','משתתף','attendee_name','attendee']) || null,
    attendee_phone:  g(['טלפון','phone','attendee_phone']) || null,
    location:        g(['מיקום','location']) || null,
    notes:           g(['הערות','notes']) || null,
    assigned_to,
  };
}
