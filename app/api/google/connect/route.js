export const dynamic = 'force-dynamic';

export async function GET(request) {
  return Response.redirect(new URL('/api/auth/google/connect', request.url), 302);
}
