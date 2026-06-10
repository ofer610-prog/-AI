import { NextResponse } from 'next/server';
import { runWhatsappScan } from '@/lib/whatsapp-scan';
import { validateCronSecret } from '@/lib/security';
import { getSessionUser } from '@/lib/supabase/server';

export async function GET(request) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runWhatsappScan();
    return NextResponse.json(result);
  } catch (err) {
    console.error('whatsapp/scan GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runWhatsappScan();
    return NextResponse.json(result);
  } catch (err) {
    console.error('whatsapp/scan POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
