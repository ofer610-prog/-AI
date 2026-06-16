export const dynamic = 'force-dynamic';
export async function GET(request) {
  return Response.redirect(new URL('/expenses?status=old_route', request.url), 302);
}
