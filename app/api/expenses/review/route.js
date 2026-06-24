import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { extractDriveFileId, moveFileToTopicFolder } from '@/lib/drive';

export const dynamic = 'force-dynamic';

// GET /api/expenses/review — list all docs with status=needs_review
export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data, error } = await sb.from('expense_documents')
    .select('id, vendor, description, amount, doc_date, file_url, file_name, gmail_message_id, expense_item, expense_section, expense_year, expense_month_num, created_at')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'needs_review')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ items: data || [] });
}

// PATCH /api/expenses/review — admin classifies a pending item
// Body: { id, action: 'approve'|'reject', expense_item?, expense_section?, vendor?, amount?, doc_date? }
export async function PATCH(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { id, action } = body;
  if (!id || !action) return Response.json({ error: 'id ו-action נדרשים' }, { status: 400 });

  const sb = createServiceClient();

  if (action === 'reject') {
    const { error } = await sb.from('expense_documents')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('organization_id', profile.organization_id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, action: 'rejected' });
  }

  if (action === 'approve') {
    const { expense_item, expense_section = 'office', vendor, amount, doc_date } = body;
    if (!expense_item) return Response.json({ error: 'expense_item נדרש לאישור' }, { status: 400 });

    const updates = {
      status: 'linked',
      expense_item,
      expense_section,
    };
    if (vendor) updates.vendor = vendor;
    if (amount !== undefined) updates.amount = Number(amount);
    if (doc_date) {
      updates.doc_date = doc_date;
      updates.month = doc_date.slice(0, 7);
      updates.expense_year = new Date(doc_date).getFullYear();
      updates.expense_month_num = new Date(doc_date).getMonth() + 1;
    }

    const { data: doc, error } = await sb.from('expense_documents')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .select('expense_section, expense_item, expense_year, expense_month_num, file_url')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Move the Drive file to the correct topic folder (best-effort, non-blocking)
    const fileId = extractDriveFileId(doc.file_url);
    if (fileId && doc.expense_year && doc.expense_month_num) {
      const { data: org } = await sb.from('organizations')
        .select('gmail_refresh_token, drive_expenses_folder_id')
        .eq('id', profile.organization_id).single();
      if (org?.gmail_refresh_token) {
        moveFileToTopicFolder({
          refreshToken: org.gmail_refresh_token,
          rootFolderId: org.drive_expenses_folder_id || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID,
          fileId,
          year: doc.expense_year,
          month: doc.expense_month_num,
          topic: doc.expense_item,
        }).catch(() => {}); // fire-and-forget
      }
    }

    // Recompute cell totals after classification
    const { data: allDocs } = await sb.from('expense_documents')
      .select('amount, payer')
      .eq('organization_id', profile.organization_id)
      .eq('expense_section', doc.expense_section)
      .eq('expense_item', doc.expense_item)
      .eq('expense_year', doc.expense_year)
      .eq('expense_month_num', doc.expense_month_num);

    const total = (allDocs || [])
      .filter(r => (r.payer || 'office') === 'office')
      .reduce((s, r) => s + Number(r.amount || 0), 0);

    await sb.from('office_expenses').upsert({
      organization_id: profile.organization_id,
      section: doc.expense_section,
      item_name: doc.expense_item,
      year: doc.expense_year,
      month: doc.expense_month_num,
      amount: total,
      is_itemized: true,
    }, { onConflict: 'organization_id,section,item_name,year,month' });

    return Response.json({ ok: true, action: 'approved', expense_item });
  }

  return Response.json({ error: 'action חייב להיות approve או reject' }, { status: 400 });
}
