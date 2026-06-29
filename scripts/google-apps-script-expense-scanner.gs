/**
 * Google Apps Script — סורק חשבוניות Gmail ושומר ל־Drive.
 *
 * כלל קבוע: סורקים רק מיילים שמכילים אחת מ־4 הספרות האחרונות של כרטיסי המשרד:
 * 1626 או 9434.
 *
 * Hotmail/Outlook צריך להעביר את המיילים הרלוונטיים אל Gmail המרכזי,
 * והסקריפט הזה יסרוק את Gmail המרכזי בלבד.
 */

const CONFIG = {
  SITE_IMPORT_URL: 'https://ai-rosy-theta.vercel.app/api/expenses/app-script-import',
  APP_SCRIPT_SECRET: 'CHANGE_ME_TO_LONG_SECRET',
  OFFICE_CARD_LAST4S: ['1626', '9434'],
  ROOT_FOLDER_NAME: 'חשבוניות',
  DUPLICATES_FOLDER_NAME: 'כפילויות לבדיקה',
  MAX_THREADS_PER_RUN: 50,
  DAYS_BACK_FIRST_RUN: 120,
};

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runExpenseScan') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runExpenseScan').timeBased().everyHours(1).create();
}

function runExpenseScan() {
  const props = PropertiesService.getScriptProperties();
  const lastScan = props.getProperty('last_scan_after');
  const afterDate = lastScan ? new Date(lastScan) : new Date(Date.now() - CONFIG.DAYS_BACK_FIRST_RUN * 86400000);
  const after = formatGmailDate(afterDate);
  const cards = getOfficeCards_();

  const query = [
    'after:' + after,
    cardQuery_(cards)
  ].join(' ');

  const threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), CONFIG.ROOT_FOLDER_NAME);
  const dupFolder = getOrCreateFolder_(root, CONFIG.DUPLICATES_FOLDER_NAME);
  const invoices = [];
  let newestDate = afterDate;

  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      const msgDate = msg.getDate();
      if (msgDate > newestDate) newestDate = msgDate;
      const gmailId = msg.getId();
      if (isProcessed_(gmailId)) return;

      const subject = msg.getSubject() || '';
      const from = msg.getFrom() || '';
      const body = stripHtml_(msg.getPlainBody() || msg.getBody() || '');
      const combined = [subject, from, body].join(' ');
      const matchedCard = findCard_(combined, cards);
      if (!matchedCard) return;
      if (!isInvoiceLike_(combined, msg.getAttachments().length > 0)) return;

      const vendor = detectVendor_(combined, from);
      const amount = extractAmount_(combined);
      const topic = detectTopic_(combined, vendor);
      const docDate = Utilities.formatDate(msgDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const year = Utilities.formatDate(msgDate, Session.getScriptTimeZone(), 'yyyy');
      const month = Utilities.formatDate(msgDate, Session.getScriptTimeZone(), 'yyyy-MM');
      const monthFolder = getOrCreateFolder_(getOrCreateFolder_(root, year), month);
      const topicFolder = getOrCreateFolder_(monthFolder, sanitizeFileName_(topic));

      const attachments = msg.getAttachments({ includeInlineImages: false, includeAttachments: true }) || [];
      let savedFiles = [];

      attachments.forEach(att => {
        const name = sanitizeFileName_([docDate, vendor, 'כרטיס ' + matchedCard, att.getName()].join(' - '));
        if (fileExists_(topicFolder, name)) {
          const existing = topicFolder.getFilesByName(name).next();
          savedFiles.push({ file: existing, duplicate: true });
          return;
        }
        const file = topicFolder.createFile(att.copyBlob()).setName(name);
        savedFiles.push({ file, duplicate: false });
      });

      if (!savedFiles.length) {
        const htmlName = sanitizeFileName_([docDate, vendor, 'כרטיס ' + matchedCard, subject].join(' - ')) + '.html';
        if (fileExists_(topicFolder, htmlName)) {
          savedFiles.push({ file: topicFolder.getFilesByName(htmlName).next(), duplicate: true });
        } else {
          const html = '<html><body dir="rtl"><h2>' + escapeHtml_(subject) + '</h2><pre>' + escapeHtml_(body) + '</pre></body></html>';
          const file = topicFolder.createFile(htmlName, html, MimeType.HTML);
          savedFiles.push({ file, duplicate: false });
        }
      }

      savedFiles.forEach(saved => {
        const file = saved.file;
        if (saved.duplicate) {
          try { file.moveTo(dupFolder); } catch (e) {}
        }
        invoices.push({
          gmail_message_id: gmailId,
          gmail_link: 'https://mail.google.com/mail/u/0/#all/' + gmailId,
          subject,
          from,
          vendor,
          amount,
          doc_date: docDate,
          topic,
          expense_item: topic,
          expense_section: 'office',
          file_name: file.getName(),
          file_url: file.getUrl(),
          file_type: saved.duplicate ? 'drive_duplicate_review' : 'drive_receipt',
          status: saved.duplicate ? 'duplicate_review' : (topic === 'ממתין לסיווג' ? 'needs_review' : 'approved'),
          needs_review: topic === 'ממתין לסיווג',
          payer: 'office',
          card_last4: matchedCard
        });
      });

      markProcessed_(gmailId);
    });
  });

  if (invoices.length) sendToSite_(invoices);
  props.setProperty('last_scan_after', newestDate.toISOString());
  props.setProperty('last_run_at', new Date().toISOString());
  props.setProperty('last_found_count', String(invoices.length));
  props.setProperty('last_cards', cards.join(','));
}

function getOfficeCards_() {
  return (CONFIG.OFFICE_CARD_LAST4S || [])
    .map(c => String(c || '').replace(/\D/g, ''))
    .filter(c => /^\d{4}$/.test(c));
}

function cardQuery_(cards) {
  return '(' + cards.map(c => c + ' OR "' + c + '"').join(' OR ') + ')';
}

function findCard_(text, cards) {
  const t = String(text || '');
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (new RegExp('(^|\\D)' + card + '(\\D|$)').test(t)) return card;
  }
  return null;
}

function sendToSite_(invoices) {
  const res = UrlFetchApp.fetch(CONFIG.SITE_IMPORT_URL, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-app-script-secret': CONFIG.APP_SCRIPT_SECRET },
    payload: JSON.stringify({ invoices })
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Site import failed: ' + code + ' ' + res.getContentText());
}

function formatGmailDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

function getOrCreateFolder_(parent, name) {
  const safe = sanitizeFileName_(name);
  const it = parent.getFoldersByName(safe);
  return it.hasNext() ? it.next() : parent.createFolder(safe);
}

function fileExists_(folder, name) {
  return folder.getFilesByName(name).hasNext();
}

function sanitizeFileName_(s) {
  return String(s || 'כללי').replace(/[\\/:*?"<>|#%{}~&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'כללי';
}

function isInvoiceLike_(text, hasAttachment) {
  const low = String(text || '').toLowerCase();
  return hasAttachment || ['חשבונית', 'קבלה', 'אישור תשלום', 'invoice', 'receipt', 'payment', 'order', 'tax invoice'].some(w => low.indexOf(w.toLowerCase()) >= 0);
}

function detectVendor_(text, from) {
  const low = String(text || '').toLowerCase();
  if (low.indexOf('egovpayments') >= 0 || low.indexOf('ecom.gov.il') >= 0 || low.indexOf('justice') >= 0) return 'משרד המשפטים – נסח טאבו';
  if (low.indexOf('google') >= 0) return 'google';
  if (low.indexOf('anthropic') >= 0 || low.indexOf('claude') >= 0) return 'Anthropic';
  if (low.indexOf('openai') >= 0 || low.indexOf('chatgpt') >= 0) return 'OpenAI';
  if (low.indexOf('חברת חשמל') >= 0 || low.indexOf('electric') >= 0) return 'חשמל';
  return String(from || '').replace(/<.*?>/g, '').trim() || 'ספק לא ידוע';
}

function detectTopic_(text, vendor) {
  const low = String(text || '').toLowerCase();
  if (/egovpayments|ecom\.gov\.il|justice|טאבו|נסח|מקרקעין/i.test(low)) return 'אגרות טאבו';
  if (/google|play/i.test(low)) return 'Google Play';
  if (/anthropic|claude/i.test(low)) return 'Anthropic';
  if (/openai|chatgpt/i.test(low)) return 'OpenAI';
  if (/חברת חשמל|electric/i.test(low)) return 'חשמל צריכה';
  if (vendor && vendor !== 'ספק לא ידוע') return vendor;
  return 'ממתין לסיווג';
}

function extractAmount_(text) {
  const s = String(text || '').replace(/,/g, '');
  const patterns = [/(?:₪|שח|ש״ח|nis|ils)\s*(\d+(?:\.\d+)?)/i, /(\d+(?:\.\d+)?)\s*(?:₪|שח|ש״ח|nis|ils)/i, /(?:total|amount|סהכ|סך הכל|לתשלום)\D{0,20}(\d+(?:\.\d+)?)/i];
  for (let i = 0; i < patterns.length; i++) {
    const m = s.match(patterns[i]);
    if (m && m[1]) return Number(m[1]) || null;
  }
  return null;
}

function stripHtml_(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml_(s) {
  return String(s || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function isProcessed_(gmailId) {
  return PropertiesService.getScriptProperties().getProperty('processed_' + gmailId) === '1';
}

function markProcessed_(gmailId) {
  PropertiesService.getScriptProperties().setProperty('processed_' + gmailId, '1');
}

function resetScannerState() {
  PropertiesService.getScriptProperties().deleteAllProperties();
}
