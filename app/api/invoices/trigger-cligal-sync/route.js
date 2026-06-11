import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, forbidden } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/trigger-cligal-sync
 * Triggers the GitHub Actions workflow to scrape Cligal and sync invoices.
 * Requires the user to be authenticated (session cookie).
 */
export async function POST(request) {
  // Verify authenticated session
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ghToken = process.env.GITHUB_TOKEN;
  const ghRepo = process.env.GITHUB_REPO; // e.g. "ofer610-prog/-ai"

  if (!ghToken || !ghRepo) {
    return NextResponse.json(
      { error: 'GitHub Actions trigger not configured. Set GITHUB_TOKEN and GITHUB_REPO env vars.' },
      { status: 503 }
    );
  }

  const [owner, repo] = ghRepo.split('/');

  // Trigger the workflow_dispatch event on sync-cligal.yml
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/sync-cligal.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `GitHub API error ${res.status}: ${text}` },
      { status: 502 }
    );
  }

  // GitHub returns 204 No Content on success
  return NextResponse.json({
    success: true,
    message: 'סנכרון הופעל. התהליך ירוץ ברקע ויעדכן את החשבוניות תוך כ-3 דקות.',
  });
}
