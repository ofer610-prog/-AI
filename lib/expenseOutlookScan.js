/**
 * expenseOutlookScan.js
 * סורק תיבת Hotmail / Outlook — עובד בדיוק כמו Gmail:
 *   לכל 4 ספרות אחרונות של כרטיס → $search בתוכן המייל → decide() → DB.
 * כל לוגיקת הסינון/ספקים/חילוץ מרוכזת ב-lib/scanEngine.js.
 */

import { refreshOutlookToken, searchOutlookByKeyword } from '@/lib/outlookClient';
import { decide, stripHtml, cardInContext } from '@/lib/scanEngine';

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

  // ── 1. כרטיסי אשראי — קבועים (1626, 9434) + מ-org + env ──
  const DEFAULT_CARDS = ['1626', '9434'];
  const rawCards = Array.isArray(org.office_card_last4) ? org.office_card_last4 : [];
  const envCards = String(process.env.OFFICE_CARD_LAST4 || '').split(',');
  const cards = [...new Set(
    [...DEFAULT_CARDS, ...rawCards, ...envCards].map(x => String(x).replace(/\D/g, '')).filter(x => x.length === 4)
  )];

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
      // וודא שה-4 ספרות מופיעות בהקשר כרטיס אשראי (לא מספר מודעה/ערוץ וכו')
      const bodyText = stripHtml(msg.body?.content || msg.bodyPreview || '');
      if (!cardInContext([msg.subject || '', bodyText].join(' '), card)) continue;
      if (!found.has(msg.id)) found.set(msg.id, { ...msg, _matchedCard: card });
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
    // ספאם מובהק → skip. אבל מייל שעבר cardInContext (חיוב כרטיס אמיתי) —
    // גם בלי סכום מזוהה — נכנס לטבלה כ-needs_review כדי שלא ייעלם. Hotmail
    // לעיתים לא מחלץ סכום בגלל מבנה המייל; עדיף שהמשתמש ישלים/ימחק.
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
        // ספק מוכר בוודאות גבוהה → אישור אוטומטי (עם אפשרות עריכה/מחיקה).
        status:            'approved',
        file_url:          outlookLink,
        file_name:         subject.slice(0, 200),
        file_type:         'outlook_receipt',
        payer:             'office',
      });
      if (!docErr) { stats.auto_imported++; continue; }
    }

    // ── לא auto_import (חסר סכום או ודאות) → נכנס לטבלת הקבלות כ-needs_review ──
    // כך המשתמש רואה את חיוב הכרטיס בטבלה אחת, ויכול להשלים סכום / לאשר / למחוק.
    const { error: revErr } = await sb.from('expense_documents').insert({
      organization_id:   org.id,
      gmail_message_id:  gmailMessageId,
      vendor:            d.vendor || fromName || 'ממתין לסיווג',
      amount:            d.amount || 0,
      vat:               d.vat,
      doc_number:        d.docNumber || null,
      currency:          d.currency || 'ILS',
      original_amount:   d.currency && d.currency !== 'ILS' && d.amount ? d.amount : null,
      description:       [d.reason, description, `שולח: ${fromEmail}`, `קישור: ${outlookLink}`].filter(Boolean).join('\n'),
      doc_date:          emailDate,
      month:             emailDate.slice(0, 7),
      expense_year:      dateObj.getFullYear(),
      expense_month_num: dateObj.getMonth() + 1,
      expense_item:      d.vendor || null,
      expense_section:   d.section || 'office',
      category:          d.category || 'review',
      status:            'needs_review',
      file_url:          outlookLink,
      file_name:         subject.slice(0, 200),
      file_type:         'outlook_receipt',
      payer:             'office',
    });
    if (!revErr) stats.pending_review++;
    else stats.skipped++;
  }

  await sb.from('organizations').update({ last_outlook_sync: new Date().toISOString() }).eq('id', org.id);
  return stats;
}
