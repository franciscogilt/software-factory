import { purgeDueAccounts, type AnyPgDb } from '@factory/db';
import { enqueue } from './queue';

// Erases accounts whose 14-day grace period is over and tells each person. The goodbye email is queued after the
// erasure, so its address is removed from the queue as soon as it is sent.
export async function purgeAndNotify(db: AnyPgDb, now: Date = new Date()): Promise<{ purged: number; blocked: number }> {
  const result = await purgeDueAccounts(db, now);
  for (const person of result.purged) {
    if (!person.email) continue;
    await enqueue(db, {
      type: 'email.send',
      payload: {
        to: person.email,
        subject: 'Tu cuenta fue eliminada / Your account was deleted',
        text: 'Tu cuenta y tus datos personales fueron eliminados. Gracias por haber usado el servicio.\n\n---\n\nYour account and personal data were deleted. Thank you for using the service.',
      },
      idempotencyKey: `account-deleted:${person.userId}`,
    });
  }
  if (result.purged.length > 0 || result.blocked.length > 0) console.log(`purge: ${result.purged.length} deleted, ${result.blocked.length} blocked`);
  return { purged: result.purged.length, blocked: result.blocked.length };
}
