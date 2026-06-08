import { createServiceClient } from '@/lib/supabase/server';
import { validatePin, getPinFromRequest, getOrgId } from '@/lib/pinAuth';
import { importSheets } from '@/lib/casesImport';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const pin = await getPinFromRequest(request);
  const ok  = await validatePin(pin);
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const orgId = await getOrgId();
  if (!orgId) return Response.json({ error: 'No organization' }, { status: 500 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return Response.json({ error: 'לא נבחר קובץ' }, { status: 400 });

  const fileName = file.name?.toLowerCase() || '';
  const buffer   = Buffer.from(await file.arrayBuffer());

  const XLSX = await import('xlsx');
  let sheets = {};

  try {
    if (fileName.endsWith('.csv')) {
      const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      sheets = { sheet1: XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) };
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      for (const name of wb.SheetNames) {
        sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
      }
    }
  } catch (err) {
    return Response.json({ error: `קובץ לא תקין: ${err.message}` }, { status: 400 });
  }

  const sb = createServiceClient();
  const stats = await importSheets(sb, orgId, sheets);

  return Response.json({ ok: true, ...stats });
}
