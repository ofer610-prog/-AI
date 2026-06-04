import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsappToOffice } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bank/cligal-draft-result
 * Called by the create-cligal-draft.js script after attempting to create the draft.
 * Records the result and notifies the office via WhatsApp.
 */
export async function POST(request) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { success, details = {} } = body;

  if (success) {
    const msg = [
      `✅ *טיוטת חשבונית נוצרה בקליגל*`,
      ``,
      `לקוח: ${details.client || '—'}`,
      `סכום: ₪${Number(details.amount || 0).toLocaleString('he-IL')}`,
      `תאריך: ${details.date || '—'}`,
      ``,
      `יש להיכנס לקליגל, לאשר את הטיוטה ולשלוח ללקוח.`,
    ].join('\n');
    await sendWhatsappToOffice(msg);
  } else {
    const msg = [
      `⚠️ *יצירת טיוטה בקליגל נכשלה*`,
      ``,
      `לקוח: ${details.client || '—'}`,
      `סכום: ₪${Number(details.amount || 0).toLocaleString('he-IL')}`,
      details.error ? `שגיאה: ${details.error}` : '',
      ``,
      `יש להנפיק חשבונית ידנית בקליגל.`,
    ].filter(Boolean).join('\n');
    await sendWhatsappToOffice(msg);

    // Log failure
    try {
      const sb = createServiceClient();
      const { data: org } = await sb.from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
      if (org) {
        await sb.from('bank_transactions')
          .update({ alert_status: 'draft_failed' })
          .eq('organization_id', org.id)
          .eq('alert_status', 'draft_requested')
          .filter('description', 'ilike', `%${details.client || ''}%`);
      }
    } catch {}
  }

  return Response.json({ ok: true });
}
