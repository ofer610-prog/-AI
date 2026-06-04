import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/events/upload-xlsx
 * Accepts a multipart/form-data upload with field "file" containing an .xlsx or .csv file.
 * Parses it and imports events.
 */
export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await sb
    .from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

  const fileName = file.name?.toLowerCase() || '';
  const buffer   = Buffer.from(await file.arrayBuffer());

  let rows = [];

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    // Parse Excel
    const XLSX = await import('xlsx');
    const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } else {
    // Parse CSV
    const text = buffer.toString('utf-8');
    rows = parseCSV(text);
  }

  if (!rows.length) return Response.json({ error: 'הקובץ ריק' }, { status: 400 });

  // Load profiles for name matching
  const { data: profiles } = await sb
    .from('profiles').select('id, full_name').eq('organization_id', profile.organization_id);
  const profileByName = Object.fromEntries(
    (profiles || []).map((p) => [(p.full_name||'').trim().toLowerCase(), p.id])
  );

  const toInsert = rows
    .map((row, i) => parseRow(row, profile.organization_id, profileByName, i + 2))
    .filter(Boolean);

  if (!toInsert.length) return Response.json({ error: 'לא נמצאו שורות תקינות' }, { status: 400 });

  const { data: inserted, error } = await sb.from('events').insert(toInsert).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Return sample of what was imported so user can verify
  const sample = toInsert.slice(0, 5).map((r) => ({
    title: r.title, date: r.start_time?.slice(0,10), type: r.event_type,
  }));

  return Response.json({ imported: inserted?.length || 0, sample });
}

// ─── CSV parser ────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const parse = (line) => {
    const cells = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
      else if (ch===','&&!inQ){ cells.push(cur); cur=''; }
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

// ─── Row parser ─────────────────────────────────────────────────────────────

const TYPE_MAP = {
  'פגישה':'meeting','meeting':'meeting',
  'דיון':'court','court':'court','בית משפט':'court','ביהמ"ש':'court',
  'שיחה':'call','call':'call','טלפון':'call',
  'מועד אחרון':'deadline','deadline':'deadline','דדליין':'deadline',
};

function toISO(dateVal, timeStr) {
  if (!dateVal) return null;
  let iso;
  if (dateVal instanceof Date) {
    iso = dateVal.toISOString().slice(0,10);
  } else {
    const s = String(dateVal).trim();
    const dmy = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
    if (dmy) {
      const [,d,m,y] = dmy;
      iso = `${y.length===2?'20'+y:y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      iso = s.slice(0,10);
    } else {
      return null;
    }
  }
  if (timeStr) {
    const t = String(timeStr).trim().replace('.',':').replace(/[^\d:]/g,'');
    if (t) return `${iso}T${t.padStart(5,'0')}:00`;
  }
  return iso + 'T00:00:00';
}

function parseRow(row, orgId, profileByName, rowNum) {
  const g = (...keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };

  const dateVal = row['תאריך'] || row['date'] || row['Date'] || row['תאריך פגישה'] || '';
  const title   = g('כותרת','נושא','title','subject','פגישה','אירוע');
  if (!dateVal && !title) return null;

  const startStr = g('שעת התחלה','שעת_התחלה','start_time','שעה','שעת פגישה');
  const endStr   = g('שעת סיום','שעת_סיום','end_time','סיום');
  const rawType  = g('סוג','type','event_type','סוג אירוע');
  const empName  = g('עובד','שם עובד','assigned_to','employee','לעובד').toLowerCase();

  return {
    organization_id: orgId,
    sheet_row_id:    String(rowNum),
    title:           title || '(ללא כותרת)',
    start_time:      toISO(dateVal, startStr),
    end_time:        endStr ? toISO(dateVal, endStr) : null,
    event_type:      TYPE_MAP[rawType] || 'meeting',
    attendee_name:   g('שם משתתף','משתתף','attendee_name','לקוח','שם לקוח') || null,
    attendee_phone:  g('טלפון','phone','attendee_phone') || null,
    location:        g('מיקום','location','כתובת') || null,
    notes:           g('הערות','notes','פרטים') || null,
    assigned_to:     empName ? (profileByName[empName] || null) : null,
  };
}
