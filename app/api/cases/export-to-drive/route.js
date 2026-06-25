import { createServiceClient } from '@/lib/supabase/server';
import { writeDriveFile } from '@/lib/gdrive';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fmtDate = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const fmtMoney = v => (v || v === 0) && !isNaN(Number(v)) ? Number(v) : '';

const STAGE_HE = {
  draft: 'טיוטה', conditional: 'מותנה', waiting: 'ממתין לצד שני',
  signed: 'נחתם', registration: 'ברישום', closed: 'סגור',
};

function stageHe(s) { return STAGE_HE[s] || s || ''; }

function buildRESheet(matters) {
  const rows = matters.map(m => ({
    'שם התיק/לקוח':    m.clients?.buyer || m.client_name || '',
    'עו"ד מטפל':       m.profiles?.full_name || '',
    'שלב':             stageHe(m.stage),
    'גוש/חלקה':        m.parcel || '',
    'כתובת הנכס':      m.property_address || '',
    'הערות':           m.description || '',
    'תאריך מסירה':     fmtDate(m.delivery_date),
    'שכ"ט (₪)':        fmtMoney(m.agreed_fee),
    'נגבה':            fmtMoney(m.collected_amount),
    'יתרה':            fmtMoney(m.balance_amount),
    'סטטוס תשלום':    m.payment_status || '',
    'משכנתא':          m.mortgage || '',
    'מס שבח':          m.capital_gains || '',
    'ועדה':            m.committee_status || '',
    'עירייה':          m.municipality_status || '',
    'פניה רמ"י':       m.rami_status || '',
  }));
  return XLSX.utils.json_to_sheet(rows);
}

function buildOtherSheet(matters) {
  const rows = matters.map(m => ({
    'שם התיק/לקוח':    m.client_name || '',
    'עו"ד מטפל':       m.profiles?.full_name || '',
    'שלב':             stageHe(m.stage),
    'תיאור':           m.description || '',
    'תאריך מסירה':     fmtDate(m.delivery_date),
    'שכ"ט (₪)':        fmtMoney(m.agreed_fee),
    'נגבה':            fmtMoney(m.collected_amount),
    'יתרה':            fmtMoney(m.balance_amount),
    'סטטוס תשלום':    m.payment_status || '',
  }));
  return XLSX.utils.json_to_sheet(rows);
}

function buildTasksSheet(tasks) {
  const rows = tasks.map(t => ({
    'כותרת':           t.title || '',
    'תיאור':           t.description || '',
    'סטטוס':           t.status || '',
    'עדיפות':          t.priority || '',
    'מועד יעד':        fmtDate(t.due_date),
    'משויך ל':         t.profiles?.full_name || '',
  }));
  return XLSX.utils.json_to_sheet(rows);
}

async function verifyPin(request) {
  const pin = request.headers.get('x-cases-pin') || (await request.json().catch(() => ({}))).pin;
  const envPin = process.env.CASES_ACCESS_PIN;
  if (envPin && String(pin) !== String(envPin)) return false;
  return true;
}

export async function POST(request) {
  const cloned = request.clone();
  const pinOk = await verifyPin(cloned);
  if (!pinOk) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const fileId = process.env.GDRIVE_FILE_ID;
  if (!fileId) return Response.json({ error: 'GDRIVE_FILE_ID not configured' }, { status: 503 });
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return Response.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }, { status: 503 });
  }

  const sb = createServiceClient();

  // Get org
  const { data: org } = await sb.from('organizations')
    .select('id').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });

  // Fetch matters
  const { data: matters } = await sb.from('matters')
    .select('*, profiles(full_name), clients(*)')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false });

  // Fetch tasks
  const { data: tasks } = await sb.from('tasks')
    .select('*, profiles(full_name)')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false });

  const re    = (matters || []).filter(m => m.case_category !== 'other');
  const other = (matters || []).filter(m => m.case_category === 'other');

  // Build workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildRESheet(re),         'תיקי נדלן');
  XLSX.utils.book_append_sheet(wb, buildOtherSheet(other),   'תיקים אחרים');
  XLSX.utils.book_append_sheet(wb, buildTasksSheet(tasks || []), 'משימות');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  try {
    await writeDriveFile(fileId, buffer);
  } catch (err) {
    console.error('Drive write error:', err.message);
    return Response.json({ error: `Drive error: ${err.message}` }, { status: 502 });
  }

  return Response.json({ ok: true, re: re.length, other: other.length, tasks: (tasks || []).length });
}
