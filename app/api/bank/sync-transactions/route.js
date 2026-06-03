import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsappToOffice, buildBankAlertMessage } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const DRAFT_MARKER = '[טיוטה - ממתין לאישור]';

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

  // Load clients for name-based matching
  const { data: clients } = await sb.from('clients').select('id, name, phone, email').eq('organization_id', orgId);
  const clientList = clients || [];

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

    // For unmatched credits: create draft invoice + send office alert
    if (isCredit && !matchedInvoice) {
      const amt = Math.abs(Number(txn.amount));

      // Try to find client by name in description
      const desc = (txn.description || '').toLowerCase();
      const matchedClient = clientList.find(
        (c) => c.name && desc.includes(c.name.toLowerCase())
      ) || null;

      // Create draft invoice
      const today = txn.date || new Date().toISOString().slice(0, 10);
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 30);

      // Generate a draft number
      const draftNum = `DRAFT-${Date.now()}`;

      const { data: draft } = await sb.from('invoices').insert({
        organization_id: orgId,
        number:          draftNum,
        client_id:       matchedClient?.id || null,
        client_name:     matchedClient?.name || `(לא זוהה — ${txn.description?.slice(0, 30) || 'בנק'})`,
        amount:          amt,
        issue_date:      today,
        due_date:        dueDate.toISOString().slice(0, 10),
        status:          'open',
        notes:           `${DRAFT_MARKER}\nהועבר אוטומטית מחשבון הבנק ב-${today}. תיאור: ${txn.description || ''}`,
      }).select('id, number').single();

      // Send WhatsApp alert to office
      const msg = buildBankAlertMessage({
        amount: amt,
        description: txn.description,
        date: txn.date,
        draftInvoiceNumber: draft?.number,
      });
      await sendWhatsappToOffice(msg);
      alertsCreated++;
    }
  }

  return Response.json({ success: true, imported, skipped, alerts_created: alertsCreated });
}
