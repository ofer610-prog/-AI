/**
 * POST /api/expenses/import-scan
 * Saves a receipt scan result (from /api/expenses/scan-receipt) directly into
 * expense_documents and recomputes the office_expenses cell.
 *
 * Body: {
 *   scan: { merchant, date, total, vat_amount, subtotal, document_number,
 *           allocation_number, category, document_type, vat_deductible },
 *   section: string,   // e.g. "office"
 *   item:    string,   // expense item name, e.g. "דלק"
 *   year:    number,
 *   month:   number,
 * }
 */
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

async function recomputeCell(sb, orgId, section, item, year, month) {
  const { data: lines } = await sb.from('expense_documents')
    .select('amount, payer')
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);

  const sum = (lines || [])
    .filter(l => (l.payer || 'office') === 'office')
    .reduce((s, l) => s + Number(l.amount || 0), 0);

  await sb.from('office_expenses').upsert({
    organization_id: orgId,
    section, item_name: item, year, month, amount: sum,
  }, { onConflict: 'organization_id,section,item_name,year,month' });

  return sum;
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { scan, section, item, year, month } = body;

  if (!scan || !section || !item || !year || !month) {
    return Response.json({ error: 'scan, section, item, year, month required' }, { status: 400 });
  }

  const vendor = scan.merchant?.name_he || scan.merchant?.name_en || item;
  const amount = Number(scan.total || 0);
  const docDate = scan.date || `${year}-${String(month).padStart(2, '0')}-01`;

  const sb = createServiceClient();

  const { data, error } = await sb.from('expense_documents').insert({
    organization_id:   profile.organization_id,
    uploaded_by:       profile.id,
    expense_section:   section,
    expense_item:      item,
    expense_year:      Number(year),
    expense_month_num: Number(month),
    month:             docDate.slice(0, 7),
    amount,
    vendor,
    description:       `סריקת קבלה — ${scan.document_type || 'מסמך'} מס' ${scan.document_number || '—'}`,
    doc_date:          docDate,
    category:          scan.category || 'general',
    vat_deductible:    scan.vat_deductible ?? true,
    allocation_number: scan.allocation_number || null,
    supplier_type:     scan.merchant?.vat_registration ? 'registered' : null,
    payer:             'office',
    status:            'approved',
  }).select('id, amount, vendor').single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const total = await recomputeCell(sb, profile.organization_id, section, item, Number(year), Number(month));
  return Response.json({ ok: true, doc: data, newCellTotal: total }, { status: 201 });
}
