import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/approve-draft
 * Body: { id, number?, client_name?, amount?, issue_date?, due_date?, notes? }
 *
 * Converts a bank-generated draft invoice into a real invoice:
 * - Assigns a real invoice number (sequential if not provided)
 * - Removes the draft marker from notes
 * - Status remains 'open'
 */
export async function POST(request) {
  try {
    const sb = createServiceClient();
    const body = await request.json();
    const { id, ...overrides } = body;
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });

    // Load the draft
    const { data: inv, error: invErr } = await sb.from('invoices').select('*').eq('id', id).single();
    if (invErr || !inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    // Generate next real invoice number if not provided
    let number = overrides.number || inv.number;
    if (!number || number.startsWith('DRAFT-')) {
      const { data: lastInv } = await sb
        .from('invoices')
        .select('number')
        .eq('organization_id', inv.organization_id)
        .not('number', 'like', 'DRAFT-%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const lastNum = lastInv?.number ? parseInt(lastInv.number, 10) : 0;
      number = String(isNaN(lastNum) ? Date.now() : lastNum + 1).padStart(5, '0');
    }

    // Clean notes: remove draft marker
    const cleanNotes = (overrides.notes ?? inv.notes ?? '')
      .replace('[טיוטה - ממתין לאישור]\n', '')
      .trim() || null;

    const update = {
      number,
      client_name:  overrides.client_name  ?? inv.client_name,
      client_id:    overrides.client_id    ?? inv.client_id,
      amount:       overrides.amount       ?? inv.amount,
      issue_date:   overrides.issue_date   ?? inv.issue_date,
      due_date:     overrides.due_date     ?? inv.due_date,
      status:       'open',
      notes:        cleanNotes,
    };

    const { data: updated, error: updErr } = await sb
      .from('invoices').update(update).eq('id', id).select().single();
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

    return Response.json({ success: true, invoice: updated });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
