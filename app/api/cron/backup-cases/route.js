import { validateCronSecret } from '@/lib/security';
import { runBackup } from '@/lib/casesBackup';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  if (!validateCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runBackup();
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json(result);
}
