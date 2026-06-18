import { createClient } from '@/lib/supabase/server';

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
  const { data: profile } = await sb.from('profiles').select('organization_id,role').eq('id', user.id).single();
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

  if (action === 'approve') {
    const docDate = body.doc_date || new Date().toISOString().slice(0, 10);
    const date = new Date(docDate);
    const safe = Number.isNaN(date.getTime()) ? new Date() : date;
    const year = Number(body.expense_year || safe.getFullYear());
    const monthNum = Number(body.expense_month_num || (safe.getMonth() + 1));
    const item = body.expense_item || body.item;
    if (!item) return Response.json({ error: 'יש לבחור תת נושא לפני אישור' }, { status: 400 });
    const section = body.expense_section || 'office';
    const updates = {
      status: 'linked',
      expense_item: item,
      expense_section: section,
      expense_year: year,
      expense_month_num: monthNum,
      doc_date: docDate,
      month: String(docDate).slice(0, 7),
      vendor: body.vendor || item,
      amount: body.amount === undefined ? 0 : Number(body.amount || 0),
      category: body.category || 'general',
      accountant_notes: body.accountant_notes || null,
    };
    const { data, error } = await sb.from('expense_documents').update(updates).eq('id', id).eq('organization_id', profile.organization_id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await recompute(sb, profile.organization_id, section, item, year, monthNum);
    return Response.json({ ok: true, doc: data });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
