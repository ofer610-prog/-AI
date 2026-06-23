import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const now = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  // Build list of last 3 months (excluding current)
  const prevMonths = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    prevMonths.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  // 1. Get all expense items from last 3 months + all is_recurring items
  const minYear  = prevMonths[2].year;
  const minMonth = prevMonths[2].month;

  const [{ data: patternItems }, { data: recurringItems }] = await Promise.all([
    sb.from('office_expenses')
      .select('section, item_name, year, month')
      .eq('organization_id', profile.organization_id)
      .gte('year', minYear)
      .order('year'),
    sb.from('office_expenses')
      .select('section, item_name, is_recurring')
      .eq('organization_id', profile.organization_id)
      .eq('is_recurring', true),
  ]);

  const allItems = [...(patternItems || []), ...(recurringItems || [])];

  if (!allItems?.length) return Response.json({ missing: [], ok: true });

  // Count appearances per item in last 3 months
  const countMap = {};
  const recurringSet = new Set();

  for (const row of allItems) {
    const key = `${row.section}__${row.item_name}`;
    if (row.is_recurring) { recurringSet.add(key); continue; }
    const inPrev = prevMonths.some(p => p.year === row.year && p.month === row.month);
    if (inPrev) {
      countMap[key] = (countMap[key] || 0) + 1;
      if (!countMap[`_section_${key}`]) countMap[`_section_${key}`] = row.section;
    }
  }

  // Items recurring by pattern (≥2 of last 3 months)
  const patternRecurring = Object.entries(countMap)
    .filter(([k, v]) => !k.startsWith('_section_') && v >= 2)
    .map(([k]) => k);

  const expectedKeys = new Set([...recurringSet, ...patternRecurring]);
  if (!expectedKeys.size) return Response.json({ missing: [], ok: true });

  // 2. Check which of those have docs linked for current month
  const { data: thisMonthDocs } = await sb.from('expense_documents')
    .select('expense_section, expense_item')
    .eq('organization_id', profile.organization_id)
    .eq('expense_year', thisYear)
    .eq('expense_month_num', thisMonth)
    .in('status', ['linked', 'needs_review']);

  const coveredKeys = new Set(
    (thisMonthDocs || []).map(d => `${d.expense_section}__${d.expense_item}`)
  );

  // 3. Build missing list with metadata from office_expenses
  const { data: latestItems } = await sb.from('office_expenses')
    .select('section, item_name, amount, is_recurring')
    .eq('organization_id', profile.organization_id)
    .order('month', { ascending: false });

  // De-dup to latest entry per item
  const metaMap = {};
  for (const row of (latestItems || [])) {
    const key = `${row.section}__${row.item_name}`;
    if (!metaMap[key]) metaMap[key] = row;
  }

  const missing = [];
  for (const key of expectedKeys) {
    if (coveredKeys.has(key)) continue;
    const [section, item_name] = key.split('__');
    const meta = metaMap[key] || {};
    const isPattern = patternRecurring.includes(key);
    missing.push({
      section: meta.section || section,
      item_name: meta.item_name || item_name,
      last_amount: meta.amount || null,
      is_recurring: meta.is_recurring || false,
      detected_as: isPattern ? 'pattern' : 'marked',
    });
  }

  missing.sort((a, b) => a.item_name.localeCompare(b.item_name, 'he'));

  return Response.json({
    ok: true,
    year: thisYear,
    month: thisMonth,
    missing,
    total_expected: expectedKeys.size,
    total_covered: coveredKeys.size,
  });
}
