/**
 * Unified Gmail → expense_documents scanner.
 *
 * Shared by:
 *  - /api/cron/expense-gmail-scan  (scheduled maintenance, all orgs)
 *  - /api/expenses/deep-scan       (admin-triggered backfill, single org)
 *
 * Design principles:
 *  - Works without a configured card number (card is extra evidence, not a gate)
 *  - Israeli-first: Hebrew keywords, Israeli banks, gov payments
 *  - Deduplicates on gmail_message_id — re-scanning never creates duplicates
 *  - Stores everything invoice-like for human review; auto-files when confident
 */

import { getGmailClient } from '@/lib/gmail';
import { saveGmailReceiptToDrive } from '@/lib/expenseDriveSave';

// ── Known suppliers: used to classify & auto-file without human review ────────
const KNOWN_SUPPLIERS = [
  // Government
  { item: 'אגרות טאבו',         patterns: ['egovpayments', 'ecom.gov.il', 'justicepayments', 'land.gov.il', 'טאבו', 'רשם המקרקעין'] },
  { item: 'ארנונה',              patterns: ['arnona', 'ארנונה', 'עיריית', 'municipality'] },
  { item: 'מע"מ / רשות המסים',   patterns: ['taxes.gov.il', 'mcs.taxes.gov.il', 'מס ערך מוסף', 'רשות המסים', 'מסים'] },
  // Banks
  { item: 'בנק הפועלים',         patterns: ['bankhapoalim', 'hapoalim', 'הפועלים'] },
  { item: 'בנק לאומי',           patterns: ['leumi', 'לאומי'] },
  { item: 'בנק דיסקונט',         patterns: ['discountbank', 'discount', 'דיסקונט'] },
  { item: 'מזרחי טפחות',         patterns: ['mizrahi', 'מזרחי', 'טפחות'] },
  { item: 'ביטוח לאומי',         patterns: ['btl.gov.il', 'ביטוח לאומי'] },
  // Credit cards
  { item: 'ישראכרט',             patterns: ['isracard', 'ישראכרט'] },
  { item: 'MAX / לאומי קארד',    patterns: ['leumipay', 'max.co.il', 'leumicard', 'max card'] },
  { item: 'Cal / ויזה כאל',      patterns: ['cal-online', 'cal.co.il', 'כאל'] },
  // Tech
  { item: 'Google Workspace',    patterns: ['payments-noreply@google.com', 'google payments', 'google workspace', 'google cloud', 'google play'] },
  { item: 'Anthropic / Claude',  patterns: ['anthropic', 'claude.ai', 'billing@anthropic.com'] },
  { item: 'OpenAI',              patterns: ['openai', 'chatgpt'] },
  { item: 'Microsoft 365',       patterns: ['microsoft', 'office365', 'azure', 'msoffice'] },
  { item: 'Zoom',                patterns: ['zoom.us', 'zoom video'] },
  { item: 'Dropbox',             patterns: ['dropbox'] },
  // Utilities
  { item: 'חשמל',                patterns: ['iec.co.il', 'חברת חשמל', 'electricityauthority'] },
  { item: 'גז',                  patterns: ['gaslightnrg', 'supergas', 'אמפג', 'pazgas', 'גז לישראל'] },
  { item: 'מים',                 patterns: ['mekorot', 'מקורות', 'מים', 'water.gov.il'] },
  { item: 'טלפון / סלולר',       patterns: ['partner', 'cellcom', 'hot mobile', 'pelephone', 'golan', ' 012', 'bezeq', 'פרטנר', 'סלקום', 'פלאפון', 'בזק'] },
  { item: 'אינטרנט',             patterns: ['hot.net.il', 'bezeqint', ' 013', 'xfone'] },
  // Office
  { item: 'שכירות משרד',         patterns: ['שכירות', 'דמי שכירות', 'rent'] },
  { item: 'ביטוח',               patterns: ['harel', 'clal', 'migdal', 'menora', 'phoenix', 'הראל', 'כלל ביטוח', 'מגדל', 'מנורה', 'פניקס', 'ביטוח'] },
  { item: 'ספקי משרד',           patterns: ['invoice', 'receipt', 'חשבונית', 'קבלה', 'חשבון'] },
];

// ── Gmail query fragments ─────────────────────────────────────────────────────
const BILLING_SENDERS = [
  'payments-noreply@google.com', 'noreply-payments@google.com',
  'billing@anthropic.com', 'receipts@', 'billing@', 'invoice@', 'invoices@',
  'noreply@', 'no-reply@', 'ecom.gov.il', 'egovpayments', 'taxes.gov.il',
  'bankhapoalim', 'leumi', 'discountbank', 'isracard', 'cal.co.il', 'max.co.il',
  'iec.co.il', 'bezeq',
];
const INVOICE_KEYWORDS = [
  'חשבונית', 'חשבונית מס', 'קבלה', 'אישור תשלום', 'דרישת תשלום', 'חשבון לתשלום',
  'invoice', 'receipt', 'payment receipt', 'tax invoice', 'order confirmation', 'your receipt',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function ymd(d) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function monthWindows(daysBack = 120) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(Date.now() - daysBack * 86400000); start.setHours(0, 0, 0, 0);
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
    if ((p.mimeType === 'text/html' || p.mimeType === 'text/plain') && p.body?.data) {
      text += decodePart(p.body.data) + ' ';
    }
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return text;
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
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

function isInvoiceLike(text, fromHeader, attachment) {
  if (attachment) return true;
  const low = String(text || '').toLowerCase();
  const fromLow = String(fromHeader || '').toLowerCase();
  // Check known billing senders
  if (BILLING_SENDERS.some(s => fromLow.includes(s.toLowerCase()))) return true;
  // Check invoice keywords
  return INVOICE_KEYWORDS.some(w => low.includes(w.toLowerCase()));
}

function matchedVendor(text, vendors) {
  const low = String(text || '').toLowerCase();
  for (const k of KNOWN_SUPPLIERS) {
    if (k.patterns.some(p => low.includes(p.toLowerCase()))) return k.item;
  }
  for (const v of vendors) {
    if (v && low.includes(String(v).toLowerCase())) return v;
  }
  return null;
}

function amountFrom(text) {
  const clean = stripHtml(text);
  const patterns = [
    // ₪ before or after number
    /(?:₪|ils|nis|שח|ש״ח|שקל)\s*([\d,]+\.?\d{0,2})/i,
    /([\d,]+\.?\d{0,2})\s*(?:₪|ils|nis|שח|ש״ח|שקל)/i,
    // Hebrew total keywords
    /(?:סה"כ|סך הכל|לתשלום|סכום לחיוב|סכום|total|amount charged|amount due)\s*[:\-]?\s*([\d,]+\.?\d{0,2})/i,
    // Fallback: any price-like number (3+ digits, optional decimals)
    /\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{3,6}(?:\.\d{1,2})?)\b/,
  ];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m?.[1]) {
      const n = Number(String(m[1]).replace(/,/g, ''));
      if (n > 0 && n < 1000000) return n;
    }
  }
  return null;
}

function hasCard(text, cards, fallback) {
  const t = stripHtml(text);
  for (const card of cards) {
    if (new RegExp(`(^|\\D)${card}(\\D|$)`).test(t)) return card;
  }
  return fallback || null;
}

function parseDate(value) {
  const d = value ? new Date(value) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return {
    docDate: safe.toISOString().slice(0, 10),
    year: safe.getFullYear(),
    month: safe.getMonth() + 1,
  };
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
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);
  const total = (data || [])
    .filter(x => x.status !== 'removed')
    .filter(x => (x.payer || 'office') === 'office')
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  await sb.from('office_expenses').upsert(
    { organization_id: orgId, section, item_name: item, year, month, amount: total, is_itemized: true },
    { onConflict: 'organization_id,section,item_name,year,month' }
  );
}

async function duplicateExists(sb, orgId, { gmailId, vendor, amount, docDate }) {
  // Primary: exact gmail message id
  if (gmailId) {
    const { data } = await sb.from('expense_documents')
      .select('id').eq('organization_id', orgId)
      .eq('gmail_message_id', gmailId).neq('status', 'removed').maybeSingle();
    if (data?.id) return true;
  }
  // Secondary: same vendor + date + amount (±1 ILS)
  if (vendor && docDate && amount) {
    const { data } = await sb.from('expense_documents')
      .select('id').eq('organization_id', orgId)
      .eq('vendor', vendor).eq('doc_date', docDate)
      .gte('amount', Number(amount) - 1).lte('amount', Number(amount) + 1)
      .neq('status', 'removed').limit(1);
    if (data?.[0]?.id) return true;
  }
  return false;
}

// ── Build consolidated Gmail queries (fewer API calls) ────────────────────────
function buildQueries(window, cards) {
  const { after, before } = window;
  const base = `after:${after} before:${before}`;
  const queries = new Set();

  // 1. Any message with an invoice/receipt keyword or attachment
  const kwFrag = INVOICE_KEYWORDS.slice(0, 6)
    .map(k => (k.includes(' ') ? `"${k}"` : k)).join(' OR ');
  queries.add(`${base} (${kwFrag})`);
  queries.add(`${base} has:attachment (${kwFrag})`);

  // 2. Known billing senders (batched into 2 queries to stay under Gmail query length)
  const half = Math.ceil(BILLING_SENDERS.length / 2);
  const senderFrag1 = BILLING_SENDERS.slice(0, half).map(s => `from:${s}`).join(' OR ');
  const senderFrag2 = BILLING_SENDERS.slice(half).map(s => `from:${s}`).join(' OR ');
  queries.add(`${base} (${senderFrag1})`);
  queries.add(`${base} (${senderFrag2})`);

  // 3. Card numbers (high-confidence for office expenses)
  for (const card of cards) {
    queries.add(`${base} ${card}`);
  }

  return [...queries];
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Scan a single org's Gmail and persist receipts.
 *
 * @param {object} sb       - Supabase service client
 * @param {object} org      - { id, gmail_refresh_token, office_card_last4, ... }
 * @param {number} daysBack - Window to scan (default 120 days)
 * @returns {object} stats
 */
export async function scanOrg(sb, org, daysBack = 120) {
  if (!org.gmail_refresh_token) return { skipped: 'no_gmail_token' };

  const rawCards = Array.isArray(org.office_card_last4) ? org.office_card_last4 : [];
  const envCards = String(process.env.OFFICE_CARD_LAST4 || '').split(',');
  const cards = [...new Set([...rawCards, ...envCards]
    .map(x => String(x).replace(/\D/g, '')).filter(x => x.length === 4))];
  // Cards are optional — absence no longer blocks scanning.

  const { data: items } = await sb.from('office_expenses')
    .select('item_name').eq('organization_id', org.id);
  const vendors = [...new Set((items || []).map(x => String(x.item_name || '').trim()).filter(Boolean))];

  const gmail = getGmailClient(org.gmail_refresh_token);
  const found = new Map();   // msgId → message stub
  const cardOf = new Map();  // msgId → card (if matched by card query)
  let queries = 0;

  for (const w of monthWindows(daysBack)) {
    for (const q of buildQueries(w, cards)) {
      queries++;
      for (const msg of await listAll(gmail, q, 500)) {
        if (!found.has(msg.id)) found.set(msg.id, msg);
        // Mark card origin only on card-specific queries (last group in buildQueries)
        if (cards.some(c => q.includes(c)) && !cardOf.has(msg.id)) {
          const matchedCard = cards.find(c => q.includes(c));
          if (matchedCard) cardOf.set(msg.id, matchedCard);
        }
      }
    }
  }

  let imported = 0, pending = 0, duplicates = 0, skipped = 0, failed = 0;

  for (const msg of [...found.values()]) {
    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload?.headers || [];
      const subject  = headers.find(h => h.name === 'Subject')?.value || '';
      const from     = headers.find(h => h.name === 'From')?.value || '';
      const dateHdr  = headers.find(h => h.name === 'Date')?.value || '';
      const bodyText = payloadText(detail.data.payload);
      const fullText = `${subject} ${from} ${detail.data.snippet || ''} ${bodyText}`;
      const attach   = hasAttachment(detail.data.payload);

      if (!isInvoiceLike(fullText, from, attach)) { skipped++; continue; }

      const item   = matchedVendor(fullText, vendors);
      const card   = hasCard(fullText, cards, cardOf.get(msg.id));
      const amount = amountFrom(fullText) || 0;
      const { docDate, year, month } = parseDate(dateHdr);
      const vendor = item || extractVendorFromFrom(from) || 'ממתין לסיווג';
      const gmailLink = `https://mail.google.com/mail/#all/${msg.id}`;

      if (await duplicateExists(sb, org.id, { gmailId: msg.id, vendor, amount, docDate })) {
        duplicates++; continue;
      }

      const isConfident = card && item;

      if (!isConfident) {
        // Store for human review — nothing is lost
        const reason = card
          ? 'חשבונית עם כרטיס משרד — נדרש סיווג'
          : item
          ? `חשבונית מ-${item} — ממתין לאימות כרטיס`
          : 'חשבונית/קבלה — נדרש אימות';
        await sb.from('expense_documents').insert({
          organization_id: org.id,
          amount,
          vendor,
          description: [
            reason,
            card ? `כרטיס: ${card}` : 'כרטיס: לא זוהה',
            `נושא: ${subject}`,
            `שולח: ${from}`,
            `קישור למייל: ${gmailLink}`,
          ].join('\n'),
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
        pending++;
        continue;
      }

      // Confident match: auto-file and save to Drive
      const saved = await saveGmailReceiptToDrive({
        org, gmailId: msg.id,
        row: { subject, description: subject, amount, vendor, card_last4: card },
        docDate, year, month, topic: item, vendor,
      });
      const fileUrl = saved.url || gmailLink;
      await sb.from('expense_documents').insert({
        organization_id: org.id,
        amount,
        vendor,
        description: [
          `חשבונית/קבלה — ${item}`,
          `כרטיס: ${card}`,
          `נושא: ${subject}`,
          `שולח: ${from}`,
          `קישור למייל: ${gmailLink}`,
        ].join('\n'),
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
      await recompute(sb, org.id, 'office', item, year, month);
      imported++;
    } catch (e) {
      console.warn('EXPENSE_GMAIL_SCAN failed msg', msg.id, e.message);
      failed++;
    }
  }

  return { queries, found: found.size, imported, pending_review: pending, duplicates, skipped, failed };
}

// ── Extract vendor name from From header: "Acme Billing <billing@acme.com>" ──
function extractVendorFromFrom(from) {
  const match = String(from || '').match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  const domain = String(from || '').match(/@([a-z0-9-]+)\./i);
  return domain ? domain[1] : null;
}
