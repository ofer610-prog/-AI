export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { pin } = await request.json().catch(() => ({}));
  const correct = process.env.CASES_ACCESS_PIN;

  if (!correct) {
    // If no PIN is configured, allow access (not yet set up)
    return Response.json({ ok: true });
  }

  if (!pin || String(pin) !== String(correct)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  return Response.json({ ok: true });
}
