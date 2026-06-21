import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function savePendingReview(sb, profile, row) {
  const gmailId = row.gmail_id || row.gmail_message_id;
  if (!gmailId) return { skipped: true, reason: 'missing_gmail_id' };

  const { data: exists } = await sb.from('expense_documents')
    .select('id,status')
    .eq('organization_id', profile.organization_id)
    .eq('gmail_message_id', gmailId)
    .neq('status', 'removed')
    .maybeSingle();
  if (exists?.id) return { skipped: true, reason: 'duplicate', id: exists.id };

  const dateStr = row.date || row.doc_date || new Date().toISOString().slice(0, 10);
  const month = String(dateStr).slice(0, 7);
  const gmailLink = row.gmail_link || `https://mail.google.com/mail/#all/${gmailId}`;
  const description = [
    row.description || row.subject || 'חשבונית ממתינה לסיווג',
    row.card_last4 ? `כרטיס: ${row.card_last4}` : null,
    row.from ? `שולח: ${row.from}` : null,
    `קישור למייל: ${gmailLink}`,
  ].filter(Boolean).join('\n');

  const { data, error } = await sb.from('expense_documents').insert({
    organization_id: profile.organization_id,
    uploaded_by: profile.id,
    amount: Number(row.amount || 0),
    vendor: row.vendor || row.from || null,
    description,
    category: 'review',
    doc_date: dateStr,
    month,
    status: 'needs_review',
    file_url: gmailLink,
    file_name: row.subject || `${gmailId}.gmail`,
    file_type: 'gmail_candidate',
    gmail_message_id: gmailId,
    payer: 'office',
  }).select('id').single();

  if (error) return { error: error.message, gmail_id: gmailId };
  return { id: data.id, gmail_id: gmailId, status: 'needs_review' };
}

async function runDriveReorganize(origin, cookie) {
  try {
    const res = await fetch(`${origin}/api/expenses/reorganize-drive`, { method: 'POST', headers: { cookie } });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const origin = new URL(request.url).origin;
  const cookie = request.headers.get('cookie') || '';
  const scanRes = await fetch(`${origin}/api/expenses/scan-gmail`, { method: 'POST', headers: { cookie } });
  const scan = await scanRes.json().catch(() => ({}));
  if (!scanRes.ok) return Response.json(scan, { status: scanRes.status });

  const suggestions = Array.isArray(scan.suggestions) ? scan.suggestions : [];
  if (!suggestions.length) {
    const reorganize = await runDriveReorganize(origin, cookie);
    return Response.json({ ok: true, scanned: scan.scanned || 0, imported: [], pending_review: [], skipped: [], errors: [], message: 'לא נמצאו קבלות חדשות לייבוא', drive_reorganize: reorganize });
  }

  const known = suggestions.filter(x => !!x.matched_vendor);
  const unknown = suggestions.filter(x => !x.matched_vendor);

  const sb = createServiceClient();
  const pending = [];
  const pendingErrors = [];
  for (const row of unknown) {
    const saved = await savePendingReview(sb, profile, row);
    if (saved?.error) pendingErrors.push(saved); else pending.push(saved);
  }

  let imported = { imported: [], skipped: [], errors: [], driveWarnings: [] };
  if (known.length) {
    const importRes = await fetch(`${origin}/api/expenses/import-gmail-suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ suggestions: known }),
    });
    imported = await importRes.json().catch(() => ({}));
    if (!importRes.ok) return Response.json(imported, { status: importRes.status });
  }

  const reorganize = await runDriveReorganize(origin, cookie);

  return Response.json({
    ok: true,
    scanned: scan.scanned || suggestions.length,
    suggestions: suggestions.length,
    imported: imported.imported || [],
    skipped: imported.skipped || [],
    errors: [...(imported.errors || []), ...pendingErrors],
    driveWarnings: imported.driveWarnings || [],
    pending_review: pending.filter(x => !x.skipped),
    pending_skipped: pending.filter(x => x.skipped),
    drive_reorganize: reorganize,
  });
}
