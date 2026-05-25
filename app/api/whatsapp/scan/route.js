import { NextResponse } from 'next/server';
import { runWhatsappScan } from '@/lib/whatsapp-scan';

export async function GET() {
  try {
    const result = await runWhatsappScan();
    return NextResponse.json(result);
  } catch (err) {
    console.error('whatsapp/scan GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runWhatsappScan();
    return NextResponse.json(result);
  } catch (err) {
    console.error('whatsapp/scan POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
