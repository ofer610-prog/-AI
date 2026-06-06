import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/bank/unmatched
 * Returns bank credits that have no matching invoice.
 * For each credit we also suggest candidate invoices by close amount (±10%).
 *
 * PATCH /api/bank/unmatched
 * Body: { id, action: 'match'|'dismiss', invoice_id? }
 * Marks a bank transaction as matched (optionally to an invoice) or dismissed.
 */

export async function GET(request) {
  try {
    const userSb = await createClient();
    const { data: { user } } = await userSb.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await userSb.from('profiles').select('organization_id, role').eq('id', user.id).single();
    if (!profile || !['admin','accountant'].includes(profile.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sb    = createServiceClient();
    const orgId = profile.organization_id;

    // Credits with pending alert status (no invoice matched yet)
    let { data: credits, error } = await sb
      .from('bank_transactions')
      .select('*')
      .eq('organization_id', orgId)
      .gt('amount', 0)
      .order('date', { ascending: false })
      .limit(200);

    if (error) {
      // Table may not have alert_status yet — fall back to all credits
      const { data: all } = await sb
        .from('bank_transactions')
        .select('*')
        .eq('organization_id', orgId)
        .gt('amount', 0)
        .order('date', { ascending: false })
        .limit(200);
      credits = (all || []).filter((c) => !c.matched_invoice_id && !c.matched_income_id);
    } else {
      credits = (credits || []).filter(
        (c) => !c.matched_invoice_id && !c.matched_income_id && c.alert_status !== 'dismissed'
      );
    }

    if (!credits.length) return Response.json({ alerts: [] });

    // Load open/paid invoices from the last 90 days for matching suggestions
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: invoices } = await sb
      .from('invoices')
      .select('id, number, client_name, amount, issue_date, due_date, status')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gte('issue_date', ninetyDaysAgo);

    const invList = invoices || [];

    // For each credit, find candidate invoices within ±10% amount
    const alerts = credits.map((credit) => {
      const candidates = invList
        .filter((inv) => {
          const diff = Math.abs(inv.amount - credit.amount) / Math.max(credit.amount, 1);
          return diff <= 0.10; // within 10%
        })
        .slice(0, 3);

      return {
        ...credit,
        candidate_invoices: candidates,
        has_match_candidate: candidates.length > 0,
      };
    });

    return Response.json({ alerts });
  } catch (err) {
    console.error('bank/unmatched GET:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const userSb = await createClient();
    const { data: { user } } = await userSb.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await userSb.from('profiles').select('organization_id, role').eq('id', user.id).single();
    if (!profile || !['admin','accountant'].includes(profile.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sb   = createServiceClient();
    const body = await request.json();
    const { id, action, invoice_id } = body;

    if (!id || !['match', 'dismiss'].includes(action)) {
      return Response.json({ error: 'נדרש id ו-action (match/dismiss)' }, { status: 400 });
    }

    const update = {};
    if (action === 'match') {
      update.alert_status = 'matched';
      if (invoice_id) update.matched_invoice_id = invoice_id;
    } else {
      update.alert_status = 'dismissed';
    }

    const { error } = await sb
      .from('bank_transactions')
      .update(update)
      .eq('id', id);

    if (error) {
      // If alert_status column doesn't exist yet, just update matched_invoice_id
      if (error.message?.includes('alert_status') && invoice_id) {
        await sb.from('bank_transactions').update({ matched_invoice_id: invoice_id }).eq('id', id);
      }
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
