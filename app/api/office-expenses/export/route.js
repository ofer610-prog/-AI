/**
 * GET /api/office-expenses/export?year=2026&format=csv
 * Exports office expenses as CSV (UTF-8 BOM for Excel compatibility).
 * Includes section, item, month, amount, notes, recurring flag.
 */
import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const SECTION_LABELS = {
  salary: 'שכר',
  pension: 'פנסיה',
  vehicle: 'רכב ודלק',
  telecom: 'תקשורת',
  software: 'תוכנה ושירותי ענן',
  office: 'ציוד משרדי',
  professional: 'שירותים מקצועיים',
  insurance: 'ביטוח',
  rent: 'שכירות',
  property: 'ארנונה ונכסים',
  vat_payment: 'תשלום מע"מ',
  income_tax: 'מקדמת מס הכנסה',
  general: 'כללי',
};

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year') || new Date().getFullYear());

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('office_expenses')
    .select('section, item_name, year, month, amount, notes, is_recurring')
    .eq('organization_id', profile.organization_id)
    .eq('year', year)
    .order('section')
    .order('item_name')
    .order('month');

  if (error) return new Response(error.message, { status: 500 });

  const rows = data || [];

  // Build summary: totals by section
  const sectionTotals = {};
  for (const r of rows) {
    if (!sectionTotals[r.section]) sectionTotals[r.section] = 0;
    sectionTotals[r.section] += Number(r.amount || 0);
  }
  const grandTotal = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const csvRows = [
    [`דוח הוצאות — ${year}`],
    [],
    ['מדור', 'שם הוצאה', 'חודש', 'סכום (₪)', 'חוזרת?', 'הערות'],
    ...rows.map(r => [
      SECTION_LABELS[r.section] || r.section,
      r.item_name,
      MONTHS_HE[r.month] || r.month,
      Number(r.amount || 0).toFixed(2),
      r.is_recurring ? 'כן' : 'לא',
      r.notes || '',
    ]),
    [],
    ['סיכום לפי מדור'],
    ['מדור', 'סה"כ'],
    ...Object.entries(sectionTotals).map(([s, v]) => [SECTION_LABELS[s] || s, v.toFixed(2)]),
    [],
    ['סה"כ כולל', grandTotal.toFixed(2)],
  ];

  const BOM = '﻿';
  const csv = BOM + csvRows.map(r =>
    r.map(c => {
      const s = String(c ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expenses-${year}.csv"`,
    },
  });
}
