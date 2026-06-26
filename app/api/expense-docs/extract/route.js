/**
 * POST /api/expense-docs/extract
 * Extract fields from an uploaded receipt/invoice using the Israeli Receipt Scanner skill.
 * Delegates to /api/expenses/scan-receipt and maps the rich result to the simpler
 * shape expected by the expense-docs UI (vendor, amount, date, description, category).
 */
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert Israeli accounting assistant that parses Hebrew and English receipts and tax invoices. Today's Israeli VAT rate is 18%.`;

const EXTRACT_PROMPT = `Parse this Israeli receipt/invoice and return ONLY a valid JSON object (no markdown, no explanation):
{
  "vendor": "שם הספק/עסק בעברית או באנגלית",
  "vat_registration": "מספר עוסק מורשה 9 ספרות או null",
  "amount": 123.45,
  "vat_amount": 22.22,
  "vat_deductible": false,
  "date": "YYYY-MM-DD",
  "document_type": "tax_invoice_receipt | tax_invoice | receipt | proforma | unknown",
  "document_number": "מספר חשבונית או null",
  "allocation_number": "מספר הקצאה או null",
  "category": "groceries | fuel | office_supplies | meals | transportation | software | professional_services | telecommunications | insurance | maintenance | medical | travel | general",
  "description": "תיאור קצר של השירות/המוצר",
  "needs_review": false,
  "warnings": []
}

RULES:
- amount = total amount paid (NIS number only, no currency symbol)
- vat_deductible = true ONLY for tax_invoice or tax_invoice_receipt from osek_murshe where buyer name is printed
- Fuel receipts: vat_deductible=false, needs_review=true
- Foreign receipts (AWS/Google/Apple/Stripe/etc): vat_deductible=false, add "foreign_vendor" warning
- If field not found: use null
- Return JSON only`;

export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return Response.json({ error: 'file required' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'application/octet-stream';

  const SUPPORTED_IMAGE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const isImage = SUPPORTED_IMAGE.includes(mimeType);
  const isPdf = mimeType === 'application/pdf';

  if (!isImage && !isPdf) {
    return Response.json({ extracted: {}, note: `סוג קובץ לא נתמך: ${mimeType}` });
  }

  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } };

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: EXTRACT_PROMPT }] }],
    });

    const text = response.content[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ extracted: {} });

    const raw = JSON.parse(jsonMatch[0]);

    // Server-side safety guards
    if (raw.document_type === 'receipt' || raw.document_type === 'proforma') raw.vat_deductible = false;
    if (raw.category === 'fuel') { raw.vat_deductible = false; raw.needs_review = true; }
    if (raw.amount && isNaN(Number(raw.amount))) delete raw.amount;

    return Response.json({ extracted: raw });
  } catch (err) {
    console.error('Claude extract error:', err.message);
    return Response.json({ extracted: {}, error: err.message });
  }
}
