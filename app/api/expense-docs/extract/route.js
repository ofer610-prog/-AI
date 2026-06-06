import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return Response.json({ error: 'file required' }, { status: 400 });

  // Read file as base64
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = file.type || 'image/jpeg';

  // Support images only for vision; PDFs we can't send directly to Claude vision
  const isImage = mimeType.startsWith('image/');
  if (!isImage) {
    // For PDFs return empty extraction (manual fill)
    return Response.json({ extracted: {}, note: 'PDF — יש למלא ידנית' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: `זוהי חשבונית עסקית. חלץ את הפרטים הבאים בפורמט JSON בדיוק:
{
  "vendor": "שם הספק/עסק",
  "amount": 123.45,
  "date": "YYYY-MM-DD",
  "description": "תיאור קצר של השירות/המוצר",
  "category": "rent|utilities|salary|office|legal|travel|marketing|professional|other"
}

חוקים:
- amount יהיה מספר בלבד ללא סימן מטבע
- אם אין תאריך ברור, החזר null עבור date
- category תהיה אחת מהאפשרויות המפורטות
- אם שדה לא ברור, החזר null
- החזר JSON בלבד ללא טקסט נוסף`
          }
        ],
      }],
    });

    const text = response.content[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ extracted: {} });

    const extracted = JSON.parse(jsonMatch[0]);
    // Sanitize
    if (extracted.amount && isNaN(Number(extracted.amount))) delete extracted.amount;
    return Response.json({ extracted });
  } catch (err) {
    console.error('Claude extract error:', err.message);
    return Response.json({ extracted: {}, error: err.message });
  }
}
