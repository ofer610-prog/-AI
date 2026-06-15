import { getAuthUrl } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.redirect(getAuthUrl(), 302);
}
