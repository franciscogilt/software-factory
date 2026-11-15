import { exportUserData, hitRateLimit, recordAudit } from '@factory/db';
import { timedFlow } from '@factory/jobs';
import { getT } from '@/i18n/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/guard';
import { secondStepMissing } from '@/lib/privacy-guard';
import { getSessionToken } from '@/lib/session-token';

export const dynamic = 'force-dynamic';

function text(status: number, body: string) {
  return { value: new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }), outcome: 'limited' as const };
}

// Downloads everything we hold about the signed-in person. Own data only, limited per hour, audited.
export async function GET() {
  return timedFlow(getDb(), 'privacy_export', async () => {
    const { t } = await getT();
    const session = await auth();
    const token = await getSessionToken();
    if (!session?.user?.id || !token) return text(401, t('common.mustSignInAgain'));
    const userId = session.user.id;
    const db = getDb();
    if (await secondStepMissing(userId, token)) return text(403, t('privacy.exportForbidden'));
    const limit = await hitRateLimit(db, { key: `privacy-export:${userId}`, limit: 5, windowMs: 3_600_000 });
    if (!limit.allowed) return text(429, t('privacy.tooMany'));
    const data = await exportUserData(db, userId);
    if (!data) return text(404, 'Not found');
    await recordAudit(db, { actorUserId: userId, action: 'privacy.exported', targetType: 'user', targetId: userId });
    return {
      value: new Response(JSON.stringify(data, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="my-data.json"', 'cache-control': 'no-store' },
      }),
      outcome: 'success' as const,
    };
  });
}
