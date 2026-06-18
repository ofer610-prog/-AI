import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function POST() {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email, office_card_last4')
    .eq('id', profile.organization_id).single();

  const rawCards = Array.isArray(org?.office_card_last4) ? org.office_card_last4 : [];
  const officeCards = rawCards.map(c => String(c).replace(/\D/g, '')).filter(c => /^\d{4}$/.test(c));

  if (!org?.gmail_connected || !org?.gmail_refresh_token) {
    return Response.json({
      error: 'Gmail לא מחובר — יש לבצע חיבור Google חד־פעמי ואז להפעיל שוב סריקה',
      connected: false,
      connect_url: '/api/auth/google/connect?return_to=/expenses/receipts',
    }, { status: 400 });
  }

  if (!officeCards.length) {
    return Response.json({
      error: 'לא מוגדרות 4 ספרות אחרונות של כרטיס המשרד. יש להגדיר כרטיס משרד לפני סריקת חשבוניות.',
      connected: true,
      missing_office_cards: true,
    }, { status: 400 });
  }

  const { data: items } = await sb.from('office_expenses')
    .select('item_name')
    .eq('organization_id', profile.organization_id);
  const vendors = [...new Set((items || []).map(i => i.item_name.trim()).filter(Boolean))];
  const gmail = getGmailClient(org.gmail_refresh_token);

  const since = new Date(Date.now() - 90 * 86400000);
  const sinceUnix = Math.floor(since.getTime() / 1000);

  const messageMap = new Map();
  const matchedByCard = new Map();
  const queries = [];

  for (const card of officeCards) {
    queries.push({ card, q: `after:${sinceUnix} ${card}` });
    queries.push({ card, q: `after:${sinceUnix} "${card}"` });
    queries.push({ card, q: `after:${sinceUnix} (invoice OR receipt OR חשבונית OR קבלה OR תשלום) ${card}` });
  }

  let scanned = 0;
  try {
    for (const query of queries) {
      const res = await gmail.users.messages.list({ userId: 'me', q: query.q, maxResults: 40 });
      for (const msg of res.data.messages || []) {
        messageMap.set(msg.id, msg);
        if (!matchedByCard.has(msg.id)) matchedByCard.set(msg.id, query.card);
      }
      scanned += (res.data.messages || []).length;
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

  const decodePart = (data) => Buffer.from((data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  const getFullText = (payload) => {
    let text = '';
    const walk = (p) => {
      if (!p) return;
      if ((p.mimeType === 'text/html' || p.mimeType === 'text/plain') && p.body?.data) text += decodePart(p.body.data) + ' ';
      (p.parts || []).forEach(walk);
    };
    walk(payload);
    return text;
  };
  const cleanText = (text) => String(text || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const extractCardLast4 = (text, fallbackCard) => {
    const t = cleanText(text);
    for (const card of officeCards) {
      if (new RegExp(`(^|\\D)${card}(\\D|$)`).test(t)) return card;
    }
    return fallbackCard || null;
  };

  for (const msg of [...messageMap.values()].slice(0, 80)) {
    if (importedIds.has(msg.id)) { skippedImported++; continue; }
    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const bodyText = cleanText(getFullText(detail.data.payload));
      const combinedText = `${subject} ${from} ${detail.data.snippet || ''} ${bodyText}`;
      const cardLast4 = extractCardLast4(combinedText, matchedByCard.get(msg.id));
      if (!cardLast4 || !officeCards.includes(cardLast4)) { skippedNoCard++; continue; }

      const fromLow = from.toLowerCase();
      const isGovPayment = fromLow.includes('egovpayments') || fromLow.includes('ecom.gov.il') || subject.includes('אישור תשלום') || subject.includes('שירותי הפנייה');
      let matchedVendor = null;
      let description = 'חשבונית/קבלה עם כרטיס משרד';
      let amount = null;

      if (isGovPayment) {
        matchedVendor = 'אגרות טאבו';
        description = 'תשלום ממשלתי בכרטיס משרד';
      } else {
        const textLow = combinedText.toLowerCase();
        for (const v of vendors) {
          if (textLow.includes(v.toLowerCase())) { matchedVendor = v; break; }
        }
      }

      const amountMatch = combinedText.match(/[\d,]+\.?\d*\s*(?:₪|nis|ils|שח)/i) || combinedText.match(/(?:₪|nis)\s*[\d,]+\.?\d*/i);
      if (amountMatch) amount = parseFloat(amountMatch[0].replace(/[^\d.]/g, ''));

      let docDate = null;
      try { docDate = new Date(date).toISOString().slice(0, 10); } catch {}

      suggestions.push({
        gmail_id: msg.id,
        subject,
        from,
        date: docDate,
        amount,
        matched_vendor: matchedVendor,
        description,
        card_last4: cardLast4,
        payer: 'office',
        is_gov_payment: isGovPayment,
        snippet: detail.data.snippet || '',
      });
    } catch { }
  }

  return Response.json({
    suggestions,
    scanned,
    unique_messages: messageMap.size,
    skipped_imported: skippedImported,
    skipped_no_card: skippedNoCard,
    office_cards: officeCards,
    connected: true,
    days: 90,
    filter: 'gmail_search_by_office_card_last4',
  });
}
