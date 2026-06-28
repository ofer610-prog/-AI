/**
 * expenseOutlookScan.js
 * Scans a connected Hotmail / Outlook mailbox for Israeli invoices and receipts.
 * Mirrors expenseGmailScan.js but uses Microsoft Graph API.
 *
 * Features (from israeli-receipt-scanner + israeli-expense-categorizer skills):
 *  - Searches for emails from known Israeli suppliers and government bodies
 *  - Detects salary slips (תלוש שכר), pension statements, VAT confirmations, income-tax payments
 *  - Extracts amounts with Hebrew shekel patterns
 *  - Deduplicates against expense_documents table (±1 ILS tolerance)
 *  - Auto-categorizes using Israeli chart-of-accounts mapping
 */

import { refreshOutlookToken, searchOutlookMessages, getOutlookAttachment } from '@/lib/outlookClient';
import { saveGmailReceiptToDrive } from '@/lib/expenseDriveSave';

// ── Supplier patterns ─────────────────────────────────────────────────────────

const KNOWN_SUPPLIERS = [
  // Government / tax
  { item: 'מס הכנסה',     patterns: ['mas.gov.il', 'taxes.gov.il', 'מס הכנסה', 'income tax', 'misim'],             category: 'income_tax',   section: 'income_tax' },
  { item: 'מע"מ',          patterns: ['vat.gov.il', 'מע"מ', 'מס ערך מוסף', 'maam'],                                 category: 'vat_payment',  section: 'vat_payment' },
  { item: 'ביטוח לאומי',   patterns: ['btl.gov.il', 'ביטוח לאומי', 'bituah leumi', 'national insurance'],           category: 'pension',      section: 'pension' },
  { item: 'עירייה / ארנונה', patterns: ['arnona', 'ארנונה', 'municipality', 'עירייה'],                               category: 'property',     section: 'personal' },
  // Payroll / pension
  { item: 'תלוש שכר',      patterns: ['payslip', 'תלוש שכר', 'salary slip', 'hilan', 'חילן', 'mysalary'],           category: 'salary',       section: 'salary' },
  { item: 'פנסיה / גמל',   patterns: ['pension', 'פנסיה', 'גמל', 'מגדל', 'הראל', 'כלל ביטוח', 'מנורה', 'אנליסט', 'מיטב'], category: 'pension', section: 'pension' },
  // Telecom
  { item: 'סלקום',         patterns: ['celcom', 'cellcom', 'סלקום'],                                                 category: 'telecom' },
  { item: 'פרטנר',         patterns: ['partner.co.il', 'פרטנר'],                                                     category: 'telecom' },
  { item: 'HOT',           patterns: ['hot.net.il', 'hot mobile', 'הוט'],                                            category: 'telecom' },
  { item: 'בזק',           patterns: ['bezeq', 'בזק'],                                                               category: 'telecom' },
  { item: '019 מובייל',    patterns: ['019mobile', '019'],                                                            category: 'telecom' },
  { item: 'גולן טלקום',   patterns: ['golan.co.il', 'גולן'],                                                        category: 'telecom' },
  // Utilities
  { item: 'חשמל',          patterns: ['iec.co.il', 'חברת חשמל', 'electricity'],                                      category: 'office' },
  { item: 'מים',           patterns: ['mekorot', 'מקורות', 'מים', 'water corp'],                                     category: 'office' },
  // Cloud / SaaS (foreign vendors — reverse-charge VAT)
  { item: 'Google',        patterns: ['google.com', 'google workspace', 'googleapis'],                                category: 'software', foreign: true },
  { item: 'Microsoft',     patterns: ['microsoft.com', 'office 365', 'azure', 'microsoft 365'],                      category: 'software', foreign: true },
  { item: 'AWS',           patterns: ['amazonaws.com', 'aws.amazon.com', 'amazon web services'],                      category: 'software', foreign: true },
  { item: 'Anthropic / Claude', patterns: ['anthropic.com', 'claude.ai', 'billing@anthropic'],                       category: 'software', foreign: true },
  { item: 'OpenAI',        patterns: ['openai.com', 'chatgpt'],                                                       category: 'software', foreign: true },
  { item: 'GitHub',        patterns: ['github.com', 'github copilot'],                                               category: 'software', foreign: true },
  { item: 'Zoom',          patterns: ['zoom.us', 'zoom video'],                                                       category: 'software', foreign: true },
  // Insurance
  { item: 'ביטוח',         patterns: ['insurance', 'ביטוח', 'הפניקס', 'אקסלנס', 'שירביט', 'ayalon', 'אייל'],        category: 'insurance' },
  // Office / supplies
  { item: 'Office Depot',  patterns: ['officedepot', 'office depot', 'קראוויץ'],                                     category: 'office' },
  { item: 'אמזון',         patterns: ['amazon.co.il', 'amazon.com/invoices'],                                        category: 'office', foreign: true },
];

// ── Amount extraction ─────────────────────────────────────────────────────────

const AMOUNT_RE = /(?:₪|ש[״"]ח|NIS|ILS|סה[״"]כ[^0-9]{0,20}|לתשלום[^0-9]{0,20})\s*([0-9]{1,9}(?:[,.][0-9]{1,2})?)/gi;

function amountFrom(text) {
  let best = 0;
  let m;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    if (v > best && v < 2_000_000) best = v;
  }
  return best || null;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// ── OData filter builder ─────────────────────────────────────────────────────

function buildFilters(since, suppliers) {
  const dateFilter = `receivedDateTime ge ${since.toISOString()}`;
  // Build OR list of subject/from filters for key terms
  const terms = [
    'חשבונית', 'invoice', 'קבלה', 'receipt', 'תלוש', 'payslip',
    'מע"מ', 'vat', 'ביטוח לאומי', 'מס הכנסה',
    'salary', 'שכר', 'פנסיה',
  ];
  // Graph API $search is easier for broad matching; use $filter for date only
  // and fetch a broad window, then filter client-side
  return dateFilter;
}

// ── Category lookup ───────────────────────────────────────────────────────────

function detectSupplier(subject = '', fromEmail = '', fromName = '', body = '') {
  const haystack = [subject, fromEmail, fromName, body.slice(0, 500)].join(' ').toLowerCase();
  for (const sup of KNOWN_SUPPLIERS) {
    if (sup.patterns.some(p => haystack.includes(p.toLowerCase()))) {
      return sup;
    }
  }
  return null;
}

function detectDocType(subject = '', body = '') {
  const text = (subject + ' ' + body).toLowerCase();
  if (text.includes('תלוש שכר') || text.includes('payslip') || text.includes('salary slip')) return 'salary';
  if (text.includes('תלוש') || text.includes('hilan') || text.includes('חילן')) return 'salary';
  if (text.includes('חשבונית מס') || text.includes('tax invoice')) return 'tax_invoice';
  if (text.includes('חשבונית')) return 'invoice';
  if (text.includes('קבלה') || text.includes('receipt')) return 'receipt';
  if (text.includes('מקדמה') || text.includes('advance payment') || text.includes('income tax')) return 'tax_payment';
  if (text.includes('מע"מ') || text.includes('vat')) return 'vat_payment';
  return 'document';
}

// ── Main scan function ────────────────────────────────────────────────────────

/**
 * @param {object} sb         Supabase service client
 * @param {object} org        Organization row with outlook_* fields
 * @param {number} days       How many days back to scan (default 7)
 */
export async function scanOutlookOrg(sb, org, days = 7) {
  if (!org.outlook_connected || !org.outlook_refresh_token) {
    return { skipped: 'no_outlook_token' };
  }

  // ── 1. Refresh access token ──────────────────────────────────────────────
  let accessToken;
  let newRefreshToken;
  try {
    const tokens = await refreshOutlookToken(org.outlook_refresh_token);
    accessToken = tokens.access_token;
    newRefreshToken = tokens.refresh_token; // Microsoft rotates refresh tokens
    if (newRefreshToken && newRefreshToken !== org.outlook_refresh_token) {
      await sb.from('organizations').update({ outlook_refresh_token: newRefreshToken }).eq('id', org.id);
    }
  } catch (e) {
    await sb.from('organizations').update({ outlook_connected: false }).eq('id', org.id);
    return { error: `Token refresh failed: ${e.message}` };
  }

  // ── 2. Fetch emails ───────────────────────────────────────────────────────
  const since = new Date(Date.now() - days * 86_400_000);
  const filter = buildFilters(since, KNOWN_SUPPLIERS);

  let messages = [];
  try {
    messages = await searchOutlookMessages(accessToken, filter, 100);
  } catch (e) {
    return { error: `Graph search failed: ${e.message}` };
  }

  // ── 3. Filter and process ─────────────────────────────────────────────────
  const stats = { found: messages.length, imported: 0, pending_review: 0, duplicates: 0, skipped: 0 };
  const INVOICE_KEYWORDS = ['חשבונית', 'invoice', 'קבלה', 'receipt', 'תלוש', 'payslip',
    'מע"מ', 'vat', 'ביטוח לאומי', 'מס הכנסה', 'salary', 'שכר', 'פנסיה', 'תשלום', 'payment'];

  for (const msg of messages) {
    const subject = msg.subject || '';
    const fromEmail = msg.from?.emailAddress?.address || '';
    const fromName = msg.from?.emailAddress?.name || '';
    const bodyText = stripHtml(msg.body?.content || '');
    const combined = subject + ' ' + fromEmail + ' ' + fromName + ' ' + bodyText;

    // Skip if no relevant keywords
    const relevant = INVOICE_KEYWORDS.some(kw => combined.toLowerCase().includes(kw.toLowerCase()));
    if (!relevant) { stats.skipped++; continue; }

    const sup = detectSupplier(subject, fromEmail, fromName, bodyText);
    const docType = detectDocType(subject, bodyText);
    const amount = amountFrom(combined);
    if (!amount && !sup) { stats.skipped++; continue; }

    const vendor = sup?.item || fromName || fromEmail.split('@')[0];
    const category = sup?.category || 'general';
    const section = sup?.section || 'office';
    const isForeign = !!sup?.foreign;

    const docDate = msg.receivedDateTime
      ? new Date(msg.receivedDateTime).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const [docYear, docMonthStr] = docDate.split('-');
    const docMonth = Number(docMonthStr);

    // ── Dedup check ─────────────────────────────────────────────────────────
    const msgId = `outlook_${msg.id}`;
    const { data: existing } = await sb.from('expense_documents')
      .select('id').eq('organization_id', org.id).eq('gmail_message_id', msgId).maybeSingle();
    if (existing) { stats.duplicates++; continue; }

    // Also check by amount ± 1 ILS and date for the same month
    if (amount) {
      const { data: amtMatch } = await sb.from('expense_documents')
        .select('id')
        .eq('organization_id', org.id)
        .eq('expense_month_num', docMonth)
        .eq('expense_year', Number(docYear))
        .gte('amount', amount - 1)
        .lte('amount', amount + 1)
        .maybeSingle();
      if (amtMatch) { stats.duplicates++; continue; }
    }

    // ── Build description ───────────────────────────────────────────────────
    const description = [
      docType === 'salary' ? 'תלוש שכר' : docType === 'vat_payment' ? 'תשלום מע״מ' : docType === 'tax_payment' ? 'מס הכנסה' : null,
      subject.slice(0, 120),
      isForeign ? '(ספק זר — ריברס צ׳ארג׳)' : null,
    ].filter(Boolean).join(' | ');

    // ── Needs review logic ──────────────────────────────────────────────────
    const needsReview = !amount || isForeign || !sup;

    // ── Insert ──────────────────────────────────────────────────────────────
    const { error: insertErr } = await sb.from('expense_documents').insert({
      organization_id: org.id,
      gmail_message_id: msgId, // reuse field for Outlook IDs prefixed with "outlook_"
      vendor,
      amount,
      doc_date: docDate,
      expense_year: Number(docYear),
      expense_month_num: docMonth,
      expense_item: vendor,
      expense_section: section,
      category,
      description,
      status: needsReview ? 'needs_review' : 'approved',
      file_name: subject.slice(0, 200) || 'Outlook מסמך',
    });

    if (insertErr) {
      console.error('Outlook insert error:', insertErr.message);
      stats.skipped++;
      continue;
    }

    if (needsReview) stats.pending_review++;
    else stats.imported++;
  }

  // ── Update last_sync ──────────────────────────────────────────────────────
  await sb.from('organizations').update({ last_outlook_sync: new Date().toISOString() }).eq('id', org.id);

  return stats;
}
