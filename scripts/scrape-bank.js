#!/usr/bin/env node
/**
 * Israeli bank scraper — Mizrahi Tefahot
 * Pulls last 60 days of transactions and POSTs to the sync endpoint.
 *
 * Required env vars:
 *   BANK_ID         - תעודת זהות / מספר משתמש
 *   BANK_PASSWORD   - סיסמה
 *   APP_URL         - base URL of our app
 *   CRON_SECRET     - shared secret
 */

const { createScraper, CompanyTypes } = require('israeli-bank-scrapers');

const BANK_ID       = process.env.BANK_ID;
const BANK_PASSWORD = process.env.BANK_PASSWORD;
const CRON_SECRET   = process.env.CRON_SECRET;

function normalizeAppUrl(raw) {
  if (!raw) return raw;
  try { return new URL(raw).origin; } catch { return raw.replace(/\/+$/, ''); }
}
const APP_URL = normalizeAppUrl(process.env.APP_URL);

if (!BANK_ID || !BANK_PASSWORD || !APP_URL || !CRON_SECRET) {
  console.error('Missing required env vars: BANK_ID, BANK_PASSWORD, APP_URL, CRON_SECRET');
  process.exit(1);
}

async function main() {
  console.log('Starting Mizrahi Tefahot bank scraper...');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 60); // last 60 days

  const scraper = createScraper({
    companyId: CompanyTypes.mizrahi,
    startDate,
    combineInstallments: false,
    showBrowser: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let result;
  try {
    result = await scraper.scrape({ id: BANK_ID, password: BANK_PASSWORD });
  } catch (err) {
    console.error('Scraper threw:', err.message);
    process.exit(1);
  }

  if (!result.success) {
    console.error('Scraper failed:', result.errorType, result.errorMessage);
    process.exit(1);
  }

  // Flatten all accounts → transactions
  const transactions = [];
  for (const account of result.accounts || []) {
    console.log(`Account ${account.accountNumber}: ${account.txns?.length || 0} transactions`);
    for (const txn of account.txns || []) {
      transactions.push({
        account_number: account.accountNumber,
        date:           txn.date ? txn.date.slice(0, 10) : null,
        amount:         txn.chargedAmount ?? txn.originalAmount ?? 0,
        description:    txn.description || '',
        reference:      String(txn.identifier || ''),
        memo:           txn.memo || '',
        status:         txn.status || 'completed',
      });
    }
  }

  if (!transactions.length) {
    console.log('No transactions found.');
    return;
  }

  console.log(`Total transactions: ${transactions.length}`);

  // Send in batches of 100
  const BATCH = 100;
  let totalImported = 0;
  let totalAlerts = 0;

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH);
    console.log(`Sending batch ${Math.floor(i / BATCH) + 1} (${batch.length} txns)...`);

    const res = await fetch(`${APP_URL}/api/bank/sync-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify({ transactions: batch }),
    });

    let data;
    try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }

    if (!res.ok) {
      console.error('Batch failed:', JSON.stringify(data));
      continue;
    }
    console.log(`  → imported=${data.imported}, skipped=${data.skipped}, alerts=${data.alerts_created}`);
    totalImported += data.imported || 0;
    totalAlerts   += data.alerts_created || 0;
  }

  console.log(`\nDone. imported=${totalImported}, alerts=${totalAlerts}`);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
