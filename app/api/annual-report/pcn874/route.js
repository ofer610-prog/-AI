/**
 * GET /api/annual-report/pcn874?year=2026&period=1
 * Exports a PCN874 detailed VAT report (CSV) for a bi-monthly period.
 *
 * PCN874 is mandatory since Jan 2026 for Osek Murshe with turnover > 500,000 NIS.
 * Deadline: 23rd of the month after the period (vs 19th for regular VAT).
 * Per-invoice detail required: invoice number, date, amount (pre-VAT), VAT amount,
 * counterparty VAT registration number (if known).
 * Invoices under 5,000 NIS pre-VAT may be aggregated (single summary row).
 *
 * Source: israeli-financial-reports skill, PCN874 section.
 */
import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MONTHS_HE = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const VAT_RATE = 0.18;
const AGGREGATE_THRESHOLD = 5000; // NIS pre-VAT

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year') || new Date().getFullYear());
  // period 1-6: 1=Jan-Feb, 2=Mar-Apr, ..., 6=Nov-Dec
  const period = Math.min(6, Math.max(1, Number(searchParams.get('period') || 1)));

  const m1 = (period - 1) * 2 + 1;
  const m2 = m1 + 1;
  const dateFrom = `${year}-${String(m1).padStart(2, '0')}-01`;
  const dateTo = `${year}-${String(m2).padStart(2, '0')}-${m2 === 2 ? '29' : '30'}`;

  const sb = createServiceClient();

  const [invRes, expRes] = await Promise.all([
    sb.from('invoices')
      .select('number,invoice_number,amount,vat_amount,issue_date,client_name,client_id,clients(vat_number)')
      .eq('organization_id', profile.organization_id)
      .gte('issue_date', dateFrom)
      .lte('issue_date', dateTo)
      .neq('status', 'cancelled')
      .order('issue_date'),
    sb.from('office_expenses')
      .select('item_name,amount,month,section')
      .eq('organization_id', profile.organization_id)
      .eq('year', year)
      .in('month', [m1, m2])
      .not('section', 'in', '("salary","pension","vat_payment","income_tax")'),
  ]);

  const invoices = invRes.data || [];
  const expenses = expRes.data || [];

  // Split invoices: detailed (≥5000 pre-VAT) vs aggregated (<5000)
  const detailed = [];
  const toAggregate = [];

  for (const inv of invoices) {
    const total = Number(inv.amount || 0);
    const vat = Number(inv.vat_amount || 0) || total * VAT_RATE / (1 + VAT_RATE);
    const preVat = total - vat;
    const vatNum = inv.clients?.vat_number || '';
    const invNum = inv.number || inv.invoice_number || '';
    if (preVat >= AGGREGATE_THRESHOLD) {
      detailed.push({ invNum, date: inv.issue_date, preVat, vat, vatNum, client: inv.client_name });
    } else {
      toAggregate.push({ preVat, vat });
    }
  }

  const aggPreVat = toAggregate.reduce((s, i) => s + i.preVat, 0);
  const aggVat = toAggregate.reduce((s, i) => s + i.vat, 0);

  // Build PCN874 CSV — Israeli Tax Authority format (simplified)
  const periodLabel = `${MONTHS_HE[m1]}-${MONTHS_HE[m2]} ${year}`;
  const dueMonth = m2 === 12 ? `ינואר ${year + 1}` : MONTHS_HE[m2 + 1];
  const dueDate = `23 ל${dueMonth}`;

  const rows = [
    [`PCN874 — דוח מע"מ מפורט | ${periodLabel} | מועד הגשה: ${dueDate}`],
    [],
    ['סוג רשומה','מספר חשבונית','תאריך','לקוח / ספק','מ.ע. (עוסק)','סכום לפני מע"מ','מע"מ','סה"כ'],
    ...detailed.map(d => [
      'S', d.invNum, d.date, d.client, d.vatNum,
      fmt(d.preVat), fmt(d.vat), fmt(d.preVat + d.vat),
    ]),
  ];

  if (aggPreVat > 0) {
    rows.push(['A', `מצבר ${toAggregate.length} חשבוניות <${AGGREGATE_THRESHOLD} ₪`, `${dateFrom} עד ${dateTo}`, '—', '—', fmt(aggPreVat), fmt(aggVat), fmt(aggPreVat + aggVat)]);
  }

  // Input VAT (purchases) — office expenses
  rows.push([], ['--- מע"מ תשומות (קניות) ---']);
  rows.push(['סוג','תיאור','חודש','סכום','מע"מ משוער (18%)','הערה']);
  for (const exp of expenses) {
    const amt = Number(exp.amount || 0);
    const inputVat = amt * VAT_RATE * 0.8; // ~80% eligible per skill
    rows.push(['P', exp.item_name, MONTHS_HE[exp.month], fmt(amt), fmt(inputVat), '~80% ניכוי']);
  }

  // Totals
  const totalOutputVat = detailed.reduce((s, d) => s + d.vat, 0) + aggVat;
  const totalInputVat = expenses.reduce((s, e) => s + Number(e.amount || 0) * VAT_RATE * 0.8, 0);
  rows.push([], ['','','','','',
    'מע"מ עסקאות (פלט)', fmt(totalOutputVat), '',
  ]);
  rows.push(['','','','','',
    'מע"מ תשומות (קנייה)', fmt(totalInputVat), '',
  ]);
  rows.push(['','','','','',
    'מע"מ נטו לתשלום', fmt(totalOutputVat - totalInputVat), '',
  ]);
  rows.push([], [`הערה: דוח זה הוא עזר בלבד. יש להגיש PCN874 רשמי דרך אתר רשות המסים gov.il. מועד הגשה: ${dueDate}.`]);

  const BOM = '﻿';
  const csv = BOM + rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pcn874-${year}-period${period}.csv"`,
    },
  });
}

function fmt(n) { return Number(n || 0).toFixed(2); }
