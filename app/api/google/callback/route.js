export const dynamic = 'force-dynamic';

export async function GET(request) {
  const target = new URL('/api/auth/google/callback', request.url);
  const current = new URL(request.url);
  for (const [key, value] of current.searchParams.entries()) {
    target.searchParams.set(key, value);
  }
  return Response.redirect(target, 302);
}
