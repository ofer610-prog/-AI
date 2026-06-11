import { requireAdmin, forbidden } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsappToPhone } from '@/lib/notifications';
import { israelToday } from '@/lib/helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/remind
 * Sends a WhatsApp reminder to the client for one invoice and records it.
 * Body: { invoice_id, custom_message? }
 */
export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return forbidden();

  const body = await request.json().catch(() => ({}));
  const { invoice_id, custom_message } = body;
  if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });

  const sb = createServiceClient();
  const { data: inv } = await sb.from('invoices')
    .select('id, number, client_name, client_id, amount, due_date, clients(name, phone, email)')
    .eq('id', invoice_id).single();

  if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });

  const phone = inv.clients?.phone;
  if (!phone) return Response.json({ error: 'אין מספר טלפון ללקוח' }, { status: 422 });

  const daysLate = inv.due_date ? Math.floor((Date.now() - new Date(inv.due_date)) / 86400000) : 0;
  const message = custom_message || [
    `שלום ${inv.client_name || inv.clients?.name || ''},`,
    ``,
    `אנו מבקשים לעדכן בנוגע לחשבונית ${inv.number ? `מס׳ ${inv.number}` : ''}`,
    `סכום לתשלום: ₪${Number(inv.amount || 0).toLocaleString('he-IL')}`,
    inv.due_date ? `תאריך פירעון: ${new Date(inv.due_date).toLocaleDateString('he-IL')}` : '',
    daysLate > 0 ? `⚠️ עבר המועד לפני ${daysLate} ימים` : '',
    ``,
    `נשמח לתאם תשלום בהקדם. תודה על שיתוף הפעולה.`,
    ``,
    `משרד עו״ד`,
  ].filter(Boolean).join('\n');

  const ok = await sendWhatsappToPhone(phone, message);
  if (!ok) return Response.json({ error: 'שגיאה בשליחת ווטסאפ' }, { status: 500 });

  const today = israelToday();
  await sb.from('invoices').update({
    last_reminder_sent: today,
    reminder_count: (inv.reminder_count || 0) + 1,
  }).eq('id', invoice_id);

  return Response.json({ ok: true, phone, sentAt: today });
}
