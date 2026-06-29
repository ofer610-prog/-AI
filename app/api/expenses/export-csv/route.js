import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const profile = await requireAdmin();
  if (!profile) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const year  = searchParams.get('year')  || new Date().getFullYear();
  const month = searchParams.get('month') || null; // null = all months

  const sb = await createClient();
  let query = sb.from('expense_documents')
    .select('doc_date,vendor,doc_number,expense_item,expense_section,amount,vat,currency,original_amount,category,status,file_url,file_type,description')
    .eq('organization_id', profile.organization_id)
    .eq('expense_year', year)
    .not('status', 'in', '("removed","duplicate_review")')
    .order('doc_date', { ascending: true });

  if (month) query = query.eq('expense_month_num', month);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const SECTION_LABELS = {
    office: 'משרד כללי', vehicle: 'רכב ודלק', telecom: 'תקשורת',
    professional: 'שירותים מקצועיים', insurance: 'ביטוח', salary: 'שכר', personal: 'אישי / נכסים',
  };
  const STATUS_LABELS = {
    approved: 'מאושר', linked: 'ממתין לאישור', needs_review: 'ממתין לסיווג',
    pending: 'ממתין', imported: 'יובא',
  };

  const headers = ['תאריך','ספק','מספר מסמך','נושא','קטגוריה','סכום ₪','מע"מ','מטבע מקורי','סכום מקורי','סטטוס','קישור'];
  const rows = (data || []).map(d => [
    d.doc_date || '',
    d.vendor || '',
    d.doc_number || '',
    d.expense_item || '',
    SECTION_LABELS[d.expense_section] || d.expense_section || '',
    d.amount != null ? Number(d.amount).toFixed(2) : '',
    d.vat    != null ? Number(d.vat).toFixed(2)    : '',
    d.currency !== 'ILS' ? d.currency : '',
    d.original_amount != null ? Number(d.original_amount).toFixed(2) : '',
    STATUS_LABELS[d.status] || d.status || '',
    d.file_url || '',
  ]);

  const csvLines = [headers, ...rows].map(row =>
    row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')
  );
  const csv = '﻿' + csvLines.join('\r\n'); // BOM for Excel Hebrew support

  const filename = month
    ? `הוצאות_${year}_${String(month).padStart(2,'0')}.csv`
    : `הוצאות_${year}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
