import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, forbidden } from '@/lib/adminAuth';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// --- Helpers -------------------------------------------------------------

// Normalize a header string: trim, collapse whitespace, strip quotes/punctuation
function normHeader(s) {
  return String(s == null ? '' : s)
    .replace(/[‎‏]/g, '') // strip RTL/LTR marks
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Field detection: ordered list of [field, [keywords...]].
// Matching is includes-based on normalized Hebrew headers. First match wins.
const FIELD_KEYWORDS = [
  ['invoice_number', ['מספר חשבונית', "מס' חשבונית", 'מס חשבונית', 'חשבונית מס', 'מספר חשבון', 'invoice', 'number']],
  ['client_name', ['שם לקוח', 'שם הלקוח', 'לקוח', 'client', 'customer']],
  ['issue_date', ['תאריך הפקה', 'תאריך הנפקה', 'תאריך חשבונית', 'תאריך', 'date']],
  ['due_date', ['תאריך פירעון', 'תאריך לתשלום', 'מועד תשלום', 'due']],
  ['vat', ['מע"מ', 'מעמ', 'מע״מ', 'vat']],
  ['total', ['סכום כולל', 'סה"כ כולל', 'סה״כ', 'סהכ', 'סכום לתשלום', 'total', 'amount', 'סכום']],
  ['subtotal', ['סכום לפני', 'לפני מע', 'subtotal', 'net']],
  ['status', ['סטטוס', 'מצב', 'status']],
  ['notes', ['הערות', 'תיאור', 'notes', 'description']],
];

// Build a mapping { field: headerName } from the row headers.
function detectColumns(headers) {
  const mapping = {};
  const used = new Set();
  const normed = headers.map((h) => ({ raw: h, norm: normHeader(h).toLowerCase() }));

  for (const [field, keywords] of FIELD_KEYWORDS) {
    for (const kw of keywords) {
      const k = normHeader(kw).toLowerCase();
      const hit = normed.find((h) => !used.has(h.raw) && h.norm && h.norm.includes(k));
      if (hit) {
        mapping[field] = hit.raw;
        used.add(hit.raw);
        break;
      }
    }
  }
  return mapping;
}

// Excel serial date -> ISO yyyy-mm-dd (Excel epoch 1899-12-30)
function excelSerialToISO(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (value == null || value === '') return null;

  // Excel serial number
  if (typeof value === 'number') {
    return excelSerialToISO(value);
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const s = String(value).trim();
  if (!s) return null;

  // Already ISO
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // dd/mm/yyyy or dd.mm.yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let [, dd, mm, yyyy] = m;
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  // Numeric string serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    return excelSerialToISO(Number(s));
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseAmount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  let s = String(value).trim();
  s = s.replace(/[₪$€,\s]/g, '').replace(/[^\d.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

const STATUS_MAP = {
  'שולמה': 'paid', 'שולם': 'paid', 'paid': 'paid',
  'נשלחה': 'sent', 'נשלח': 'sent', 'sent': 'sent',
  'פתוחה': 'open', 'פתוח': 'open', 'open': 'open',
  'פיגור': 'overdue', 'בפיגור': 'overdue', 'overdue': 'overdue',
  'טיוטה': 'draft', 'draft': 'draft',
  'בוטלה': 'cancelled', 'מבוטל': 'cancelled', 'cancelled': 'cancelled',
};

function normStatus(value) {
  if (!value) return null;
  const s = normHeader(value).toLowerCase();
  for (const [k, v] of Object.entries(STATUS_MAP)) {
    if (s.includes(normHeader(k).toLowerCase())) return v;
  }
  return null;
}

// Map a raw spreadsheet row -> detected invoice fields
function mapRow(row, mapping) {
  const get = (field) => (mapping[field] != null ? row[mapping[field]] : undefined);

  const totalRaw = parseAmount(get('total'));
  const subtotalRaw = parseAmount(get('subtotal'));
  const vatRaw = parseAmount(get('vat'));

  let subtotal = subtotalRaw;
  let vatAmount = vatRaw;
  let total = totalRaw;

  // Derive missing values when possible (default VAT 18%)
  if (subtotal == null && total != null) {
    if (vatAmount != null) subtotal = Math.round((total - vatAmount) * 100) / 100;
    else subtotal = Math.round((total / 1.18) * 100) / 100;
  }
  if (subtotal == null && total == null && vatAmount == null) {
    subtotal = null;
  }
  if (vatAmount == null && subtotal != null && total != null) {
    vatAmount = Math.round((total - subtotal) * 100) / 100;
  }
  if (subtotal != null && vatAmount == null) {
    vatAmount = Math.round(subtotal * 18) / 100;
  }
  if (total == null && subtotal != null) {
    total = Math.round((subtotal + (vatAmount || 0)) * 100) / 100;
  }

  const invNum = get('invoice_number');
  return {
    invoice_number: invNum == null ? '' : String(invNum).trim(),
    client_name: get('client_name') == null ? '' : String(get('client_name')).trim(),
    issue_date: parseDate(get('issue_date')),
    due_date: parseDate(get('due_date')),
    subtotal,
    vat_amount: vatAmount,
    total,
    status: normStatus(get('status')) || 'sent',
    notes: get('notes') == null ? null : String(get('notes')).trim() || null,
  };
}

// --- Route ---------------------------------------------------------------

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return forbidden();

  const { searchParams } = new URL(request.url);
  const previewOnly = searchParams.get('preview') === 'true';

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ success: false, error: 'לא נבחר קובץ' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch (e) {
      return Response.json({ success: false, error: 'לא ניתן לקרוא את קובץ האקסל. ודא שזהו קובץ ‎.xlsx/.xls תקין.' }, { status: 400 });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return Response.json({ success: false, error: 'הקובץ אינו מכיל גיליונות' }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

    if (!rows.length) {
      return Response.json({ success: false, error: 'לא נמצאו שורות נתונים בגיליון' }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);
    const mapping = detectColumns(headers);

    if (!mapping.invoice_number && !mapping.client_name) {
      return Response.json({
        success: false,
        error: 'לא זוהו עמודות מתאימות (מספר חשבונית / שם לקוח). בדוק את כותרות הקובץ.',
        detected_columns: mapping,
        headers,
      }, { status: 400 });
    }

    const mappedRows = rows.map((r) => mapRow(r, mapping));

    // --- Preview mode: parse only, no DB writes ---
    if (previewOnly) {
      return Response.json({
        success: true,
        preview_only: true,
        parsed_rows: mappedRows.length,
        detected_columns: mapping,
        headers,
        preview: mappedRows.slice(0, 20),
      });
    }

    // --- Import mode ---
    const sb = createServiceClient();
    const orgId = profile.organization_id;
    if (!orgId) {
      return Response.json({ success: false, error: 'לא נמצא ארגון במערכת' }, { status: 404 });
    }

    // Load existing clients (name -> id) and existing invoice numbers for dedupe
    const [{ data: existingClients }, { data: existingInvoices }] = await Promise.all([
      sb.from('clients').select('id, name').eq('organization_id', orgId),
      sb.from('invoices').select('number').eq('organization_id', orgId),
    ]);

    const clientByName = new Map();
    (existingClients || []).forEach((c) => {
      if (c.name) clientByName.set(c.name.trim().toLowerCase(), c.id);
    });
    const existingInvNums = new Set(
      (existingInvoices || []).map((i) => String(i.number || '').trim().toLowerCase()).filter(Boolean)
    );

    let imported = 0;
    let skipped = 0;
    const errors = [];
    const seenInBatch = new Set();

    for (let i = 0; i < mappedRows.length; i++) {
      const rowNum = i + 2; // +1 header, +1 to 1-based
      const m = mappedRows[i];

      try {
        // Skip empty rows
        if (!m.invoice_number && !m.client_name && m.total == null) {
          continue;
        }

        const invKey = m.invoice_number.trim().toLowerCase();

        // Dedupe against DB and within this batch
        if (invKey && (existingInvNums.has(invKey) || seenInBatch.has(invKey))) {
          skipped++;
          continue;
        }
        if (invKey) seenInBatch.add(invKey);

        // Match or create client
        let clientId = null;
        if (m.client_name) {
          const key = m.client_name.toLowerCase();
          if (clientByName.has(key)) {
            clientId = clientByName.get(key);
          } else {
            const { data: newClient, error: cErr } = await sb
              .from('clients')
              .insert({ organization_id: orgId, name: m.client_name })
              .select('id')
              .single();
            if (cErr) {
              errors.push(`שורה ${rowNum}: שגיאה ביצירת לקוח "${m.client_name}" — ${cErr.message}`);
              continue;
            }
            clientId = newClient.id;
            clientByName.set(key, clientId);
          }
        }

        const subtotal = m.subtotal != null ? m.subtotal : 0;
        const vatAmount = m.vat_amount != null ? m.vat_amount : Math.round(subtotal * 18) / 100;
        const total = m.total != null ? m.total : Math.round((subtotal + vatAmount) * 100) / 100;
        const invoiceNumber = m.invoice_number || `IMP-${Date.now()}-${i}`;

        const validStatus = ['open', 'paid', 'cancelled'];
        const payload = {
          organization_id: orgId,
          client_id: clientId,
          number: invoiceNumber,
          client_name: m.client_name || '',
          amount: total,
          issue_date: m.issue_date || new Date().toISOString().slice(0, 10),
          due_date: m.due_date || new Date().toISOString().slice(0, 10),
          status: validStatus.includes(m.status) ? m.status : 'open',
          notes: m.notes,
        };

        const { error: insErr } = await sb.from('invoices').insert(payload);
        if (insErr) {
          errors.push(`שורה ${rowNum}: שגיאה בשמירת חשבונית — ${insErr.message}`);
          continue;
        }

        if (invKey) existingInvNums.add(invKey);
        imported++;
      } catch (e) {
        errors.push(`שורה ${rowNum}: ${e.message || 'שגיאה לא ידועה'}`);
      }
    }

    return Response.json({
      success: true,
      parsed_rows: mappedRows.length,
      imported,
      skipped,
      errors,
      detected_columns: mapping,
      preview: mappedRows.slice(0, 5),
    });
  } catch (e) {
    return Response.json({ success: false, error: `שגיאה בעיבוד הקובץ: ${e.message || 'שגיאה לא ידועה'}` }, { status: 500 });
  }
}
