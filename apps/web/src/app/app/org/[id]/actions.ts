'use server';

import { resetTwoStep } from '@factory/db';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/guard';
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
  if (result.ok) redirect(`/app/org/${organizationId}?reset=ok`);
  return { message: MESSAGES[result.reason] };
}
