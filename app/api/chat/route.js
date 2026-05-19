import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { messages } = await request.json();

  // Build context from data
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('id', user.id)
    .single();

  const orgId = profile.organization_id;

  const [
    { data: clients },
    { data: matters },
    { data: income },
    { data: expense },
    { data: invoices },
    { data: timesheet },
    { data: team },
  ] = await Promise.all([
    supabase.from('clients').select('id, name'),
    supabase.from('matters').select('id, title, type, status, client_id, agreed_fee, responsible_lawyer_id'),
    supabase.from('income').select('date, amount, vat, client_id, matter_id, description').gte('date', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
    supabase.from('expense').select('date, amount, vat, description').gte('date', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
    supabase.from('invoices').select('client_id, client_name, amount, due_date, status'),
    supabase.from('timesheet').select('lawyer_id, matter_id, hours, billable, date').gte('date', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
    supabase.from('profiles').select('id, full_name, role, monthly_salary, hourly_rate'),
  ]);

  // Aggregate stats
  const monthlyIncome = (income || []).reduce((a, b) => a + Number(b.amount || 0), 0) / 3;
  const monthlyExpense = (expense || []).reduce((a, b) => a + Number(b.amount || 0), 0) / 3;
  const openInvoices = (invoices || []).filter(i => i.status !== 'paid');
  const overdueInvoices = openInvoices.filter(i => new Date(i.due_date) < new Date());
  const totalOpen = openInvoices.reduce((a, b) => a + Number(b.amount || 0), 0);

  const summary = {
    organization: profile.organizations.name,
    user: { name: profile.full_name, role: profile.role },
    financials_3mo_avg: {
      monthlyIncome,
      monthlyExpense,
      monthlyNet: monthlyIncome - monthlyExpense,
    },
    invoices: {
      total: invoices?.length || 0,
      open: openInvoices.length,
      overdue: overdueInvoices.length,
      total_open_amount: totalOpen,
    },
    clients_count: clients?.length || 0,
    active_matters: matters?.filter(m => m.status === 'active').length || 0,
    matters_by_type: (matters || []).reduce((acc, m) => { acc[m.type] = (acc[m.type] || 0) + 1; return acc; }, {}),
    team_size: team?.length || 0,
    total_salary_monthly: (team || []).reduce((a, b) => a + Number(b.monthly_salary || 0), 0),
  };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `אתה יועץ פיננסי-עסקי בכיר למשרד עורכי דין בישראל המתמחה בנדל"ן. אתה מומחה בהנהלת חשבונות לעוסק מורשה, חוקי מס בישראל (מע"מ, מ"ה, ביטוח לאומי), ניהול גבייה, רווחיות, ותמחור.

נתוני המשרד:
${JSON.stringify(summary, null, 2)}

הנחיות:
- ענה בעברית, ענייני וקצר.
- השתמש במספרים האמיתיים מהנתונים.
- תן עצות קונקרטיות, לא כלליות.
- כשמדובר במס: ציין שצריך לוודא מול רו"ח.
- אל תתנצל יותר מדי. תהיה ישיר.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  const text = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');

  return Response.json({ text });
}
