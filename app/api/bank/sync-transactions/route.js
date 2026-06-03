import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsappToOffice, buildBankAlertMessage } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();

  const { data: org } = await sb
    .from('organizations').select('id, name').order('created_at', { ascending: true }).limit(1).single();
  if (!org) return Response.json({ error: 'No organization' }, { status: 500 });
  const orgId = org.id;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { transactions } = body;
  if (!Array.isArray(transactions) || !transactions.length) {
    return Response.json({ error: 'transactions[] required' }, { status: 400 });
  }

  // Load existing transaction references for deduplication
  const { data: existing } = await sb
    .from('bank_transactions')
    .select('reference, date, amount')
    .eq('organization_id', orgId);
  const existingSet = new Set(
    (existing || []).map((r) => `${r.reference}|${r.date}|${r.amount}`)
  );

  // Load open invoices (last 90 days) for matching
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: openInvoices } = await sb
    .from('invoices')
    .select('id, number, amount, client_id, client_name, issue_date')
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')
    .gte('issue_date', ninetyDaysAgo);

  let imported = 0;
  let skipped = 0;
  let alertsCreated = 0;

  for (const txn of transactions) {
    if (!txn.date || txn.amount == null) { skipped++; continue; }

    const dedupeKey = `${txn.reference || ''}|${txn.date}|${txn.amount}`;
    if (existingSet.has(dedupeKey)) { skipped++; continue; }
    existingSet.add(dedupeKey);

    const isCredit = Number(txn.amount) > 0;

    // Try to match invoice by amount (credits only)
    let matchedInvoice = null;
    if (isCredit) {
      const amt = Math.abs(Number(txn.amount));
      matchedInvoice = (openInvoices || []).find((inv) => {
        const diff = Math.abs(inv.amount - amt) / Math.max(amt, 1);
        return diff <= 0.10;
      }) || null;
    }

    const alertStatus = isCredit ? (matchedInvoice ? 'matched' : 'pending') : 'dismissed';

    const { error: insErr } = await sb.from('bank_transactions').insert({
      organization_id:    orgId,
      date:               txn.date,
      amount:             txn.amount,
      description:        txn.description || '',
      reference:          txn.reference || null,
      matched_invoice_id: matchedInvoice?.id || null,
      alert_status:       alertStatus,
      source:             'bank-scraper',
    }).then((r) => r).catch(() => ({ error: { message: 'insert failed' } }));

    if (insErr) {
      // Fallback: insert without new columns if migration not yet applied
      await sb.from('bank_transactions').insert({
        organization_id: orgId,
        date:            txn.date,
        amount:          txn.amount,
        description:     txn.description || '',
        reference:       txn.reference || null,
        source:          'bank-scraper',
      });
    }

    imported++;

    // For unmatched credits: create draft invoice in Cligal + WhatsApp alert
    if (isCredit && !matchedInvoice) {
      const amt = Math.abs(Number(txn.amount));

      // Try to find client name from invoice descriptions (best-effort)
      const { data: clients } = await sb.from('clients').select('name').eq('organization_id', orgId);
      const desc = (txn.description || '').toLowerCase();
      const matchedClient = (clients || []).find((c) => c.name && desc.includes(c.name.toLowerCase()));
      const clientName = matchedClient?.name || `לא ידוע (${(txn.description || '').slice(0, 30)})`;

      // Trigger Cligal draft creation (fire-and-forget; failures reported back separately)
      const baseUrl = process.env.APP_URL
        ? (() => { try { return new URL(process.env.APP_URL).origin; } catch { return process.env.APP_URL; } })()
        : null;

      if (baseUrl && process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
        fetch(`${baseUrl}/api/bank/create-cligal-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET },
          body: JSON.stringify({
            client_name: clientName,
            amount: amt,
            description: txn.description || '',
            date: txn.date,
          }),
        }).catch((err) => console.error('create-cligal-draft error:', err.message));
      }

      // Always send WhatsApp alert so the office knows
      const msg = buildBankAlertMessage({ amount: amt, description: txn.description, date: txn.date });
      await sendWhatsappToOffice(msg);
      alertsCreated++;
    }
  }

  return Response.json({ success: true, imported, skipped, alerts_created: alertsCreated });
}
