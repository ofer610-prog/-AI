import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function norm(v) {
  return String(v || '').trim();
}

function num(v) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function dateOnly(v) {
  if (!v) return new Date().toISOString().slice(0, 10);
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10);
}

function yearMonth(dateStr) {
  return {
    year: Number(dateStr.slice(0, 4)) || new Date().getFullYear(),
    monthNum: Number(dateStr.slice(5, 7)) || (new Date().getMonth() + 1),
    month: dateStr.slice(0, 7),
  };
}

function fingerprint(r) {
  return [
    norm(r.vendor).toLowerCase(),
    dateOnly(r.doc_date || r.date),
    num(r.amount).toFixed(2),
    norm(r.expense_item || r.topic).toLowerCase(),
    norm(r.file_name).toLowerCase(),
  ].join('|');
}

async function getDefaultOrg(sb) {
  const { data, error } = await sb.from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

async function getUploadUser(sb, organizationId) {
  const { data } = await sb.from('profiles')
    .select('id')
    .eq('organization_id', organizationId)
    .in('role', ['admin', 'accountant'])
    .limit(1)
    .single();
  return data?.id || null;
}

export async function POST(request) {
  const secret = process.env.APP_SCRIPT_SECRET;
  const headerSecret = request.headers.get('x-app-script-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret || headerSecret !== secret) {
    return Response.json({ ok: false, error: 'Unauthorized app script import' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const invoices = Array.isArray(body.invoices) ? body.invoices : [];
  if (!invoices.length) return Response.json({ ok: true, imported: [], skipped: [], errors: [], message: 'No invoices supplied' });

  const sb = createServiceClient();
  const org = body.organization_id ? { id: body.organization_id } : await getDefaultOrg(sb);
  const uploadedBy = body.uploaded_by || await getUploadUser(sb, org.id);

  const imported = [];
  const skipped = [];
  const errors = [];

  for (const r of invoices.slice(0, 200)) {
    try {
      const gmailId = norm(r.gmail_message_id || r.gmail_id);
      const fileUrl = norm(r.file_url || r.drive_file_url || r.gmail_link);
      const fileName = norm(r.file_name || r.subject || `${gmailId || 'invoice'}.pdf`);
      const d = dateOnly(r.doc_date || r.date);
      const ym = yearMonth(d);
      const fp = fingerprint({ ...r, file_name: fileName, doc_date: d });

      let duplicate = null;
      if (gmailId) {
        const { data } = await sb.from('expense_documents')
          .select('id,status')
          .eq('organization_id', org.id)
          .eq('gmail_message_id', gmailId)
          .neq('status', 'removed')
          .maybeSingle();
        duplicate = data;
      }
      if (!duplicate && fileUrl) {
        const { data } = await sb.from('expense_documents')
          .select('id,status')
          .eq('organization_id', org.id)
          .eq('file_url', fileUrl)
          .neq('status', 'removed')
          .maybeSingle();
        duplicate = data;
      }
      if (!duplicate) {
        const { data } = await sb.from('expense_documents')
          .select('id,status,description')
          .eq('organization_id', org.id)
          .eq('description', `apps-script:${fp}`)
          .neq('status', 'removed')
          .maybeSingle();
        duplicate = data;
      }

      if (duplicate?.id) {
        skipped.push({ reason: 'duplicate', id: duplicate.id, gmail_message_id: gmailId, file_name: fileName });
        continue;
      }

      const status = r.status || (r.needs_review ? 'needs_review' : 'approved');
      const payload = {
        organization_id: org.id,
        uploaded_by: uploadedBy,
        file_url: fileUrl,
        file_name: fileName,
        file_type: r.file_type || 'drive_receipt',
        amount: num(r.amount) || null,
        vendor: norm(r.vendor || r.supplier || r.from) || null,
        description: `apps-script:${fp}`,
        category: r.category || 'office',
        doc_date: d,
        month: ym.month,
        status,
        expense_item: norm(r.expense_item || r.topic) || null,
        expense_section: norm(r.expense_section || r.section || 'office') || 'office',
        expense_year: ym.year,
        expense_month_num: ym.monthNum,
        gmail_message_id: gmailId || null,
        payer: r.payer || 'office',
      };

      const { data, error } = await sb.from('expense_documents')
        .insert(payload)
        .select('id,status,file_name')
        .single();
      if (error) throw error;
      imported.push({ id: data.id, status: data.status, file_name: data.file_name, gmail_message_id: gmailId });
    } catch (e) {
      errors.push({ file_name: r.file_name || r.subject || null, error: e.message });
    }
  }

  return Response.json({ ok: true, imported, skipped, errors, received: invoices.length });
}
