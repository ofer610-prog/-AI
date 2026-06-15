import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

const DEFAULT_OFFICE_CARDS = ['9434'];
const MAX_MESSAGES = 100;

function decodePart(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function stripHtml(s = '') {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectBody(payload) {
  let html = '';
  let text = '';
  const attachments = [];

  const walk = (part) => {
    if (!part) return;
    if (part.filename) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || null,
        attachmentId: part.body?.attachmentId || null,
        size: part.body?.size || null,
      });
    }
    if (part.body?.data) {
      const decoded = decodePart(part.body.data);
      if (part.mimeType === 'text/html') html += decoded + '\n';
      if (part.mimeType === 'text/plain') text += decoded + '\n';
    }
    (part.parts || []).forEach(walk);
  };

  walk(payload);
  const receiptText = stripHtml(text || html);
  return { receiptText, rawHtml: html || null, attachments };
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) return m;
  }
  return null;
}

function parseAmount(text = '', subject = '') {
  const m = firstMatch(`${text} ${subject}`, [
    /סה["״”']?כ\s*(?:שולם|לתשלום|חיוב|תשלום)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*₪/i,
    /סך\s*הכל\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*₪/i,
    /Total\s*(?:paid|amount)?\s*[:\-]?\s*(?:ILS|NIS|USD|\$|₪)?\s*([\d,]+(?:\.\d+)?)/i,
    /Amount\s*(?:paid)?\s*[:\-]?\s*(?:ILS|NIS|USD|\$|₪)?\s*([\d,]+(?:\.\d+)?)/i,
    /מחיר\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*₪/i,
    /([\d,]+(?:\.\d+)?)\s*(?:₪|שח|ש"ח|ILS|NIS)/i,
    /(?:₪|ILS|NIS|\$)\s*([\d,]+(?:\.\d+)?)/i,
  ]);
  if (!m) return null;
  const amount = Number(String(m[1]).replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

function parseCardLast4(text = '') {
  const m = firstMatch(text, [
    /4\s*ספרות\s*אחרונות[^0-9]{0,80}(\d{4})/i,
    /(?:ending|ends|last\s*4|card)[^0-9]{0,40}(\d{4})/i,
    /(?:ויזה|visa|ישראכרט|mastercard|מאסטרקארד)[^0-9]{0,60}(\d{4})/i,
  ]);
  return m ? m[1] : null;
}

function parsePaymentConfirmation(text = '', subject = '') {
  const m = firstMatch(`${subject} ${text}`, [
    /מספר\s*(?:אישור\s*)?תשלום\s*[:\-]?\s*(\d{6,})/i,
    /מספר\s*הזמנה\s*[:\-]?\s*(\d{6,})/i,
    /אישור\s*מחברת\s*האשראי\/בנק\s*[:\-]?\s*(\d{4,})/i,
    /payment\s*(?:confirmation|number|id)\s*[:\-]?\s*([A-Z0-9\-]{6,})/i,
    /invoice\s*(?:number|#)?\s*[:\-]?\s*([A-Z0-9\-]{5,})/i,
  ]);
  return m ? m[1] : null;
}

function parseDescription(text = '', subject = '') {
  const m = firstMatch(text, [
    /תיאור\s*התשלום\s*[:\-]?\s*([^\n\r<]{2,80})/i,
    /עבור\s*[:\-]?\s*([^\n\r<]{2,80})/i,
    /סוג\s*התשלום\s*[:\-]?\s*([^\n\r<]{2,80})/i,
    /שם\s*השירות\s*[:\-]?\s*([^\n\r<]{2,80})/i,
  ]);
  return (m ? m[1] : subject || 'קבלה').trim().slice(0, 160);
}

function classifyReceipt({ subject, from, text }) {
  const hay = `${subject || ''} ${from || ''} ${text || ''}`.toLowerCase();
  const heb = `${subject || ''} ${text || ''}`;

  if (hay.includes('egovpayments') || hay.includes('ecom.gov.il') || heb.includes('שירות התשלומים') || heb.includes('שרות התשלומים')) {
    if (heb.includes('רשם המשכונות') || heb.includes('נסח בטוחה')) {
      return { section: 'office', item: 'רשם המשכונות', vendor: 'רשם המשכונות', category: 'legal', sourceType: 'gov_mortgages' };
    }
    if (heb.includes('רשות מקרקעי ישראל') || heb.includes('פלט מחשב בדבר זכות') || heb.includes('אישור זכויות')) {
      return { section: 'office', item: 'רמ״י / אישורי זכויות', vendor: 'רשות מקרקעי ישראל', category: 'legal', sourceType: 'gov_rami' };
    }
    if (heb.includes('הרשות לרישום והסדר זכויות מקרקעין') || heb.includes('נסח מלא') || heb.includes('נסח מרוכז') || heb.includes('הזמנת מסמכים')) {
      return { section: 'office', item: 'אגרות טאבו', vendor: 'משרד המשפטים', category: 'legal', sourceType: 'gov_tabu' };
    }
    return { section: 'office', item: 'תשלומים ממשלתיים', vendor: 'שירות התשלומים הממשלתי', category: 'legal', sourceType: 'gov_payment' };
  }

  if (hay.includes('openai') || hay.includes('chatgpt')) {
    return { section: 'ai', item: 'OpenAI / ChatGPT', vendor: 'OpenAI', category: 'software', sourceType: 'ai_openai' };
  }
  if (hay.includes('anthropic') || hay.includes('claude')) {
    return { section: 'ai', item: 'Claude / Anthropic', vendor: 'Anthropic', category: 'software', sourceType: 'ai_anthropic' };
  }
  if (hay.includes('google') || hay.includes('workspace') || hay.includes('gemini') || hay.includes('cloud billing')) {
    return { section: 'ai', item: 'Google / Workspace / Gemini', vendor: 'Google', category: 'software', sourceType: 'google' };
  }

  if (hay.includes('invoice') || hay.includes('חשבונית') || hay.includes('קבלה') || hay.includes('receipt')) {
    return { section: 'office', item: 'חשבוניות מספקים', vendor: null, category: 'general', sourceType: 'forwarded_invoice' };
  }

  return null;
}

function monthFromDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return { docDate: new Date().toISOString().slice(0, 10), year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  const docDate = d.toISOString().slice(0, 10);
  return { docDate, year: d.getFullYear(), month: d.getMonth() + 1 };
}

async function recomputeCell(sb, orgId, section, item, year, month) {
  const { data } = await sb.from('expense_documents')
    .select('amount, payer')
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);

  const sum = (data || [])
    .filter(row => (row.payer || 'office') === 'office')
    .reduce((s, row) => s + Number(row.amount || 0), 0);

  await sb.from('office_expenses').upsert({
    organization_id: orgId,
    section,
    item_name: item,
    year,
    month,
    amount: sum,
    is_itemized: true,
  }, { onConflict: 'organization_id,section,item_name,year,month' });

  return sum;
}

async function insertReceiptDoc({ sb, profile, receipt, importedIds }) {
  if (importedIds.has(receipt.gmailMessageId)) return { status: 'duplicate' };

  const { data, error } = await sb.from('expense_documents').insert({
    organization_id: profile.organization_id,
    uploaded_by: profile.id,
    amount: receipt.amount || 0,
    vendor: receipt.vendor,
    description: receipt.description,
    category: receipt.category || 'general',
    doc_date: receipt.docDate,
    month: receipt.docDate.slice(0, 7),
    status: 'linked',
    file_url: receipt.gmailUrl,
    file_name: receipt.fileName,
    file_type: 'gmail_receipt',
    expense_item: receipt.item,
    expense_section: receipt.section,
    expense_year: receipt.year,
    expense_month_num: receipt.month,
    gmail_message_id: receipt.gmailMessageId,
    payer: receipt.payer,
    card_last4: receipt.cardLast4,
    payment_confirmation: receipt.paymentConfirmation,
    gmail_subject: receipt.subject,
    gmail_from: receipt.from,
    gmail_date: receipt.gmailDate,
    gmail_link: receipt.gmailUrl,
    source_type: receipt.sourceType,
    receipt_category: receipt.category,
    receipt_text: receipt.receiptText,
    receipt_attachments: receipt.attachments,
  }).select('id').single();

  if (error) return { status: 'error', error: error.message };
  importedIds.add(receipt.gmailMessageId);
  await recomputeCell(sb, profile.organization_id, receipt.section, receipt.item, receipt.year, receipt.month);
  return { status: 'imported', id: data?.id };
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const shouldImport = body.import === true || body.mode === 'import';
  const days = Math.min(Number(body.days || 120), 365);
  const limit = Math.min(Number(body.limit || MAX_MESSAGES), 200);

  const sb = createServiceClient();

  const { data: org } = await sb.from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email, office_card_last4')
    .eq('id', profile.organization_id).single();

  if (!org?.gmail_connected || !org?.gmail_refresh_token) {
    return Response.json({ error: 'Gmail לא מחובר — חבר Gmail בהגדרות המשרד', connected: false }, { status: 400 });
  }

  const officeCards = Array.isArray(org.office_card_last4) && org.office_card_last4.length
    ? org.office_card_last4.map(String)
    : DEFAULT_OFFICE_CARDS;

  const gmail = getGmailClient(org.gmail_refresh_token);
  const since = new Date(Date.now() - days * 86400000);
  const sinceUnix = Math.floor(since.getTime() / 1000);

  const query = body.query || [
    `after:${sinceUnix}`,
    '(from:ecom.gov.il OR from:egovpayments OR "שירות התשלומים" OR "שרות התשלומים" OR "אישור תשלום" OR "חשבונית" OR "קבלה" OR invoice OR receipt OR billing OR payment OR openai OR chatgpt OR anthropic OR claude OR google OR workspace OR gemini)',
    '(has:attachment OR "4 ספרות אחרונות" OR "נסח מלא" OR "רשם המשכונות" OR "רשות מקרקעי ישראל" OR "פלט מחשב בדבר זכות" OR "OpenAI" OR "Claude")',
  ].join(' ');

  let messages = [];
  try {
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: limit });
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
  let imported = 0;
  let duplicates = 0;
  let skippedClient = 0;
  let skippedUnrecognized = 0;
  const errors = [];

  for (const msg of messages) {
    if (importedIds.has(msg.id)) { duplicates++; continue; }

    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
      const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
      const gmailDate = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';
      const { receiptText, attachments } = collectBody(detail.data.payload);
      const combinedText = `${subject}\n${from}\n${receiptText}\n${attachments.map(a => a.filename).join(' ')}`;
      const classification = classifyReceipt({ subject, from, text: combinedText });

      if (!classification) { skippedUnrecognized++; continue; }

      const amount = parseAmount(receiptText, subject);
      const cardLast4 = parseCardLast4(receiptText);
      const paymentConfirmation = parsePaymentConfirmation(receiptText, subject);
      const description = parseDescription(receiptText, subject);
      const { docDate, year, month } = monthFromDate(gmailDate);
      const isGovPayment = classification.sourceType?.startsWith('gov_');
      const isOfficeCard = cardLast4 ? officeCards.includes(String(cardLast4)) : !isGovPayment;

      if (isGovPayment && !isOfficeCard) {
        skippedClient++;
        continue;
      }

      const receipt = {
        gmailMessageId: msg.id,
        subject,
        from,
        gmailDate,
        gmailUrl: `https://mail.google.com/mail/#all/${msg.id}`,
        fileName: attachments[0]?.filename || `${paymentConfirmation || msg.id}.gmail` ,
        amount,
        cardLast4,
        paymentConfirmation,
        description,
        receiptText: receiptText.slice(0, 50000),
        attachments,
        payer: 'office',
        ...classification,
        docDate,
        year,
        month,
      };

      if (shouldImport) {
        const result = await insertReceiptDoc({ sb, profile, receipt, importedIds });
        if (result.status === 'imported') imported++;
        if (result.status === 'duplicate') duplicates++;
        if (result.status === 'error') errors.push({ gmail_id: msg.id, error: result.error });
      }

      suggestions.push({
        gmail_id: msg.id,
        subject,
        from,
        date: docDate,
        amount,
        matched_vendor: receipt.vendor,
        section: receipt.section,
        item: receipt.item,
        description,
        card_last4: cardLast4,
        payer: 'office',
        payment_confirmation: paymentConfirmation,
        source_type: receipt.sourceType,
        attachment_count: attachments.length,
        imported: shouldImport && !errors.find(e => e.gmail_id === msg.id),
        gmail_link: receipt.gmailUrl,
      });
    } catch (e) {
      errors.push({ gmail_id: msg.id, error: e.message });
    }
  }

  return Response.json({
    connected: true,
    mode: shouldImport ? 'import' : 'preview',
    scanned: messages.length,
    suggestions,
    imported,
    duplicates,
    skipped_client: skippedClient,
    skipped_unrecognized: skippedUnrecognized,
    office_cards: officeCards,
    errors,
  });
}
