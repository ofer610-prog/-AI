import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/cligal-debug
 * Receives diagnostic info from the Playwright scraper so we can see what the
 * scraper actually encountered (page URL, title, structure) via Vercel logs.
 */
export async function POST(request) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Log everything so it shows up in Vercel runtime logs
  console.log('=== CLIGAL DEBUG DIAGNOSTICS ===');
  console.log(JSON.stringify(body, null, 2));
  console.log('=== END CLIGAL DEBUG ===');

  return NextResponse.json({ received: true });
}
