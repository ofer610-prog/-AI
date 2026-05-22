import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServiceClient } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(request) {
  const { messages, organizationId } = await request.json();
  if (!messages?.length) return Response.json({ error: 'No messages' }, { status: 400 });

  const supabase = createServiceClient();

  // Load org
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const orgId = organizationId || org?.id;

  const [
    { data: clients },
    { data: matters },
    { data: income },
    { data: expense },
    { data: invoices },
    { data: team },
  ] = await Promise.all([
    supabase.from('clients').select('id, name').eq('organization_id', orgId),
    supabase.from('matters').select('id, title, type, status, agreed_fee').eq('organization_id', orgId),
    supabase.from('income').select('date, amount, vat, description').eq('organization_id', orgId).gte('date', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
    supabase.from('expense').select('date, amount, vat, description').eq('organization_id', orgId).gte('date', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
    supabase.from('invoices').select('amount, due_date, status, client_name').eq('organization_id', orgId),
    supabase.from('profiles').select('full_name, role, monthly_salary').eq('organization_id', orgId),
  ]);

  const monthlyIncome = (income || []).reduce((a, b) => a + Number(b.amount || 0), 0) / 3;
  const monthlyExpense = (expense || []).reduce((a, b) => a + Number(b.amount || 0), 0) / 3;
  const openInvoices = (invoices || []).filter(i => i.status !== 'paid');
  const overdueInvoices = openInvoices.filter(i => new Date(i.due_date) < new Date());
  const totalOpen = openInvoices.reduce((a, b) => a + Number(b.amount || 0), 0);

  const summary = {
    organization: org?.name || 'משרד עו"ד',
    financials_3mo_avg: {
      monthlyIncome: Math.round(monthlyIncome),
      monthlyExpense: Math.round(monthlyExpense),
      monthlyNet: Math.round(monthlyIncome - monthlyExpense),
    },
    invoices: {
      open: openInvoices.length,
      overdue: overdueInvoices.length,
      total_open_amount: Math.round(totalOpen),
    },
    clients_count: clients?.length || 0,
    active_matters: matters?.filter(m => m.status === 'active').length || 0,
    team_size: team?.length || 0,
    total_salary_monthly: Math.round((team || []).reduce((a, b) => a + Number(b.monthly_salary || 0), 0)),
  };

  const systemPrompt = `אתה יועץ פיננסי-עסקי בכיר למשרד עורכי דין בישראל המתמחה בנדל"ן. אתה מומחה בהנהלת חשבונות לעוסק מורשה, חוקי מס בישראל (מע"מ, מ"ה, ביטוח לאומי), ניהול גבייה, רווחיות, ותמחור.

נתוני המשרד (90 הימים האחרונים):
${JSON.stringify(summary, null, 2)}

הנחיות:
- ענה בעברית, ענייני וקצר.
- השתמש במספרים האמיתיים מהנתונים.
- תן עצות קונקרטיות, לא כלליות.
- כשמדובר במס: ציין שצריך לוודא מול רו"ח.
- אל תתנצל יותר מדי. תהיה ישיר.`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: systemPrompt,
  });

  // Build chat history (all but last message)
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMessage.content);
  const text = result.response.text();

  return Response.json({ text });
}
