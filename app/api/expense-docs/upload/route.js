import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return Response.json({ error: 'file required' }, { status: 400 });

  const ext      = file.name.split('.').pop();
  const safeName = `${user.id}/${Date.now()}.${ext}`;
  const buffer   = await file.arrayBuffer();

  const { data, error } = await sb.storage
    .from('expense-docs')
    .upload(safeName, buffer, { contentType: file.type, upsert: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = sb.storage.from('expense-docs').getPublicUrl(safeName);

  // Signed URL (valid 1 year) — since bucket is private
  const { data: signed } = await sb.storage
    .from('expense-docs')
    .createSignedUrl(safeName, 365 * 24 * 3600);

  return Response.json({
    path: data.path,
    url:  signed?.signedUrl || publicUrl,
    name: file.name,
    type: file.type,
  });
}
