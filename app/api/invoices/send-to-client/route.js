import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, forbidden } from '@/lib/adminAuth';
import {
  sendWhatsappToPhone,
  sendEmail,
  buildInvoiceClientMessage,
  buildInvoiceEmailHtml,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const authSb = await createClient();
    const { data: { user } } = await authSb.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await requireAdmin())) return forbidden();

    const { data: userProfile } = await authSb
      .from('profiles').select('organization_id').eq('id', user.id).single();
    if (!userProfile) return Response.json({ error: 'No profile' }, { status: 403 });

    const sb = createServiceClient();
    const body = await request.json();
    const { invoice_id, method = 'whatsapp', phone: phoneOverride, email: emailOverride } = body;

    if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    if (!['whatsapp', 'email', 'both'].includes(method)) {
      return Response.json({ error: 'method must be whatsapp, email, or both' }, { status: 400 });
    }

    // Load invoice + client — scoped to user's org
    const { data: inv, error: invErr } = await sb
      .from('invoices')
      .select('*, clients(name, phone, email)')
      .eq('id', invoice_id)
      .eq('organization_id', userProfile.organization_id)
      .single();
    if (invErr || !inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    const { data: org } = await sb
      .from('organizations').select('name').eq('id', userProfile.organization_id).single();

    const clientName = inv.client_name || inv.clients?.name || 'לקוח';
    const phone = phoneOverride || inv.clients?.phone || null;
    const email = emailOverride || inv.clients?.email || null;

    const msgData = {
      clientName,
      invoiceNumber: inv.number,
      amount:        inv.amount,
      issueDate:     inv.issue_date,
      dueDate:       inv.due_date,
      notes:         inv.notes,
      officeName:    org?.name,
    };

    const results = { whatsapp: null, email: null };
    const errors  = [];

    // WhatsApp
    if (method === 'whatsapp' || method === 'both') {
      if (!phone) {
        errors.push('לא נמצא מספר טלפון ללקוח — הזן מספר ידנית');
      } else {
        const msg = buildInvoiceClientMessage(msgData);
        const ok = await sendWhatsappToPhone(phone, msg);
        results.whatsapp = ok ? 'sent' : 'failed';
        if (!ok) errors.push('שליחת WhatsApp נכשלה');
      }
    }

    // Email
    if (method === 'email' || method === 'both') {
      if (!email) {
        errors.push('לא נמצאה כתובת מייל ללקוח — הזן מייל ידנית');
      } else {
        const ok = await sendEmail({
          to:      email,
          subject: `חשבונית מס׳ ${inv.number} — ${clientName}`,
          html:    buildInvoiceEmailHtml(msgData),
        });
        results.email = ok ? 'sent' : 'failed';
        if (!ok) errors.push('שליחת מייל נכשלה');
      }
    }

    // Mark invoice as sent (if it was a draft/open)
    const anySent = results.whatsapp === 'sent' || results.email === 'sent';
    if (anySent) {
      // Remove draft marker from notes if present
      const cleanNotes = (inv.notes || '').replace('[טיוטה - ממתין לאישור]\n', '').trim();
      await sb.from('invoices')
        .update({ status: 'open', notes: cleanNotes || inv.notes })
        .eq('id', invoice_id);
    }

    return Response.json({ success: anySent || errors.length === 0, results, errors });
  } catch (err) {
    console.error('send-to-client error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
