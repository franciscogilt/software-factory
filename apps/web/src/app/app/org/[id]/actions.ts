'use server';

import { recordAudit, resetTwoStep } from '@factory/db';
import { enqueue, retryDead } from '@factory/jobs';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDb, requireOrgRole } from '@/lib/guard';
import { getSessionToken } from '@/lib/session-token';

export type ResetState = { message: string } | null;

const MESSAGES = {
  not_allowed: 'Solo un dueño de la organización puede hacerlo.',
  mfa_required: 'Verifica tu sesión en dos pasos primero.',
  cannot_reset_self: 'No puedes restablecer tu propia verificación. Pídeselo a otro dueño.',
  target_not_member: 'Ese usuario no pertenece a esta organización.',
} as const;

export async function resetMemberTwoStep(organizationId: string, _prev: ResetState, data: FormData): Promise<ResetState> {
  const session = await auth();
  const token = await getSessionToken();
  if (!session?.user?.id || !token) return { message: 'Inicia sesión de nuevo.' };
  if (data.get('confirm') !== 'on') return { message: 'Marca la casilla para confirmar.' };
  const result = await resetTwoStep(getDb(), {
    actorUserId: session.user.id,
    actorSessionToken: token,
    organizationId,
    targetUserId: String(data.get('userId') ?? ''),
  });
  // On success the row changes shape, so show the confirmation on the reloaded page instead of inside the row.
  if (result.ok) {
    if (result.targetEmail) {
      await enqueue(getDb(), {
        type: 'email.send',
        organizationId,
        payload: {
          to: result.targetEmail,
          subject: 'Se restableció tu verificación en dos pasos',
          text: 'Un dueño de tu organización restableció tu verificación en dos pasos. Debes iniciar sesión de nuevo y configurarla otra vez. Si no esperabas este cambio, avisa a tu administrador.',
        },
        idempotencyKey: `mfa-reset:${organizationId}:${String(data.get('userId'))}:${Math.floor(Date.now() / 60_000)}`,
      });
    }
    redirect(`/app/org/${organizationId}?reset=ok`);
  }
  return { message: MESSAGES[result.reason] };
}

export async function retryJob(organizationId: string, data: FormData): Promise<void> {
  const result = await requireOrgRole(organizationId, 'admin');
  if (!result.allowed) redirect('/app');
  const session = await auth();
  const jobId = String(data.get('jobId') ?? '');
  if (await retryDead(getDb(), jobId, new Date(), organizationId)) {
    await recordAudit(getDb(), { organizationId, actorUserId: session?.user?.id, action: 'job.retried', targetType: 'job', targetId: jobId });
  }
  redirect(`/app/org/${organizationId}/jobs`);
}
