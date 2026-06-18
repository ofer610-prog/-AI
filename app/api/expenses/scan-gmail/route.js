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

  const since = new Date(Date.now() - 60 * 86400000);
  const sinceUnix = Math.floor(since.getTime() / 1000);

  const hebrewTerms = 'חשבונית OR חשבון OR קבלה OR תשלום OR חיוב';
  const engTerms = 'invoice OR receipt OR billing OR payment';
  const query = `after:${sinceUnix} (${hebrewTerms} OR ${engTerms} OR has:attachment filename:(pdf OR jpg))`;

  let messages = [];
  try {
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 60 });
    messages = res.data.messages || [];
  } catch (e) {
    return Response.json({ error: `שגיאת Gmail: ${e.message}` }, { status: 500 });
  }

  const { data: existing } = await sb.from('expense_documents')
    .select('gmail_message_id')
    .eq('organization_id', profile.organization_id)
    .not('gmail_message_id', 'is', null);
  const importedIds = new Set((existing || []).map(d => d.gmail_message_id));

  const suggestions = [];
  let skippedClient = 0;
  let skippedNoCard = 0;
  let skippedImported = 0;

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
  const extractCardLast4 = (text) => {
    const t = cleanText(text);
    const patterns = [
      /(?:4\s*ספרות\s*אחרונות|ארבע\s*ספרות\s*אחרונות|מסתיים\s*ב|המסתיים\s*ב|last\s*4|ends?\s*with)[^\d]{0,40}(\d{4})/i,
      /(?:כרטיס|אשראי|visa|mastercard|card)[^\d]{0,60}(\d{4})/i,
      /(?:\*{2,}|x{2,}|X{2,}|•{2,})\s*(\d{4})/,
    ];
    for (const p of patterns) {
      const m = t.match(p);
      if (m?.[1]) return m[1];
    }
    for (const card of officeCards) {
      if (new RegExp(`(^|\\D)${card}(\\D|$)`).test(t)) return card;
    }
    return null;
  };

  for (const msg of messages.slice(0, 40)) {
    if (importedIds.has(msg.id)) { skippedImported++; continue; }

    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const date    = headers.find(h => h.name === 'Date')?.value || '';
      const fromLow = from.toLowerCase();
      const bodyText = cleanText(getFullText(detail.data.payload));
      const combinedText = `${subject} ${from} ${detail.data.snippet || ''} ${bodyText}`;

      const cardLast4 = extractCardLast4(combinedText);
      if (!cardLast4) { skippedNoCard++; continue; }

      const isOfficeCard = officeCards.includes(cardLast4);
      if (!isOfficeCard) { skippedClient++; continue; }

      const isGovPayment = fromLow.includes('egovpayments') || fromLow.includes('ecom.gov.il')
        || subject.includes('שירותי הפנייה') || subject.includes('אישור תשלום');

      let amount = null, description = '', matchedVendor = null;

      if (isGovPayment) {
        const amtM = bodyText.match(/סה["”]?כ\s*שולם[:\s]*([\d,]+\.?\d*)/i)
          || bodyText.match(/מחיר[:\s]*([\d,]+\.?\d*)\s*₪/);
        if (amtM) amount = parseFloat(amtM[1].replace(/,/g, ''));
        const descM = bodyText.match(/תיאור התשלום[:\s]*([^\n]{1,60})/);
        description = descM ? descM[1].trim() : 'תשלום ממשלתי בכרטיס משרד';
        matchedVendor = 'אגרות טאבו';
      } else {
        const subjectLow = subject.toLowerCase();
        const textLow = combinedText.toLowerCase();
        for (const v of vendors) {
          if (subjectLow.includes(v.toLowerCase()) || fromLow.includes(v.toLowerCase()) || textLow.includes(v.toLowerCase())) { matchedVendor = v; break; }
        }
        const amountMatch = combinedText.match(/[\d,]+\.?\d*\s*(?:₪|nis|ils|שח)/i) || combinedText.match(/(?:₪|nis)\s*[\d,]+\.?\d*/i);
        if (amountMatch) amount = parseFloat(amountMatch[0].replace(/[^\d.]/g, ''));
        description = 'חשבונית/קבלה עם כרטיס משרד';
      }

      let docDate = null;
      try { docDate = new Date(date).toISOString().slice(0, 10); } catch {}

      suggestions.push({
        gmail_id: msg.id, subject, from, date: docDate,
        amount, matched_vendor: matchedVendor, description,
        card_last4: cardLast4, payer: 'office', is_gov_payment: isGovPayment,
        snippet: detail.data.snippet || '',
      });
    } catch { }
  }

  return Response.json({
    suggestions,
    scanned: messages.length,
    skipped_imported: skippedImported,
    skipped_no_card: skippedNoCard,
    skipped_client: skippedClient,
    office_cards: officeCards,
    connected: true,
    filter: 'office_card_last4_required',
  });
}
