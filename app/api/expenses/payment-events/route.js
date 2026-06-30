import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function norm(s = '') {
  return String(s || '').toLowerCase().replace(/["'׳״₪,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseAmount(text) {
  const patterns = [
    /(?:בסך|סך|עסקה בסך|חיוב בסך)\s*([\d,]+(?:\.\d+)?)\s*(?:שח|ש"ח|₪|ils|nis)?/i,
    /([\d,]+(?:\.\d+)?)\s*(?:שח|ש"ח|₪|ils|nis)/i,
    /(?:₪|ils|nis)\s*([\d,]+(?:\.\d+)?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = Number(String(m[1]).replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseDate(text) {
  const now = new Date();
  const y = now.getFullYear();
  const m1 = text.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (m1) {
    const day = Number(m1[1]);
    const month = Number(m1[2]);
    const year = m1[3] ? Number(String(m1[3]).length === 2 ? `20${m1[3]}` : m1[3]) : y;
    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (/היום/.test(text)) return now.toISOString().slice(0, 10);
  return now.toISOString().slice(0, 10);
}

function parseTail(text) {
  const m = text.match(/(?:מסתיים|מסתיימת|אחרונות|סיומת|ending|last)[^0-9]{0,40}(\d{4})/i)
    || text.match(/(?:כרטיס|card)[^0-9]{0,40}(\d{4})/i);
  return m ? m[1] : null;
}

function parseMerchant(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const patterns = [
    /(?:ב|אצל|ל)\s*([^,.\n]{2,45})\s+(?:בסך|סך|על סך)/,
    /(?:עסקה|חיוב|רכישה)\s*(?:בוצעה|נקלטה|אושרה)?\s*(?:ב|אצל)?\s*([^,.\n]{2,45})\s+(?:בסך|סך|על סך)/,
    /(?:בית עסק|ספק|merchant)[:\s]+([^,.\n]{2,45})/i,
  ];
  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m) return m[1].replace(/בתאריך.*$/,'').trim();
  }
  const withoutAmount = cleaned.replace(/[\d,]+(?:\.\d+)?\s*(?:₪|שח|ש"ח|ils|nis)?/ig, ' ');
  return withoutAmount.slice(0, 45).trim() || 'ספק לא מזוהה';
}

function categoryFor(merchant = '', text = '') {
  const h = norm(`${merchant} ${text}`);
  if (h.includes('משרד המשפטים') || h.includes('טאבו') || h.includes('רישום והסדר')) return 'אגרות טאבו';
  if (h.includes('רשם המשכונות') || h.includes('נסח בטוחה')) return 'רשם המשכונות';
  if (h.includes('רמי') || h.includes('רמ י') || h.includes('מקרקעי ישראל')) return 'רמ״י / אישורי זכויות';
  if (h.includes('google') || h.includes('גוגל')) return 'Google / Workspace / Gemini';
  if (h.includes('openai') || h.includes('chatgpt')) return 'OpenAI / ChatGPT';
  if (h.includes('claude') || h.includes('anthropic') || h.includes('קלוד')) return 'Claude / Anthropic';
  if (h.includes('סלקום') || h.includes('019') || h.includes('בזק') || h.includes('אינטרנט')) return 'תקשורת';
  return 'לא מסווג';
}

function scoreMatch(event, doc) {
  let score = 0;
  const amountDiff = Math.abs(Number(event.amount || 0) - Number(doc.amount || 0));
  if (amountDiff === 0) score += 45;
  else if (amountDiff <= 1) score += 35;
  else if (amountDiff <= 5) score += 20;

  const eDate = new Date(event.event_date);
  const dDate = new Date(doc.doc_date || event.event_date);
  const days = Math.abs(Math.round((eDate - dDate) / 86400000));
  if (days <= 1) score += 25;
  else if (days <= 3) score += 18;
  else if (days <= 7) score += 8;

  const em = norm(`${event.merchant_name} ${event.category}`);
  const dm = norm(`${doc.vendor} ${doc.expense_item} ${doc.description}`);
  for (const token of em.split(' ').filter(x => x.length > 2).slice(0, 8)) {
    if (dm.includes(token)) score += 4;
  }
  return Math.min(score, 100);
}

async function findMatch(sb, orgId, event) {
  const from = new Date(event.event_date); from.setDate(from.getDate() - 7);
  const to = new Date(event.event_date); to.setDate(to.getDate() + 7);
  const { data: docs } = await sb.from('expense_documents')
    .select('id, amount, vendor, description, doc_date, expense_item, expense_section, file_url, file_name')
    .eq('organization_id', orgId)
    .gte('doc_date', from.toISOString().slice(0, 10))
    .lte('doc_date', to.toISOString().slice(0, 10));

  let best = null;
  for (const doc of docs || []) {
    const score = scoreMatch(event, doc);
    if (!best || score > best.score) best = { doc, score };
  }
  if (!best || best.score < 55) return { status: 'missing_document', confidence: best?.score || 0, docId: null };
  if (best.score < 75) return { status: 'possible_match', confidence: best.score, docId: best.doc.id };
  return { status: 'matched', confidence: best.score, docId: best.doc.id };
}

function parseLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(line => {
      const amount = parseAmount(line);
      if (!amount) return null;
      const merchant = parseMerchant(line);
      const date = parseDate(line);
      const tail = parseTail(line);
      return {
        event_date: date,
        merchant_name: merchant,
        amount,
        currency: 'ILS',
        payment_tail: tail,
        source: 'manual_text',
        source_text: line,
        source_message_id: `${date}-${amount}-${norm(merchant).slice(0, 40)}-${norm(line).slice(0, 40)}`,
        category: categoryFor(merchant, line),
      };
    })
    .filter(Boolean);
}

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const month = searchParams.get('month');
  const status = searchParams.get('status');
  const sb = createServiceClient();
  let q = sb.from('payment_events')
    .select('id,event_date,merchant_name,amount,currency,payment_tail,source,source_text,category,match_status,confidence,matched_expense_document_id,notes,ignored,created_at')
    .eq('organization_id', profile.organization_id)
    .gte('event_date', `${year}-01-01`)
    .lte('event_date', `${year}-12-31`)
    .order('event_date', { ascending: false });
  if (month && month !== 'all') {
    const m = String(month).padStart(2, '0');
    q = q.gte('event_date', `${year}-${m}-01`).lte('event_date', `${year}-${m}-31`);
  }
  if (status && status !== 'all') q = q.eq('match_status', status);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ events: data || [] });
}

export async function POST(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : parseLines(body.text || '');
  if (!rows.length) return Response.json({ error: 'לא זוהו חיובים בטקסט שהוזן' }, { status: 400 });

  const sb = createServiceClient();
  const imported = [];
  const skipped = [];
  const errors = [];

  for (const row of rows) {
    const event = {
      organization_id: profile.organization_id,
      created_by: profile.id,
      event_date: row.event_date || parseDate(row.source_text || ''),
      merchant_name: row.merchant_name || parseMerchant(row.source_text || ''),
      amount: Number(row.amount || 0),
      currency: row.currency || 'ILS',
      payment_tail: row.payment_tail || null,
      source: row.source || 'manual_text',
      source_text: row.source_text || null,
      source_message_id: row.source_message_id || `${Date.now()}-${Math.random()}`,
      category: row.category || categoryFor(row.merchant_name, row.source_text),
    };
    const match = await findMatch(sb, profile.organization_id, event);
    event.match_status = match.status;
    event.confidence = match.confidence;
    event.matched_expense_document_id = match.docId;
    const { data, error } = await sb.from('payment_events').upsert(event, { onConflict: 'organization_id,source,source_message_id' }).select('id').single();
    if (error) {
      if (String(error.message || '').includes('duplicate')) skipped.push({ merchant_name: event.merchant_name, amount: event.amount });
      else errors.push({ row: event.source_text, error: error.message });
      continue;
    }
    imported.push({ id: data.id, ...event });
  }

  return Response.json({ imported, skipped, errors });
}

export async function PATCH(request) {
  const profile = await requireAdmin();
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });
  const updates = {};
  if (body.match_status) updates.match_status = body.match_status;
  if (body.ignored !== undefined) updates.ignored = !!body.ignored;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.matched_expense_document_id !== undefined) updates.matched_expense_document_id = body.matched_expense_document_id;
  const sb = createServiceClient();
  const { error } = await sb.from('payment_events').update(updates)
    .eq('organization_id', profile.organization_id)
    .eq('id', body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
