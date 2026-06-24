import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { DEFAULT_EXPENSES_DRIVE_FOLDER_ID } from '@/lib/drive';
import { saveGmailReceiptToDrive } from '@/lib/expenseDriveSave';

export const dynamic = 'force-dynamic';

async function recomputeCell(sb, orgId, section, item, year, month) {
  const { data } = await sb.from('expense_documents')
    .select('amount, payer, status')
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);

  const total = (data || [])
    .filter(row => row.status !== 'removed')
    .filter(row => (row.payer || 'office') === 'office')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  await sb.from('office_expenses').upsert({
    organization_id: orgId,
    section,
    item_name: item,
    year,
    month,
    amount: total,
    is_itemized: true,
  }, { onConflict: 'organization_id,section,item_name,year,month' });

  return total;
}

function monthParts(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return { docDate: safe.toISOString().slice(0, 10), year: safe.getFullYear(), month: safe.getMonth() + 1 };
}

async function findDuplicate(sb, orgId, { gmailId, vendor, amount, docDate, subject }) {
  if (gmailId) {
    const { data: byGmail } = await sb.from('expense_documents')
      .select('id,status')
      .eq('organization_id', orgId)
      .eq('gmail_message_id', gmailId)
      .neq('status', 'removed')
      .maybeSingle();
    if (byGmail?.id) return { id: byGmail.id, reason: 'duplicate_gmail_message' };
  }
  if (amount && docDate && vendor) {
    const { data: byFingerprint } = await sb.from('expense_documents')
      .select('id,status')
      .eq('organization_id', orgId)
      .eq('doc_date', docDate)
      .eq('vendor', vendor)
      .eq('amount', Number(amount || 0))
      .neq('status', 'removed')
      .limit(1);
    if (byFingerprint?.[0]?.id) return { id: byFingerprint[0].id, reason: 'duplicate_vendor_date_amount' };
  }
  if (subject && docDate) {
    const { data: byName } = await sb.from('expense_documents')
      .select('id,status')
      .eq('organization_id', orgId)
      .eq('doc_date', docDate)
      .ilike('file_name', `%${String(subject).slice(0, 40)}%`)
      .neq('status', 'removed')
      .limit(1);
    if (byName?.[0]?.id) return { id: byName[0].id, reason: 'duplicate_subject_date' };
  }
  return null;
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.suggestions) ? body.suggestions : [];
  if (!rows.length) return Response.json({ error: 'לא התקבלו קבלות לייבוא' }, { status: 400 });

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email, drive_expenses_folder_id')
    .eq('id', profile.organization_id).single();

  const imported = [];
  const skipped = [];
  const errors = [];
  const driveWarnings = [];

  for (const row of rows) {
    const gmailId = row.gmail_id || row.gmail_message_id;
    if (!gmailId) { skipped.push({ reason: 'missing_gmail_id' }); continue; }

    const section = row.section || 'office';
    const item = row.item || row.matched_vendor || row.expense_item || 'חשבוניות מספקים';
    const { docDate, year, month } = monthParts(row.date || row.doc_date);
    const gmailLink = row.gmail_link || `https://mail.google.com/mail/#all/${gmailId}`;
    const vendor = row.matched_vendor || row.vendor || item;
    const amount = Number(row.amount || 0);

    const duplicate = await findDuplicate(sb, profile.organization_id, { gmailId, vendor, amount, docDate, subject: row.subject });
    if (duplicate) { skipped.push({ gmail_id: gmailId, ...duplicate }); continue; }

    let fileUrl = gmailLink;
    let fileName = row.file_name || row.subject || `${gmailId}.gmail`;
    let fileType = 'gmail_receipt';
    let driveNote = null;

    try {
      const driveResult = await saveGmailReceiptToDrive({ org, gmailId, row, docDate, year, month, topic: item, vendor });
      if (driveResult.url) {
        fileUrl = driveResult.url;
        fileName = driveResult.fileName || fileName;
        fileType = driveResult.source === 'gmail_body' ? 'drive_email_body' : 'drive_receipt';
      } else if (driveResult.note) {
        driveNote = driveResult.note;
        driveWarnings.push({ gmail_id: gmailId, warning: driveResult.note });
      }
    } catch (e) {
      driveNote = `לא נשמר בדרייב: ${e.message}`;
      driveWarnings.push({ gmail_id: gmailId, warning: e.message });
    }

    const description = [
      row.description || row.subject || 'קבלה מגימייל',
      row.card_last4 ? `כרטיס: ${row.card_last4}` : null,
      row.payment_confirmation ? `אסמכתא: ${row.payment_confirmation}` : null,
      row.subject ? `נושא: ${row.subject}` : null,
      row.from ? `שולח: ${row.from}` : null,
      driveNote,
      `קישור למייל: ${gmailLink}`,
    ].filter(Boolean).join('\n');

    const { data, error } = await sb.from('expense_documents').insert({
      organization_id: profile.organization_id,
      uploaded_by: profile.id,
      amount,
      vendor,
      description,
      category: row.category || 'general',
      doc_date: docDate,
      month: docDate.slice(0, 7),
      status: 'linked',
      file_url: fileUrl,
      file_name: fileName,
      file_type: fileType,
      expense_item: item,
      expense_section: section,
      expense_year: year,
      expense_month_num: month,
      gmail_message_id: gmailId,
      payer: 'office',
    }).select('id').single();

    if (error) { errors.push({ gmail_id: gmailId, error: error.message }); continue; }
    await recomputeCell(sb, profile.organization_id, section, item, year, month);
    imported.push({ id: data.id, gmail_id: gmailId, item, amount, date: docDate, file_url: fileUrl, saved_to_drive: fileUrl !== gmailLink });
  }

  return Response.json({ imported, skipped, errors, driveWarnings, drive_folder_id: org?.drive_expenses_folder_id || DEFAULT_EXPENSES_DRIVE_FOLDER_ID });
}
