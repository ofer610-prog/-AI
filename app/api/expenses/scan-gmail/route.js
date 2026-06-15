import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getGmailClient } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

/**
 * POST /api/expenses/scan-gmail
 * Scans Gmail for invoice/receipt emails matching known expense vendors.
 * Returns: { suggestions: [{ subject, from, date, amount, vendor, gmail_id }] }
 */
export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createServiceClient();

  // Get Gmail token
  const { data: org } = await sb.from('organizations')
    .select('gmail_connected, gmail_refresh_token, gmail_email')
    .eq('id', profile.organization_id).single();

  if (!org?.gmail_connected || !org?.gmail_refresh_token) {
    return Response.json({ error: 'Gmail לא מחובר — חבר Gmail בהגדרות המשרד', connected: false }, { status: 400 });
  }

  // Get known expense items (for vendor matching)
  const { data: items } = await sb.from('office_expenses')
    .select('item_name')
    .eq('organization_id', profile.organization_id);

  const vendors = [...new Set((items || []).map(i => i.item_name.trim()))];

  const gmail = getGmailClient(org.gmail_refresh_token);

  // Build search: last 60 days, invoices/receipts in Hebrew or English
  const since = new Date(Date.now() - 60 * 86400000);
  const sinceUnix = Math.floor(since.getTime() / 1000);

  const hebrewTerms = 'חשבונית OR חשבון OR קבלה OR תשלום OR חיוב OR ספק';
  const engTerms = 'invoice OR receipt OR billing OR payment';
  const query = `after:${sinceUnix} (${hebrewTerms} OR ${engTerms} OR has:attachment filename:(pdf OR jpg))`;

  let messages = [];
  try {
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50 });
    messages = res.data.messages || [];
  } catch (e) {
    return Response.json({ error: `שגיאת Gmail: ${e.message}` }, { status: 500 });
  }

  // Already-imported gmail IDs (to skip)
  const { data: existing } = await sb.from('expense_documents')
    .select('gmail_message_id')
    .eq('organization_id', profile.organization_id)
    .not('gmail_message_id', 'is', null);
  const importedIds = new Set((existing || []).map(d => d.gmail_message_id));

  const suggestions = [];

  for (const msg of messages.slice(0, 30)) {
    if (importedIds.has(msg.id)) continue;

    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'] });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const date    = headers.find(h => h.name === 'Date')?.value || '';

      // Try to match vendor name from expense matrix
      const subjectLow = subject.toLowerCase();
      const fromLow    = from.toLowerCase();
      let matchedVendor = '';
      for (const v of vendors) {
        if (subjectLow.includes(v.toLowerCase()) || fromLow.includes(v.toLowerCase())) {
          matchedVendor = v; break;
        }
      }

      // Try to extract amount from subject
      const amountMatch = subject.match(/[\d,]+\.?\d*\s*(?:₪|nis|ils|שח)/i)
        || subject.match(/(?:₪|nis)\s*[\d,]+\.?\d*/i)
        || subject.match(/(\d+\.?\d*)\s*(?:שח)/i);
      const amount = amountMatch
        ? parseFloat(amountMatch[0].replace(/[^\d.]/g, ''))
        : null;

      // Parse date
      let docDate = null;
      try { docDate = new Date(date).toISOString().slice(0, 10); } catch {}

      suggestions.push({
        gmail_id: msg.id,
        subject,
        from,
        date: docDate,
        amount,
        matched_vendor: matchedVendor || null,
        snippet: detail.data.snippet || '',
      });
    } catch { /* skip malformed */ }
  }

  return Response.json({ suggestions, scanned: messages.length, connected: true });
}
