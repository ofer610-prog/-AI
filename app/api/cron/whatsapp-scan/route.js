import { NextResponse } from 'next/server';
import { runWhatsappScan } from '@/lib/whatsapp-scan';

export async function GET(request) {
  // Vercel cron sends Authorization header with CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
