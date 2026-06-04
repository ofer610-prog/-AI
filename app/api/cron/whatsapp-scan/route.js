import { NextResponse } from 'next/server';
import { runWhatsappScan } from '@/lib/whatsapp-scan';
import { validateCronSecret } from '@/lib/security';

export async function GET(request) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runWhatsappScan();
    console.log('whatsapp-scan cron result:', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('whatsapp-scan cron error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
