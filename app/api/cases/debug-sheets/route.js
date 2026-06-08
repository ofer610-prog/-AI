import { readDriveFileAllSheets } from '@/lib/gdrive';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cases/debug-sheets
 * TEMPORARY diagnostic.
 * ?test=insert  → tests whether the service client can actually insert (RLS / key check)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // ── Service-client insert test ──
  if (searchParams.get('test') === 'insert') {
    const out = {
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceKeyLen: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    };
    try {
      const sb = createServiceClient();
      const { data: org } = await sb.from('organizations')
        .select('id').order('created_at', { ascending: true }).limit(1).single();
      out.orgId = org?.id || null;

      const { data, error } = await sb.from('clients').insert({
        organization_id: org.id,
        name: 'DEBUG_TEST_CLIENT',
        sheet_row_id: 'debug_test_insert',
      }).select('id').single();

      out.insertError = error ? { message: error.message, code: error.code, details: error.details } : null;
      out.insertedId = data?.id || null;

      // clean up
      if (data?.id) await sb.from('clients').delete().eq('id', data.id);
    } catch (err) {
      out.threw = err.message;
    }
    return Response.json(out);
  }

  // ── Sheet structure dump ──
  const fileId = process.env.GDRIVE_FILE_ID;
  if (!fileId) return Response.json({ error: 'GDRIVE_FILE_ID not set' }, { status: 503 });

  let sheets;
  try {
    sheets = await readDriveFileAllSheets(fileId);
  } catch (err) {
    return Response.json({ error: `Drive error: ${err.message}` }, { status: 502 });
  }

  const summary = {};
  for (const [name, rows] of Object.entries(sheets)) {
    summary[name] = {
      rowCount: rows.length,
      headers: rows[0] ? Object.keys(rows[0]) : [],
    };
  }
  return Response.json({ sheetNames: Object.keys(sheets), summary });
}
