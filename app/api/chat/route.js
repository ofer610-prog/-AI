import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(request) {
  const authSb = await createClient();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { messages } = await request.json();
  if (!messages?.length) return Response.json({ error: 'No messages' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });

  const orgId = profile.organization_id;
  const { data: org } = await supabase.from('organizations').select('*').eq('id', orgId).single();

  const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const recentMonths = [currentMonth - 2, currentMonth - 1, currentMonth].map(m => m <= 0 ? m + 12 : m);

  const [
    { data: clients },
    { data: matters },
    { data: recentInvoices },
    { data: allInvoices },
    { data: officeExpenses },
    { data: team },
    { data: tasks },
  ] = await Promise.all([
    supabase.from('clients').select('id, name').eq('organization_id', orgId),
    supabase.from('matters').select('id, title, type, status, agreed_fee, collected_amount, balance_amount').eq('organization_id', orgId),
    supabase.from('invoices').select('amount, vat_amount, issue_date, due_date, status, client_name').eq('organization_id', orgId).gte('issue_date', threeMonthsAgo),
    supabase.from('invoices').select('amount, due_date, status, client_name').eq('organization_id', orgId),
    supabase.from('office_expenses').select('amount, month, section, item_name').eq('organization_id', orgId).eq('year', currentYear).in('month', recentMonths),
    supabase.from('profiles').select('full_name, role, monthly_salary').eq('organization_id', orgId),
    supabase.from('tasks').select('status, due_date, title').eq('organization_id', orgId).neq('status', 'done').limit(10),
  ]);

  const monthlyIncome = (recentInvoices || []).reduce((a, b) => a + Number(b.amount || 0), 0) / 3;
  const monthlyExpense = (officeExpenses || []).filter(e => !['salary','pension','vat_payment','income_tax'].includes(e.section)).reduce((a, b) => a + Number(b.amount || 0), 0) / 3;
  const openInvoices = (allInvoices || []).filter(i => i.status !== 'paid');
  const overdueInvoices = openInvoices.filter(i => i.due_date && new Date(i.due_date) < new Date());
  const totalOpen = openInvoices.reduce((a, b) => a + Number(b.amount || 0), 0);
  const activePipeline = (matters || []).filter(m => m.status === 'active');
  const overdueTasks = (tasks || []).filter(t => t.due_date && new Date(t.due_date) < new Date());

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
    pipeline: {
      active_matters: activePipeline.length,
      total_agreed: Math.round(activePipeline.reduce((s, m) => s + Number(m.agreed_fee || 0), 0)),
      total_balance_to_collect: Math.round(activePipeline.reduce((s, m) => s + Number(m.balance_amount || 0), 0)),
    },
    clients_count: clients?.length || 0,
    team_size: team?.length || 0,
    total_salary_monthly: Math.round((team || []).reduce((a, b) => a + Number(b.monthly_salary || 0), 0)),
    pending_tasks: (tasks || []).length,
    overdue_tasks: overdueTasks.length,
  };

  const systemPrompt = `אתה יועץ פיננסי-עסקי בכיר למשרד עורכי דין בישראל המתמחה בנדל"ן. אתה מומחה בהנהלת חשבונות לעוסק מורשה, חוקי מס בישראל (מע"מ, מ"ה, ביטוח לאומי), ניהול גבייה, רווחיות, ותמחור.

נתוני המשרד האמיתיים (90 הימים האחרונים):
${JSON.stringify(summary, null, 2)}

הנחיות:
- ענה בעברית, ענייני וקצר.
- השתמש במספרים האמיתיים מהנתונים — לא הנחות כלליות.
- ציין כשיש חוב פתוח גבוה או פגישות שפג תוקפן.
- תן עצות קונקרטיות: "גבה ₪X מ-Y לפני תאריך Z".
- כשמדובר במס: ציין שיש לאמת מול רו"ח.
- תהיה ישיר ותכליתי.`;

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
