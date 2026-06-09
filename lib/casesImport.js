/**
 * Shared cases/matters import logic.
 * Used by both the Google-Drive cron sync and the direct xlsx upload route.
 *
 * importSheets(sb, orgId, sheets) — sb is a Supabase service client,
 * sheets is { [sheetName]: rowObject[] } (as produced by XLSX.utils.sheet_to_json).
 *
 * Mirrors the firm's Excel workbook:
 *   "תיקי נדלן"   → real-estate matters (case_category = 'realestate')
 *   "תיקים אחרים" → other matters       (case_category = 'other')
 *   "משימות"      → tasks
 */

// ─── Sheet finder ─────────────────────────────────────────────────────────────

export function findSheet(sheets, names) {
  for (const name of names) {
    const key = Object.keys(sheets).find(
      (k) => k.trim() === name || k.replace('"', '"').trim() === name
    );
    if (key) return sheets[key];
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function g(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === '-----' || s === '----') return null;
  const dmy = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseAmount(val) {
  if (!val) return null;
  const s = String(val).replace(/[₪,\s]/g, '').trim();
  // Pull the first numeric run (handles "8500+מעמ", "0.5 כולל", "1770 לבקש")
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return isNaN(n) ? null : n;
}

const STAGE_MAP = {
  'טיוטה': 'draft', 'מותנה': 'conditional',
  'ממתין לצד שני': 'waiting', 'נחתם': 'signed',
  'ברישום': 'registration', 'סגור': 'closed',
};

const TYPE_MAP_MATTERS = {
  'פינוי בינוי': 'pinui', 'הסכם ממון': 'other',
  'ייפוי כוח מתמשך': 'other', 'צוואה': 'other',
  'ירושה': 'inheritance', 'חלוקת עזבון': 'inheritance',
};

// Section/header strings that should never become a case row
const SECTION_HEADERS = [
  'תיקים שנחתמו', 'ברישום', 'מותנה', 'ממתין לצד שני',
  'תיקים אחרים', 'שם התיק/לקוח', 'סטטוס תשלום', 'תאריך מסירה',
];

// ─── Top-level import ─────────────────────────────────────────────────────────

export async function importSheets(sb, orgId, sheets) {
  const { data: profiles } = await sb
    .from('profiles').select('id, full_name').eq('organization_id', orgId);
  const profileByName = Object.fromEntries(
    (profiles || []).map((p) => [(p.full_name || '').trim(), p.id])
  );

  const stats = { clients: 0, matters: 0, tasks: 0, events: 0 };

  const realEstateSheet = findSheet(sheets, ['תיקי נדלן', 'תיקי נדל"ן', 'תיקים', 'real_estate']);
  const otherSheet      = findSheet(sheets, ['תיקים אחרים', 'other_cases']);
  const tasksSheet      = findSheet(sheets, ['משימות', 'tasks']);

  if (realEstateSheet) {
    const r = await syncCases(sb, orgId, profileByName, realEstateSheet, 'realestate');
    stats.clients += r.clients; stats.matters += r.matters; stats.events += r.events;
  }
  if (otherSheet) {
    const r = await syncCases(sb, orgId, profileByName, otherSheet, 'other');
    stats.clients += r.clients; stats.matters += r.matters;
  }
  if (tasksSheet) {
    stats.tasks = await syncTasks(sb, orgId, profileByName, tasksSheet);
  }

  return { ...stats, sheets: Object.keys(sheets) };
}

// ─── Real-estate / other cases sync ──────────────────────────────────────────

async function syncCases(sb, orgId, profileByName, rows, sheetType) {
  const stats = { clients: 0, matters: 0, events: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const fields = sheetType === 'realestate'
      ? extractRealEstate(row)
      : extractOther(row);

    const { clientName, attorney } = fields;
    if (!clientName) continue;
    if (!attorney && sheetType === 'realestate') continue;
    if (SECTION_HEADERS.some((h) => clientName === h)) continue;

    const rowId = sheetType === 'realestate'
      ? `re_${i}`
      : `other_${i}`;

    // ── Client ──
    const clientSheetId = `${sheetType}_client_${i}`;
    const { data: existingClient } = await sb.from('clients')
      .select('id').eq('organization_id', orgId).eq('sheet_row_id', clientSheetId).maybeSingle();

    const clientPayload = {
      name: clientName,
      address: fields.address || null,
      id_number: fields.idNumber || null,
      notes: fields.notes || null,
    };

    let clientId = existingClient?.id;
    if (!clientId) {
      const { data: inserted } = await sb.from('clients').insert({
        organization_id: orgId, sheet_row_id: clientSheetId, ...clientPayload,
      }).select('id').single();
      clientId = inserted?.id;
      if (clientId) stats.clients++;
    } else {
      await sb.from('clients').update(clientPayload).eq('id', clientId);
    }
    if (!clientId) continue;

    // ── Matter ──
    const lawyerId    = attorney ? (profileByName[attorney] || null) : null;
    const deliveryDate = parseDate(fields.deliveryDateRaw);
    const mappedStage  = STAGE_MAP[fields.stage] || (fields.stage || null);

    const matterPayload = {
      organization_id:      orgId,
      client_id:            clientId,
      title:                clientName,
      type:                 fields.mappedType,
      status:               'active',
      case_category:        sheetType,
      sheet_order:          i,
      responsible_lawyer_id: lawyerId,
      agreed_fee:           parseAmount(fields.feeRaw),
      fee_text:             fields.feeRaw || null,
      collected_amount:     parseAmount(fields.collectedRaw),
      balance_amount:       parseAmount(fields.balanceRaw),
      property_address:     fields.address || null,
      stage:                mappedStage,
      delivery_date:        deliveryDate,
      parcel:               fields.parcel || null,
      payment_status:       fields.paymentStatus || null,
      other_lawyer:         fields.otherLawyer || null,
      broker:               fields.broker || null,
      mortgage:             fields.mortgage || null,
      capital_gains:        fields.capitalGains || null,
      committee_status:     fields.committee || null,
      municipality_status:  fields.municipality || null,
      rami_status:          fields.rami || null,
      referral_source:      fields.referral || null,
      case_number:          fields.caseNumber || null,
      open_date:            parseDate(fields.openDateRaw),
      target_date:          parseDate(fields.targetDateRaw),
      documents:            fields.documents && fields.documents.length ? fields.documents : null,
      description:          fields.notes || null,
      sheet_row_id:         rowId,
    };
    // Strip nulls we don't want to overwrite type/category with on update edge-cases
    Object.keys(matterPayload).forEach((k) => matterPayload[k] === undefined && delete matterPayload[k]);

    const { data: existingMatter } = await sb.from('matters')
      .select('id').eq('organization_id', orgId).eq('sheet_row_id', rowId).maybeSingle();

    let matterId = existingMatter?.id;
    if (!matterId) {
      const { data: inserted } = await sb.from('matters').insert(matterPayload).select('id').single();
      matterId = inserted?.id;
      if (matterId) stats.matters++;
    } else {
      await sb.from('matters').update(matterPayload).eq('id', matterId);
    }

    // ── Delivery event (real-estate only) ──
    if (deliveryDate && matterId && sheetType === 'realestate') {
      const evSheetId = `delivery_${rowId}`;
      const { data: existingEv } = await sb.from('events')
        .select('id').eq('organization_id', orgId).eq('sheet_row_id', evSheetId).maybeSingle();

      const evPayload = {
        title: `מסירה – ${clientName}`,
        start_time: `${deliveryDate}T10:00:00`,
        assigned_to: lawyerId,
        notes: fields.notes || null,
      };
      if (!existingEv) {
        await sb.from('events').insert({
          organization_id: orgId, event_type: 'deadline',
          location: fields.address || null, matter_id: matterId,
          attendee_name: clientName, sheet_row_id: evSheetId, ...evPayload,
        });
        stats.events++;
      } else {
        await sb.from('events').update(evPayload).eq('id', existingEv.id);
      }
    }

    // ── Signing meetings parsed from notes (real-estate only) ──
    if (fields.notes && matterId && sheetType === 'realestate') {
      const signingEvents = extractSigningDates(fields.notes, clientName, fields.address, lawyerId, orgId, matterId, rowId);
      for (const ev of signingEvents) {
        const { data: existingEv } = await sb.from('events')
          .select('id').eq('organization_id', orgId).eq('sheet_row_id', ev.sheet_row_id).maybeSingle();
        if (!existingEv) { await sb.from('events').insert(ev); stats.events++; }
      }
    }
  }

  return stats;
}

// ─── Column extraction per sheet type ────────────────────────────────────────

function extractRealEstate(row) {
  return {
    attorney:        g(row, 'עו"ד מטפל', 'עו\'\'ד מטפל', 'עוד מטפל'),
    clientName:      g(row, 'שם התיק/לקוח', 'שם הלקוח', 'שם'),
    parcel:          g(row, 'גוש/חלקה'),
    address:         g(row, 'כתובת הנכס', 'כתובת'),
    notes:           g(row, 'הערות'),
    deliveryDateRaw: g(row, 'תאריך מסירה'),
    feeRaw:          g(row, 'שכ"ט (₪)', 'שכ\'\'ט (₪)', 'שכט'),
    paymentStatus:   g(row, 'סטטוס תשלום'),
    mortgage:        g(row, 'משכנתא'),
    capitalGains:    g(row, 'מס שבח'),
    committee:       g(row, 'וועדה', 'ועדה'),
    municipality:    g(row, 'עירייה/ארנונה'),
    otherLawyer:     g(row, 'עו"ד צד שני', 'עו\'\'ד צד שני'),
    broker:          g(row, 'מתווך'),
    // Stage lives in the "תאריך מסירה_1" column in the workbook
    stage:           cleanStage(g(row, 'תאריך מסירה_1', 'סטטוס/שלב', 'שלב', 'סטטוס')),
    collectedRaw:    g(row, 'נגבה (₪)'),
    balanceRaw:      g(row, 'יתרה (₪)'),
    rami:            g(row, 'פניה רמי', 'פנייה רמי'),
    mappedType:      'sale',
    idNumber:        '',
    referral:        '',
    caseNumber:      '',
    openDateRaw:     '',
    targetDateRaw:   '',
    documents:       [],
  };
}

function extractOther(row) {
  const caseType = g(row, 'סוג התיק');
  const docs = ['מסמך 1', 'מסמך 2', 'מסמך 3', 'מסמך 4']
    .map((k) => g(row, k)).filter(Boolean);
  return {
    caseNumber:      g(row, 'מס\' תיק', 'מס תיק'),
    clientName:      g(row, 'שם התיק/לקוח', 'שם הלקוח'),
    idNumber:        g(row, 'ת.ז./ח.פ.', 'ת.ז', 'ח.פ'),
    attorney:        g(row, 'עו"ד מטפל', 'עו\'\'ד מטפל'),
    otherLawyer:     g(row, 'צד שני'),
    referral:        g(row, 'מקור הפניה'),
    openDateRaw:     g(row, 'תאריך פתיחה'),
    targetDateRaw:   g(row, 'תאריך יעד'),
    feeRaw:          g(row, 'שכ"ט (₪)', 'שכ\'\'ט (₪)'),
    collectedRaw:    g(row, 'נגבה (₪)'),
    balanceRaw:      g(row, 'יתרה (₪)'),
    paymentStatus:   g(row, 'סטטוס תשלום'),
    notes:           g(row, 'הערות'),
    documents:       docs,
    mappedType:      TYPE_MAP_MATTERS[caseType] || 'other',
    // real-estate-only fields default empty
    parcel: '', address: '', deliveryDateRaw: '', mortgage: '',
    capitalGains: '', committee: '', municipality: '', broker: '',
    stage: '', rami: '',
  };
}

// "תאריך מסירה" sometimes leaks as a header value into the stage column — drop it
function cleanStage(v) {
  if (!v) return '';
  if (v === 'תאריך מסירה') return '';
  return v;
}

// ─── Extract signing meetings from notes ─────────────────────────────────────

function extractSigningDates(notes, clientName, address, lawyerId, orgId, matterId, rowId) {
  const events = [];
  const re = /חתימ[הת][^0-9]*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?:[^0-9]*(\d{1,2}:\d{2}))?/g;
  let idx = 0, m;
  while ((m = re.exec(notes)) !== null) {
    const [, d, mo, y, time] = m;
    const year = y ? (y.length === 2 ? '20' + y : y) : new Date().getFullYear();
    const dateStr = `${year}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    events.push({
      organization_id: orgId,
      title: `חתימה – ${clientName}`,
      start_time: `${dateStr}T${time || '10:00'}:00`,
      event_type: 'meeting',
      location: address || null,
      matter_id: matterId,
      attendee_name: clientName,
      notes,
      assigned_to: lawyerId,
      sheet_row_id: `signing_${rowId}_${idx++}`,
    });
  }
  return events;
}

// ─── Tasks sync ───────────────────────────────────────────────────────────────

async function syncTasks(sb, orgId, profileByName, rows) {
  let count = 0;

  for (const row of rows) {
    const taskNum  = g(row, 'מס\' משימה', 'מס משימה');
    const taskType = g(row, 'סוג משימה');
    const caseNum  = g(row, 'מס\' תיק', 'מס תיק');
    const desc     = g(row, 'תיאור המשימה', 'תיאור');
    const assigned = g(row, 'אחראי');
    const dueDateRaw  = g(row, 'תאריך יעד');
    const doneDateRaw = g(row, 'תאריך השלמה');
    const status   = g(row, 'סטטוס');
    const priority = g(row, 'עדיפות');
    const notes    = g(row, 'הערות');

    if (!desc || !taskNum) continue;

    const sheetRowId = taskNum;
    const assignedId = assigned ? (profileByName[assigned] || null) : null;

    const priorityMap = { 'גבוהה': 'high', 'בינונית': 'medium', 'נמוכה': 'low' };
    const statusMap   = { 'פתוח': 'open', 'הושלם': 'done', 'מבוטל': 'cancelled' };

    const payload = {
      organization_id: orgId,
      task_number: taskNum,
      task_type: taskType || null,
      description: desc,
      assigned_to: assignedId,
      due_date: parseDate(dueDateRaw),
      completed_at: parseDate(doneDateRaw),
      status: statusMap[status] || 'open',
      priority: priorityMap[priority] || 'medium',
      notes: notes || null,
      sheet_row_id: sheetRowId,
    };

    if (caseNum) {
      const { data: matter } = await sb.from('matters')
        .select('id').eq('organization_id', orgId).eq('sheet_row_id', caseNum).maybeSingle();
      if (matter) payload.matter_id = matter.id;
    }

    const { data: existing } = await sb.from('tasks')
      .select('id').eq('organization_id', orgId).eq('sheet_row_id', sheetRowId).maybeSingle();

    if (!existing) {
      await sb.from('tasks').insert(payload);
      count++;
    } else {
      await sb.from('tasks').update(payload).eq('id', existing.id);
    }
  }

  return count;
}
