import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getDriveClient, DEFAULT_EXPENSES_DRIVE_FOLDER_ID } from '@/lib/drive';
import { getOrCreateExpenseDateTopicFolder, getOrCreateExpenseTopicFolder } from '@/lib/driveFolders';
import { saveGmailReceiptToDrive } from '@/lib/expenseDriveSave';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function driveFileId(url) {
  const s = String(url || '');
  let m = s.match(/\/file\/d\/([^/]+)/);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]id=([^&]+)/);
  return m?.[1] || null;
}

function monthParts(doc) {
  const d = doc.doc_date ? new Date(doc.doc_date) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return {
    docDate: safe.toISOString().slice(0, 10),
    year: Number(doc.expense_year || safe.getFullYear()),
    month: Number(doc.expense_month_num || (safe.getMonth() + 1)),
  };
}

function duplicateKey(doc) {
  if (doc.gmail_message_id) return `gmail:${doc.gmail_message_id}`;
  const amount = Number(doc.amount || 0).toFixed(2);
  return `finger:${doc.vendor || ''}|${doc.doc_date || ''}|${amount}|${doc.expense_item || ''}`.toLowerCase();
}

async function moveDriveFile({ drive, fileId, targetFolderId }) {
  const meta = await drive.files.get({ fileId, fields: 'id,name,parents,webViewLink', supportsAllDrives: true });
  const previousParents = (meta.data.parents || []).join(',');
  if ((meta.data.parents || []).includes(targetFolderId)) return { moved: false, file: meta.data };
  const updated = await drive.files.update({
    fileId,
    addParents: targetFolderId,
    removeParents: previousParents || undefined,
    fields: 'id,name,webViewLink,parents',
    supportsAllDrives: true,
  });
  return { moved: true, file: updated.data };
}

export async function POST() {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();
  const { data: org } = await sb.from('organizations')
    .select('gmail_refresh_token,drive_expenses_folder_id')
    .eq('id', profile.organization_id)
    .single();
  if (!org?.gmail_refresh_token) return Response.json({ error: 'Google לא מחובר' }, { status: 400 });

  const rootFolderId = org.drive_expenses_folder_id || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;
  const drive = getDriveClient(org.gmail_refresh_token);
  const duplicatesFolder = await getOrCreateExpenseTopicFolder({
    refreshToken: org.gmail_refresh_token,
    rootFolderId,
    topic: 'כפילויות לבדיקה',
  });

  const { data: docs, error } = await sb.from('expense_documents')
    .select('id,amount,vendor,description,doc_date,status,file_url,file_name,file_type,expense_item,expense_section,expense_year,expense_month_num,gmail_message_id')
    .eq('organization_id', profile.organization_id)
    .neq('status', 'removed')
    .order('doc_date', { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const seen = new Map();
  const moved = [];
  const saved = [];
  const duplicates = [];
  const skipped = [];
  const failed = [];

  for (const doc of docs || []) {
    const key = duplicateKey(doc);
    const isDuplicate = seen.has(key);
    if (!isDuplicate) seen.set(key, doc.id);

    try {
      if (isDuplicate) {
        const fileId = driveFileId(doc.file_url);
        if (fileId) {
          await moveDriveFile({ drive, fileId, targetFolderId: duplicatesFolder.id });
          duplicates.push({ id: doc.id, duplicate_of: seen.get(key), action: 'moved_to_duplicates_folder' });
        } else {
          duplicates.push({ id: doc.id, duplicate_of: seen.get(key), action: 'marked_duplicate_no_drive_file' });
        }
        await sb.from('expense_documents').update({ status: 'duplicate_review' }).eq('id', doc.id).eq('organization_id', profile.organization_id);
        continue;
      }

      const { docDate, year, month } = monthParts(doc);
      const topic = doc.expense_item || 'ממתין לסיווג';
      const folderPath = await getOrCreateExpenseDateTopicFolder({
        refreshToken: org.gmail_refresh_token,
        rootFolderId,
        year,
        month,
        topic,
      });

      const fileId = driveFileId(doc.file_url);
      if (fileId) {
        const result = await moveDriveFile({ drive, fileId, targetFolderId: folderPath.folder.id });
        moved.push({ id: doc.id, file_id: fileId, folder: folderPath.folder.name, moved: result.moved });
        continue;
      }

      if (doc.gmail_message_id) {
        const row = { subject: doc.file_name, description: doc.description, amount: doc.amount, vendor: doc.vendor };
        const result = await saveGmailReceiptToDrive({
          org,
          gmailId: doc.gmail_message_id,
          row,
          docDate,
          year,
          month,
          topic,
          vendor: doc.vendor || topic,
        });
        if (result.url) {
          await sb.from('expense_documents').update({
            file_url: result.url,
            file_name: result.fileName || doc.file_name,
            file_type: result.source === 'gmail_body' ? 'drive_email_body' : 'drive_receipt',
          }).eq('id', doc.id).eq('organization_id', profile.organization_id);
          saved.push({ id: doc.id, folder: result.folderName, source: result.source });
        } else {
          skipped.push({ id: doc.id, reason: result.note || 'not_saved' });
        }
        continue;
      }

      skipped.push({ id: doc.id, reason: 'no_drive_or_gmail_source' });
    } catch (e) {
      failed.push({ id: doc.id, error: e.message });
    }
  }

  return Response.json({
    ok: true,
    docs: docs?.length || 0,
    moved,
    saved,
    duplicates,
    skipped,
    failed,
    duplicates_folder: { id: duplicatesFolder.id, name: duplicatesFolder.name, url: duplicatesFolder.webViewLink },
  });
}
