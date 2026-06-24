/**
 * Shared backup logic: reads all matters + tasks from Supabase,
 * builds a rich XLSX workbook, and uploads/updates to Google Drive.
 *
 * Used by:
 *  - POST /api/cases/backup  (manual trigger from UI)
 *  - GET  /api/cron/backup-cases  (daily Vercel cron)
 */

import { createServiceClient } from '@/lib/supabase/server';
import { createDriveFile, writeDriveFile } from '@/lib/gdrive';
import * as XLSX from 'xlsx';

// ── Hebrew helpers ──────────────────────────────────────────────────────────
const fmtDate  = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const fmtMoney = v => (v || v === 0) && !isNaN(Number(v)) ? Number(v) : '';

const STAGE_HE = {
  draft: 'טיוטה', conditional: 'מותנה', waiting: 'ממתין לצד שני',
  signed: 'נחתם', registration: 'ברישום', closed: 'סגור',
};
const PAY_HE = { paid: 'שולם', partial: 'חלקי', pending: 'ממתין', overdue: 'בפיגור' };

function stageHe(s)   { return STAGE_HE[s] || s || ''; }
function payHe(s)     { return PAY_HE[s]   || s || ''; }

// ── Sheet builders ──────────────────────────────────────────────────────────
function buildRESheet(matters) {
  return XLSX.utils.json_to_sheet(matters.map(m => ({
    'שם התיק/לקוח':  m.clients?.buyer || m.client_name || '',
    'עו"ד מטפל':     m.profiles?.full_name || '',
    'שלב':           stageHe(m.stage),
    'גוש/חלקה':      m.parcel || '',
    'כתובת הנכס':    m.property_address || '',
    'הערות':         m.description || '',
    'תאריך מסירה':   fmtDate(m.delivery_date),
    'שכ"ט (₪)':      fmtMoney(m.agreed_fee),
    'נגבה (₪)':      fmtMoney(m.collected_amount),
    'יתרה (₪)':      fmtMoney(m.balance_amount),
    'סטטוס תשלום':   payHe(m.payment_status),
    'משכנתא':        m.mortgage || '',
    'מס שבח':        m.capital_gains || '',
    'ועדה':          m.committee_status || '',
    'עירייה':        m.municipality_status || '',
    'פניה רמ"י':     m.rami_status || '',
    'עו"ד צד שני':   m.other_lawyer || '',
    'מתווך':         m.broker || '',
  })));
}

function buildOtherSheet(matters) {
  return XLSX.utils.json_to_sheet(matters.map(m => ({
    'שם התיק/לקוח': m.client_name || '',
    'עו"ד מטפל':    m.profiles?.full_name || '',
    'שלב':          stageHe(m.stage),
    'תיאור':        m.description || '',
    'תאריך מסירה':  fmtDate(m.delivery_date),
    'שכ"ט (₪)':     fmtMoney(m.agreed_fee),
    'נגבה (₪)':     fmtMoney(m.collected_amount),
    'יתרה (₪)':     fmtMoney(m.balance_amount),
    'סטטוס תשלום':  payHe(m.payment_status),
  })));
}

function buildTasksSheet(tasks) {
  return XLSX.utils.json_to_sheet(tasks.map(t => ({
    'כותרת':    t.title || '',
    'תיאור':    t.description || '',
    'סטטוס':    t.status || '',
    'עדיפות':   t.priority || '',
    'מועד יעד': fmtDate(t.due_date),
    'משויך ל':  t.profiles?.full_name || '',
  })));
}

function buildSummarySheet(matters) {
  const re    = matters.filter(m => m.case_category !== 'other');
  const other = matters.filter(m => m.case_category === 'other');
  const all   = matters;

  const totalFee       = all.reduce((s, m) => s + Number(m.agreed_fee || 0), 0);
  const totalCollected = all.reduce((s, m) => s + Number(m.collected_amount || 0), 0);
  const totalBalance   = all.reduce((s, m) => s + Number(m.balance_amount || 0), 0);

  const rows = [
    { 'נושא': 'תאריך גיבוי', 'ערך': new Date().toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) },
    { 'נושא': '', 'ערך': '' },
    { 'נושא': 'תיקי נדל"ן', 'ערך': re.length },
    { 'נושא': 'תיקים אחרים', 'ערך': other.length },
    { 'נושא': 'סה"כ תיקים', 'ערך': all.length },
    { 'נושא': '', 'ערך': '' },
    { 'נושא': 'שכ"ט מוסכם סה"כ', 'ערך': `₪${totalFee.toLocaleString('he-IL')}` },
    { 'נושא': 'נגבה סה"כ',        'ערך': `₪${totalCollected.toLocaleString('he-IL')}` },
    { 'נושא': 'יתרה לגבייה',      'ערך': `₪${totalBalance.toLocaleString('he-IL')}` },
  ];

  return XLSX.utils.json_to_sheet(rows);
}

// ── Main export function ────────────────────────────────────────────────────
export async function runBackup() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return { ok: false, error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' };
  }

  const sb = createServiceClient();

  // Get org + existing backup file ID
  const { data: org } = await sb
    .from('organizations')
    .select('id, gdrive_backup_file_id, accountant_email')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) return { ok: false, error: 'No organization found' };

  // Fetch all data
  const [mattersRes, tasksRes] = await Promise.all([
    sb.from('matters')
      .select('*, profiles(full_name), clients(*)')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false }),
    sb.from('tasks')
      .select('*, profiles(full_name)')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false }),
  ]);

  const matters = mattersRes.data || [];
  const tasks   = tasksRes.data  || [];
  const re      = matters.filter(m => m.case_category !== 'other');
  const other   = matters.filter(m => m.case_category === 'other');

  // Build workbook — 4 sheets
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(matters),  'סיכום');
  XLSX.utils.book_append_sheet(wb, buildRESheet(re),            'תיקי נדלן');
  XLSX.utils.book_append_sheet(wb, buildOtherSheet(other),      'תיקים אחרים');
  XLSX.utils.book_append_sheet(wb, buildTasksSheet(tasks),      'משימות');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = 'גיבוי-תיקים — ספרי משרד';

  let fileId      = org.gdrive_backup_file_id;
  let webViewLink = null;
  let created     = false;

  // Share with user email if known
  const shareEmail = process.env.ADMIN_EMAIL || org.accountant_email || null;

  try {
    if (fileId) {
      // Update existing backup file
      await writeDriveFile(fileId, buf, filename);
      webViewLink = `https://drive.google.com/file/d/${fileId}/view`;
    } else {
      // First time — create a new file and share with admin
      const result = await createDriveFile(buf, filename, shareEmail);
      fileId      = result.fileId;
      webViewLink = result.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
      created     = true;
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }

  // Persist file ID and timestamp
  await sb
    .from('organizations')
    .update({ gdrive_backup_file_id: fileId, last_backup_at: new Date().toISOString() })
    .eq('id', org.id);

  return {
    ok: true,
    created,
    fileId,
    webViewLink,
    matters: matters.length,
    tasks:   tasks.length,
    filename,
  };
}
