import { createClient, createServiceClient } from '@/lib/supabase/server';
import { importSheets } from '@/lib/casesImport';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/upload-xlsx
 * Accepts multipart/form-data with field "file" (.xlsx/.xls/.csv).
 * Parses all sheets and imports cases/tasks/events — same logic as the
 * Google-Drive cron sync, but from a directly uploaded file.
 */
export async function POST(request) {
  const authSb = await createClient();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await authSb
    .from('profiles').select('organization_id, role').eq('id', user.id).single();
  if (!profile) return Response.json({ error: 'No profile' }, { status: 403 });
  if (!['admin', 'accountant', 'lawyer'].includes(profile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  const stats = await importSheets(sb, profile.organization_id, sheets);

  return Response.json({ ok: true, ...stats });
}
