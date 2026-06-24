import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient } from '@/lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KNOWN_SUPPLIERS = [
  { item: 'אגרות טאבו', patterns: ['egovpayments', 'ecom.gov.il', 'justicepayments', 'שירותי הפנייה', 'אישור תשלום'] },
  { item: 'Anthropic', patterns: ['anthropic', 'claude'] },
  { item: 'Google Play', patterns: ['google play', 'google payments', 'payments-noreply@google.com'] },
  { item: 'ועדה לתכנון ובניה', patterns: ['ועדה לתכנון', 'ועדה מקומית', 'תכנון ובניה'] },
  { item: 'עיריית מעלות תרשיחא', patterns: ['עיריית מעלות', 'מעלות תרשיחא'] },
  { item: 'חשבוניות מספקים', patterns: ['invoice', 'receipt', 'חשבונית', 'קבלה'] },
];

function ymd(d) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function monthWindows(daysBack = 120) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(Date.now() - daysBack * 86400000);
  start.setHours(0, 0, 0, 0);
  const windows = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const s = new Date(Math.max(start.getTime(), cursor.getTime()));
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const e = new Date(Math.min(end.getTime(), next.getTime()));
    windows.push({ start: s, end: e, after: ymd(s), before: ymd(e) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return windows;
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

function cleanText(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

function textHasCard(text, cards, fallback) {
  const t = cleanText(text);
  for (const card of cards) if (new RegExp(`(^|\\D)${card}(\\D|$)`).test(t)) return card;
  return fallback || null;
}

function knownVendor(combinedText, vendors) {
  const low = combinedText.toLowerCase();
  for (const k of KNOWN_SUPPLIERS) {
    if (k.patterns.some(p => low.includes(String(p).toLowerCase()))) return k.item;
  }
  for (const v of vendors) if (v && low.includes(String(v).toLowerCase())) return v;
  return null;
}

function isInvoiceLike(text, hasAttachment) {
  const low = text.toLowerCase();
  if (hasAttachment) return true;
  return ['חשבונית', 'קבלה', 'אישור תשלום', 'receipt', 'invoice', 'payment', 'order', 'tax invoice', 'מספר אישור תשלום'].some(w => low.includes(w.toLowerCase()));
}

function extractAmount(text) {
  const patterns = [
    /(?:₪|ils|nis|שח|ש״ח)\s*([\d,]+\.?\d*)/i,
    /([\d,]+\.?\d*)\s*(?:₪|ils|nis|שח|ש״ח)/i,
    /(?:total|amount|סהכ|סך הכל|לתשלום)\D{0,20}([\d,]+\.?\d*)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return Number(String(m[1]).replace(/,/g, '')) || null;
  }
  return null;
}

function hasAnyAttachment(payload) {
  let found = false;
  const walk = (p) => {
    if (!p || found) return;
    if (p.filename && p.body?.attachmentId) found = true;
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return found;
}

async function listAllMessages(gmail, q, limit = 500) {
  const out = [];
  let pageToken;
  do {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken });
    for (const msg of res.data.messages || []) out.push(msg);
    pageToken = res.data.nextPageToken;
  } while (pageToken && out.length < limit);
  return out.slice(0, limit);
}

export async function POST() {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email, office_card_last4')
    .eq('id', profile.organization_id).single();

  const rawCards = Array.isArray(org?.office_card_last4) ? org.office_card_last4 : [];
  const envCards = String(process.env.OFFICE_CARD_LAST4 || '').split(',');
  const officeCards = [...new Set([...rawCards, ...envCards].map(c => String(c).replace(/\D/g, '')).filter(c => /^\d{4}$/.test(c)))];

  if (!org?.gmail_connected || !org?.gmail_refresh_token) return Response.json({ error: 'Gmail לא מחובר — יש לבצע חיבור Google חד־פעמי ואז להפעיל שוב סריקה', connected: false, connect_url: '/api/auth/google/connect?return_to=/expenses/receipts' }, { status: 400 });
  if (!officeCards.length) return Response.json({ error: 'לא מוגדרות 4 ספרות אחרונות של כרטיס המשרד. יש להגדיר כרטיס משרד לפני סריקת חשבוניות.', connected: true, missing_office_cards: true }, { status: 400 });

  const { data: items } = await sb.from('office_expenses').select('item_name').eq('organization_id', profile.organization_id);
  const vendors = [...new Set((items || []).map(i => String(i.item_name || '').trim()).filter(Boolean))];
  const gmail = getGmailClient(org.gmail_refresh_token);

  const messageMap = new Map();
  const matchedBy = new Map();
  const queriesRun = [];
  const windows = monthWindows(120);

  try {
    for (const w of windows) {
      for (const card of officeCards) {
        const base = `after:${w.after} before:${w.before}`;
        const queries = [
          `${base} ${card}`,
          `${base} "${card}"`,
          `${base} ${card} (חשבונית OR קבלה OR invoice OR receipt OR payment OR תשלום OR order)`,
          `${base} ${card} has:attachment`,
        ];
        for (const q of queries) {
          queriesRun.push(q);
          const messages = await listAllMessages(gmail, q, 500);
          for (const msg of messages) {
            messageMap.set(msg.id, msg);
            if (!matchedBy.has(msg.id)) matchedBy.set(msg.id, { card, query: q });
          }
        }
      }
    }
  } catch (e) {
    return Response.json({ error: `שגיאת Gmail: ${e.message}` }, { status: 500 });
  }

  const { data: existing } = await sb.from('expense_documents')
    .select('gmail_message_id,status')
    .eq('organization_id', profile.organization_id)
    .not('gmail_message_id', 'is', null);
  const importedIds = new Set((existing || []).filter(d => d.status !== 'removed').map(d => d.gmail_message_id));

  const suggestions = [];
  let skippedImported = 0;
  let skippedNoCard = 0;
  let skippedNotInvoice = 0;

  for (const msg of [...messageMap.values()]) {
    if (importedIds.has(msg.id)) { skippedImported++; continue; }
    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const bodyText = cleanText(payloadText(detail.data.payload));
      const combinedText = `${subject} ${from} ${detail.data.snippet || ''} ${bodyText}`;
      const fallback = matchedBy.get(msg.id)?.card;
      const cardLast4 = textHasCard(combinedText, officeCards, fallback);
      if (!cardLast4 || !officeCards.includes(cardLast4)) { skippedNoCard++; continue; }
      const hasAttachment = hasAnyAttachment(detail.data.payload);
      if (!isInvoiceLike(combinedText, hasAttachment)) { skippedNotInvoice++; continue; }

      const matchedVendor = knownVendor(combinedText, vendors);
      const amount = extractAmount(combinedText);
      let docDate = null;
      try { docDate = new Date(date).toISOString().slice(0, 10); } catch {}
      const isKnown = !!matchedVendor && matchedVendor !== 'חשבוניות מספקים';
      const confidence = isKnown ? 'high' : (amount || hasAttachment ? 'medium' : 'low');

      suggestions.push({
        gmail_id: msg.id,
        subject,
        from,
        date: docDate,
        amount,
        matched_vendor: confidence === 'low' ? null : matchedVendor,
        description: matchedVendor ? `חשבונית/קבלה - ${matchedVendor}` : 'חשבונית/קבלה עם כרטיס משרד - נדרש סיווג',
        card_last4: cardLast4,
        payer: 'office',
        snippet: detail.data.snippet || '',
        confidence,
        has_attachment: hasAttachment,
        gmail_link: `https://mail.google.com/mail/#all/${msg.id}`,
      });
    } catch (e) {
      // skip one bad message but keep the scan running
    }
  }

  return Response.json({
    suggestions,
    scanned: queriesRun.length,
    unique_messages: messageMap.size,
    skipped_imported: skippedImported,
    skipped_no_card: skippedNoCard,
    skipped_not_invoice: skippedNotInvoice,
    office_cards: officeCards,
    connected: true,
    days: 120,
    windows: windows.map(w => `${w.after}-${w.before}`),
    queries_run: queriesRun.length,
    filter: 'month_by_month_card_invoice_paged',
  });
}
