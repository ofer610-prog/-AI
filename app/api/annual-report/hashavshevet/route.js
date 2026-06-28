/**
 * GET /api/annual-report/hashavshevet?year=2026
 * Exports Israeli journal entries (פקודות יומן) in tab-delimited format
 * compatible with Hashavshevet accounting software import.
 *
 * Format: tab-delimited, UTF-8 with BOM, Hebrew headers.
 * Columns per PKUDOT layout: תאריך, מספר פקודה, חשבון חובה, חשבון זכות, סכום, תיאור, אסמכתא
 *
 * Account numbers (Israeli standard chart of accounts):
 *   2200 — לקוחות (Receivables)
 *   5000 — הכנסות (Revenue)
 *   2310 — מעמ עסקאות (VAT output)
 *   7000 — הוצאות כלליות (Expenses)
 *   1310 — מעמ תשומות (VAT input)
 *   1200 — קופה/בנק (Cash/bank)
 *
 * Note: For official ITA / CPA filing, export via Hashavshevet's built-in
 * OPENFORMAT (BKMV) wizard. This file is a convenience import helper only.
 */
import { requireAdmin } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VAT_RATE = 0.18;

// Account numbers — Israeli standard chart of accounts
const ACCOUNTS = {
  receivables: '2200',  // לקוחות
  revenue: '5000',      // הכנסות
  vat_output: '2310',   // מעמ עסקאות
  expenses: '7000',     // הוצאות כלליות
  vat_input: '1310',    // מעמ תשומות
  bank: '1200',         // קופה/בנק
};

/** Format a JS Date as DD/MM/YYYY (Israeli date format required by Hashavshevet) */
function fmtDate(dateStr) {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Format amount with 2 decimal places, period as decimal separator */
function fmtAmount(n) {
  return Number(n || 0).toFixed(2);
}

/** Build a tab-delimited row */
function row(...cols) {
  return cols.join('\t');
}

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year') || new Date().getFullYear());

  const sb = createServiceClient();

  const [invRes, expRes] = await Promise.all([
    sb.from('invoices')
      .select('number,invoice_number,amount,vat_amount,issue_date,status,client_name')
      .eq('organization_id', profile.organization_id)
      .gte('issue_date', `${year}-01-01`)
      .lte('issue_date', `${year}-12-31`)
      .neq('status', 'cancelled')
      .order('issue_date'),
    sb.from('office_expenses')
      .select('item_name,amount,month,year,section')
      .eq('organization_id', profile.organization_id)
      .eq('year', year)
      .not('section', 'in', '("salary","pension","vat_payment","income_tax")')
      .order('month'),
  ]);

  const invoices = invRes.data || [];
  const expenses = expRes.data || [];

  const lines = [];

  // UTF-8 BOM — required for Hashavshevet and Excel to render Hebrew correctly
  lines.push('﻿');

  // Header comment block
  lines.push(row(`; פקודות יומן — שנת ${year}`));
  lines.push(row(`; יוצא: ${new Date().toLocaleDateString('he-IL')} | ייבא לחשבשבת דרך: קבצים → ייבוא פקודות יומן`));
  lines.push(row(`; הערה: קובץ זה הוא עזר בלבד. לצרכי רשות המסים / רו"ח — יצא קובץ OPENFORMAT/BKMV ישירות מחשבשבת`));
  lines.push('');

  // Column headers (Hebrew)
  lines.push(row('תאריך', 'מספר פקודה', 'חשבון חובה', 'חשבון זכות', 'סכום', 'תיאור', 'אסמכתא'));

  let entryNum = 1;

  // ── Invoice journal entries ──────────────────────────────────────────────────
  // Each invoice creates two entries:
  //   1. Revenue recognition: DR לקוחות (2200) / CR הכנסות (5000) — pre-VAT amount
  //   2. VAT output:          DR לקוחות (2200) / CR מעמ עסקאות (2310) — VAT amount
  // When paid: DR קופה/בנק (1200) / CR לקוחות (2200) — full amount
  lines.push('');
  lines.push(row(`; ── חשבוניות (${invoices.length}) ──`));

  for (const inv of invoices) {
    const total = Number(inv.amount || 0);
    const vat = Number(inv.vat_amount || 0) || Math.round(total * VAT_RATE / (1 + VAT_RATE) * 100) / 100;
    const preVat = total - vat;
    const dateStr = fmtDate(inv.issue_date);
    const ref = String(inv.number || inv.invoice_number || entryNum);
    const client = inv.client_name || 'לקוח';

    // Entry 1: Revenue (pre-VAT portion)
    if (preVat > 0) {
      lines.push(row(
        dateStr,
        String(entryNum++),
        ACCOUNTS.receivables,
        ACCOUNTS.revenue,
        fmtAmount(preVat),
        `חשבונית הכנסה — ${client}`,
        ref,
      ));
    }

    // Entry 2: VAT output
    if (vat > 0) {
      lines.push(row(
        dateStr,
        String(entryNum++),
        ACCOUNTS.receivables,
        ACCOUNTS.vat_output,
        fmtAmount(vat),
        `מעמ עסקאות — ${client}`,
        ref,
      ));
    }

    // Entry 3: Payment (if paid) — bank receives the full invoice amount
    if (inv.status === 'paid') {
      lines.push(row(
        dateStr,
        String(entryNum++),
        ACCOUNTS.bank,
        ACCOUNTS.receivables,
        fmtAmount(total),
        `גביה — ${client}`,
        ref,
      ));
    }
  }

  // ── Expense journal entries ───────────────────────────────────────────────────
  // Each expense:
  //   DR הוצאות כלליות (7000) — pre-VAT amount
  //   DR מעמ תשומות (1310)    — VAT input (where applicable)
  //   CR קופה/בנק (1200)      — full amount paid
  lines.push('');
  lines.push(row(`; ── הוצאות (${expenses.length}) ──`));

  for (const exp of expenses) {
    const total = Number(exp.amount || 0);
    if (total === 0) continue;

    // Determine VAT eligibility based on expense section
    // vehicle: 45%, telecom: 50%, office/professional/software: 100%, entertainment: 0%
    const section = exp.section || 'office';
    const vatEligPct = section === 'vehicle' ? 0.45
      : section === 'telecom' ? 0.50
      : section === 'general' ? 0.0
      : 1.0; // default: fully eligible

    const vat = Math.round(total * VAT_RATE / (1 + VAT_RATE) * vatEligPct * 100) / 100;
    const preVat = total - (total * VAT_RATE / (1 + VAT_RATE)); // pre-vat portion (gross)
    const expenseAmt = preVat; // expense account gets pre-VAT amount

    // Build date from month (use last day of the month as expense date)
    const monthNum = exp.month || 1;
    const expDateStr = `${String(monthNum).padStart(2, '0')}/01/${year}`.replace(/^(\d{2})\//, (_, m) => {
      const d = new Date(year, Number(m) - 1, 1);
      return `01/${String(d.getMonth() + 1).padStart(2, '0')}/`;
    });
    // Simpler approach: build DD/MM/YYYY directly
    const expDate = `01/${String(monthNum).padStart(2, '0')}/${year}`;
    const desc = exp.item_name || 'הוצאה';

    // Entry: expense + vat input vs bank
    if (vat > 0) {
      // Split: expense account + VAT input account, both credit bank
      lines.push(row(
        expDate,
        String(entryNum++),
        ACCOUNTS.expenses,
        ACCOUNTS.bank,
        fmtAmount(expenseAmt),
        `${desc} (ללא מעמ)`,
        '',
      ));
      lines.push(row(
        expDate,
        String(entryNum++),
        ACCOUNTS.vat_input,
        ACCOUNTS.bank,
        fmtAmount(vat),
        `מעמ תשומות — ${desc}`,
        '',
      ));
    } else {
      // No VAT (entertainment/general) — full amount to expense account
      lines.push(row(
        expDate,
        String(entryNum++),
        ACCOUNTS.expenses,
        ACCOUNTS.bank,
        fmtAmount(total),
        desc,
        '',
      ));
    }
  }

  // ── Totals summary (comment lines) ──────────────────────────────────────────
  const totalIncome = invoices.reduce((s, inv) => s + Number(inv.amount || 0), 0);
  const totalExp = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  lines.push('');
  lines.push(row(`; ── סיכום ${year} ──`));
  lines.push(row(`; סה"כ הכנסות: ${fmtAmount(totalIncome)} ₪ | ${invoices.length} חשבוניות`));
  lines.push(row(`; סה"כ הוצאות: ${fmtAmount(totalExp)} ₪ | ${expenses.length} רשומות`));
  lines.push(row(`; רווח גולמי: ${fmtAmount(totalIncome - totalExp)} ₪`));
  lines.push(row(`; סה"כ פקודות: ${entryNum - 1}`));

  // Join — note: BOM was pushed as first element, join with \r\n (Windows line endings for Hashavshevet)
  const content = lines[0] + lines.slice(1).join('\r\n');

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="hashavshevet-${year}.txt"`,
    },
  });
}
