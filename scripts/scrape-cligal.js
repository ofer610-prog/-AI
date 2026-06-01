#!/usr/bin/env node
/**
 * Playwright scraper for app.cligal.com
 * Logs in and extracts all invoices, then POSTs them to the app's sync endpoint.
 *
 * Required env vars:
 *   CLIGAL_EMAIL        - login email
 *   CLIGAL_PASSWORD     - login password
 *   APP_URL             - base URL of our app (e.g. https://your-app.vercel.app)
 *   CRON_SECRET         - shared secret for the sync endpoint
 */

const { chromium } = require('playwright');

const CLIGAL_URL = 'https://app.cligal.com';
const EMAIL = process.env.CLIGAL_EMAIL;
const PASSWORD = process.env.CLIGAL_PASSWORD;
const APP_URL = process.env.APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

if (!EMAIL || !PASSWORD || !APP_URL || !CRON_SECRET) {
  console.error('Missing required env vars: CLIGAL_EMAIL, CLIGAL_PASSWORD, APP_URL, CRON_SECRET');
  process.exit(1);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(page) {
  console.log('Navigating to login page...');
  await page.goto(`${CLIGAL_URL}/app`, { waitUntil: 'networkidle', timeout: 30000 });

  // Handle possible redirect to login page
  const currentUrl = page.url();
  console.log('Current URL after navigation:', currentUrl);

  // Try common login form selectors
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[placeholder*="מייל"]',
    'input[placeholder*="אימייל"]',
    'input[placeholder*="שם משתמש"]',
    '#email',
    '#username',
  ];

  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    '#password',
  ];

  let emailField = null;
  for (const sel of emailSelectors) {
    try {
      emailField = await page.waitForSelector(sel, { timeout: 3000 });
      if (emailField) {
        console.log(`Found email field with selector: ${sel}`);
        break;
      }
    } catch {}
  }

  if (!emailField) {
    // Take screenshot for debugging
    await page.screenshot({ path: 'debug-login.png' });
    throw new Error('Could not find email/username field on login page');
  }

  await emailField.fill(EMAIL);

  let passwordField = null;
  for (const sel of passwordSelectors) {
    try {
      passwordField = await page.$(sel);
      if (passwordField) {
        console.log(`Found password field with selector: ${sel}`);
        break;
      }
    } catch {}
  }

  if (!passwordField) {
    await page.screenshot({ path: 'debug-login.png' });
    throw new Error('Could not find password field on login page');
  }

  await passwordField.fill(PASSWORD);

  // Submit the form
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("כניסה")',
    'button:has-text("התחבר")',
    'button:has-text("Sign in")',
    'button:has-text("Login")',
  ];

  for (const sel of submitSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        console.log(`Clicking submit with selector: ${sel}`);
        await btn.click();
        break;
      }
    } catch {}
  }

  // Wait for navigation after login
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  await sleep(2000);

  const urlAfterLogin = page.url();
  console.log('URL after login attempt:', urlAfterLogin);

  if (urlAfterLogin.includes('login') || urlAfterLogin.includes('signin')) {
    await page.screenshot({ path: 'debug-login-failed.png' });
    throw new Error('Login appears to have failed - still on login page');
  }

  console.log('Login successful');
}

async function navigateToInvoices(page) {
  // Try to find invoices/documents section
  const invoiceNavSelectors = [
    'a[href*="invoice"]',
    'a[href*="document"]',
    'a[href*="חשבונית"]',
    'nav a:has-text("חשבוניות")',
    'nav a:has-text("מסמכים")',
    '[data-section="invoices"]',
    'a:has-text("חשבוניות")',
    'a:has-text("מסמכים")',
  ];

  for (const sel of invoiceNavSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        console.log(`Navigating to invoices via: ${sel}`);
        await el.click();
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        await sleep(1500);
        console.log('Navigated to invoices, URL:', page.url());
        return;
      }
    } catch {}
  }

  // Try direct URL patterns
  const invoiceUrls = [
    `${CLIGAL_URL}/app/invoices`,
    `${CLIGAL_URL}/app/documents`,
    `${CLIGAL_URL}/app/#/invoices`,
    `${CLIGAL_URL}/app/#/documents`,
  ];

  for (const url of invoiceUrls) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      await sleep(1500);
      const hasTable = await page.$('table, [role="grid"], .invoice-list, .document-list');
      if (hasTable) {
        console.log('Found invoice table at:', url);
        return;
      }
    } catch {}
  }

  console.warn('Could not navigate to invoices directly, will try scraping from current page');
}

async function extractInvoicesFromPage(page) {
  const invoices = [];

  // Try to find table rows
  const tableSelectors = [
    'table tbody tr',
    '[role="grid"] [role="row"]:not([role="columnheader"])',
    '.invoice-row',
    '.document-row',
    'tr[data-id]',
    'tbody tr',
  ];

  let rows = [];
  for (const sel of tableSelectors) {
    try {
      const found = await page.$$(sel);
      if (found.length > 0) {
        rows = found;
        console.log(`Found ${rows.length} rows with selector: ${sel}`);
        break;
      }
    } catch {}
  }

  if (rows.length === 0) {
    console.log('No rows found, taking screenshot for debug');
    await page.screenshot({ path: 'debug-table.png' });
    return [];
  }

  for (const row of rows) {
    try {
      const cells = await row.$$('td, [role="cell"]');
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(cells.map((c) => c.innerText().then((t) => t.trim())));
      console.log('Row cells:', cellTexts.join(' | '));

      // Detect columns based on content patterns
      // Expected: מספר מסמך, תאריך, תשלום עד, סטטוס, סוג מסמך, שם לקוח, שם תיק, סכום
      const invoice = parseRowCells(cellTexts);
      if (invoice) invoices.push(invoice);
    } catch (err) {
      console.warn('Error parsing row:', err.message);
    }
  }

  return invoices;
}

function parseRowCells(cells) {
  if (!cells || cells.length === 0) return null;

  // Try to identify columns by content
  let docNumber = null;
  let issueDate = null;
  let dueDate = null;
  let status = null;
  let docType = null;
  let clientName = null;
  let matterName = null;
  let amount = null;

  const datePattern = /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/;
  const numberPattern = /^\d{4,}$/;
  const amountPattern = /^-?[\d,]+\.?\d*$/;
  const statusValues = ['סגור', 'פתוח', 'מבוטל', 'טיוטה', 'שולם'];
  const docTypes = ['חשבונית מס', 'חשבונית מס קבלה', 'קבלה', 'הצעת מחיר', 'תעודת משלוח'];

  // First pass: categorize each cell
  const categorized = cells.map((text) => {
    if (numberPattern.test(text)) return { value: text, type: 'number' };
    if (datePattern.test(text)) return { value: text, type: 'date' };
    if (amountPattern.test(text.replace(/,/g, ''))) return { value: text, type: 'amount' };
    if (statusValues.some((s) => text.includes(s))) return { value: text, type: 'status' };
    if (docTypes.some((d) => text.includes(d))) return { value: text, type: 'doctype' };
    return { value: text, type: 'text' };
  });

  // Assign values based on position and type
  // Column order in Kligl: מספר מסמך, תאריך, תשלום עד, סטטוס, סוג מסמך, שם לקוח, שם תיק, סכום
  const dateColumns = categorized.filter((c) => c.type === 'date');
  const numberColumns = categorized.filter((c) => c.type === 'number');
  const amountColumns = categorized.filter((c) => c.type === 'amount');
  const statusColumns = categorized.filter((c) => c.type === 'status');
  const doctypeColumns = categorized.filter((c) => c.type === 'doctype');

  docNumber = numberColumns[0]?.value || cells[0];
  issueDate = dateColumns[0]?.value || null;
  dueDate = dateColumns[1]?.value || null;
  status = statusColumns[0]?.value || null;
  docType = doctypeColumns[0]?.value || null;
  amount = amountColumns[0]?.value?.replace(/,/g, '') || null;

  // Text columns for client and matter
  const textColumns = categorized
    .filter((c) => c.type === 'text' && c.value.length > 1)
    .map((c) => c.value);
  clientName = textColumns[0] || null;
  matterName = textColumns[1] || null;

  // Skip header rows or empty rows
  if (!docNumber || docNumber === 'מספר מסמך') return null;

  return {
    document_number: docNumber,
    issue_date: issueDate ? parseHebrewDate(issueDate) : null,
    due_date: dueDate ? parseHebrewDate(dueDate) : null,
    status: normalizeStatus(status),
    doc_type: docType,
    client_name: clientName,
    matter_name: matterName,
    amount: amount ? parseFloat(amount) : null,
    raw: cells.join(' | '),
  };
}

function parseHebrewDate(dateStr) {
  if (!dateStr) return null;
  // Formats: DD/MM/YYYY or DD.MM.YYYY
  const parts = dateStr.split(/[./]/);
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const fullYear = year.length === 2 ? '20' + year : year;
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeStatus(status) {
  if (!status) return 'unknown';
  if (status.includes('סגור') || status.includes('שולם')) return 'paid';
  if (status.includes('פתוח')) return 'open';
  if (status.includes('מבוטל')) return 'cancelled';
  if (status.includes('טיוטה')) return 'draft';
  return status;
}

async function getPageCount(page) {
  // Look for pagination info
  const paginationSelectors = [
    '.pagination',
    '[aria-label="pagination"]',
    '.page-count',
    'span:has-text("מתוך")',
    'span:has-text("של")',
  ];

  for (const sel of paginationSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = await el.innerText();
        console.log('Pagination text:', text);
        // Try to extract total pages
        const match = text.match(/מתוך\s+(\d+)|of\s+(\d+)|\/\s*(\d+)/);
        if (match) {
          return parseInt(match[1] || match[2] || match[3]);
        }
      }
    } catch {}
  }
  return 1;
}

async function goToNextPage(page) {
  const nextSelectors = [
    'button[aria-label="Next page"]',
    'button[aria-label="עמוד הבא"]',
    '.pagination .next',
    'button:has-text("הבא")',
    'button:has-text(">")',
    '[data-page="next"]',
    '.next-page',
  ];

  for (const sel of nextSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const isDisabled = await btn.getAttribute('disabled');
        if (isDisabled !== null) return false;
        await btn.click();
        await page.waitForLoadState('networkidle', { timeout: 8000 });
        await sleep(1000);
        return true;
      }
    } catch {}
  }
  return false;
}

async function syncToApp(invoices) {
  if (invoices.length === 0) {
    console.log('No invoices to sync');
    return;
  }

  console.log(`Syncing ${invoices.length} invoices to ${APP_URL}...`);

  const response = await fetch(`${APP_URL}/api/invoices/sync-cligal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
    },
    body: JSON.stringify({ invoices }),
  });

  const result = await response.json();
  console.log('Sync result:', JSON.stringify(result, null, 2));

  if (!response.ok) {
    throw new Error(`Sync failed: ${result.error || response.status}`);
  }

  return result;
}

/** Collect a snapshot of the current page structure for remote debugging */
async function collectDiagnostics(page, label) {
  try {
    return await page.evaluate((lbl) => {
      const txt = (el) => (el && el.innerText ? el.innerText.trim().slice(0, 60) : '');
      const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
        type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
      }));
      const buttons = Array.from(document.querySelectorAll('button, input[type=submit], a[role=button]'))
        .map((b) => txt(b)).filter(Boolean).slice(0, 30);
      const navLinks = Array.from(document.querySelectorAll('nav a, aside a, a'))
        .map((a) => ({ text: txt(a), href: a.getAttribute('href') }))
        .filter((a) => a.text).slice(0, 40);
      const tables = Array.from(document.querySelectorAll('table')).length;
      const grids = Array.from(document.querySelectorAll('[role=grid]')).length;
      const rows = Array.from(document.querySelectorAll('table tbody tr, [role=row]')).length;
      return {
        label: lbl,
        url: location.href,
        title: document.title,
        inputs,
        buttons,
        navLinks,
        tableCount: tables,
        gridCount: grids,
        rowCount: rows,
        bodyTextSnippet: (document.body ? document.body.innerText : '').slice(0, 2000),
      };
    }, label);
  } catch (err) {
    return { label, error: err.message };
  }
}

async function sendDiagnostics(diagnostics) {
  try {
    await fetch(`${APP_URL}/api/invoices/cligal-debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify(diagnostics),
    });
    console.log('Diagnostics sent to server');
  } catch (err) {
    console.error('Failed to send diagnostics:', err.message);
  }
}

async function main() {
  console.log('Starting Cligal invoice scraper...');
  const diagnostics = { steps: [] };

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'he-IL',
  });

  const page = await context.newPage();
  let allInvoices = [];

  try {
    // Snapshot the very first page (login screen) before doing anything
    await page.goto(`${CLIGAL_URL}/app`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    diagnostics.steps.push(await collectDiagnostics(page, 'initial-landing'));

    await login(page);
    diagnostics.steps.push(await collectDiagnostics(page, 'after-login'));

    await navigateToInvoices(page);
    diagnostics.steps.push(await collectDiagnostics(page, 'invoices-page'));

    let pageNum = 1;
    const maxPages = 50; // Safety limit (50 rows/page × 50 pages = 2500 invoices)

    while (pageNum <= maxPages) {
      console.log(`\nScraping page ${pageNum}...`);
      const pageInvoices = await extractInvoicesFromPage(page);
      console.log(`Found ${pageInvoices.length} invoices on page ${pageNum}`);

      if (pageInvoices.length === 0) break;
      allInvoices = allInvoices.concat(pageInvoices);

      const hasNext = await goToNextPage(page);
      if (!hasNext) {
        console.log('No more pages');
        break;
      }
      pageNum++;
    }

    console.log(`\nTotal invoices scraped: ${allInvoices.length}`);
    diagnostics.totalScraped = allInvoices.length;
    diagnostics.sampleInvoices = allInvoices.slice(0, 3);

    // Always send diagnostics so we can see what the scraper encountered
    await sendDiagnostics(diagnostics);

    if (allInvoices.length > 0) {
      await syncToApp(allInvoices);
    }
  } catch (err) {
    console.error('Scraper error:', err.message);
    diagnostics.error = err.message;
    diagnostics.steps.push(await collectDiagnostics(page, 'error-state'));
    await sendDiagnostics(diagnostics);
    await page.screenshot({ path: 'debug-error.png' }).catch(() => {});
    await browser.close();
    process.exit(1);
  }

  await browser.close();
  console.log('Done!');
}

main();
