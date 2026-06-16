export const dynamic = 'force-dynamic';
export async function GET(request) {
  return Response.redirect(new URL('/expenses?google_return=1', request.url), 302);
}
