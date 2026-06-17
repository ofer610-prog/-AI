import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const origin = new URL(request.url).origin;
  const cookie = request.headers.get('cookie') || '';

  const scanRes = await fetch(`${origin}/api/expenses/scan-gmail`, {
    method: 'POST',
    headers: { cookie },
  });
  const scan = await scanRes.json().catch(() => ({}));
  if (!scanRes.ok) return Response.json(scan, { status: scanRes.status });

  const suggestions = Array.isArray(scan.suggestions) ? scan.suggestions : [];
  if (!suggestions.length) {
    console.log('SCAN_AND_IMPORT no_suggestions', JSON.stringify({ scanned: scan.scanned || 0 }));
    return Response.json({ ok: true, scanned: scan.scanned || 0, imported: [], skipped: [], errors: [], message: 'לא נמצאו קבלות חדשות לייבוא' });
  }

  const importRes = await fetch(`${origin}/api/expenses/import-gmail-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ suggestions }),
  });
  const imported = await importRes.json().catch(() => ({}));
  if (!importRes.ok) return Response.json(imported, { status: importRes.status });

  const finalResult = {
    ok: true,
    scanned: scan.scanned || suggestions.length,
    suggestions: suggestions.length,
    ...imported,
  };
  console.log('SCAN_AND_IMPORT result', JSON.stringify({ scanned: finalResult.scanned, suggestions: finalResult.suggestions, imported: finalResult.imported?.length, skipped: finalResult.skipped?.length, errors: finalResult.errors?.length, driveWarnings: finalResult.driveWarnings?.length }));
  return Response.json(finalResult);
}
