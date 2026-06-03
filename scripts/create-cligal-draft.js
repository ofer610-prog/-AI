#!/usr/bin/env node
/**
 * Playwright script — creates a draft invoice in Cligal.
 *
 * Required env vars:
 *   CLIGAL_EMAIL       - login email
 *   CLIGAL_PASSWORD    - login password
 *   APP_URL            - base URL of our app
 *   CRON_SECRET        - shared secret for the callback endpoint
 *   DRAFT_CLIENT_NAME  - client name for the invoice
 *   DRAFT_AMOUNT       - invoice amount (number)
 *   DRAFT_DESCRIPTION  - description / memo
 *   DRAFT_DATE         - invoice date YYYY-MM-DD (optional, defaults to today)
 */

const { chromium } = require('playwright');

const CLIGAL_URL   = 'https://app.cligal.com';
const EMAIL        = process.env.CLIGAL_EMAIL;
const PASSWORD     = process.env.CLIGAL_PASSWORD;
const CRON_SECRET  = process.env.CRON_SECRET;
const CLIENT_NAME  = process.env.DRAFT_CLIENT_NAME  || '';
const AMOUNT       = process.env.DRAFT_AMOUNT       || '';
const DESCRIPTION  = process.env.DRAFT_DESCRIPTION  || '';
const DRAFT_DATE   = process.env.DRAFT_DATE         || new Date().toISOString().slice(0, 10);

function normalizeAppUrl(raw) {
  if (!raw) return raw;
  try { return new URL(raw).origin; } catch { return raw.replace(/\/+$/, ''); }
}
const APP_URL = normalizeAppUrl(process.env.APP_URL);

if (!EMAIL || !PASSWORD || !APP_URL || !CRON_SECRET) {
  console.error('Missing required env vars: CLIGAL_EMAIL, CLIGAL_PASSWORD, APP_URL, CRON_SECRET');
  process.exit(1);
}
if (!CLIENT_NAME || !AMOUNT) {
  console.error('Missing required env vars: DRAFT_CLIENT_NAME, DRAFT_AMOUNT');
  process.exit(1);
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function login(page) {
  console.log('Navigating to Cligal...');
  await page.goto(`${CLIGAL_URL}/app`, { waitUntil: 'networkidle', timeout: 30000 });

  const emailSelectors = [
    'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
    'input[placeholder*="מייל"]', 'input[placeholder*="אימייל"]', '#email',
  ];
  let emailField = null;
  for (const sel of emailSelectors) {
    try {
      emailField = await page.waitForSelector(sel, { timeout: 3000 });
      if (emailField) { console.log(`Email field: ${sel}`); break; }
    } catch {}
  }
  if (!emailField) {
    await page.screenshot({ path: 'debug-draft-login.png' });
    throw new Error('Email field not found');
  }
  await emailField.fill(EMAIL);

  const pwField = await page.$('input[type="password"]');
  if (!pwField) throw new Error('Password field not found');
  await pwField.fill(PASSWORD);

  for (const sel of ['button[type="submit"]', 'button:has-text("כניסה")', 'button:has-text("התחבר")']) {
    const btn = await page.$(sel);
    if (btn) { await btn.click(); break; }
  }

  await page.waitForLoadState('networkidle', { timeout: 15000 });
  await sleep(2000);
  if (page.url().includes('login') || page.url().includes('signin')) {
    throw new Error('Login failed');
  }
  console.log('Logged in. URL:', page.url());
}

/** Wait for the app to finish the loading progress bar */
async function waitForApp(page) {
  try {
    await Promise.race([
      page.waitForSelector('[class*="AppLayout_progressContainer"]', { state: 'hidden', timeout: 60000 }),
      page.waitForSelector('[class*="Sidebar_container"]', { state: 'visible', timeout: 60000 }),
    ]);
  } catch {}
  await sleep(1000);
}

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
    } catch {}
  }
  return null;
}

/** Navigate to הנהלת חשבונות → יתרות לחיוב (unbilled balances) where new invoices are created */
async function navigateToAccounting(page) {
  await waitForApp(page);

  // Wait for sidebar
  try {
    await page.locator('li').filter({ hasText: /^הנהלת חשבונות$/ }).first()
      .waitFor({ state: 'visible', timeout: 15000 });
  } catch {}

  const opened = await clickByText(page, ['הנהלת חשבונות']);
  if (!opened) throw new Error('Could not open הנהלת חשבונות');
  await sleep(2000);

  // Click into accounting area
  await clickByText(page, ['חשבוניות', 'כל המסמכים', 'מסמכים חשבונאיים', 'מסמכים', 'הכנסות']);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sleep(2500);
  console.log('Accounting page URL:', page.url());
}

/** Convert YYYY-MM-DD to DD/MM/YYYY for Cligal date inputs */
function formatDateForCligal(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Fill in an input/textarea by trying multiple selectors */
async function fillField(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await el.fill('');
        await el.type(value, { delay: 50 });
        console.log(`Filled "${sel}" with "${value}"`);
        await sleep(500);
        return true;
      }
    } catch {}
  }
  return false;
}

/** Look for and click the "new invoice" button */
async function clickNewInvoiceButton(page) {
  // Try URL-based navigation first
  const newInvoiceUrls = [
    `${CLIGAL_URL}/app/accounting/invoice/new`,
    `${CLIGAL_URL}/app/accounting/new`,
    `${CLIGAL_URL}/app/documents/new`,
  ];
  for (const url of newInvoiceUrls) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      await sleep(1500);
      // Check if we landed on a form page (has inputs)
      const inputs = await page.$$('input:not([type="hidden"])');
      if (inputs.length >= 2) {
        console.log('Navigated to new invoice form via URL:', url);
        return true;
      }
    } catch {}
  }

  // Try clicking a button on the current page
  const buttonTexts = [
    'חשבונית חדשה', 'הוסף חשבונית', 'יצירת חשבונית', 'צור חשבונית',
    'חשבונית מס חדשה', 'הפק חשבונית', 'חשבונית מס קבלה חדשה',
    'חדש', 'הוסף', 'יצור',
  ];
  for (const text of buttonTexts) {
    const loc = page.getByText(text, { exact: false }).first();
    try {
      if (await loc.count() > 0) {
        await loc.click({ timeout: 3000 });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await sleep(2000);
        const inputs = await page.$$('input:not([type="hidden"])');
        if (inputs.length >= 2) {
          console.log(`Navigated to new invoice form via button: "${text}"`);
          return true;
        }
      }
    } catch {}
  }

  // Try "+" or icon buttons
  const plusBtn = await page.$('button[aria-label*="חדש"], button[aria-label*="הוסף"], button[title*="חדש"], button[title*="הוסף"]');
  if (plusBtn) {
    await plusBtn.click();
    await sleep(2000);
    console.log('Clicked + button');
    return true;
  }

  await page.screenshot({ path: 'debug-draft-no-new-button.png' });
  return false;
}

/** Fill in the new invoice form */
async function fillInvoiceForm(page) {
  console.log('Filling invoice form...');
  await sleep(1000);

  // Client name
  const clientSelectors = [
    'input[name*="client"], input[name*="לקוח"], input[placeholder*="לקוח"], input[placeholder*="חיפוש לקוח"]',
    '[data-field*="client"] input', '[aria-label*="לקוח"] input',
    '.client-select input', '.client-field input',
    'input[id*="client"]',
  ].flatMap((s) => s.split(', '));

  const clientFilled = await fillField(page, clientSelectors, CLIENT_NAME);
  if (clientFilled) {
    // Wait for autocomplete dropdown and pick first result
    await sleep(800);
    const dropdownItem = page.locator('[role="option"], .dropdown-item, .autocomplete-item').first();
    try {
      if (await dropdownItem.count() > 0) {
        await dropdownItem.click();
        console.log('Selected client from dropdown');
      }
    } catch {}
  } else {
    console.warn('Could not fill client name — trying Select component');
    // Some forms use a Select component
    const clientSelect = page.getByText('בחר לקוח', { exact: false }).first();
    if (await clientSelect.count() > 0) {
      await clientSelect.click();
      await sleep(500);
      const searchInput = page.locator('input[placeholder*="חיפוש"], input[placeholder*="search"]').first();
      if (await searchInput.count() > 0) {
        await searchInput.type(CLIENT_NAME, { delay: 50 });
        await sleep(600);
        const option = page.locator('[role="option"]').first();
        if (await option.count() > 0) await option.click();
      }
    }
  }

  // Date
  const dateFormatted = formatDateForCligal(DRAFT_DATE);
  await fillField(page, [
    'input[type="date"]',
    'input[name*="date"], input[name*="תאריך"]',
    'input[placeholder*="תאריך"]',
    'input[id*="date"]',
  ], dateFormatted);

  // Description
  if (DESCRIPTION) {
    await fillField(page, [
      'textarea[name*="description"], textarea[name*="תיאור"], textarea[placeholder*="תיאור"]',
      'input[name*="description"], input[name*="תיאור"], input[placeholder*="תיאור"]',
      'textarea', '[contenteditable]',
    ], DESCRIPTION);
  }

  // Amount — may be in a line-item row
  const amountSelectors = [
    'input[name*="amount"], input[name*="סכום"], input[name*="price"], input[name*="מחיר"]',
    'input[placeholder*="סכום"], input[placeholder*="מחיר"]',
    'input[type="number"]',
    'input[id*="amount"], input[id*="price"]',
  ];
  const amountFilled = await fillField(page, amountSelectors.flatMap((s) => s.split(', ')), AMOUNT);
  if (!amountFilled) {
    // Try clicking into the amount cell in a line-item table
    const amountCell = page.locator('td input, .line-item input').last();
    if (await amountCell.count() > 0) {
      await amountCell.click();
      await amountCell.fill(AMOUNT);
      console.log('Filled amount in line-item cell');
    }
  }

  console.log('Form filling complete');
}

/** Click the save-as-draft button */
async function saveDraft(page) {
  const draftButtonTexts = [
    'שמור כטיוטה', 'שמור טיוטה', 'שמירה כטיוטה', 'שמור כ-טיוטה',
    'שמור', 'שמירה',
    'Save Draft', 'Save as Draft',
  ];

  for (const text of draftButtonTexts) {
    const btn = page.getByText(text, { exact: true }).first();
    try {
      if (await btn.count() > 0) {
        await btn.click({ timeout: 5000 });
        console.log(`Clicked draft save button: "${text}"`);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await sleep(2000);
        return true;
      }
    } catch {}
  }

  // Fallback: look for a secondary button (usually "שמור" as opposed to primary "הפק/שלח")
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = (await btn.innerText().catch(() => '')).trim();
    if (text && ['שמור', 'שמירה', 'Save'].includes(text)) {
      await btn.click();
      await sleep(2000);
      console.log(`Clicked save button: "${text}"`);
      return true;
    }
  }

  await page.screenshot({ path: 'debug-draft-no-save.png' });
  return false;
}

/** Report result back to the app */
async function reportResult(success, details) {
  try {
    const res = await fetch(`${APP_URL}/api/bank/cligal-draft-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify({ success, details }),
    });
    console.log(`Result reported: ${res.status}`);
  } catch (err) {
    console.error('Failed to report result:', err.message);
  }
}

async function main() {
  console.log(`Creating Cligal draft invoice: client="${CLIENT_NAME}", amount=${AMOUNT}, date=${DRAFT_DATE}`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
  });
  const page = await context.newPage();

  try {
    await login(page);
    await navigateToAccounting(page);

    const foundForm = await clickNewInvoiceButton(page);
    if (!foundForm) {
      throw new Error('Could not find new invoice form in Cligal');
    }

    await fillInvoiceForm(page);
    const saved = await saveDraft(page);
    if (!saved) {
      throw new Error('Could not save draft — save button not found');
    }

    console.log('Draft invoice created successfully in Cligal');
    await reportResult(true, { client: CLIENT_NAME, amount: AMOUNT, date: DRAFT_DATE });

  } catch (err) {
    console.error('Error creating draft:', err.message);
    await page.screenshot({ path: 'debug-draft-error.png' }).catch(() => {});
    await reportResult(false, { error: err.message, client: CLIENT_NAME, amount: AMOUNT });
    await browser.close();
    process.exit(1);
  }

  await browser.close();
  console.log('Done');
}

main();
