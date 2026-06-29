/**
 * expenseOutlookScan.js
 * Scans a connected Hotmail / Outlook mailbox for Israeli invoices, receipts,
 * and any financial email — writes to gmail_processed (pending-review queue).
 */

import { refreshOutlookToken, searchOutlookMessages } from '@/lib/outlookClient';

// ── Supplier / keyword patterns ───────────────────────────────────────────────

const KNOWN_SUPPLIERS = [
  // Government / tax
  { item: 'מס הכנסה',        patterns: ['mas.gov.il', 'taxes.gov.il', 'מס הכנסה', 'income tax', 'misim'],             category: 'income_tax' },
  { item: 'מע"מ',             patterns: ['vat.gov.il', 'מע"מ', 'מס ערך מוסף', 'maam'],                                category: 'vat_payment' },
  { item: 'ביטוח לאומי',      patterns: ['btl.gov.il', 'ביטוח לאומי', 'bituah leumi', 'national insurance'],          category: 'pension' },
  { item: 'עירייה / ארנונה',  patterns: ['arnona', 'ארנונה', 'municipality', 'עירייה'],                               category: 'property' },
  // Payroll / pension
  { item: 'תלוש שכר',         patterns: ['payslip', 'תלוש שכר', 'salary slip', 'hilan', 'חילן', 'mysalary'],          category: 'salary' },
  { item: 'פנסיה / גמל',      patterns: ['pension', 'פנסיה', 'גמל', 'מגדל', 'הראל', 'כלל ביטוח', 'מנורה', 'אנליסט', 'מיטב'], category: 'pension' },
  // Telecom
  { item: 'סלקום',            patterns: ['celcom', 'cellcom', 'סלקום'],                                               category: 'telecom' },
  { item: 'פרטנר',            patterns: ['partner.co.il', 'פרטנר'],                                                   category: 'telecom' },
  { item: 'HOT',              patterns: ['hot.net.il', 'hot mobile', 'הוט'],                                          category: 'telecom' },
  { item: 'בזק',              patterns: ['bezeq', 'בזק'],                                                             category: 'telecom' },
  { item: '019 מובייל',       patterns: ['019mobile', '019'],                                                         category: 'telecom' },
  { item: 'גולן טלקום',       patterns: ['golan.co.il', 'גולן'],                                                     category: 'telecom' },
  // Utilities
  { item: 'חשמל',             patterns: ['iec.co.il', 'חברת חשמל', 'חשמל', 'electricity'],                           category: 'office' },
  { item: 'מים',              patterns: ['mekorot', 'מקורות', 'מים', 'water corp'],                                   category: 'office' },
  // Transport / parking
  { item: 'פנגו',             patterns: ['פנגו', 'pango'],                                                            category: 'transport' },
  { item: 'כביש 6',           patterns: ['כביש 6', 'כביש6', 'נתיבי ישראל', 'road6', 'kvish6'],                       category: 'transport' },
  { item: 'חניה',             patterns: ['parking', 'חניה', 'חנייה'],                                                 category: 'transport' },
  { item: 'דלק',              patterns: ['דלק', 'fuel', 'תדלוק', 'paz', 'sonol', 'delek'],                            category: 'transport' },
  // Rent
  { item: 'שכירות',           patterns: ['שכ"ד', 'שכירות', 'rent', 'house rent', 'office rent'],                     category: 'rent' },
  // Payment apps
  { item: 'ביט',              patterns: ['ביט', 'bit.co.il'],                                                         category: 'payment' },
  { item: 'Paybox',           patterns: ['paybox', 'פייבוקס'],                                                        category: 'payment' },
  { item: 'מאנקי',            patterns: ['מאנקי', 'monkey'],                                                          category: 'payment' },
  // Cloud / SaaS (foreign vendors)
  { item: 'Google',           patterns: ['google.com', 'google workspace', 'googleapis', 'גוגל'],                     category: 'software', foreign: true },
  { item: 'Microsoft',        patterns: ['microsoft.com', 'office 365', 'azure', 'microsoft 365', 'מיקרוסופט'],       category: 'software', foreign: true },
  { item: 'AWS',              patterns: ['amazonaws.com', 'aws.amazon.com', 'amazon web services'],                   category: 'software', foreign: true },
  { item: 'Anthropic / Claude', patterns: ['anthropic.com', 'claude.ai', 'billing@anthropic'],                       category: 'software', foreign: true },
  { item: 'OpenAI',           patterns: ['openai.com', 'chatgpt'],                                                    category: 'software', foreign: true },
  { item: 'GitHub',           patterns: ['github.com', 'github copilot'],                                            category: 'software', foreign: true },
  { item: 'Zoom',             patterns: ['zoom.us', 'zoom video', 'zoom'],                                            category: 'software', foreign: true },
  { item: 'Spotify',          patterns: ['spotify.com', 'spotify'],                                                   category: 'software', foreign: true },
  { item: 'Netflix',          patterns: ['netflix.com', 'netflix'],                                                   category: 'software', foreign: true },
  { item: 'Apple',            patterns: ['apple.com', 'itunes', 'appstore', 'אפל'],                                  category: 'software', foreign: true },
  { item: 'Wix',              patterns: ['wix.com', 'wix'],                                                           category: 'software', foreign: true },
  { item: 'Fiverr',           patterns: ['fiverr.com', 'fiverr'],                                                     category: 'software', foreign: true },
  { item: 'Upwork',           patterns: ['upwork.com', 'upwork'],                                                     category: 'software', foreign: true },
  // Insurance
  { item: 'ביטוח',            patterns: ['insurance', 'ביטוח', 'הפניקס', 'אקסלנס', 'שירביט', 'ayalon', 'אייל'],     category: 'insurance' },
  // Office / supplies
  { item: 'Office Depot',     patterns: ['officedepot', 'office depot', 'קראוויץ'],                                  category: 'office' },
  { item: 'אמזון',            patterns: ['amazon.co.il', 'amazon.com/invoices'],                                     category: 'office', foreign: true },
];

// Known financial domains (any email from these → always queue)
const KNOWN_DOMAINS = [
  'iec.co.il', 'btl.gov.il', 'mas.gov.il', 'vat.gov.il', 'taxes.gov.il',
  'partner.co.il', 'cellcom.co.il', 'hot.net.il', 'bezeq.co.il', 'golan.co.il',
  'microsoft.com', 'google.com', 'apple.com', 'zoom.us', 'spotify.com',
  'netflix.com', 'wix.com', 'fiverr.com', 'upwork.com', 'paybox.co.il',
];

// ── Spam / irrelevant email filter ────────────────────────────────────────────

const SKIP_DOMAINS = [
  'instagram.com', 'facebookmail.com', 'twitter.com', 'x.com', 'tiktok.com',
  'linkedin.com', 'youtube.com', 'pinterest.com', 'snapchat.com',
  'notifications@', 'noreply@bounce.', 'bounce.',
  // news / legal newsletters
  'psakdin.co.il', 'capiTax.co.il', 'globesmail.co.il', 'kfarnik.co.il',
  // shopping review requests
  'aliexpress.com', 'lapelota.co.il',
  // trade fair spam
  'yorilo41.com', 'havencool.com',
  // Meta marketing
  'global.metamail.com',
  // government non-financial
  'mod.gov.il', 'accountprotection.microsoft.com',
];

const SKIP_SUBJECT_KEYWORDS = [
  // Social media notifications
  'liked your', 'commented on', 'mentioned you', 'followed you', 'tagged you',
  'sent you a message', 'view your story', 'your reel', 'new follower',
  'אהב את', 'הגיב על', 'ציין אותך', 'עקב אחריך', 'שלח לך הודעה',
  // Marketing / newsletters
  'newsletter', 'unsubscribe', 'הסרה מרשימה', 'להסרה מרשימת',
  'promotion', 'sale ends', 'limited offer', 'flash sale', 'black friday',
  'cyber monday', 'coupon', 'discount code', 'promo code', '% off',
  'free shipping', 'מבצע', 'הנחה', 'הצעה מיוחדת', 'סייל', 'מכירה',
  // Event marketing / ads
  'conference', 'seminar', 'webinar', 'join us for', 'register now',
  'כנס', 'סמינר', 'וובינר', 'הזמנה לכנס', 'כרטיסים',
  // Legal marketing
  'legal conference', 'bar association', 'lsil.co.il/event', 'הזמנה לאירוע',
  // Password/security (not financial)
  'reset your password', 'verify your email', 'confirm your email',
  'login attempt', 'security alert from', 'unusual sign-in',
  'אמת את כתובת', 'אפס סיסמה',
  // Spam indicators
  'congratulations', 'you have won', 'winner', 'lottery', 'claim your prize',
  'זכית', 'פרס',
  // Delivery tracking without payment
  'your package', 'delivered', 'out for delivery', 'החבילה שלך',
];

function shouldSkip(subject = '', fromEmail = '', fromName = '') {
  const subjectLow  = subject.toLowerCase();
  const fromLow     = fromEmail.toLowerCase();

  // Skip known social/spam domains
  if (SKIP_DOMAINS.some(d => fromLow.includes(d))) return true;

  // Skip by subject keywords
  if (SKIP_SUBJECT_KEYWORDS.some(kw => subjectLow.includes(kw.toLowerCase()))) return true;

  // Skip client/legal emails forwarded from own address without financial content
  if ((fromLow.includes('ofer-law@hotmail') || fromLow.includes('ofer@oferlaw')) &&
      (subjectLow.includes('קופליו') || subjectLow.includes('הסכם') || subjectLow.includes('הצהרות'))) return true;

  return false;
}

// ── Amount extraction ─────────────────────────────────────────────────────────

const AMOUNT_RE = /(?:₪|ש[״"']ח|NIS|ILS|סה[״"']כ[^0-9]{0,20}|לתשלום[^0-9]{0,20})\s*([0-9]{1,9}(?:[,.][0-9]{1,2})?)/gi;

function amountFrom(text) {
  let best = 0;
  let m;
  AMOUNT_RE.lastIndex = 0;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    if (v > best && v < 2_000_000) best = v;
  }
  return best || null;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// ── Broad financial keywords (permissive) ─────────────────────────────────────

const FINANCIAL_KEYWORDS = [
  // Hebrew invoice/payment terms
  'חשבונית', 'קבלה', 'תשלום', 'תלוש', 'שכר', 'פנסיה', 'ביטוח לאומי', 'מע"מ', 'מס הכנסה',
  'ארנונה', 'שכירות', 'שכ"ד', 'דמי שכירות', 'חניה', 'דלק', 'תדלוק', 'חשמל', 'מים',
  'ביט', 'העברה', 'זיכוי', 'חיוב', 'מקדמה', 'חשבון', 'אישור תשלום', 'פרטי חשבון',
  // English
  'invoice', 'receipt', 'payment', 'payslip', 'salary', 'salary slip', 'bill', 'statement',
  'charge', 'debit', 'credit', 'refund', 'order confirmation', 'subscription', 'renewal',
  'fuel', 'parking', 'rent',
  // Domains / brands
  'pango', 'paybox', 'bit.co', 'iec.co', 'netflix', 'spotify', 'apple', 'google',
  'microsoft', 'zoom', 'wix', 'fiverr', 'upwork',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectSupplier(subject = '', fromEmail = '', fromName = '', body = '') {
  const haystack = [subject, fromEmail, fromName, body.slice(0, 500)].join(' ').toLowerCase();
  for (const sup of KNOWN_SUPPLIERS) {
    if (sup.patterns.some(p => haystack.includes(p.toLowerCase()))) return sup;
  }
  return null;
}

function isKnownDomain(email = '') {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return KNOWN_DOMAINS.some(d => domain.includes(d));
}

function detectClassification(subject = '', body = '') {
  const text = (subject + ' ' + body).toLowerCase();
  if (text.includes('תלוש שכר') || text.includes('payslip') || text.includes('salary slip') || text.includes('חילן') || text.includes('hilan')) return 'salary';
  if (text.includes('חשבונית מס') || text.includes('tax invoice') || text.includes('חשבונית')) return 'invoice';
  if (text.includes('קבלה') || text.includes('receipt')) return 'receipt';
  if (text.includes('תשלום') || text.includes('payment') || text.includes('charge') || text.includes('debit')) return 'payment';
  return 'other';
}

// ── Main scan function ────────────────────────────────────────────────────────

/**
 * @param {object} sb         Supabase service client
 * @param {object} org        Organization row with outlook_* fields
 * @param {number} days       How many days back to scan (default 7)
 * @returns {{ found, pending_review, duplicates, skipped }}
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
    newRefreshToken = tokens.refresh_token;
    if (newRefreshToken && newRefreshToken !== org.outlook_refresh_token) {
      await sb.from('organizations').update({ outlook_refresh_token: newRefreshToken }).eq('id', org.id);
    }
  } catch (e) {
    await sb.from('organizations').update({ outlook_connected: false }).eq('id', org.id);
    return { error: `Token refresh failed: ${e.message}` };
  }

  // ── 2. Fetch emails ───────────────────────────────────────────────────────
  const since = new Date(Date.now() - days * 86_400_000);
  const dateFilter = `receivedDateTime ge ${since.toISOString()}`;

  let messages = [];
  try {
    messages = await searchOutlookMessages(accessToken, dateFilter, 200);
  } catch (e) {
    return { error: `Graph search failed: ${e.message}` };
  }

  // ── 3. Filter and process ─────────────────────────────────────────────────
  const stats = { found: messages.length, auto_imported: 0, pending_review: 0, duplicates: 0, skipped: 0 };

  for (const msg of messages) {
    const subject   = msg.subject || '';
    const fromEmail = msg.from?.emailAddress?.address || '';
    const fromName  = msg.from?.emailAddress?.name || '';
    const bodyText  = stripHtml(msg.body?.content || msg.bodyPreview || '');
    const combined  = [subject, fromEmail, fromName, bodyText].join(' ');

    // ── Spam / irrelevant filter (runs first) ─────────────────────────────
    if (shouldSkip(subject, fromEmail, fromName)) { stats.skipped++; continue; }

    // ── Relevance check ────────────────────────────────────────────────────
    const hasFinancialKeyword = FINANCIAL_KEYWORDS.some(kw => combined.toLowerCase().includes(kw.toLowerCase()));
    const hasAmountPattern    = /(?:₪|ש[״"']ח|NIS|ILS)/i.test(combined);
    const fromKnownDomain     = isKnownDomain(fromEmail);
    const isRelevant          = hasFinancialKeyword || hasAmountPattern || fromKnownDomain;
    if (!isRelevant) { stats.skipped++; continue; }

    // ── Dedup: check both tables ───────────────────────────────────────────
    const gmailMessageId = `outlook_${msg.id}`;
    const [{ data: inQueue }, { data: inDocs }] = await Promise.all([
      sb.from('gmail_processed').select('id').eq('gmail_message_id', gmailMessageId).maybeSingle(),
      sb.from('expense_documents').select('id').eq('gmail_message_id', gmailMessageId).maybeSingle(),
    ]);
    if (inQueue || inDocs) { stats.duplicates++; continue; }

    // ── Extract fields ────────────────────────────────────────────────────
    const sup            = detectSupplier(subject, fromEmail, fromName, bodyText);
    const classification = detectClassification(subject, bodyText);
    const amount         = amountFrom(combined);
    const vendor         = sup?.item || fromName || fromEmail.split('@')[0];
    const description    = [vendor, subject.slice(0, 120)].filter(Boolean).join(' — ');
    const outlookLink    = `https://outlook.live.com/mail/0/inbox/id/${encodeURIComponent(msg.id)}`;

    const emailDate = msg.receivedDateTime
      ? new Date(msg.receivedDateTime).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const dateObj   = new Date(emailDate);
    const year      = dateObj.getFullYear();
    const month     = dateObj.getMonth() + 1;

    // ── AUTO-IMPORT: known supplier + valid amount → expense_documents ─────
    if (sup && amount > 0) {
      const fullDesc = [
        description,
        `שולח: ${fromEmail}`,
        `קישור למייל: ${outlookLink}`,
      ].join('\n');

      const { error: docErr } = await sb.from('expense_documents').insert({
        organization_id:  org.id,
        gmail_message_id: gmailMessageId,
        vendor:           sup.item,
        amount,
        description:      fullDesc,
        doc_date:         emailDate,
        month:            emailDate.slice(0, 7),
        expense_year:     year,
        expense_month_num: month,
        expense_item:     sup.item,
        expense_section:  'office',
        category:         sup.category || 'office',
        status:           'linked',
        file_url:         outlookLink,
        file_name:        subject.slice(0, 200),
        file_type:        'outlook_receipt',
        payer:            'office',
      });

      if (!docErr) { stats.auto_imported++; continue; }
      // fall through to review queue on error
    }

    // ── REVIEW QUEUE: unknown supplier, or known supplier without amount ───
    // Skip entirely if no amount AND no known supplier (not worth reviewing)
    if (!amount && !sup) { stats.skipped++; continue; }

    const bodyPreview = (msg.bodyPreview || bodyText).slice(0, 150);
    const aiNotes     = `[Outlook קישור](${outlookLink}) | ${bodyPreview}`;

    const { error: insertErr } = await sb.from('gmail_processed').insert({
      organization_id:       org.id,
      gmail_message_id:      gmailMessageId,
      subject:               subject.slice(0, 300),
      from_email:            fromEmail,
      date:                  emailDate,
      classification,
      extracted_amount:      amount,
      extracted_date:        emailDate,
      extracted_description: description.slice(0, 300),
      status:                'pending-review',
      ai_confidence:         sup ? 'high' : 'medium',
      ai_notes:              aiNotes.slice(0, 500),
      processed_at:          new Date().toISOString(),
    });

    if (!insertErr) stats.pending_review++;
    else stats.skipped++;
  }

  // ── Update last_sync ──────────────────────────────────────────────────────
  await sb.from('organizations').update({ last_outlook_sync: new Date().toISOString() }).eq('id', org.id);

  return stats;
}
