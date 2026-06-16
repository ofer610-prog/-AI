import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * Parses Israeli credit card SMS notifications.
 * Supports: ישראכרט, Max (לאומי קארד), Visa Cal, American Express Israel
 */
function parseSmsBlock(sms) {
  const results = [];

  // Split by newlines to handle multiple SMS messages pasted together
  const messages = sms.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

  for (const msg of messages) {
    const result = parseSingleSms(msg);
    if (result) results.push(result);
  }

  // If no clear split found, try parsing as single message
  if (!results.length) {
    const single = parseSingleSms(sms);
    if (single) results.push(single);
  }

  return results;
}

function parseSingleSms(text) {
  const t = text.trim();
  if (!t) return null;

  let amount = null;
  let vendor = null;
  let date = null;
  let card_last4 = null;

  // ── Amount patterns ──
  // "חויבת ב-345.00 ₪" / "סכום: 345.00 ₪" / "₪345.00" / "345.00 ש"ח"
  const amountPatterns = [
    /חויב(?:ת|ה)?\s+ב[־\-]?([\d,]+\.?\d*)\s*[₪]/i,
    /סכום[:\s]+([\d,]+\.?\d*)\s*[₪]/i,
    /[₪]\s*([\d,]+\.?\d*)/,
    /([\d,]+\.?\d*)\s*[₪]/,
    /([\d,]+\.?\d*)\s*ש[״"]ח/i,
  ];
  for (const p of amountPatterns) {
    const m = t.match(p);
    if (m) { amount = parseFloat(m[1].replace(/,/g, '')); break; }
  }

  // ── Card last 4 digits ──
  // "כרטיס מסתיים ב-9434" / "כרטיס *9434" / "xxxx-9434"
  const cardPatterns = [
    /כרטיס\s+(?:מסתיים\s+)?[בב][ּ]?[־\-*]?(\d{4})/i,
    /[*xX]{2,}[-\s]?(\d{4})/,
    /card\s+(?:ending\s+)?(\d{4})/i,
    /\*{1,4}(\d{4})/,
  ];
  for (const p of cardPatterns) {
    const m = t.match(p);
    if (m) { card_last4 = m[1]; break; }
  }

  // ── Date patterns ──
  // "14/06/26" / "14/06/2026" / "14.06.26" / "בתאריך 14/06/26"
  const datePatterns = [
    /(?:בתאריך\s+)?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ];
  for (const p of datePatterns) {
    const m = t.match(p);
    if (m) {
      if (m[0].includes('-') && m[1].length === 4) {
        // ISO format
        date = `${m[1]}-${m[2]}-${m[3]}`;
      } else {
        const day = m[1].padStart(2, '0');
        const month = m[2].padStart(2, '0');
        let year = m[3];
        if (year.length === 2) year = `20${year}`;
        date = `${year}-${month}-${day}`;
      }
      // Validate
      const d = new Date(date);
      if (isNaN(d.getTime())) date = null;
      else break;
    }
  }

  // ── Vendor patterns ──
  // "ב-SPOTIFY T.LAviv" / "אצל: חברת החשמל" / "AMAZON" etc.
  const vendorPatterns = [
    /ב[ּ]?[־\-]\s*([A-Za-zא-ת][A-Za-zא-ת0-9\s.,'&\-]{1,50}?)(?:\s+ב(?:תאריך|[0-9])|\s+כרטיס|\s*$)/i,
    /אצל[:\s]+([A-Za-zא-ת][A-Za-zא-ת0-9\s.,'&\-]{1,50}?)(?:\n|$|\s+ב(?:תאריך|[0-9]))/i,
    /(?:חנות|ספק|בית עסק)[:\s]+([A-Za-zא-ת][A-Za-zא-ת0-9\s.,'&\-]{1,50}?)(?:\n|$)/i,
  ];
  for (const p of vendorPatterns) {
    const m = t.match(p);
    if (m) { vendor = m[1].trim(); break; }
  }

  // Fallback: take first non-Hebrew "word" as vendor if amount was found
  if (!vendor && amount) {
    const words = t.match(/[A-Z][A-Z\s.]{3,}/);
    if (words) vendor = words[0].trim();
  }

  if (!amount) return null; // can't parse without amount

  return {
    amount,
    vendor: vendor || 'לא זוהה',
    charge_date: date || new Date().toISOString().slice(0, 10),
    card_last4: card_last4 || null,
    raw_sms: text.slice(0, 500),
  };
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { sms } = await request.json().catch(() => ({}));
  if (!sms?.trim()) return Response.json({ error: 'נדרש טקסט SMS' }, { status: 400 });

  const parsed = parseSmsBlock(sms);
  if (!parsed.length) {
    return Response.json({ error: 'לא ניתן לחלץ חיוב מהטקסט', parsed: [] }, { status: 422 });
  }

  const sb = createServiceClient();
  const orgId = profile.organization_id;

  // Get office card numbers for this org
  const { data: org } = await sb
    .from('organizations')
    .select('office_card_last4')
    .eq('id', orgId)
    .single();
  const officeCards = org?.office_card_last4 || [];

  // For each parsed charge, check if a matching expense doc exists
  const results = [];
  for (const charge of parsed) {
    // Match by amount ±5% and date ±7 days
    const dateFrom = new Date(charge.charge_date);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = new Date(charge.charge_date);
    dateTo.setDate(dateTo.getDate() + 7);

    const { data: matchingDocs } = await sb
      .from('expense_documents')
      .select('id, vendor, amount, doc_date, file_url')
      .eq('organization_id', orgId)
      .gte('doc_date', dateFrom.toISOString().slice(0, 10))
      .lte('doc_date', dateTo.toISOString().slice(0, 10))
      .gte('amount', charge.amount * 0.95)
      .lte('amount', charge.amount * 1.05);

    const isOfficeCard = charge.card_last4
      ? officeCards.includes(charge.card_last4)
      : true;

    // Save to credit_charges
    const { data: inserted } = await sb
      .from('credit_charges')
      .insert({
        organization_id: orgId,
        charge_date: charge.charge_date,
        amount: charge.amount,
        vendor: charge.vendor,
        card_last4: charge.card_last4,
        raw_sms: charge.raw_sms,
        matched_doc_id: matchingDocs?.[0]?.id || null,
        alert_status: matchingDocs?.length ? 'matched' : 'pending',
      })
      .select('id')
      .single();

    results.push({
      ...charge,
      id: inserted?.id,
      is_office_card: isOfficeCard,
      matched: matchingDocs?.length > 0,
      matching_docs: matchingDocs || [],
      alert_status: matchingDocs?.length ? 'matched' : 'pending',
    });
  }

  return Response.json({ parsed: results, count: results.length });
}
