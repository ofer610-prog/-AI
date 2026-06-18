import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient, classifyEmail } from '@/lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    console.log('SCAN_GMAIL found_messages', messages.length);
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
  let skippedIrrelevant = 0;

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

  // Process max 20 emails to stay within Vercel timeout
  for (const msg of messages.slice(0, 20)) {
    if (importedIds.has(msg.id)) continue;

    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const date    = headers.find(h => h.name === 'Date')?.value || '';
      const fromLow = from.toLowerCase();

      let docDate = null;
      try { docDate = new Date(date).toISOString().slice(0, 10); } catch {}

      const isGovPayment = fromLow.includes('egovpayments') || fromLow.includes('ecom.gov.il')
        || subject.includes('שירותי הפנייה') || subject.includes('אישור תשלום');

      if (isGovPayment) {
        // Reliable regex extraction for government payments
        const body = getFullText(detail.data.payload);
        let amount = null, cardLast4 = null, description = '';
        const amtM = body.match(/סה[""]?כ\s*שולם[:\s<\/bu>]*([\d,]+\.?\d*)/i) || body.match(/מחיר[:\s<\/b>]*([\d,]+\.?\d*)\s*₪/);
        if (amtM) amount = parseFloat(amtM[1].replace(/,/g, ''));
        const cardM = body.match(/4 ספרות אחרונות[^:]*:\s*<\/b>\s*(\d{4})/) || body.match(/(\d{4})(?=[^\d]{0,40}אישור מחברת האשראי)/);
        if (cardM) cardLast4 = cardM[1];
        const descM = body.match(/תיאור התשלום[:\s<\/b>]*([^<\n]{1,40})/);
        description = descM ? descM[1].trim() : 'תשלום ממשלתי';
        const isOffice = cardLast4 ? officeCards.includes(cardLast4) : true;
        if (!isOffice) { skippedClient++; continue; }
        suggestions.push({
          gmail_id: msg.id, subject, from, date: docDate,
          amount, matched_vendor: 'אגרות טאבו', description,
          card_last4: cardLast4, payer: 'office', is_gov_payment: true,
          snippet: detail.data.snippet || '',
          needs_review: false,
        });
        continue;
      }

      // AI classification for all other financial emails
      const body = getFullText(detail.data.payload).slice(0, 10000);
      let aiResult = null;
      try {
        aiResult = await classifyEmail({ id: msg.id, subject, from, date, body });
      } catch (e) {
        console.warn('SCAN_GMAIL ai_failed', msg.id, e.message?.slice(0, 80));
      }

      // Skip emails AI says are irrelevant (newsletters, spam, etc.)
      if (aiResult && !aiResult.is_relevant) { skippedIrrelevant++; continue; }

      // Determine if this needs manual review
      const needsReview = !aiResult
        || aiResult.confidence === 'low'
        || aiResult.classification === 'other'
        || aiResult.classification === 'whatsapp-export';

      // Try to match known vendor from subject/sender, or use AI's from_party
      const subjectLow = subject.toLowerCase();
      const matchedVendor = vendors.find(v => subjectLow.includes(v.toLowerCase()) || fromLow.includes(v.toLowerCase()))
        || (aiResult?.from_party && aiResult.from_party !== 'לא ידוע' ? aiResult.from_party : null);

      const aiDate = aiResult?.date || null;
      const finalDate = docDate || aiDate;

      suggestions.push({
        gmail_id: msg.id, subject, from,
        date: finalDate,
        amount: aiResult?.amount || null,
        matched_vendor: matchedVendor,
        description: aiResult?.description || subject,
        card_last4: null, payer: 'office', is_gov_payment: false,
        snippet: detail.data.snippet || '',
        needs_review: needsReview,
        ai_classification: aiResult?.classification || 'unknown',
        ai_confidence: aiResult?.confidence || 'low',
        ai_direction: aiResult?.direction || 'neutral',
      });
    } catch (e) {
      console.warn('SCAN_GMAIL email_error', msg.id, e.message?.slice(0, 80));
    }
  }

  const needsReviewCount = suggestions.filter(s => s.needs_review).length;
  console.log('SCAN_GMAIL result', JSON.stringify({
    scanned: messages.length,
    suggestions: suggestions.length,
    needs_review: needsReviewCount,
    skipped_client: skippedClient,
    skipped_irrelevant: skippedIrrelevant,
  }));
  return Response.json({ suggestions, scanned: messages.length, skipped_client: skippedClient, skipped_irrelevant: skippedIrrelevant, connected: true });
}
