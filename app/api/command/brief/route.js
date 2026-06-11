import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/command/brief — AI manager briefing.
 * Feeds the live office snapshot to Gemini and returns prioritized,
 * actionable recommendations (collections, stuck tasks, tax prep, risks).
 */
export async function POST(request) {
  if (!(await requireAdmin())) return Response.json({ error: 'Forbidden' }, { status: 403 });

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: 'AI not configured' }, { status: 503 });
  }

  // Reuse the command snapshot via an internal call to keep logic in one place
  const snapshot = await request.json().catch(() => null);
  if (!snapshot || !snapshot.lawyers) {
    return Response.json({ error: 'snapshot required (POST the /api/command payload)' }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data: profile } = await sb
    .from('profiles').select('organization_id, full_name').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `אתה היועץ הניהולי של משרד עורכי דין ישראלי. לפניך תמונת מצב חיה של המשרד.
נתח אותה והחזר עד 8 המלצות פעולה מסודרות לפי דחיפות, בעברית, בפורמט JSON בלבד:
[{"priority": 1, "icon": "🔴|🟠|🟢", "area": "גבייה|משימות|מסים|תיקים|הוצאות", "action": "ההמלצה עצמה - קצרה וברורה", "owner": "שם עו\\"ד או 'מנהל'"}]

דגשים:
- חובות גבייה גדולים או ישנים = דחוף
- משימות באיחור לפי עו"ד
- חשבוניות בפיגור
- היערכות לתשלומי מע"מ/מקדמות (15 לחודש)
- עומס לא מאוזן בין עוה"ד
- אל תמציא נתונים. רק מה שבתמונת המצב.

תמונת מצב:
${JSON.stringify(snapshot).slice(0, 14000)}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    return Response.json({ recommendations });
  } catch (err) {
    console.error('AI brief error:', err.message);
    return Response.json({ error: 'AI error: ' + err.message }, { status: 502 });
  }
}
