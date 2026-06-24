/**
 * Comprehensive Gmail → expense_documents scanner.
 *
 * Shared by:
 *  - /api/cron/expense-gmail-scan  (daily maintenance, all orgs, Bearer CRON_SECRET)
 *  - /api/expenses/deep-scan       (admin-triggered one-time backfill, single org)
 *
 * Scans up to `daysBack` days of Gmail for receipts charged to the office card(s),
 * stores them permanently with duplicate detection so re-scanning never duplicates.
 */

import { getGmailClient } from '@/lib/gmail';
import { saveGmailReceiptToDrive } from '@/lib/expenseDriveSave';

const KNOWN_SUPPLIERS = [
  { item: 'אגרות טאבו', patterns: ['egovpayments', 'ecom.gov.il', 'justicepayments', 'שירותי הפנייה', 'אישור תשלום', 'land.gov.il', 'טאבו'] },
  { item: 'Google Play', patterns: ['google play', 'google payments', 'payments-noreply@google.com', 'google workspace', 'google cloud'] },
  { item: 'Anthropic', patterns: ['anthropic', 'claude.ai'] },
  { item: 'OpenAI', patterns: ['openai', 'chatgpt'] },
  { item: 'Microsoft', patterns: ['microsoft', 'office365', 'azure'] },
  { item: 'חשבוניות מספקים', patterns: ['invoice', 'receipt', 'חשבונית', 'קבלה', 'תשלום'] },
];

// Billing senders & invoice keywords used to BUILD Gmail queries so invoices
// that never print the office card number (Google, Anthropic, טאבו, suppliers)
// are still discovered. This is the core fix: scanning is no longer gated on
// the card number appearing in the email body.
const BILLING_SENDERS = [
  'payments-noreply@google.com', 'noreply-payments@google.com', 'billing@anthropic.com',
  'receipts@', 'billing@', 'invoice@', 'invoices@',
  'egovpayments', 'ecom.gov.il', 'justicepayments',
];
const INVOICE_KEYWORDS = [
  'חשבונית', 'קבלה', 'אישור תשלום', 'דרישת תשלום', 'חשבונית מס',
  'invoice', 'receipt', 'payment receipt', 'your receipt', 'order confirmation', 'tax invoice',
];

function ymd(d) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function monthWindows(daysBack = 120) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(Date.now() - daysBack * 86400000);
  start.setHours(0, 0, 0, 0);
  const out = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const s = new Date(Math.max(start.getTime(), cur.getTime()));
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const e = new Date(Math.min(end.getTime(), next.getTime()));
    out.push({ after: ymd(s), before: ymd(e) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}
function decodePart(data) {
  return Buffer.from((data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}
function payloadText(payload) {
  let text = '';
  const walk = (p) => {
    if (!p) return;
    if ((p.mimeType === 'text/html' || p.mimeType === 'text/plain') && p.body?.data) text += decodePart(p.body.data) + ' ';
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return text;
}
function clean(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}
function hasCard(text, cards, fallback) {
  const t = clean(text);
  for (const card of cards) if (new RegExp(`(^|\\D)${card}(\\D|$)`).test(t)) return card;
  return fallback || null;
}
function hasAttachment(payload) {
  let ok = false;
  const walk = (p) => {
    if (!p || ok) return;
    if (p.filename && p.body?.attachmentId) ok = true;
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return ok;
}
function isInvoiceLike(text, attachment) {
  const low = String(text || '').toLowerCase();
  if (attachment) return true;
  return ['חשבונית', 'קבלה', 'אישור תשלום', 'receipt', 'invoice', 'payment', 'order', 'מספר אישור תשלום'].some(w => low.includes(w.toLowerCase()));
}
function matchedVendor(text, vendors) {
  const low = String(text || '').toLowerCase();
  for (const k of KNOWN_SUPPLIERS) if (k.patterns.some(p => low.includes(p.toLowerCase()))) return k.item;
  for (const v of vendors) if (v && low.includes(String(v).toLowerCase())) return v;
  return null;
}
function amountFrom(text) {
  const patterns = [/(?:₪|ils|nis|שח|ש״ח)\s*([\d,]+\.?\d*)/i,/([\d,]+\.?\d*)\s*(?:₪|ils|nis|שח|ש״ח)/i,/(?:total|amount|סהכ|סך הכל|לתשלום)\D{0,20}([\d,]+\.?\d*)/i];
  for (const p of patterns) {
    const m = String(text || '').match(p);
    if (m?.[1]) return Number(String(m[1]).replace(/,/g, '')) || null;
  }
  return null;
}
function partsFromDate(value) {
  const d = value ? new Date(value) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return { docDate: safe.toISOString().slice(0, 10), year: safe.getFullYear(), month: safe.getMonth() + 1 };
}
async function listAll(gmail, q, limit = 500) {
  const out = [];
  let pageToken;
  do {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken });
    for (const m of res.data.messages || []) out.push(m);
    pageToken = res.data.nextPageToken;
  } while (pageToken && out.length < limit);
  return out.slice(0, limit);
}
async function recompute(sb, orgId, section, item, year, month) {
  const { data } = await sb.from('expense_documents')
    .select('amount,payer,status')
    .eq('organization_id', orgId).eq('expense_section', section).eq('expense_item', item).eq('expense_year', year).eq('expense_month_num', month);
  const total = (data || []).filter(x => x.status !== 'removed').filter(x => (x.payer || 'office') === 'office').reduce((s, x) => s + Number(x.amount || 0), 0);
  await sb.from('office_expenses').upsert({ organization_id: orgId, section, item_name: item, year, month, amount: total, is_itemized: true }, { onConflict: 'organization_id,section,item_name,year,month' });
}
async function duplicateExists(sb, orgId, { gmailId, vendor, amount, docDate }) {
  if (gmailId) {
    const { data } = await sb.from('expense_documents').select('id').eq('organization_id', orgId).eq('gmail_message_id', gmailId).neq('status', 'removed').maybeSingle();
    if (data?.id) return true;
  }
  if (vendor && docDate && amount) {
    const { data } = await sb.from('expense_documents').select('id').eq('organization_id', orgId).eq('vendor', vendor).eq('doc_date', docDate).eq('amount', Number(amount || 0)).neq('status', 'removed').limit(1);
    if (data?.[0]?.id) return true;
  }
  return false;
}

/**
 * Scan a single org's Gmail and persist receipts.
 * @param {object} sb        - service supabase client
 * @param {object} org       - { id, gmail_refresh_token, office_card_last4, ... }
 * @param {number} daysBack  - history window in days (default 120 ≈ 4 months)
 */
export async function scanOrg(sb, org, daysBack = 120) {
  const rawCards = Array.isArray(org.office_card_last4) ? org.office_card_last4 : [];
  const envCards = String(process.env.OFFICE_CARD_LAST4 || '').split(',');
  const cards = [...new Set([...rawCards, ...envCards].map(x => String(x).replace(/\D/g, '')).filter(x => x.length === 4))];
  if (!cards.length) return { skipped: 'no_cards' };

  const { data: items } = await sb.from('office_expenses').select('item_name').eq('organization_id', org.id);
  const vendors = [...new Set((items || []).map(x => String(x.item_name || '').trim()).filter(Boolean))];
  const gmail = getGmailClient(org.gmail_refresh_token);
  const found = new Map();
  const matchedBy = new Map();
  let queries = 0;

  // Card-independent supplier query fragment: senders + invoice keywords.
  // Gmail OR-joins them so any billing email in the window is returned even
  // when the card number is absent from the body.
  const senderFrag = BILLING_SENDERS.map(s => `from:${s}`).join(' OR ');
  const kwFrag = INVOICE_KEYWORDS.map(k => (k.includes(' ') ? `"${k}"` : k)).join(' OR ');

  for (const w of monthWindows(daysBack)) {
    const base = `after:${w.after} before:${w.before}`;
    // 1) High-confidence: messages mentioning an office card number.
    for (const card of cards) {
      for (const q of [`${base} ${card}`, `${base} "${card}"`, `${base} ${card} has:attachment`]) {
        queries++;
        for (const msg of await listAll(gmail, q, 500)) {
          found.set(msg.id, msg);
          matchedBy.set(msg.id, card); // card-origin = strong office-card evidence
        }
      }
    }
    // 2) Card-independent: any invoice/receipt by sender, keyword, or attachment.
    for (const q of [
      `${base} (${senderFrag})`,
      `${base} (${kwFrag}) has:attachment`,
      `${base} (${kwFrag})`,
    ]) {
      queries++;
      for (const msg of await listAll(gmail, q, 500)) {
        if (!found.has(msg.id)) found.set(msg.id, msg); // don't downgrade card-origin
      }
    }
  }

  let imported = 0, pending = 0, duplicates = 0, skippedNotInvoice = 0, failed = 0;
  for (const msg of [...found.values()]) {
    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const text = `${subject} ${from} ${detail.data.snippet || ''} ${clean(payloadText(detail.data.payload))}`;
      const attach = hasAttachment(detail.data.payload);
      if (!isInvoiceLike(text, attach)) { skippedNotInvoice++; continue; }
      const item = matchedVendor(text, vendors);
      // Card evidence: appears in body, OR the message was returned by a card query.
      const card = hasCard(text, cards, matchedBy.get(msg.id));
      // Keep only real invoices: must have a card, a known supplier, or an attachment.
      if (!card && !item && !attach) { skippedNotInvoice++; continue; }
      const amount = amountFrom(text) || 0;
      const { docDate, year, month } = partsFromDate(date);
      const vendor = item || from || 'ממתין לסיווג';
      if (await duplicateExists(sb, org.id, { gmailId: msg.id, vendor, amount, docDate })) { duplicates++; continue; }
      const gmailLink = `https://mail.google.com/mail/#all/${msg.id}`;

      // Without a confirmed office card we can't auto-file it — store for review
      // (still visible on the receipts page) so nothing real is ever lost.
      if (!card || !item) {
        const reason = card
          ? 'חשבונית/קבלה עם כרטיס משרד - נדרש סיווג'
          : 'חשבונית/קבלה ללא מספר כרטיס - נדרש אימות חיוב';
        const { error } = await sb.from('expense_documents').insert({
          organization_id: org.id,
          amount,
          vendor,
          description: [reason, card ? `כרטיס: ${card}` : 'כרטיס: לא זוהה', `נושא: ${subject}`, `שולח: ${from}`, `קישור למייל: ${gmailLink}`].join('\n'),
          category: 'review',
          doc_date: docDate,
          month: docDate.slice(0, 7),
          status: 'needs_review',
          file_url: gmailLink,
          file_name: subject || `${msg.id}.gmail`,
          file_type: 'gmail_candidate',
          gmail_message_id: msg.id,
          payer: card ? 'office' : 'unknown',
        });
        if (error) throw error;
        pending++;
        continue;
      }

      const saved = await saveGmailReceiptToDrive({ org, gmailId: msg.id, row: { subject, description: subject, amount, vendor, card_last4: card }, docDate, year, month, topic: item, vendor });
      const fileUrl = saved.url || gmailLink;
      const { error } = await sb.from('expense_documents').insert({
        organization_id: org.id,
        amount,
        vendor,
        description: [`חשבונית/קבלה - ${item}`, `כרטיס: ${card}`, `נושא: ${subject}`, `שולח: ${from}`, `קישור למייל: ${gmailLink}`].join('\n'),
        category: 'general',
        doc_date: docDate,
        month: docDate.slice(0, 7),
        status: 'linked',
        file_url: fileUrl,
        file_name: saved.fileName || subject || `${msg.id}.gmail`,
        file_type: saved.source === 'gmail_body' ? 'drive_email_body' : 'drive_receipt',
        expense_item: item,
        expense_section: 'office',
        expense_year: year,
        expense_month_num: month,
        gmail_message_id: msg.id,
        payer: 'office',
      });
      if (error) throw error;
      await recompute(sb, org.id, 'office', item, year, month);
      imported++;
    } catch (e) {
      console.warn('EXPENSE_GMAIL_SCAN failed', msg.id, e.message);
      failed++;
    }
  }
  return { queries, found: found.size, imported, pending_review: pending, duplicates, skipped_not_invoice: skippedNotInvoice, failed };
}
