/**
 * POST /api/expenses/scan-receipt
 * Parse an Israeli receipt or invoice (image or PDF) using the
 * israeli-receipt-scanner skill and return structured JSON.
 *
 * Accepts: multipart/form-data with field "file" (JPEG/PNG/PDF/WEBP)
 * Returns: { ok, result: ReceiptScanResult } or { error }
 */
import { requireAdmin } from '@/lib/adminAuth';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert Israeli accounting assistant that parses Hebrew and English receipts and tax invoices.
Apply the Israeli Receipt Scanner skill exactly as defined. Today's date is used only for validation; always use the invoice's own date for threshold logic.

STRICT RULES:
1. vat_deductible = true ONLY when ALL hold:
   - document_type is "tax_invoice" or "tax_invoice_receipt"
   - supplier_type = "osek_murshe" with a valid 9-digit osek number
   - buyer_name is printed on the invoice (not null)
   - category is NOT "fuel" (input VAT on passenger-vehicle fuel is restricted)
   - If subtotal > threshold for invoice date → allocation_number must be present
     Thresholds: 2025 → 20000 NIS; Jan–May 2026 → 10000 NIS; Jun 2026+ → 5000 NIS
2. Foreign receipts (AWS, Google, Stripe, Apple, OpenAI, Anthropic, etc.): set vat_deductible=false, add foreign_vendor warning
3. Fuel/vehicle receipts: set vat_deductible=false, needs_review=true, note mixed-use split
4. Plain receipt (קבלה only): vat_deductible=false
5. Israeli VAT rate is 18% (from 2025 onward)

OUTPUT: Return ONLY a single valid JSON object, no markdown, no explanation.`;

const USER_PROMPT = `Parse this Israeli receipt/invoice and return structured JSON.

Required JSON schema:
{
  "document_type": "tax_invoice" | "tax_invoice_receipt" | "receipt" | "proforma" | "unknown",
  "merchant": {
    "name_he": string | null,
    "name_en": string | null,
    "vat_registration": string | null,
    "supplier_type": "osek_murshe" | "osek_patur" | "unknown",
    "branch": string | null,
    "address": string | null
  },
  "buyer_name": string | null,
  "buyer_vat_number": string | null,
  "document_number": string | null,
  "allocation_number": string | null,
  "date": "YYYY-MM-DD" | null,
  "time": "HH:MM" | null,
  "items": [{ "description": string, "quantity": number | null, "unit_price": number | null, "total": number | null }],
  "subtotal": number | null,
  "vat_rate": number | null,
  "vat_amount": number | null,
  "vat_deductible": boolean,
  "total": number | null,
  "currency": "ILS" | string,
  "payment": {
    "method": "credit_card" | "cash" | "bank_transfer" | "digital_wallet" | "unknown",
    "card_last_four": string | null,
    "installments": number | null
  },
  "category": "groceries" | "fuel" | "office_supplies" | "meals" | "transportation" | "software" | "professional_services" | "telecommunications" | "insurance" | "maintenance" | "medical" | "travel" | "general",
  "category_he": string,
  "needs_review": boolean,
  "warnings": string[]
}`;

const CATEGORY_NAMES_HE = {
  groceries: 'מזון ומכולת',
  fuel: 'דלק',
  office_supplies: 'ציוד משרדי',
  meals: 'ארוחות ואירוח',
  transportation: 'תחבורה',
  software: 'תוכנה ושירותי ענן',
  professional_services: 'שירותים מקצועיים',
  telecommunications: 'תקשורת',
  insurance: 'ביטוח',
  maintenance: 'תחזוקה',
  medical: 'רפואה',
  travel: 'נסיעות',
  general: 'הוצאות כלליות',
};

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let formData;
  try { formData = await request.formData(); } catch {
    return Response.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file) return Response.json({ error: 'file field required' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'application/octet-stream';

  // Determine media type for Anthropic API
  const SUPPORTED_IMAGE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const isImage = SUPPORTED_IMAGE.includes(mimeType);
  const isPdf = mimeType === 'application/pdf';

  if (!isImage && !isPdf) {
    return Response.json({ error: `סוג קובץ לא נתמך: ${mimeType}. השתמש ב-JPEG, PNG, WEBP, או PDF.` }, { status: 400 });
  }

  // Build Anthropic content block
  const fileBlock = isPdf
    ? {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
      }
    : {
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') },
      };

  let rawText;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [fileBlock, { type: 'text', text: USER_PROMPT }],
      }],
    });
    rawText = response.content[0]?.text || '{}';
  } catch (err) {
    console.error('Claude scan-receipt error:', err.message);
    return Response.json({ error: `שגיאת AI: ${err.message}` }, { status: 500 });
  }

  // Parse JSON — strip any markdown fences Claude might add despite instructions
  let result;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    result = JSON.parse(jsonMatch[0]);
  } catch {
    return Response.json({ error: 'לא ניתן לפרסר תשובת AI', raw: rawText }, { status: 500 });
  }

  // Normalise category_he
  if (result.category && !result.category_he) {
    result.category_he = CATEGORY_NAMES_HE[result.category] || 'הוצאות כלליות';
  }

  // Ensure warnings is an array
  if (!Array.isArray(result.warnings)) result.warnings = [];

  // Server-side deductibility guard: never trust AI to set vat_deductible=true for receipts
  if (result.document_type === 'receipt' || result.document_type === 'proforma') {
    result.vat_deductible = false;
  }
  if (result.category === 'fuel') {
    result.vat_deductible = false;
    result.needs_review = true;
  }

  return Response.json({ ok: true, result });
}
