import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

async function recomputeCell(sb, orgId, section, item, year, month) {
  const { data } = await sb.from('expense_documents')
    .select('amount, payer')
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);

  const total = (data || [])
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
  return {
    docDate: safe.toISOString().slice(0, 10),
    year: safe.getFullYear(),
    month: safe.getMonth() + 1,
  };
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.suggestions) ? body.suggestions : [];
  if (!rows.length) return Response.json({ error: 'לא התקבלו קבלות לייבוא' }, { status: 400 });

  const sb = createServiceClient();
  const imported = [];
  const skipped = [];
  const errors = [];

  for (const row of rows) {
    const gmailId = row.gmail_id || row.gmail_message_id;
    if (!gmailId) { skipped.push({ reason: 'missing_gmail_id' }); continue; }

    const { data: exists } = await sb.from('expense_documents')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('gmail_message_id', gmailId)
      .maybeSingle();
    if (exists?.id) { skipped.push({ gmail_id: gmailId, reason: 'duplicate' }); continue; }

    const section = row.section || 'office';
    const item = row.item || row.matched_vendor || 'חשבוניות מספקים';
    const { docDate, year, month } = monthParts(row.date || row.doc_date);
    const gmailLink = row.gmail_link || `https://mail.google.com/mail/#all/${gmailId}`;
    const description = [
      row.description || row.subject || 'קבלה מגימייל',
      row.payment_confirmation ? `אסמכתא: ${row.payment_confirmation}` : null,
      row.subject ? `נושא: ${row.subject}` : null,
      row.from ? `שולח: ${row.from}` : null,
      `קישור למייל: ${gmailLink}`,
    ].filter(Boolean).join('\n');

    const { data, error } = await sb.from('expense_documents').insert({
      organization_id: profile.organization_id,
      uploaded_by: profile.id,
      amount: Number(row.amount || 0),
      vendor: row.matched_vendor || row.vendor || item,
      description,
      category: row.category || 'general',
      doc_date: docDate,
      month: docDate.slice(0, 7),
      status: 'linked',
      file_url: gmailLink,
      file_name: row.file_name || row.subject || `${gmailId}.gmail`,
      file_type: 'gmail_receipt',
      expense_item: item,
      expense_section: section,
      expense_year: year,
      expense_month_num: month,
      gmail_message_id: gmailId,
      payer: 'office',
    }).select('id').single();

    if (error) { errors.push({ gmail_id: gmailId, error: error.message }); continue; }
    await recomputeCell(sb, profile.organization_id, section, item, year, month);
    imported.push({ id: data.id, gmail_id: gmailId, item, amount: Number(row.amount || 0), date: docDate });
  }

  return Response.json({ imported, skipped, errors });
}
