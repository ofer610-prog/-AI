import { requireAdmin } from '@/lib/adminAuth';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `אתה עוזר משפטי חכם של משרד עורכי דין ישראלי. תפקידך לעזור לפתוח תיקים חדשים על-ידי חילוץ פרטים מהודעות ומסמכים.

כל תשובה שלך חייבת להיות JSON בדיוק כך:
{
  "reply": "תשובה שיחתית קצרה בעברית — מה מצאת, מה הוספת, מה עדכנת",
  "patches": {
    "client_name": "...",
    "client_id_number": "...",
    "client_phone": "...",
    "client_email": "...",
    "property_address": "...",
    "parcel": "...",
    "type": "sale|purchase|rental|tama38|pinui|inheritance|registration|mortgage|litigation|consulting|other",
    "stage": "draft|conditional|waiting|signed|registration|closed",
    "other_lawyer": "...",
    "other_party_name": "...",
    "broker": "...",
    "agreed_fee": 12345,
    "fee_text": "...",
    "delivery_date": "YYYY-MM-DD",
    "description": "...",
    "case_category": "realestate|other",
    "referral_source": "...",
    "mortgage": "...",
    "capital_gains": "..."
  },
  "confidence": {
    "field_name": "high|medium|low"
  },
  "questions": ["שאלת המשך 1", "שאלת המשך 2"]
}

כללים:
- patches: כלול רק שדות שהשתנו או התגלו עכשיו. null מוחק שדה, אין לכלול שדות ללא שינוי
- agreed_fee: מספר בלבד ללא סימן מטבע, null אם לא ידוע
- type: sale=מכירה, purchase=רכישה, rental=שכירות, tama38=תמ"א 38, pinui=פינוי בינוי, inheritance=ירושה, registration=רישום, mortgage=משכנתא
- stage: draft=ברירת מחדל, conditional=מותנה, waiting=ממתין לצד שני, signed=נחתם
- case_category: realestate לנכסים, other לשאר
- questions: עד 3 שאלות קצרות שיעזרו להשלים שדות חסרים. אל תשאל על שדות שכבר ידועים
- reply: קצר ולעניין — "מצאתי: שם לקוח X, כתובת Y. חסר: טלפון ות.ז."
- אם המשתמש מתקן שדה — עדכן רק אותו בלי לשנות שאר השדות
- מנסח טאבו: חלץ גוש/חלקה, כתובת, שמות בעלים
- מתעודת זהות: חלץ שם מלא, מספר ת.ז. (9 ספרות)
- מצילום ארנונה: חלץ כתובת ושם בעל הנכס
- החזר JSON בלבד ללא טקסט לפניו או אחריו`;

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = request.headers.get('content-type') || '';

  let userMessage = '';
  let currentForm = {};
  let history = [];   // [{role:'user'|'assistant', content: string}]
  const mediaItems = [];

  if (contentType.includes('multipart/form-data')) {
    const fd = await request.formData();
    userMessage = String(fd.get('message') || '');
    try { currentForm = JSON.parse(String(fd.get('form') || '{}')); } catch { currentForm = {}; }
    try { history     = JSON.parse(String(fd.get('history') || '[]')); } catch { history = []; }

    for (const file of fd.getAll('files')) {
      if (!file?.size) continue;
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mime   = file.type || 'image/jpeg';
      if (mime.startsWith('image/')) {
        mediaItems.push({ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } });
      } else if (mime === 'application/pdf') {
        mediaItems.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } });
      }
    }
  } else {
    const body = await request.json().catch(() => ({}));
    userMessage = String(body.message || '');
    currentForm = body.form || {};
    history     = body.history || [];
  }

  if (!userMessage.trim() && mediaItems.length === 0) {
    return Response.json({ error: 'נדרשת הודעה או קובץ' }, { status: 400 });
  }

  // Build conversation for Claude
  const filledFields = Object.entries(currentForm)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const messages = [];

  // Add prior turns (max last 6)
  for (const turn of history.slice(-6)) {
    messages.push({ role: turn.role, content: turn.content });
  }

  // Build current user content
  const userContent = [];
  if (filledFields) {
    userContent.push({ type: 'text', text: `מצב נוכחי של הטיוטה:\n${filledFields}\n\n---` });
  }
  for (const mi of mediaItems) userContent.push(mi);
  if (userMessage.trim()) {
    userContent.push({ type: 'text', text: userMessage });
  }

  messages.push({ role: 'user', content: userContent });

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1200,
      system:     SYSTEM_PROMPT,
      messages,
    });

    const raw = response.content[0]?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ reply: raw.slice(0, 300), patches: {}, questions: [] });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const patches = parsed.patches || {};

    // Remove null patches (explicit clearing is ok, but strip keys with no value change)
    const cleanPatches = {};
    for (const [k, v] of Object.entries(patches)) {
      if (v !== undefined) cleanPatches[k] = v === '' ? null : v;
    }

    return Response.json({
      ok:         true,
      reply:      parsed.reply      || 'בוצע.',
      patches:    cleanPatches,
      confidence: parsed.confidence || {},
      questions:  (parsed.questions || []).slice(0, 3),
    });
  } catch (err) {
    console.error('ai-chat error', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
