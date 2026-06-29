import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/expenses/recurring
 * מזהה ספקים שחוזרים כל חודש + מסמן מי לא הגיע החודש הנוכחי.
 */
export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = await createClient();
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // משיכת 6 חודשים אחורה
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10);

  const { data, error } = await sb.from('expense_documents')
    .select('vendor,expense_item,amount,currency,doc_date,expense_year,expense_month_num,status')
    .eq('organization_id', profile.organization_id)
    .not('status', 'in', '("removed","duplicate_review")')
    .gte('doc_date', fromDate)
    .not('vendor', 'is', null);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // קיבוץ לפי ספק
  const vendorMap = {};
  for (const row of data || []) {
    const key = row.expense_item || row.vendor || '';
    if (!key) continue;
    if (!vendorMap[key]) vendorMap[key] = { vendor: row.vendor, item: row.expense_item, months: new Set(), amounts: [], lastAmount: null };
    const monthKey = `${row.expense_year}-${row.expense_month_num}`;
    vendorMap[key].months.add(monthKey);
    if (row.amount) vendorMap[key].amounts.push(Number(row.amount));
    // שמור את הסכום האחרון
    if (row.expense_year === currentYear && row.expense_month_num === currentMonth) {
      vendorMap[key].lastAmount = row.amount;
    }
  }

  // ספקים שחוזרים ב-3+ מתוך 6 חודשים = קבועים
  const recurring = Object.entries(vendorMap)
    .filter(([, v]) => v.months.size >= 3)
    .map(([key, v]) => {
      const avg = v.amounts.length
        ? Math.round(v.amounts.reduce((s, x) => s + x, 0) / v.amounts.length)
        : null;
      const thisMonthKey = `${currentYear}-${currentMonth}`;
      const arrivedThisMonth = v.months.has(thisMonthKey);
      return {
        key,
        vendor: v.vendor || key,
        item: v.item || key,
        months_seen: v.months.size,
        avg_amount: avg,
        arrived_this_month: arrivedThisMonth,
        last_amount: v.lastAmount,
      };
    })
    .sort((a, b) => b.months_seen - a.months_seen);

  return Response.json({ ok: true, recurring, month: `${currentYear}-${String(currentMonth).padStart(2,'0')}` });
}
