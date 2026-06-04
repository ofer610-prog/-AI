import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bank/create-cligal-draft
 * Called by sync-transactions when an unmatched bank credit is detected.
 * Triggers a GitHub Actions workflow that opens Cligal and creates a draft invoice.
 *
 * Body: { client_name, amount, description, date, transaction_id? }
 * Requires x-cron-secret header.
 */
export async function POST(request) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ghToken = process.env.GITHUB_TOKEN;
  const ghRepo  = process.env.GITHUB_REPO;

  if (!ghToken || !ghRepo) {
    return Response.json(
      { error: 'GITHUB_TOKEN / GITHUB_REPO not configured — draft skipped' },
      { status: 503 }
    );
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { client_name, amount, description, date, transaction_id } = body;
  if (!client_name || !amount) {
    return Response.json({ error: 'client_name and amount are required' }, { status: 400 });
  }

  const [owner, repo] = ghRepo.split('/');
  const today = new Date().toISOString().slice(0, 10);

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/create-cligal-draft.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          client_name: String(client_name),
          amount:      String(amount),
          description: String(description || ''),
          draft_date:  String(date || today),
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('GitHub dispatch error:', res.status, text);
    return Response.json({ error: `GitHub API error ${res.status}` }, { status: 502 });
  }

  // Log the dispatch in Supabase for audit trail
  try {
    const sb = createServiceClient();
    const { data: org } = await sb.from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single();
    if (org) {
      await sb.from('bank_transactions').update({
        alert_status: 'draft_requested',
      }).eq('id', transaction_id);
    }
  } catch {}

  return Response.json({
    success: true,
    message: 'טיוטת חשבונית בקליגל הופעלה — תהליך יתחיל תוך כ-2 דקות.',
  });
}
