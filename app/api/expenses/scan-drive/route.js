import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function getDriveClient(refreshToken) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

/**
 * POST /api/expenses/scan-drive
 * סורק תיקיית הוצאות ב-Drive ומייצר רשומות needs_review לקבצים חדשים.
 */
export async function POST() {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = await createClient();
  const { data: org } = await sb.from('organizations')
    .select('id,gmail_refresh_token,drive_expenses_folder_id')
    .eq('id', profile.organization_id).single();

  if (!org?.gmail_refresh_token) return Response.json({ error: 'Gmail לא מחובר' }, { status: 400 });
  if (!org?.drive_expenses_folder_id) return Response.json({ error: 'תיקיית Drive לא מוגדרת' }, { status: 400 });

  let drive;
  try { drive = await getDriveClient(org.gmail_refresh_token); }
  catch (e) { return Response.json({ error: `Google auth failed: ${e.message}` }, { status: 500 }); }

  // שליפת קבצים מהתיקייה
  let files = [];
  try {
    const res = await drive.files.list({
      q: `'${org.drive_expenses_folder_id}' in parents and trashed=false and (mimeType='application/pdf' or mimeType contains 'image/')`,
      fields: 'files(id,name,mimeType,createdTime,webViewLink,size)',
      pageSize: 200,
      orderBy: 'createdTime desc',
    });
    files = res.data.files || [];
  } catch (e) {
    return Response.json({ error: `Drive list failed: ${e.message}` }, { status: 500 });
  }

  if (!files.length) return Response.json({ ok: true, found: 0, added: 0, duplicates: 0 });

  // בדיקת קיימים (לפי file_url)
  const { data: existing } = await sb.from('expense_documents')
    .select('file_url').eq('organization_id', org.id).not('file_url', 'is', null);
  const existingUrls = new Set((existing || []).map(d => d.file_url));

  let added = 0, duplicates = 0;
  for (const file of files) {
    const fileUrl = file.webViewLink;
    if (existingUrls.has(fileUrl)) { duplicates++; continue; }

    const createdDate = file.createdTime
      ? new Date(file.createdTime).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const dateObj = new Date(createdDate);

    const { error } = await sb.from('expense_documents').insert({
      organization_id:   org.id,
      file_url:          fileUrl,
      file_name:         file.name,
      file_type:         file.mimeType === 'application/pdf' ? 'drive_pdf' : 'drive_image',
      status:            'needs_review',
      doc_date:          createdDate,
      month:             createdDate.slice(0, 7),
      expense_year:      dateObj.getFullYear(),
      expense_month_num: dateObj.getMonth() + 1,
      description:       `קובץ מ-Drive: ${file.name}`,
      payer:             'office',
    });
    if (!error) { added++; existingUrls.add(fileUrl); }
  }

  return Response.json({ ok: true, found: files.length, added, duplicates });
}
