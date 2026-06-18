import { validateCronSecret } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/server';
import { getGmailClient, getEmailDetails, getAttachmentData } from '@/lib/gmail';
import { DEFAULT_EXPENSES_DRIVE_FOLDER_ID, safeDriveFileName, uploadBufferToDrive } from '@/lib/drive';
import { getOrCreateExpenseTopicFolder } from '@/lib/driveFolders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function decode(data) {
  return Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function dateParts(value) {
  const d = value ? new Date(value) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return { date: safe.toISOString().slice(0, 10), year: safe.getFullYear(), month: safe.getMonth() + 1, ym: safe.toISOString().slice(0, 7) };
}

async function recompute(sb, orgId, section, item, year, month) {
  const { data } = await sb.from('expense_documents')
    .select('amount,payer,status')
    .eq('organization_id', orgId)
    .eq('expense_section', section)
    .eq('expense_item', item)
    .eq('expense_year', year)
    .eq('expense_month_num', month);
  const total = (data || [])
    .filter(x => x.status !== 'removed')
    .filter(x => (x.payer || 'office') === 'office')
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  await sb.from('office_expenses').upsert({ organization_id: orgId, section, item_name: item, year, month, amount: total, is_itemized: true }, { onConflict: 'organization_id,section,item_name,year,month' });
}

async function saveAttachment({ gmail, org, gmailId, item, vendor, p, subject, amount, card }) {
  const details = await getEmailDetails(gmail, gmailId);
  const att = (details.attachments || []).find(a => String(a.filename || '').toLowerCase().endsWith('.pdf')) || (details.attachments || [])[0];
  if (!att?.attachmentId) return { url: null, name: null };
  const raw = await getAttachmentData(gmail, gmailId, att.attachmentId);
  const buffer = decode(raw);
  if (!buffer.length) return { url: null, name: null };
  const root = org.drive_expenses_folder_id || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_EXPENSES_DRIVE_FOLDER_ID;
  const folder = await getOrCreateExpenseTopicFolder({ refreshToken: org.gmail_refresh_token, rootFolderId: root, topic: `${p.ym} - ${item || 'כללי'}` });
  const ext = String(att.filename || '').toLowerCase().endsWith('.pdf') ? '.pdf' : ` - ${att.filename || 'invoice'}`;
  const fileName = safeDriveFileName([p.date, vendor || item, subject, card ? `card ${card}` : null, amount ? `${amount} nis` : null]) + ext;
  const saved = await uploadBufferToDrive({ refreshToken: org.gmail_refresh_token, folderId: folder.id, buffer, fileName, mimeType: att.mimeType || 'application/pdf' });
  return { url: saved.webViewLink, name: saved.name, folder: folder.name };
}

async function scanOrg(sb, org) {
  const cards = (Array.isArray(org.office_card_last4) ? org.office_card_last4 : [])
    .map(x => String(x).replace(/\D/g, '')).filter(x => x.length === 4);
  if (!cards.length) return { skipped: 'no_cards' };
  const gmail = getGmailClient(org.gmail_refresh_token);
  const sinceUnix = Math.floor((Date.now() - 90 * 86400000) / 1000);

  const { data: items } = await sb.from('office_expenses').select('item_name').eq('organization_id', org.id);
  const vendors = [...new Set((items || []).map(x => x.item_name).filter(Boolean))];

  const found = new Map();
  const cardByMessage = new Map();
  for (const card of cards) {
    const res = await gmail.users.messages.list({ userId: 'me', q: `after:${sinceUnix} ${card}`, maxResults: 40 });
    for (const msg of res.data.messages || []) {
      found.set(msg.id, msg);
      if (!cardByMessage.has(msg.id)) cardByMessage.set(msg.id, card);
    }
  }

  const { data: existing } = await sb.from('expense_documents')
    .select('gmail_message_id,status')
    .eq('organization_id', org.id)
    .not('gmail_message_id', 'is', null);
  const existingIds = new Set((existing || []).filter(x => x.status !== 'removed').map(x => x.gmail_message_id));

  let imported = 0, skippedExisting = 0, failed = 0;
  for (const msg of [...found.values()].slice(0, 50)) {
    if (existingIds.has(msg.id)) { skippedExisting++; continue; }
    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const p = dateParts(date);
      const low = `${subject} ${from}`.toLowerCase();
      const isGov = low.includes('egovpayments') || low.includes('ecom.gov.il') || subject.includes('אישור תשלום');
      const matchedVendor = isGov ? 'אגרות טאבו' : vendors.find(v => low.includes(String(v).toLowerCase())) || 'חשבוניות מספקים';
      const item = matchedVendor;
      const amountMatch = subject.match(/[\d,]+\.?\d*\s*(?:₪|nis|ils|שח)/i) || subject.match(/(?:₪|nis)\s*[\d,]+\.?\d*/i);
      const amount = amountMatch ? parseFloat(amountMatch[0].replace(/[^\d.]/g, '')) : 0;
      const card = cardByMessage.get(msg.id);
      const gmailLink = `https://mail.google.com/mail/#all/${msg.id}`;
      const drive = await saveAttachment({ gmail, org, gmailId: msg.id, item, vendor: matchedVendor, p, subject, amount, card }).catch(() => ({}));
      const fileUrl = drive.url || gmailLink;
      const fileName = drive.name || subject || `${msg.id}.gmail`;
      const description = [subject || 'חשבונית מגימייל', `כרטיס ${card}`, drive.folder ? `תיקייה ${drive.folder}` : null, from, gmailLink].filter(Boolean).join('\n');

      const { error } = await sb.from('expense_documents').insert({
        organization_id: org.id,
        amount,
        vendor: matchedVendor,
        description,
        category: 'general',
        doc_date: p.date,
        month: p.ym,
        status: 'linked',
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileUrl === gmailLink ? 'gmail_receipt' : 'drive_receipt',
        expense_item: item,
        expense_section: 'office',
        expense_year: p.year,
        expense_month_num: p.month,
        gmail_message_id: msg.id,
        payer: 'office'
      });
      if (error) throw error;
      await recompute(sb, org.id, 'office', item, p.year, p.month);
      imported++;
    } catch (e) {
      console.warn('EXPENSE_GMAIL_CRON message failed', msg.id, e.message);
      failed++;
    }
  }
  return { found: found.size, imported, skipped_existing: skippedExisting, failed };
}

export async function GET(request) {
  if (!validateCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createServiceClient();
  const { data: orgs, error } = await sb.from('organizations')
    .select('id,gmail_refresh_token,office_card_last4,drive_expenses_folder_id')
    .eq('gmail_connected', true)
    .not('gmail_refresh_token', 'is', null);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const org of orgs || []) results.push({ org_id: org.id, ...(await scanOrg(sb, org).catch(e => ({ error: e.message }))) });
  return Response.json({ ok: true, orgs: orgs?.length || 0, results });
}
