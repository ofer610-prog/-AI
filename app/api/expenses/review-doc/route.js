import { createClient } from '@/lib/supabase/server';
import { saveGmailReceiptToDrive } from '@/lib/expenseDriveSave';

export const dynamic = 'force-dynamic';

async function recompute(sb, orgId, section, item, year, month) {
  const { data } = await sb.from('expense_documents')
    .select('amount,payer,status')
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);
  const total = (data || [])
    .filter(x => x.status !== 'removed')
    .filter(x => (x.payer || 'office') === 'office')
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  await sb.from('office_expenses').upsert({ organization_id: orgId, section, item_name: item, year, month, amount: total, is_itemized: true }, { onConflict: 'organization_id,section,item_name,year,month' });
}

export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await sb.from('profiles').select('id,organization_id,role').eq('id', user.id).single();
  if (!['admin','accountant'].includes(profile?.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = body.id;
  const action = body.action;
  if (!id || !action) return Response.json({ error: 'id and action required' }, { status: 400 });

  if (action === 'reject') {
    const { data, error } = await sb.from('expense_documents').update({ status: 'removed' }).eq('id', id).eq('organization_id', profile.organization_id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, doc: data });
  }

  if (action === 'edit') {
    // עדכון שדות בלבד ללא שינוי סטטוס
    const { data: oldDoc } = await sb.from('expense_documents')
      .select('id,status').eq('id', id).eq('organization_id', profile.organization_id).single();
    if (!oldDoc) return Response.json({ error: 'לא נמצא' }, { status: 404 });
    const docDate = body.doc_date || new Date().toISOString().slice(0, 10);
    const date = new Date(docDate);
    const safe = Number.isNaN(date.getTime()) ? new Date() : date;
    const year = Number(body.expense_year || safe.getFullYear());
    const monthNum = Number(body.expense_month_num || (safe.getMonth() + 1));
    const updates = {
      doc_date: docDate, month: String(docDate).slice(0, 7),
      expense_year: year, expense_month_num: monthNum,
      vendor: body.vendor || null,
      amount: body.amount === undefined ? undefined : Number(body.amount || 0),
      vat: body.vat === undefined ? undefined : (body.vat === '' ? null : Number(body.vat)),
      ...(body.expense_item ? { expense_item: body.expense_item } : {}),
      ...(body.expense_section ? { expense_section: body.expense_section } : {}),
    };
    Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
    const { data, error } = await sb.from('expense_documents').update(updates).eq('id', id).eq('organization_id', profile.organization_id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, doc: data });
  }

  if (action === 'approve') {
    const docDate = body.doc_date || new Date().toISOString().slice(0, 10);
    const date = new Date(docDate);
    const safe = Number.isNaN(date.getTime()) ? new Date() : date;
    const year = Number(body.expense_year || safe.getFullYear());
    const monthNum = Number(body.expense_month_num || (safe.getMonth() + 1));
    // Fetch existing doc to fall back on its expense_item if not provided
    const { data: existingDoc } = await sb.from('expense_documents')
      .select('id,file_url,file_name,gmail_message_id,description,expense_item,expense_section')
      .eq('id', id).eq('organization_id', profile.organization_id).single();
    const item = body.expense_item || body.item || existingDoc?.expense_item;
    if (!item) return Response.json({ error: 'יש לבחור תת נושא לפני אישור' }, { status: 400 });
    const section = body.expense_section || existingDoc?.expense_section || 'office';

    let fileUrl = existingDoc?.file_url || null;
    let fileName = existingDoc?.file_name || null;
    let fileType = undefined;
    let driveNote = null;

    if (existingDoc?.gmail_message_id) {
      try {
        const { data: org } = await sb.from('organizations')
          .select('gmail_refresh_token,drive_expenses_folder_id')
          .eq('id', profile.organization_id)
          .single();
        const saved = await saveGmailReceiptToDrive({
          org,
          gmailId: existingDoc.gmail_message_id,
          row: { subject: existingDoc.file_name, description: existingDoc.description, amount: body.amount },
          docDate,
          year,
          month: monthNum,
          topic: item,
          vendor: body.vendor || item,
        });
        if (saved.url) {
          fileUrl = saved.url;
          fileName = saved.fileName || fileName;
          fileType = saved.source === 'gmail_body' ? 'drive_email_body' : 'drive_receipt';
        } else if (saved.note) driveNote = saved.note;
      } catch (e) {
        driveNote = `לא נשמר בדרייב: ${e.message}`;
      }
    }

    const updates = {
      status: 'approved',
      expense_item: item,
      expense_section: section,
      expense_year: year,
      expense_month_num: monthNum,
      doc_date: docDate,
      month: String(docDate).slice(0, 7),
      vendor: body.vendor || item,
      amount: body.amount === undefined ? 0 : Number(body.amount || 0),
      vat: body.vat === '' ? null : (body.vat === undefined ? undefined : Number(body.vat)),
      category: body.category || 'general',
      accountant_notes: body.accountant_notes || null,
      ...(fileUrl ? { file_url: fileUrl } : {}),
      ...(fileName ? { file_name: fileName } : {}),
      ...(fileType ? { file_type: fileType } : {}),
      ...(driveNote ? { description: [existingDoc?.description, driveNote].filter(Boolean).join('\n') } : {}),
    };
    Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
    const { data, error } = await sb.from('expense_documents').update(updates).eq('id', id).eq('organization_id', profile.organization_id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await recompute(sb, profile.organization_id, section, item, year, monthNum);
    return Response.json({ ok: true, doc: data });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
