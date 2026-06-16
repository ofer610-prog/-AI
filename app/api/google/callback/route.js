export const dynamic = 'force-dynamic';
export async function GET(request) {
  const original = new URL(request.url);
  const dest = new URL('/api/auth/google/callback', request.url);
  dest.search = original.search;
  return Response.redirect(dest, 302);
}
