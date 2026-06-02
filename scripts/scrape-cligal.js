#!/usr/bin/env node
/**
 * Playwright scraper for app.cligal.com
 * Logs in and extracts all invoices, then POSTs them to the app's sync endpoint.
 *
 * Required env vars:
 *   CLIGAL_EMAIL        - login email
 *   CLIGAL_PASSWORD     - login password
 *   APP_URL             - base URL of our app (e.g. https://your-app.vercel.app).
 *                         Any path in the value is stripped; only the origin is used.
 *   CRON_SECRET         - shared secret for the sync endpoint
 */

const { chromium } = require('playwright');

const CLIGAL_URL = 'https://app.cligal.com';
const EMAIL = process.env.CLIGAL_EMAIL;
const PASSWORD = process.env.CLIGAL_PASSWORD;
const CRON_SECRET = process.env.CRON_SECRET;

// Normalize APP_URL to just its origin so a stray path in the secret
// (e.g. ".../dashboard") can never break the POST target.
function normalizeAppUrl(raw) {
  if (!raw) return raw;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}
const APP_URL = normalizeAppUrl(process.env.APP_URL);

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

/** Click the first element whose trimmed text exactly matches one of `texts`. */
async function clickByText(page, texts) {
  for (const t of texts) {
    const loc = page.getByText(t, { exact: true }).first();
    try {
      if (await loc.count() > 0) {
        await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await loc.click({ timeout: 3000 });
        console.log(`Clicked "${t}"`);
        return t;
      }
    } catch (err) {
      console.log(`Click "${t}" failed: ${err.message}`);
    }
  }
  return null;
}

async function navigateToInvoices(page, diagnostics) {
  // The SPA shows a full-page loading progress bar (AppLayout_progressContainer)
  // until the React tree is fully mounted. networkidle fires at ~93% — before
  // the sidebar renders. We must wait until the progress bar is gone.
  console.log('Waiting for app loading progress bar to disappear...');
  try {
    await Promise.race([
      // Primary signal: progress bar hidden/removed
      page.waitForSelector('[class*="AppLayout_progressContainer"]', {
        state: 'hidden',
        timeout: 60000,
      }),
      // Fallback signal: sidebar itself becomes visible
      page.waitForSelector('[class*="Sidebar_container"], [class*="Sidebar_links"]', {
        state: 'visible',
        timeout: 60000,
      }),
    ]);
    console.log('App is ready (progress bar gone or sidebar visible)');
  } catch (err) {
    console.warn('App did not finish loading within 60 s:', err.message);
  }

  await sleep(1000);
  diagnostics.steps.push(await collectDiagnostics(page, 'after-load-wait'));

  console.log('Waiting for accounting sidebar item...');
  try {
    await page
      .locator('li')
      .filter({ hasText: /^הנהלת חשבונות$/ })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
    console.log('Accounting sidebar item is visible');
  } catch (err) {
    console.warn('Accounting item not found within 15 s:', err.message);
    await sleep(2000);
  }

  // Invoices live under the "הנהלת חשבונות" (accounting) sidebar item, which is
  // a <li> without an href — it opens a sub-menu when clicked.
  const openedAccounting = await clickByText(page, ['הנהלת חשבונות']);
  if (openedAccounting) {
    await sleep(2000);
    diagnostics.steps.push(await collectDiagnostics(page, 'after-accounting-click'));
  } else {
    console.warn('Could not click הנהלת חשבונות');
    diagnostics.steps.push(await collectDiagnostics(page, 'accounting-not-found'));
  }

  // From the accounting area, open the invoices/documents list.
  // Try every plausible label the sub-menu might use.
  const openedInvoices = await clickByText(page, [
    'חשבוניות', 'חשבונית', 'כל המסמכים', 'מסמכים חשבונאיים',
    'מסמכי הנהלת חשבונות', 'מסמכים', 'הכנסות', 'דוחות',
  ]);
  if (openedInvoices) {
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await sleep(2500);
    console.log('Navigated to accounting area, URL:', page.url());

    // The accounting page (/app/accounting) has tabs: יתרות לחיוב | טיוטות |
    // דרישות תשלום | חשבוניות. We need the "חשבוניות" tab.
    if (page.url().includes('/accounting')) {
      console.log('On accounting page — clicking חשבוניות tab...');
      const clickedTab = await clickByText(page, ['חשבוניות']);
      if (clickedTab) {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await sleep(2500);
        console.log('Clicked חשבוניות tab, URL:', page.url());
        diagnostics.steps.push(await collectDiagnostics(page, 'after-invoices-tab'));
      } else {
        console.warn('Could not click חשבוניות tab');
        diagnostics.steps.push(await collectDiagnostics(page, 'invoices-tab-not-found'));
      }
    }
  } else {
    console.warn('Could not find an invoices link under accounting');
    diagnostics.steps.push(await collectDiagnostics(page, 'invoices-not-found'));
  }
}

async function extractInvoicesFromPage(page) {
  const invoices = [];

  // Cligal renders tables with react-data-table-component: rows are
  // `.rdt_TableRow` and cells `.rdt_TableCell` (the header row is a separate
  // `.rdt_TableHeadRow`, so it's naturally excluded).
  const tableSelectors = [
    '.rdt_TableRow',
    'div[role="row"]:not(.rdt_TableHeadRow)',
    'table tbody tr',
    '[role="grid"] [role="row"]:not([role="columnheader"])',
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
      const cells = await row.$$('.rdt_TableCell, [role="gridcell"], td, [role="cell"]');
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
    '#pagination-next-page',
    'button[aria-label="Next Page"]',
    'button[aria-label="Next page"]',
    'button[aria-label="עמוד הבא"]',
    'button[id*="next"]',
    '.pagination .next',
    'button:has-text("הבא")',
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

  const BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
    batches.push(invoices.slice(i, i + BATCH_SIZE));
  }

  console.log(`Syncing ${invoices.length} invoices in ${batches.length} batches of up to ${BATCH_SIZE}...`);

  let totalImported = 0;
  let totalSkipped = 0;
  const allErrors = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`Sending batch ${b + 1}/${batches.length} (${batch.length} invoices)...`);

    const response = await fetch(`${APP_URL}/api/invoices/sync-cligal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      body: JSON.stringify({ invoices: batch }),
    });

    let result;
    try {
      result = await response.json();
    } catch {
      result = { error: `HTTP ${response.status}` };
    }

    if (!response.ok) {
      console.error(`Batch ${b + 1} failed:`, JSON.stringify(result));
      allErrors.push(`Batch ${b + 1}: ${result.error || response.status}`);
      // Continue with remaining batches rather than aborting
      continue;
    }

    const batchImported = (result.inserted || 0) + (result.updated || 0);
    console.log(`Batch ${b + 1} result: inserted=${result.inserted}, updated=${result.updated}, skipped=${result.skipped}, errors=${result.errors?.length || 0}`);
    totalImported += batchImported;
    totalSkipped += result.skipped || 0;
    if (result.errors?.length) allErrors.push(...result.errors);

    // Small pause between batches to avoid overwhelming the DB
    if (b < batches.length - 1) await sleep(500);
  }

  console.log(`\nSync complete: imported=${totalImported}, skipped=${totalSkipped}, errors=${allErrors.length}`);
  if (allErrors.length) console.error('Sync errors:', allErrors.slice(0, 10));

  return { imported: totalImported, skipped: totalSkipped, errors: allErrors };
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

      // Find the most-repeated class combinations — these usually mark the
      // repeating "row" elements in div-based grids (React/Angular tables).
      const classCount = {};
      Array.from(document.querySelectorAll('[class]')).forEach((el) => {
        const c = (el.getAttribute('class') || '').trim();
        if (c) classCount[c] = (classCount[c] || 0) + 1;
      });
      const repeatedClasses = Object.entries(classCount)
        .filter(([, n]) => n >= 5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([cls, n]) => ({ cls, n }));

      // Grab a trimmed HTML snapshot of the main content region so we can
      // write accurate selectors from the real DOM.
      const main = document.querySelector('main, [role=main], .content, #content, #root, #app, body');
      const mainHtml = main ? main.outerHTML.replace(/\s+/g, ' ').slice(0, 12000) : '';

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
        repeatedClasses,
        mainHtml,
        bodyTextSnippet: (document.body ? document.body.innerText : '').slice(0, 2000),
      };
    }, label);
  } catch (err) {
    return { label, error: err.message };
  }
}

async function sendDiagnostics(diagnostics) {
  const target = `${APP_URL}/api/invoices/cligal-debug`;
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify(diagnostics),
      redirect: 'manual',
    });
    const text = await res.text().catch(() => '');
    console.log(`Diagnostics POST ${target} -> ${res.status} ${text.slice(0, 200)}`);
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

    await navigateToInvoices(page, diagnostics);
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
