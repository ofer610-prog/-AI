/**
 * expenseOutlookScan.js
 * סורק תיבת Hotmail / Outlook — עובד בדיוק כמו Gmail:
 *   לכל 4 ספרות אחרונות של כרטיס → $search בתוכן המייל → decide() → DB.
 * כל לוגיקת הסינון/ספקים/חילוץ מרוכזת ב-lib/scanEngine.js.
 */

import { refreshOutlookToken, searchOutlookByKeyword } from '@/lib/outlookClient';
import { decide, stripHtml } from '@/lib/scanEngine';

/**
 * @param {object} sb    Supabase service client
 * @param {object} org   Organization row with outlook_* + office_card_last4 fields
 * @param {number} days  How many days back to scan (default 30)
 * @returns {{ found, auto_imported, pending_review, duplicates, skipped, cards_searched }}
 */
export async function scanOutlookOrg(sb, org, days = 30) {
  if (!org.outlook_connected || !org.outlook_refresh_token) {
    return { skipped: 'no_outlook_token' };
  }

  // ── 1. כרטיסי אשראי — בדיוק כמו Gmail ──
  const rawCards = Array.isArray(org.office_card_last4) ? org.office_card_last4 : [];
  const envCards = String(process.env.OFFICE_CARD_LAST4 || '').split(',');
  const cards = [...new Set(
    [...rawCards, ...envCards].map(x => String(x).replace(/\D/g, '')).filter(x => x.length === 4)
  )];
  if (!cards.length) return { error: 'לא הוגדרו 4 ספרות אחרונות של כרטיס — אין מה לחפש' };

  // ── 2. רענון access token ──
  let accessToken;
  try {
    const tokens = await refreshOutlookToken(org.outlook_refresh_token);
    accessToken = tokens.access_token;
    const newRefresh = tokens.refresh_token;
    if (newRefresh && newRefresh !== org.outlook_refresh_token) {
      await sb.from('organizations').update({ outlook_refresh_token: newRefresh }).eq('id', org.id);
    }
  } catch (e) {
    await sb.from('organizations').update({ outlook_connected: false }).eq('id', org.id);
    return { error: `Token refresh failed: ${e.message}` };
  }

  // ── 3. חיפוש לפי כרטיס (כמו Gmail) ──
  const since = new Date(Date.now() - days * 86_400_000);
  const found = new Map(); // msgId → message

  for (const card of cards) {
    let messages;
    try {
      messages = await searchOutlookByKeyword(accessToken, card);
    } catch (e) {
      console.warn(`Outlook $search for card ${card} failed:`, e.message);
      continue;
    }
    for (const msg of messages) {
      // סנן לפי תאריך בקוד (לא ניתן לשלב $search + $filter ב-Graph)
      if (msg.receivedDateTime && new Date(msg.receivedDateTime) < since) continue;
      if (!found.has(msg.id)) found.set(msg.id, msg);
    }
  }

  // ── 4. עיבוד כל הודעה דרך המנוע האחד ──
  const stats = { found: found.size, auto_imported: 0, pending_review: 0, duplicates: 0, skipped: 0, cards_searched: cards };

  for (const msg of found.values()) {
    const subject   = msg.subject || '';
    const fromEmail = msg.from?.emailAddress?.address || '';
    const fromName  = msg.from?.emailAddress?.name || '';
    const body      = msg.body?.content || msg.bodyPreview || '';

    const d = decide({ subject, fromEmail, fromName, body, date: msg.receivedDateTime });
    if (d.action === 'skip') { stats.skipped++; continue; }

    // ── dedup בשתי הטבלאות ──
    const gmailMessageId = `outlook_${msg.id}`;
    const [{ data: inQueue }, { data: inDocs }] = await Promise.all([
      sb.from('gmail_processed').select('id').eq('gmail_message_id', gmailMessageId).maybeSingle(),
      sb.from('expense_documents').select('id').eq('gmail_message_id', gmailMessageId).maybeSingle(),
    ]);
    if (inQueue || inDocs) { stats.duplicates++; continue; }

    const emailDate = msg.receivedDateTime
      ? new Date(msg.receivedDateTime).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const dateObj   = new Date(emailDate);
    const outlookLink = `https://outlook.live.com/mail/0/inbox/id/${encodeURIComponent(msg.id)}`;
    const description = [d.vendor, subject.slice(0, 120)].filter(Boolean).join(' — ');

    // ── ייבוא אוטומטי → expense_documents ──
    if (d.action === 'auto_import') {
      const { error: docErr } = await sb.from('expense_documents').insert({
        organization_id:   org.id,
        gmail_message_id:  gmailMessageId,
        vendor:            d.vendor,
        amount:            d.amount,
        vat:               d.vat,
        doc_number:        d.docNumber || null,
        currency:          d.currency || 'ILS',
        original_amount:   d.currency && d.currency !== 'ILS' ? d.amount : null,
        description:       [description, d.vat ? `מע"מ: ₪${d.vat}` : '', `שולח: ${fromEmail}`, `קישור: ${outlookLink}`].filter(Boolean).join('\n'),
        doc_date:          emailDate,
        month:             emailDate.slice(0, 7),
        expense_year:      dateObj.getFullYear(),
        expense_month_num: dateObj.getMonth() + 1,
        expense_item:      d.vendor,
        expense_section:   d.section,
        category:          d.category,
        status:            'linked',
        file_url:          outlookLink,
        file_name:         subject.slice(0, 200),
        file_type:         'outlook_receipt',
        payer:             'office',
      });
      if (!docErr) { stats.auto_imported++; continue; }
    }

    // ── תור סיווג → gmail_processed ──
    const bodyPreview = stripHtml(body).slice(0, 150);
    const { error: insertErr } = await sb.from('gmail_processed').insert({
      organization_id:       org.id,
      gmail_message_id:      gmailMessageId,
      subject:               subject.slice(0, 300),
      from_email:            fromEmail,
      date:                  emailDate,
      classification:        d.classification,
      extracted_amount:      d.amount,
      extracted_date:        emailDate,
      extracted_description: description.slice(0, 300),
      status:                'pending-review',
      ai_confidence:         d.confidence,
      ai_notes:              `[Outlook קישור](${outlookLink}) | ${d.reason} | ${bodyPreview}`.slice(0, 500),
      processed_at:          new Date().toISOString(),
    });
    if (!insertErr) stats.pending_review++;
    else stats.skipped++;
  }

  await sb.from('organizations').update({ last_outlook_sync: new Date().toISOString() }).eq('id', org.id);
  return stats;
}
