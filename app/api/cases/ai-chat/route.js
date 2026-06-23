import { requireAdmin } from '@/lib/adminAuth';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `חלץ את כל הפרטים האפשריים ממה שקיבלת (הודעה + מסמכים) והחזר JSON בדיוק בפורמט הבא.
החזר null עבור שדות לא ידועים או לא ברורים.

{
  "client_name": "שם הלקוח הראשי (המוכר/הקונה/השוכר מצד הלקוח)",
  "client_id_number": "מספר תעודת זהות של הלקוח (9 ספרות)",
  "client_phone": "מספר טלפון של הלקוח",
  "client_email": "כתובת אימייל של הלקוח",
  "property_address": "כתובת הנכס המלאה כולל עיר",
  "parcel": "גוש וחלקה — לדוגמה: גוש 12345 חלקה 67",
  "type": "sale|purchase|rental|tama38|pinui|inheritance|registration|mortgage|litigation|consulting|other",
  "stage": "draft|conditional|waiting|signed|registration|closed",
  "other_lawyer": "שם עורך הדין של הצד השני",
  "other_party_name": "שם הצד השני בעסקה (קונה/מוכר/משכיר)",
  "broker": "שם המתווך אם קיים",
  "agreed_fee": 12345,
  "fee_text": "תיאור שכ\"ט מילולי — לדוגמה: 1.5% + מע\"מ",
  "delivery_date": "YYYY-MM-DD",
  "description": "הערות ופרטים נוספים שאינם מסווגים בשדות אחרים",
  "case_category": "realestate|other",
  "referral_source": "מקור ההפניה אם מוזכר",
  "mortgage": "פרטי משכנתא אם מוזכרים",
  "capital_gains": "פרטי מס שבח אם מוזכרים",
  "summary": "משפט אחד המתאר את העסקה"
}

הנחיות חילוץ:
- type: sale=מכירה, purchase=רכישה, rental=שכירות, tama38=תמ\"א 38, pinui=פינוי בינוי, inheritance=ירושה, registration=רישום, mortgage=משכנתא
- stage: draft=ברירת מחדל לתיק חדש, conditional=מותנה, waiting=ממתין לצד שני, signed=נחתם
- agreed_fee: מספר בלבד ללא סימן מטבע (שקלים)
- case_category: realestate לנכסים/קרקעות, other לשאר
- מנסח טאבו: חלץ גוש/חלקה, כתובת, שמות בעלים
- מתעודת זהות: חלץ שם מלא, מספר ת.ז.
- מצילום ארנונה: חלץ כתובת, שם בעל הנכס
- החזר JSON בלבד ללא טקסט לפניו/אחריו`;

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let message = '';
  const fileContents = [];

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    message = String(formData.get('message') || '');
    const files = formData.getAll('files');

    for (const file of files) {
      if (!file || !file.size) continue;
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mime = file.type || 'image/jpeg';

      if (mime.startsWith('image/')) {
        fileContents.push({ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } });
      } else if (mime === 'application/pdf') {
        fileContents.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } });
      }
    }
  } else {
    const body = await request.json().catch(() => ({}));
    message = String(body.message || '');
  }

  if (!message.trim() && fileContents.length === 0) {
    return Response.json({ error: 'נדרשת הודעה או קובץ' }, { status: 400 });
  }

  const content = [];

  if (message.trim()) {
    content.push({ type: 'text', text: `הודעת המשתמש על העסקה:\n${message}` });
  }

  for (const fc of fileContents) {
    content.push(fc);
  }

  content.push({ type: 'text', text: EXTRACTION_PROMPT });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'לא ניתן לחלץ נתונים', raw: text.slice(0, 200) }, { status: 422 });

    const extracted = JSON.parse(jsonMatch[0]);
    return Response.json({ ok: true, extracted });
  } catch (err) {
    console.error('AI extract error', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
