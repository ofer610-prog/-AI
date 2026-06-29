/**
 * expenseGmailScan.js
 * סורק Gmail — מחפש רק לפי 4 ספרות אחרונות של כרטיס אשראי.
 * כל לוגיקת הסינון/ספקים/חילוץ/החלטות מרוכזת ב-lib/scanEngine.js.
 *
 * קובץ זה אחראי רק על:
 *   1. בניית שאילתות Gmail (לפי כרטיס בלבד)
 *   2. שליפת פרטי מייל
 *   3. קריאה ל-decide()
 *   4. שמירה ל-DB
 */

import { getGmailClient } from '@/lib/gmail';
import { saveGmailReceiptToDrive } from '@/lib/expenseDriveSave';
import { decide } from '@/lib/scanEngine';

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

async function duplicateExists(sb, orgId, gmailId) {
  if (!gmailId) return false;
  const { data } = await sb.from('expense_documents')
    .select('id').eq('organization_id', orgId)
    .eq('gmail_message_id', gmailId).neq('status', 'removed').maybeSingle();
  return !!data?.id;
}

// ── שאילתות Gmail — רק לפי מספר כרטיס ──────────────────────────────────────
function buildQueries(window, cards) {
  const { after, before } = window;
  const base = `after:${after} before:${before}`;
  // שאילתה אחת לכל כרטיס — בדיוק ספרות הכרטיס בגוף/נושא המייל
  return cards.map(card => `${base} ${card}`);
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Scan a single org's Gmail and persist receipts.
 * @param {object} sb       — Supabase service client
 * @param {object} org      — { id, gmail_refresh_token, office_card_last4, ... }
 * @param {number} daysBack — Window to scan (default 120 days)
 * @returns {{ queries, found, imported, pending_review, duplicates, skipped, failed, cards }}
 */
export async function scanOrg(sb, org, daysBack = 120) {
  if (!org.gmail_refresh_token) return { skipped: 'no_gmail_token' };

  // כרטיסים — מ-org + env, חובה
  const rawCards = Array.isArray(org.office_card_last4) ? org.office_card_last4 : [];
  const envCards = String(process.env.OFFICE_CARD_LAST4 || '').split(',');
  const cards = [...new Set(
    [...rawCards, ...envCards].map(x => String(x).replace(/\D/g, '')).filter(x => x.length === 4)
  )];
  if (!cards.length) return { error: 'לא הוגדרו 4 ספרות אחרונות של כרטיס — אין מה לחפש' };

  const gmail = getGmailClient(org.gmail_refresh_token);
  const found = new Map();   // msgId → stub
  const cardOf = new Map();  // msgId → card
  let queries = 0;

  for (const w of monthWindows(daysBack)) {
    for (const q of buildQueries(w, cards)) {
      queries++;
      const card = cards.find(c => q.includes(c));
      for (const msg of await listAll(gmail, q, 500)) {
        if (!found.has(msg.id)) found.set(msg.id, msg);
        if (card && !cardOf.has(msg.id)) cardOf.set(msg.id, card);
      }
    }
  }

  let imported = 0, pending = 0, duplicates = 0, skipped = 0, failed = 0;

  for (const msg of found.values()) {
    try {
      if (await duplicateExists(sb, org.id, msg.id)) { duplicates++; continue; }

      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload?.headers || [];
      const subject  = headers.find(h => h.name === 'Subject')?.value || '';
      const from     = headers.find(h => h.name === 'From')?.value || '';
      const dateHdr  = headers.find(h => h.name === 'Date')?.value || '';
      const bodyText = payloadText(detail.data.payload);
      const attach   = hasAttachment(detail.data.payload);
      const gmailLink = `https://mail.google.com/mail/#all/${msg.id}`;
      const card = cardOf.get(msg.id) || '';

      const d = decide({ subject, fromEmail: from, fromName: from, body: bodyText, hasAttachment: attach });
      if (d.action === 'skip') { skipped++; continue; }

      const amount = d.amount || 0;
      const { docDate, year, month } = parseDate(dateHdr);
      const vendor = d.vendor || extractVendorFromFrom(from) || 'ממתין לסיווג';
      const item   = d.supplierId ? d.vendor : null;

      if (d.action === 'review') {
        await sb.from('expense_documents').insert({
          organization_id: org.id,
          amount,
          vat: d.vat,
          vendor,
          doc_number: d.docNumber || null,
          currency: d.currency || 'ILS',
          original_amount: d.currency && d.currency !== 'ILS' ? amount : null,
          description: [
            d.reason,
            card ? `כרטיס: *${card}` : '',
            `נושא: ${subject}`,
            `שולח: ${from}`,
            `קישור: ${gmailLink}`,
          ].filter(Boolean).join('\n'),
          category: 'review',
          doc_date: docDate,
          month: docDate.slice(0, 7),
          status: 'needs_review',
          file_url: gmailLink,
          file_name: subject || `${msg.id}.gmail`,
          file_type: 'gmail_candidate',
          gmail_message_id: msg.id,
          payer: 'office',
        });
        pending++;
        continue;
      }

      // auto_import → Drive + expense_documents
      const saved = await saveGmailReceiptToDrive({
        org, gmailId: msg.id,
        row: { subject, description: subject, amount, vendor, card_last4: card },
        docDate, year, month, topic: item || vendor, vendor,
      });
      await sb.from('expense_documents').insert({
        organization_id: org.id,
        amount,
        vat: d.vat,
        vendor,
        doc_number: d.docNumber || null,
        currency: d.currency || 'ILS',
        original_amount: d.currency && d.currency !== 'ILS' ? amount : null,
        description: [
          `חשבונית/קבלה — ${vendor}`,
          card ? `כרטיס: *${card}` : '',
          `נושא: ${subject}`,
          `שולח: ${from}`,
          `קישור: ${gmailLink}`,
        ].filter(Boolean).join('\n'),
        category: d.category,
        doc_date: docDate,
        month: docDate.slice(0, 7),
        status: 'linked',
        file_url: saved.url || gmailLink,
        file_name: saved.fileName || subject || `${msg.id}.gmail`,
        file_type: saved.source === 'gmail_body' ? 'drive_email_body' : 'drive_receipt',
        expense_item: item || vendor,
        expense_section: d.section,
        expense_year: year,
        expense_month_num: month,
        gmail_message_id: msg.id,
        payer: 'office',
      });
      await recompute(sb, org.id, 'office', item || vendor, year, month);
      imported++;
    } catch (e) {
      console.warn('EXPENSE_GMAIL_SCAN failed msg', msg.id, e.message);
      failed++;
    }
  }

  return { queries, found: found.size, imported, pending_review: pending, duplicates, skipped, failed, cards };
}

function extractVendorFromFrom(from) {
  const match = String(from || '').match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  const domain = String(from || '').match(/@([a-z0-9-]+)\./i);
  return domain ? domain[1] : null;
}
