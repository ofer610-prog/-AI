/**
 * Monthly accountant report: aggregates all expenses for a month,
 * builds an analyzed Excel workbook and emails it to the firm's accountant.
 */
import * as XLSX from 'xlsx';
import { sendEmail } from '@/lib/notifications';

const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const SECTION_HE = { office: 'עלויות משרדיות', personal: 'אישי / נכסים' };
const fmtIL = (n) => Math.round(Number(n) || 0);

/**
 * Build + send the report.
 * @param sb     Supabase service client
 * @param orgId  organization id
 * @param year   report year
 * @param month  report month (1-12)
 * @returns { ok, sent, totals, error? }
 */
export async function sendAccountantReport(sb, orgId, year, month) {
  const monthStr = String(month).padStart(2, '0');
  const from = `${year}-${monthStr}-01`;
  const to = new Date(year, month, 0); // last day of month
  const toStr = `${year}-${monthStr}-${String(to.getDate()).padStart(2, '0')}`;

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const monthStr2 = String(month).padStart(2, '0');

  const [
    { data: org },
    { data: officeExp },
    { data: officePrev },
    { data: bankExp },
    { data: invoices },
    { data: expenseDocs },
  ] = await Promise.all([
    sb.from('organizations').select('name, accountant_email, vat_rate').eq('id', orgId).single(),
    sb.from('office_expenses').select('section, item_name, amount, notes')
      .eq('organization_id', orgId).eq('year', year).eq('month', month),
    sb.from('office_expenses').select('section, amount')
      .eq('organization_id', orgId).eq('year', prevYear).eq('month', prevMonth),
    sb.from('expense').select('date, description, amount, vat, category, source, notes')
      .eq('organization_id', orgId).gte('date', from).lte('date', toStr).order('date'),
    sb.from('invoices').select('invoice_number, number, client_name, amount, issue_date, status')
      .eq('organization_id', orgId).gte('issue_date', from).lte('issue_date', toStr)
      .neq('status', 'cancelled').order('issue_date'),
    sb.from('expense_documents')
      .select('expense_item, expense_section, file_name, file_url, amount, vendor, doc_date, status')
      .eq('organization_id', orgId)
      .eq('expense_year', year)
      .eq('expense_month_num', month)
      .not('expense_item', 'is', null),
  ]);

  if (!org?.accountant_email) {
    return { ok: false, error: 'לא הוגדר מייל רו"ח — הגדר בעמוד ההוצאות' };
  }

  // ── Aggregations ──
  const officeTotal = (officeExp || []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const officePrevTotal = (officePrev || []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const bySection = {};
  (officeExp || []).forEach((e) => {
    bySection[e.section] = (bySection[e.section] || 0) + Number(e.amount || 0);
  });
  const bankTotal = (bankExp || []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const bankVat = (bankExp || []).reduce((s, e) => s + Number(e.vat || 0), 0);
  const incomeTotal = (invoices || []).reduce((s, i) => s + Number(i.amount || 0), 0);
  const monthName = `${MONTHS_HE[month - 1]} ${year}`;
  const delta = officePrevTotal ? Math.round(((officeTotal - officePrevTotal) / officePrevTotal) * 100) : null;

  // ── Workbook ──
  const wb = XLSX.utils.book_new();

  // Sheet 1: summary + analysis
  const summary = [
    [`דוח הוצאות חודשי — ${monthName}`],
    [`משרד: ${org.name || ''}`],
    [],
    ['ניתוח'],
    ['סה"כ הוצאות מעקב (מטריצה)', fmtIL(officeTotal)],
    ['  מזה — עלויות משרדיות', fmtIL(bySection.office || 0)],
    ['  מזה — אישי / נכסים', fmtIL(bySection.personal || 0)],
    ['השוואה לחודש קודם', officePrevTotal ? `${fmtIL(officePrevTotal)} (${delta > 0 ? '+' : ''}${delta}%)` : 'אין נתון'],
    [],
    ['הוצאות מהבנק/מסמכים (טבלת הנה"ח)', fmtIL(bankTotal)],
    ['  מע"מ תשומות מתועד', fmtIL(bankVat)],
    [],
    ['חשבוניות שהונפקו החודש (הכנסות)', fmtIL(incomeTotal)],
    ['  מספר חשבוניות', (invoices || []).length],
    [],
    ['הופק אוטומטית ע"י מערכת המשרד', new Date().toLocaleString('he-IL')],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 40 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'סיכום וניתוח');

  // Sheet 2: office expense matrix rows for the month
  const rows2 = [['אזור', 'סעיף', 'סכום', 'הערות']];
  (officeExp || [])
    .sort((a, b) => (a.section + a.item_name).localeCompare(b.section + b.item_name, 'he'))
    .forEach((e) => rows2.push([SECTION_HE[e.section] || e.section, e.item_name, fmtIL(e.amount), e.notes || '']));
  rows2.push([]);
  rows2.push(['', 'סה"כ', fmtIL(officeTotal), '']);
  const ws2 = XLSX.utils.aoa_to_sheet(rows2);
  ws2['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'הוצאות מעקב');

  // Sheet 3: bank / bookkeeping expenses
  const rows3 = [['תאריך', 'תיאור', 'סכום', 'מע"מ', 'קטגוריה', 'מקור', 'הערות']];
  (bankExp || []).forEach((e) => rows3.push([
    e.date, e.description || '', fmtIL(e.amount), fmtIL(e.vat), e.category || '', e.source || '', e.notes || '',
  ]));
  rows3.push([]);
  rows3.push(['', 'סה"כ', fmtIL(bankTotal), fmtIL(bankVat), '', '', '']);
  const ws3 = XLSX.utils.aoa_to_sheet(rows3);
  ws3['!cols'] = [{ wch: 11 }, { wch: 36 }, { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'הוצאות הנהח');

  // Sheet 4: invoices issued (income side, helps the accountant reconcile VAT)
  const rows4 = [['מס\' חשבונית', 'לקוח', 'סכום', 'תאריך', 'סטטוס']];
  (invoices || []).forEach((i) => rows4.push([
    i.invoice_number || i.number || '', i.client_name || '', fmtIL(i.amount), i.issue_date, i.status,
  ]));
  rows4.push([]);
  rows4.push(['', 'סה"כ', fmtIL(incomeTotal), '', '']);
  const ws4 = XLSX.utils.aoa_to_sheet(rows4);
  ws4['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'חשבוניות שהונפקו');

  // Sheet 5: expense documents / invoices list
  const rows5 = [['סעיף', 'קטגוריה', 'ספק/תיאור', 'תאריך', 'סכום', 'קובץ', 'סטטוס']];
  (expenseDocs || []).forEach(d => rows5.push([
    d.expense_item || '', SECTION_HE[d.expense_section] || d.expense_section || '',
    d.vendor || '', d.doc_date || '', fmtIL(d.amount), d.file_name || '', d.status || 'pending',
  ]));
  rows5.push([]);
  rows5.push(['', '', '', 'סה"כ מתועד', fmtIL((expenseDocs || []).reduce((s, d) => s + Number(d.amount || 0), 0)), '', '']);
  const ws5 = XLSX.utils.aoa_to_sheet(rows5);
  ws5['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 32 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'חשבוניות מצורפות');

  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // ── Email ──
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.7;">
      <h2>דוח הוצאות חודשי — ${monthName}</h2>
      <p>שלום,</p>
      <p>מצורף דוח ההוצאות החודשי של ${org.name || 'המשרד'} בקובץ אקסל מנותח.</p>
      <table style="border-collapse: collapse;" border="1" cellpadding="6">
        <tr><td><b>סה"כ הוצאות מעקב</b></td><td>₪${fmtIL(officeTotal).toLocaleString('he-IL')}</td></tr>
        <tr><td>עלויות משרדיות</td><td>₪${fmtIL(bySection.office || 0).toLocaleString('he-IL')}</td></tr>
        <tr><td>אישי / נכסים</td><td>₪${fmtIL(bySection.personal || 0).toLocaleString('he-IL')}</td></tr>
        <tr><td>הוצאות הנה"ח (בנק/מסמכים)</td><td>₪${fmtIL(bankTotal).toLocaleString('he-IL')}</td></tr>
        <tr><td>חשבוניות שהונפקו</td><td>₪${fmtIL(incomeTotal).toLocaleString('he-IL')} (${(invoices || []).length})</td></tr>
        <tr><td>חשבוניות הוצאה מצורפות</td><td>${(expenseDocs || []).length} קבצים בגיליון 5</td></tr>
        ${delta !== null ? `<tr><td>שינוי מחודש קודם</td><td>${delta > 0 ? '+' : ''}${delta}%</td></tr>` : ''}
      </table>
      ${(expenseDocs || []).length > 0 ? `
      <h3>חשבוניות הוצאה מצורפות</h3>
      <ul>${(expenseDocs || []).map(d =>
        `<li>${d.expense_item || ''} — ${d.vendor || ''} — ₪${fmtIL(d.amount)} — ${d.doc_date || ''}</li>`
      ).join('')}</ul>` : ''}
      <p style="color:#888; font-size:12px;">נשלח אוטומטית ממערכת ניהול המשרד.</p>
    </div>`;

  const sent = await sendEmail({
    to: org.accountant_email,
    subject: `דוח הוצאות ${monthName} — ${org.name || 'משרד עו"ד'}`,
    html,
    attachments: [{
      filename: `expenses-${year}-${monthStr}.xlsx`,
      content: xlsxBuf.toString('base64'),
    }],
  });

  return {
    ok: sent,
    sent,
    to: org.accountant_email,
    month: monthName,
    totals: {
      office: fmtIL(officeTotal),
      bank: fmtIL(bankTotal),
      income: fmtIL(incomeTotal),
    },
    error: sent ? undefined : 'שליחת המייל נכשלה — בדוק RESEND_API_KEY',
  };
}
