import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

/**
 * POST /api/expenses/scan-gmail
 * Scans Gmail for invoice/receipt emails matching known expense vendors.
 * Returns: { suggestions: [{ subject, from, date, amount, vendor, gmail_id }] }
 */
export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();

  const { data: org } = await sb.from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email, office_card_last4')
    .eq('id', profile.organization_id).single();

  const officeCards = org?.office_card_last4 || [];

  if (!org?.gmail_connected || !org?.gmail_refresh_token) {
    return Response.json({
      error: 'Gmail לא מחובר — יש לבצע חיבור Google חד־פעמי ואז להפעיל שוב סריקה',
      connected: false,
      connect_url: '/api/auth/google/connect?return_to=/expenses/receipts',
    }, { status: 400 });
  }

  const { data: items } = await sb.from('office_expenses')
    .select('item_name')
    .eq('organization_id', profile.organization_id);

  const vendors = [...new Set((items || []).map(i => i.item_name.trim()))];

  const gmail = getGmailClient(org.gmail_refresh_token);

  const since = new Date(Date.now() - 60 * 86400000);
  const sinceUnix = Math.floor(since.getTime() / 1000);

  const hebrewTerms = 'חשבונית OR חשבון OR קבלה OR תשלום OR חיוב OR ספק';
  const engTerms = 'invoice OR receipt OR billing OR payment';
  const query = `after:${sinceUnix} (${hebrewTerms} OR ${engTerms} OR has:attachment filename:(pdf OR jpg))`;

  let messages = [];
  try {
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50 });
    messages = res.data.messages || [];
    console.log('SCAN_GMAIL found_messages', messages.length, 'query', query.slice(0, 80));
  } catch (e) {
    console.error('SCAN_GMAIL list_error', e.message);
    return Response.json({ error: `שגיאת Gmail: ${e.message}` }, { status: 500 });
  }

  const { data: existing } = await sb.from('expense_documents')
    .select('gmail_message_id')
    .eq('organization_id', profile.organization_id)
    .not('gmail_message_id', 'is', null);
  const importedIds = new Set((existing || []).map(d => d.gmail_message_id));

  const suggestions = [];
  let skippedClient = 0;

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

  for (const msg of messages.slice(0, 30)) {
    if (importedIds.has(msg.id)) continue;

    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const date    = headers.find(h => h.name === 'Date')?.value || '';
      const fromLow = from.toLowerCase();

      const isGovPayment = fromLow.includes('egovpayments') || fromLow.includes('ecom.gov.il')
        || subject.includes('שירותי הפנייה') || subject.includes('אישור תשלום');

      let amount = null, cardLast4 = null, payer = 'office', isOffice = true, description = '', matchedVendor = null;

      if (isGovPayment) {
        const body = getFullText(detail.data.payload);
        const amtM = body.match(/סה["”]?כ\s*שולם[:\s<\/bu>]*([\d,]+\.?\d*)/i)
          || body.match(/מחיר[:\s<\/b>]*([\d,]+\.?\d*)\s*₪/);
        if (amtM) amount = parseFloat(amtM[1].replace(/,/g, ''));
        const cardM = body.match(/4 ספרות אחרונות[^:]*:\s*<\/b>\s*(\d{4})/) || body.match(/(\d{4})(?=[^\d]{0,40}אישור מחברת האשראי)/);
        if (cardM) cardLast4 = cardM[1];
        const descM = body.match(/תיאור התשלום[:\s<\/b>]*([^<\n]{1,40})/);
        description = descM ? descM[1].trim() : 'תשלום ממשלתי';
        matchedVendor = 'אגרות טאבו';
        isOffice = cardLast4 ? officeCards.includes(cardLast4) : true;
        payer = isOffice ? 'office' : 'client';
        if (!isOffice) { skippedClient++; continue; }
      } else {
        const subjectLow = subject.toLowerCase();
        for (const v of vendors) {
          if (subjectLow.includes(v.toLowerCase()) || fromLow.includes(v.toLowerCase())) { matchedVendor = v; break; }
        }
        const amountMatch = subject.match(/[\d,]+\.?\d*\s*(?:₪|nis|ils|שח)/i) || subject.match(/(?:₪|nis)\s*[\d,]+\.?\d*/i);
        if (amountMatch) amount = parseFloat(amountMatch[0].replace(/[^\d.]/g, ''));
      }

      let docDate = null;
      try { docDate = new Date(date).toISOString().slice(0, 10); } catch {}

      suggestions.push({
        gmail_id: msg.id, subject, from, date: docDate,
        amount, matched_vendor: matchedVendor, description,
        card_last4: cardLast4, payer, is_gov_payment: isGovPayment,
        snippet: detail.data.snippet || '',
      });
    } catch { }
  }

  console.log('SCAN_GMAIL result', JSON.stringify({ scanned: messages.length, suggestions: suggestions.length, skipped_client: skippedClient }));
  return Response.json({ suggestions, scanned: messages.length, skipped_client: skippedClient, office_cards: officeCards, connected: true });
}
