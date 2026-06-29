/**
 * scanEngine.js — מנוע סריקה אחד (single scan engine)
 * ============================================================================
 * זהו המקור היחיד לכללי הסריקה עבור גם Gmail וגם Outlook/Hotmail.
 * כל שינוי בכללים (ספקים, סינון ספאם, חילוץ סכומים, החלטות) נעשה כאן בלבד,
 * וכך שני הסורקים מתנהגים זהה ולא "נשברים" בנפרד.
 *
 * נקודת הכניסה היחידה:  decide(email)  →  החלטה אחת אחידה.
 *
 * email = {
 *   subject, fromEmail, fromName, body,   // טקסט גולמי
 *   date,                                  // ISO string / Date
 *   hasAttachment                          // boolean (Gmail), אופציונלי
 * }
 *
 * return = {
 *   action: 'auto_import' | 'review' | 'skip',
 *   reason,            // הסבר קצר בעברית
 *   vendor,            // שם הספק לתצוגה
 *   supplierId,        // מזהה פנימי אם זוהה ספק מוכר
 *   amount,            // מספר או null
 *   category,          // קטגוריה לחשבונאות
 *   section,           // expense_section
 *   classification,    // invoice|receipt|payment|salary|other
 *   confidence,        // high|medium|low
 * }
 * ============================================================================
 */

// ── 1. רשימת ספקים מאוחדת (single source of truth) ───────────────────────────
// כל ספק: { id, label, patterns, category, section, foreign?, noAutoImport? }
//   noAutoImport: true  → גם עם סכום, תמיד עובר לתור סיווג (לא מיובא אוטומטית)
export const SUPPLIERS = [
  // ── ממשלה / מסים ──
  { id: 'income_tax', label: 'מס הכנסה', category: 'income_tax', section: 'professional',
    patterns: ['mas.gov.il', 'מס הכנסה', 'income tax', 'misim', 'mcs.taxes.gov.il'], noAutoImport: true },
  { id: 'vat', label: 'מע"מ / רשות המסים', category: 'vat_payment', section: 'professional',
    patterns: ['vat.gov.il', 'מע"מ', 'מס ערך מוסף', 'maam', 'רשות המסים', 'taxes.gov.il'], noAutoImport: true },
  { id: 'btl', label: 'ביטוח לאומי', category: 'pension', section: 'salary',
    patterns: ['btl.gov.il', 'ביטוח לאומי', 'bituah leumi', 'national insurance'] },
  { id: 'tabu', label: 'אגרות טאבו', category: 'professional', section: 'professional',
    patterns: ['egovpayments', 'ecom.gov.il', 'justicepayments', 'land.gov.il', 'טאבו', 'רשם המקרקעין', 'אגרת'] },
  { id: 'arnona', label: 'ארנונה', category: 'property', section: 'office',
    patterns: ['arnona', 'ארנונה', 'municipality', 'עירייה', 'עיריית'] },
  // ── שכר / פנסיה ──
  { id: 'payslip', label: 'תלוש שכר', category: 'salary', section: 'salary',
    patterns: ['payslip', 'תלוש שכר', 'salary slip', 'hilan', 'חילן', 'mysalary'], noAutoImport: true },
  { id: 'pension', label: 'פנסיה / גמל', category: 'pension', section: 'salary',
    patterns: ['pension', 'פנסיה', 'גמל', 'מגדל', 'הראל', 'harel', 'כלל ביטוח', 'clal', 'מנורה', 'menora', 'אנליסט', 'מיטב'] },
  // ── תקשורת ──
  { id: 'cellcom', label: 'סלקום', category: 'telecom', section: 'telecom', patterns: ['celcom', 'cellcom', 'סלקום'] },
  { id: 'partner', label: 'פרטנר', category: 'telecom', section: 'telecom', patterns: ['partner.co.il', 'פרטנר'] },
  { id: 'hot', label: 'HOT', category: 'telecom', section: 'telecom', patterns: ['hot.net.il', 'hot mobile', 'הוט'] },
  { id: 'bezeq', label: 'בזק', category: 'telecom', section: 'telecom', patterns: ['bezeq', 'בזק', 'bezeqint'] },
  { id: 'pelephone', label: 'פלאפון', category: 'telecom', section: 'telecom', patterns: ['pelephone', 'פלאפון'] },
  { id: 'mobile019', label: '019 מובייל', category: 'telecom', section: 'telecom', patterns: ['019mobile'] },
  { id: 'golan', label: 'גולן טלקום', category: 'telecom', section: 'telecom', patterns: ['golan.co.il', 'גולן טלקום'] },
  // ── תשתיות ──
  { id: 'electric', label: 'חשמל', category: 'office', section: 'office',
    patterns: ['iec.co.il', 'חברת חשמל', 'electricityauthority', 'dpd.iec'] },
  { id: 'water', label: 'מים', category: 'office', section: 'office',
    patterns: ['mekorot', 'מקורות', 'water.gov.il', 'תאגיד המים', 'מי '] },
  { id: 'gas', label: 'גז', category: 'office', section: 'office',
    patterns: ['supergas', 'pazgas', 'amisragas', 'אמישראגז', 'סופרגז', 'פזגז', 'גז טבעי'] },
  // ── תחבורה / חניה ──
  { id: 'pango', label: 'פנגו', category: 'transport', section: 'vehicle', patterns: ['פנגו', 'pango'] },
  { id: 'cellopark', label: 'סלופארק', category: 'transport', section: 'vehicle', patterns: ['cellopark', 'סלופארק'] },
  { id: 'road6', label: 'כביש 6', category: 'transport', section: 'vehicle',
    patterns: ['כביש 6', 'כביש6', 'נתיבי ישראל', 'road6', 'kvish6'] },
  { id: 'parking', label: 'חניה', category: 'transport', section: 'vehicle', patterns: ['parking', 'חניון', 'חנייה'] },
  { id: 'fuel', label: 'דלק', category: 'transport', section: 'vehicle',
    patterns: ['תדלוק', 'fuel', 'paz ', 'sonol', 'דלק', 'דור אלון', 'ten ', 'סונול'] },
  // ── שכירות ──
  { id: 'rent', label: 'שכירות', category: 'rent', section: 'office',
    patterns: ['שכ"ד', 'שכירות', 'דמי שכירות', 'office rent'], noAutoImport: true },
  // ── אפליקציות תשלום ──
  { id: 'bit', label: 'ביט', category: 'payment', section: 'office', patterns: ['bit.co.il', 'אפליקציית bit'] },
  { id: 'paybox', label: 'Paybox', category: 'payment', section: 'office', patterns: ['paybox', 'פייבוקס'] },
  // ── תוכנה / SaaS (ספקים זרים) ──
  { id: 'google', label: 'Google', category: 'software', section: 'professional', foreign: true,
    patterns: ['payments-noreply@google.com', 'google payments', 'google workspace', 'google cloud', 'google play'] },
  { id: 'microsoft', label: 'Microsoft', category: 'software', section: 'professional', foreign: true,
    patterns: ['microsoft.com', 'office 365', 'office365', 'azure', 'microsoft 365'] },
  { id: 'aws', label: 'AWS', category: 'software', section: 'professional', foreign: true,
    patterns: ['amazonaws.com', 'aws.amazon.com', 'amazon web services'] },
  { id: 'anthropic', label: 'Anthropic / Claude', category: 'software', section: 'professional', foreign: true,
    patterns: ['anthropic.com', 'claude.ai', 'billing@anthropic'] },
  { id: 'openai', label: 'OpenAI', category: 'software', section: 'professional', foreign: true,
    patterns: ['openai.com'] },
  { id: 'github', label: 'GitHub', category: 'software', section: 'professional', foreign: true,
    patterns: ['github.com', 'github copilot'] },
  { id: 'zoom', label: 'Zoom', category: 'software', section: 'professional', foreign: true,
    patterns: ['zoom.us', 'zoom video'] },
  { id: 'dropbox', label: 'Dropbox', category: 'software', section: 'professional', foreign: true,
    patterns: ['dropbox.com'] },
  { id: 'wix', label: 'Wix', category: 'software', section: 'professional', foreign: true, patterns: ['wix.com'] },
  // ── ביטוח ──
  { id: 'insurance', label: 'ביטוח', category: 'insurance', section: 'insurance',
    patterns: ['הפניקס', 'phoenix', 'אקסלנס', 'שירביט', 'ayalon', 'איילון', 'ביטוח חברת'] },
  // ── בנקים / אשראי (לא מיובא אוטומטית — הודעות בנק אינן חשבוניות) ──
  { id: 'bank', label: 'בנק / אשראי', category: 'bank', section: 'professional', noAutoImport: true,
    patterns: ['bankhapoalim', 'hapoalim', 'הפועלים', 'leumi', 'לאומי', 'discountbank', 'דיסקונט',
               'mizrahi', 'מזרחי', 'isracard', 'ישראכרט', 'cal.co.il', 'כאל', 'max.co.il'] },
];

// ── 2. סינון ספאם / לא רלוונטי ───────────────────────────────────────────────
export const SKIP_DOMAINS = [
  'instagram.com', 'facebookmail.com', 'twitter.com', 'x.com', 'tiktok.com',
  'linkedin.com', 'youtube.com', 'pinterest.com', 'snapchat.com',
  'bounce.', 'mailchimp', 'sendgrid.net', 'mailer-daemon',
  // עיתונות / ניוזלטרים משפטיים
  'psakdin.co.il', 'capitax.co.il', 'globesmail.co.il', 'kfarnik.co.il', 'takdin',
  // בקשות חוות דעת / שיווק קניות
  'aliexpress.com', 'lapelota.co.il', 'arboxinvoice', 'e-shops.co.il',
  // ספאם ירידים / שיווק הטבות
  'yorilo41.com', 'havencool.com', 'icmega.org', 'icmega.co.il',
  // שיווק Meta
  'global.metamail.com',
  // ממשל לא-פיננסי
  'mod.gov.il', 'accountprotection.microsoft.com',
  // חדר כושר / פילאטיס אישי
  'grow.security',
];

export const SKIP_SUBJECT_KEYWORDS = [
  // רשתות חברתיות
  'liked your', 'commented on', 'mentioned you', 'followed you', 'tagged you',
  'sent you a message', 'view your story', 'your reel', 'new follower',
  'אהב את', 'הגיב על', 'ציין אותך', 'עקב אחריך',
  // שיווק / ניוזלטרים
  'newsletter', 'unsubscribe', 'הסרה מרשימה', 'להסרה מרשימת',
  'sale ends', 'limited offer', 'flash sale', 'black friday', 'cyber monday',
  'coupon', 'discount code', 'promo code', '% off', 'free shipping',
  'מבצע', 'הנחה', 'הצעה מיוחדת', 'סייל',
  // אירועים / כנסים
  'conference', 'seminar', 'webinar', 'join us for', 'register now',
  'כנס', 'סמינר', 'וובינר', 'הזמנה לכנס', 'כרטיסים', 'הזמנה לאירוע',
  'legal conference', 'bar association',
  // סיסמאות / אבטחה
  'reset your password', 'verify your email', 'confirm your email',
  'login attempt', 'security alert from', 'unusual sign-in', 'אפס סיסמה',
  // ספאם / הגרלות
  'congratulations', 'you have won', 'winner', 'lottery', 'claim your prize',
  'זכית', 'פרס כספי',
  // הטבות / שיווק מסווה כהטבה (תופסות מילות פיננסים בגוף)
  'פרסומת', 'פרסומות', 'הטבות משתלמות', 'הטבות בלעדיות', 'מבצע בלעדי',
  'פסטיבל', 'טוסטר', 'רכב חדש', 'קרוז', 'נסיעה מאורגנת',
  // משלוחים ללא תשלום
  'out for delivery', 'your package', 'tracking number', 'נשלח אליך',
  // עדכוני אחסון / שיווק שירות (לא קבלות)
  'storage is full', 'storage almost full', 'אחסון מלא', 'שדרג את האחסון',
  // הודעות בנק כלליות (לא קבלות)
  'הודעה חדשה בתיבת', 'פועלים במייל', 'פירוט החיובים',
];

// מסמכי הליך/תיק לקוח (לא הוצאה) — לפי נושא
const SKIP_LEGAL_SUBJECTS = [
  'מיסוי מקרקעין', 'סגירת פנייה', 'פנייה בנושא', 'דוח שנתי', 'מכתב חדש בנושא',
  'הסכם', 'הצהרות', 'ייפוי כוח', 'תצהיר', 'כתב תביעה', 'כתב הגנה',
];

// ── 3. חילוץ סכום — עוגן למטבע/מילת-סך בלבד (no bare-number fallback) ─────────
// זה התיקון המרכזי: לעולם לא לוקחים מספר "חופשי" (כמו מספר הזמנה) כסכום.
const CUR = `(?:₪|ש["'״׳]?ח|שקל(?:ים)?|nis|ils)`;
const TOTAL = `(?:סה["'״׳]?\\s*כ|סך\\s*הכל|לתשלום|סכום\\s*לחיוב|סכום\\s*כולל|total\\s*(?:due|amount)?|amount\\s*(?:due|charged|paid|to\\s*pay))`;
const NUMBER = `(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)`;
// הקשרים שמסמנים מזהה ולא סכום (מספר הזמנה / חשבונית / טלפון וכו')
const ID_BEFORE = /(?:מספר|מס['׳"]?\s*$|הזמנה|אסמכת[או]|order|invoice\s*(?:no|#)?|ref(?:erence)?|#|טלפון|ת\.?ז|ח\.?פ|account|crm|תיק)\s*[:.#\-]?\s*$/i;

function toNumber(raw) {
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isLikelyId(text, matchIndex) {
  const before = text.slice(Math.max(0, matchIndex - 22), matchIndex);
  return ID_BEFORE.test(before);
}

/**
 * extractAmount — מחזיר { amount, strong } או { amount: null }
 *   strong=true  → הסכום נמצא עם מטבע/מילת-סך (ביטחון גבוה)
 */
export function extractAmount(rawText) {
  const text = String(rawText || '');
  if (!text) return { amount: null, strong: false };

  const candidates = []; // { value, strong }

  // עדיפות 1: מילת-סך + מטבע (הכי חזק)
  collect(new RegExp(`${TOTAL}[^0-9]{0,15}${CUR}?\\s*${NUMBER}\\s*${CUR}?`, 'gi'), true);
  // עדיפות 2: מטבע צמוד למספר (לפני או אחרי)
  collect(new RegExp(`${CUR}\\s*${NUMBER}`, 'gi'), true);
  collect(new RegExp(`${NUMBER}\\s*${CUR}`, 'gi'), true);

  function collect(re, strong) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const numIdx = m.index + m[0].indexOf(m[1]);
      if (isLikelyId(text, numIdx)) continue;
      const v = toNumber(m[1]);
      if (v === null || v <= 0 || v > 1_000_000) continue;
      // דחיית שנים (2020–2035) ללא עשרוני וללא פסיק — כנראה שנה ולא סכום
      if (v >= 2020 && v <= 2035 && Number.isInteger(v) && !m[1].includes('.')) continue;
      candidates.push({ value: v, strong });
    }
  }

  if (!candidates.length) return { amount: null, strong: false };
  // בחר את הסכום הגדול ביותר (חשבונית = הסכום הכולל, בד"כ הגדול)
  candidates.sort((a, b) => b.value - a.value);
  return { amount: candidates[0].value, strong: candidates[0].strong };
}

// ── 3ב. חילוץ מע"מ (חשבונית מס) ──────────────────────────────────────────────
export const VAT_RATE = 0.18; // שיעור מע"מ בישראל (2026)

/**
 * extractVat — מנסה למצוא שורת מע"מ מפורשת; אחרת מחשב מהסכום הכולל.
 * @param {string} text   טקסט המייל
 * @param {number} total  הסכום הכולל שזוהה (כולל מע"מ)
 * @param {string} classification  invoice/receipt/...
 * @returns {number|null}
 */
export function extractVat(text, total, classification) {
  const t = String(text || '');
  // 1. שורת מע"מ מפורשת: "מע"מ ... ₪X" או "VAT ... X"
  const re = new RegExp(`(?:מע["'״׳]?\\s*מ|vat|tax)[^0-9]{0,15}${CUR}?\\s*${NUMBER}\\s*${CUR}?`, 'i');
  const m = t.match(re);
  if (m?.[1]) {
    const v = toNumber(m[1]);
    if (v !== null && v > 0 && total && v < total) return Math.round(v * 100) / 100;
  }
  // 2. חישוב מהסכום הכולל — רק לחשבונית מס (לא קבלה רגילה)
  if (total && classification === 'invoice') {
    return Math.round((total * VAT_RATE / (1 + VAT_RATE)) * 100) / 100;
  }
  return null;
}

// ── 3ב2. זיהוי מטבע ──────────────────────────────────────────────────────────
export function extractCurrency(text) {
  const t = String(text || '');
  if (/\$|usd|us dollar/i.test(t)) return 'USD';
  if (/€|eur|euro/i.test(t)) return 'EUR';
  if (/£|gbp|pound/i.test(t)) return 'GBP';
  return 'ILS';
}

// ── 3ג. חילוץ מספר מסמך ──────────────────────────────────────────────────────
export function extractDocNumber(text) {
  const t = String(text || '');
  const patterns = [
    /(?:חשבונית\s*מס['׳"״]?\s*(?:מספר|מס['׳"״]?)?\s*[:#]?\s*)(\d[\d-/]+)/i,
    /(?:מספר\s*(?:חשבונית|קבלה|מסמך|אסמכתא)\s*[:#]?\s*)(\d[\d-/]+)/i,
    /(?:invoice\s*(?:no\.?|number|#)\s*[:#]?\s*)([A-Z0-9][\w-/]+)/i,
    /(?:receipt\s*(?:no\.?|number|#)\s*[:#]?\s*)([A-Z0-9][\w-/]+)/i,
    /(?:^|\s)#(\d{3,})/m,
    /(?:מס['׳"״]\s*(?:חשבון|חשב'?))\s*[:#]?\s*(\d[\d-/]+)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1] && m[1].length >= 3 && m[1].length <= 30) return m[1].trim();
  }
  return null;
}

// ── 4. עזרים ─────────────────────────────────────────────────────────────────
export function stripHtml(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function detectSupplier(haystackLow) {
  for (const sup of SUPPLIERS) {
    if (sup.patterns.some(p => haystackLow.includes(p.toLowerCase()))) return sup;
  }
  return null;
}

const FINANCIAL_KEYWORDS = [
  'חשבונית', 'חשבונית מס', 'קבלה', 'אישור תשלום', 'דרישת תשלום', 'חשבון לתשלום',
  'תשלום', 'חיוב', 'זיכוי', 'מקדמה', 'דמי', 'אגרה',
  'invoice', 'receipt', 'payment', 'tax invoice', 'order confirmation', 'your receipt',
  'bill', 'statement', 'subscription', 'renewal',
];

function classify(low) {
  if (/(תלוש שכר|payslip|salary slip|חילן|hilan)/.test(low)) return 'salary';
  if (/(חשבונית מס|tax invoice|חשבונית)/.test(low)) return 'invoice';
  if (/(קבלה|receipt)/.test(low)) return 'receipt';
  if (/(תשלום|payment|charge|debit|חיוב)/.test(low)) return 'payment';
  return 'other';
}

// ── 5. ההחלטה האחת — decide(email) ───────────────────────────────────────────
const AUTO_IMPORT_MAX = 50_000; // מעל זה → תמיד לתור סיווג (גם ספק מוכר)

export function decide(email) {
  const subject   = email.subject || '';
  const fromEmail = (email.fromEmail || '').toLowerCase();
  const fromName  = email.fromName || '';
  const body      = stripHtml(email.body || '');
  const subjectLow = subject.toLowerCase();
  const combined   = [subject, fromEmail, fromName, body].join(' ');
  const combinedLow = combined.toLowerCase();
  const haystackLow = [subject, fromEmail, fromName, body.slice(0, 600)].join(' ').toLowerCase();

  // ── שלב א: סינון ספאם ──
  if (SKIP_DOMAINS.some(d => fromEmail.includes(d)))
    return skip('דומיין ספאם/לא-רלוונטי');
  if (SKIP_SUBJECT_KEYWORDS.some(kw => subjectLow.includes(kw.toLowerCase())))
    return skip('נושא שיווקי/לא-פיננסי');
  if (SKIP_LEGAL_SUBJECTS.some(kw => subjectLow.includes(kw)))
    return skip('מסמך הליך/תיק לקוח — לא הוצאה');

  // ── שלב ב: זיהוי ──
  // ספק מוכר: מחפשים בשולח+כותרת בלבד (header-haystack) לצורך auto_import.
  // מחפשים גם בגוף (full-haystack) — אך רק לצורך review, לא auto_import.
  // זה מונע מיילי פרסומת שמכילים "מים/פנסיה" בגוף להיות מיובאים אוטומטית.
  const headerHaystackLow = [subject, fromEmail, fromName].join(' ').toLowerCase();
  const supHeader = detectSupplier(headerHaystackLow); // ספק לפי header בלבד
  const sup       = supHeader || detectSupplier(haystackLow); // ספק כולל גוף (לreview)
  const { amount, strong } = extractAmount(combined);
  const hasFinKw   = FINANCIAL_KEYWORDS.some(kw => combinedLow.includes(kw.toLowerCase()));
  const hasCurrency = new RegExp(CUR, 'i').test(combined);
  const classification = classify(combinedLow);
  const isInvoiceLike = sup || hasFinKw || hasCurrency || email.hasAttachment;

  if (!isInvoiceLike) return skip('לא נראה כחשבונית/קבלה');

  const vendor = sup?.label || extractVendorFromEmail(fromName, fromEmail);
  const vat = extractVat(combined, amount, classification);
  const docNumber = extractDocNumber(combined);
  const currency  = extractCurrency(combined);
  const base = {
    vendor,
    supplierId: sup?.id || null,
    amount: amount || null,
    vat: vat || null,
    category: sup?.category || 'review',
    section: sup?.section || 'office',
    classification,
    docNumber: docNumber || null,
    currency: currency,
  };

  // ── שלב ג: החלטה ──
  // ייבוא אוטומטי: ספק חייב להיות מזוהה מהכותרת/שולח בלבד (לא גוף) — מונע פרסומות
  if (supHeader && !supHeader.noAutoImport && amount && amount <= AUTO_IMPORT_MAX && strong) {
    return { action: 'auto_import', reason: `ספק מוכר (${supHeader.label}) + סכום מאומת`, confidence: 'high', ...base };
  }

  // תור סיווג: יש סימן פיננסי אמיתי אבל חסר ודאות
  // דורש לפחות אחד מ: ספק מוכר, או סכום, או מילת-מפתח פיננסית מובהקת
  if (sup || amount || hasFinKw) {
    let reason;
    if (sup && !amount)        reason = `ספק מוכר (${sup.label}) ללא סכום — נדרש סיווג`;
    else if (sup && amount)    reason = `ספק מוכר (${sup.label}) — סכום לאימות`;
    else if (amount)           reason = 'סכום זוהה, ספק לא מזוהה — נדרש סיווג';
    else                       reason = 'חשבונית/קבלה — נדרש סיווג';
    return { action: 'review', reason, confidence: sup ? 'medium' : 'low', ...base };
  }

  return skip('אין סימן פיננסי מספיק');
}

function skip(reason) {
  return { action: 'skip', reason, vendor: null, supplierId: null, amount: null, vat: null,
           category: null, section: null, classification: 'other', confidence: 'low',
           docNumber: null, currency: 'ILS' };
}

function extractVendorFromEmail(fromName, fromEmail) {
  if (fromName && !/^["'<]/.test(fromName)) return fromName.slice(0, 80);
  const domain = String(fromEmail || '').split('@')[1] || '';
  return domain.split('.')[0] || fromEmail || 'ממתין לסיווג';
}
