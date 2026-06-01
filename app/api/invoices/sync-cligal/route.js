import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  // Auth check
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();

  const { data: org } = await sb
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) return Response.json({ error: 'No organization found' }, { status: 500 });
  const orgId = org.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { invoices } = body;
  if (!Array.isArray(invoices) || invoices.length === 0) {
    return Response.json({ error: 'invoices array required' }, { status: 400 });
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const inv of invoices) {
    if (!inv.document_number) {
      skipped++;
      continue;
    }

    // Try to match client by name
    let clientId = null;
    if (inv.client_name) {
      const { data: clients } = await sb
        .from('clients')
        .select('id, name')
        .eq('organization_id', orgId)
        .ilike('name', `%${inv.client_name}%`)
        .limit(1);
      clientId = clients?.[0]?.id || null;
    }

    // Try to match matter by title
    let matterId = null;
    if (inv.matter_name && clientId) {
      const { data: matters } = await sb
        .from('matters')
        .select('id, title')
        .eq('organization_id', orgId)
        .eq('client_id', clientId)
        .ilike('title', `%${inv.matter_name}%`)
        .limit(1);
      matterId = matters?.[0]?.id || null;
    }

    const payload = {
      organization_id: orgId,
      invoice_number: inv.document_number,
      number: inv.document_number,
      client_id: clientId,
      matter_id: matterId,
      client_name: inv.client_name || null,
      amount: inv.amount || 0,
      issue_date: inv.issue_date || null,
      due_date: inv.due_date || null,
      status: mapStatus(inv.status),
      notes: inv.doc_type ? `סוג מסמך: ${inv.doc_type}` : null,
      source: 'cligal',
    };

    // Check if invoice already exists by document number
    const { data: existing } = await sb
      .from('invoices')
      .select('id')
      .eq('organization_id', orgId)
      .eq('invoice_number', inv.document_number)
      .maybeSingle();

    if (existing) {
      const { error } = await sb
        .from('invoices')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) {
        errors.push(`Update ${inv.document_number}: ${error.message}`);
      } else {
        updated++;
      }
    } else {
      const { error } = await sb.from('invoices').insert(payload);

      if (error) {
        // If source column doesn't exist yet, retry without it
        if (error.message?.includes('source')) {
          const { error: err2 } = await sb.from('invoices').insert({ ...payload, source: undefined });
          if (err2) {
            errors.push(`Insert ${inv.document_number}: ${err2.message}`);
          } else {
            inserted++;
          }
        } else {
          errors.push(`Insert ${inv.document_number}: ${error.message}`);
        }
      } else {
        inserted++;
      }
    }
  }

  return Response.json({
    success: true,
    total: invoices.length,
    inserted,
    updated,
    skipped,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}

function mapStatus(status) {
  if (!status) return 'draft';
  const s = status.toLowerCase();
  if (s === 'paid' || s.includes('שולם') || s.includes('סגור')) return 'paid';
  if (s === 'open' || s.includes('פתוח')) return 'sent';
  if (s === 'cancelled' || s.includes('מבוטל')) return 'cancelled';
  return 'draft';
}
