import { createClient } from '@/lib/supabase/server';
import { dmyToISO } from '@/lib/helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/events/import
 * Body: { rows: [{...}], column_map: { title, date, start_time, end_time, attendee_name, attendee_phone, event_type, location, notes, assigned_to_name } }
 *
 * Imports schedule rows from a parsed CSV/Excel into the events table.
 * column_map keys = canonical field names, values = original CSV header names.
 */
export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb
    .from('profiles').select('organization_id, role').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const body = await request.json();
  const { rows, column_map } = body;
  if (!Array.isArray(rows) || !rows.length) {
    return Response.json({ error: 'rows[] required' }, { status: 400 });
  }

  // Load all profiles in the org so we can match "assigned_to" by name
  const { data: profiles } = await sb
    .from('profiles').select('id, full_name').eq('organization_id', profile.organization_id);
  const profileByName = Object.fromEntries(
    (profiles || []).map((p) => [p.full_name?.trim().toLowerCase(), p.id])
  );

  const cm = column_map || {};
  const get = (row, field) => {
    const col = cm[field];
    return col ? (row[col] ?? row[field] ?? '') : (row[field] ?? '');
  };

  const toISO = (dateStr, timeStr) => dmyToISO(dateStr, timeStr);

  const EVENT_TYPES = {
    'פגישה': 'meeting', 'meeting': 'meeting',
    'דיון': 'court', 'court': 'court', 'בית משפט': 'court',
    'שיחה': 'call', 'call': 'call',
    'מועד אחרון': 'deadline', 'deadline': 'deadline',
  };

  const toInsert = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const title = get(row, 'title') || get(row, 'כותרת') || get(row, 'נושא') || get(row, 'subject');
    const dateStr = get(row, 'date') || get(row, 'תאריך');
    const startStr = get(row, 'start_time') || get(row, 'שעת התחלה') || get(row, 'שעה');
    const endStr   = get(row, 'end_time')   || get(row, 'שעת סיום');
    const assignedName = (get(row, 'assigned_to_name') || get(row, 'עובד') || get(row, 'שם עובד') || '').trim().toLowerCase();

    if (!title && !dateStr) { errors.push(`שורה ${i + 2}: ללא כותרת ותאריך — דולגה`); continue; }

    const start_time = toISO(dateStr, startStr);
    const end_time   = endStr ? toISO(dateStr, endStr) : null;
    const rawType    = get(row, 'event_type') || get(row, 'סוג') || '';
    const event_type = EVENT_TYPES[rawType.trim()] || 'meeting';
    const assigned_to = assignedName ? (profileByName[assignedName] || null) : user.id;

    toInsert.push({
      organization_id: profile.organization_id,
      title:           title || '(ללא כותרת)',
      start_time,
      end_time,
      event_type,
      attendee_name:   get(row, 'attendee_name')  || get(row, 'שם משתתף')  || null,
      attendee_phone:  get(row, 'attendee_phone') || get(row, 'טלפון')      || null,
      location:        get(row, 'location')       || get(row, 'מיקום')      || null,
      notes:           get(row, 'notes')          || get(row, 'הערות')      || null,
      assigned_to:     assigned_to || user.id,
      created_by:      user.id,
    });
  }

  if (!toInsert.length) {
    return Response.json({ error: 'לא נמצאו שורות תקינות לייבוא', errors }, { status: 400 });
  }

  const { data: inserted, error: insErr } = await sb
    .from('events').insert(toInsert).select('id');
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

  return Response.json({ imported: inserted?.length || 0, errors });
}
