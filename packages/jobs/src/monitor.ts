import { alertState, type AnyPgDb } from '@factory/db';
import { eq } from 'drizzle-orm';
import { flowStats, type FlowStat } from './metrics';
import { enqueue, queueStats } from './queue';

export const THRESHOLDS = {
  queueStuckMs: 10 * 60_000, // a due job waiting longer than this means the worker is down or stuck
  deadJobs: 1, // any exhausted job needs a look
  errorRate: 0.2, // share of failures in the window
  minEvents: 10, // do not alert on a handful of events
  windowMs: 15 * 60_000,
  reminderMs: 6 * 3_600_000, // repeat the message if the problem is still there
} as const;

export type Condition = { key: string; detail: string };

export function flowConditions(stats: FlowStat[]): Condition[] {
  const out: Condition[] = [];
  for (const s of stats) {
    const total = s.success + s.failure;
    if (total >= THRESHOLDS.minEvents && s.failure / total > THRESHOLDS.errorRate) {
      out.push({ key: `flow:${s.flow}:errors`, detail: `El flujo "${s.flow}" falla ${Math.round((s.failure / total) * 100)}% de las veces (${s.failure} de ${total} en 15 minutos).` });
    }
  }
  return out;
}

export async function findConditions(db: AnyPgDb, now: Date): Promise<Condition[]> {
  const out: Condition[] = [];
  const queue = await queueStats(db, now);
  if (queue.oldestQueuedMs !== null && queue.oldestQueuedMs > THRESHOLDS.queueStuckMs) {
    out.push({ key: 'queue:stuck', detail: `Hay trabajos esperando desde hace ${Math.round(queue.oldestQueuedMs / 60_000)} minutos. El trabajador puede estar caído.` });
  }
  if (queue.dead >= THRESHOLDS.deadJobs) out.push({ key: 'queue:dead', detail: `Hay ${queue.dead} trabajos fallidos que agotaron sus intentos.` });
  out.push(...flowConditions(await flowStats(db, THRESHOLDS.windowMs, now)));
  return out;
}

// Compares current problems with the stored alert state. Sends one email when a problem starts and a reminder
// if it lasts; clears the state when it goes away. Returns what it notified, for logs and tests.
export async function runMonitor(db: AnyPgDb, input: { alertEmail: string; now?: Date }): Promise<{ notified: string[]; resolved: string[] }> {
  const now = input.now ?? new Date();
  const conditions = await findConditions(db, now);
  const states = await db.select().from(alertState);
  const byKey = new Map(states.map((s) => [s.key, s]));
  const notified: string[] = [];
  const resolved: string[] = [];

  for (const c of conditions) {
    const state = byKey.get(c.key);
    const due = !state?.active || !state.lastNotifiedAt || now.getTime() - state.lastNotifiedAt.getTime() >= THRESHOLDS.reminderMs;
    if (!due) continue;
    await db
      .insert(alertState)
      .values({ key: c.key, active: true, firedAt: state?.active ? state.firedAt : now, lastNotifiedAt: now, detail: c.detail })
      .onConflictDoUpdate({ target: alertState.key, set: { active: true, firedAt: state?.active ? state.firedAt : now, lastNotifiedAt: now, detail: c.detail } });
    await enqueue(db, {
      type: 'email.send',
      payload: { to: input.alertEmail, subject: `Alerta de la fábrica: ${c.key}`, text: `${c.detail}\n\nRevisa el panel de la organización (trabajos y auditoría) y los registros del servicio.` },
      idempotencyKey: `alert:${c.key}:${Math.floor(now.getTime() / THRESHOLDS.reminderMs)}:${state?.active ? 'reminder' : 'start'}`,
    });
    notified.push(c.key);
  }

  const activeNow = new Set(conditions.map((c) => c.key));
  for (const s of states) {
    if (s.active && !activeNow.has(s.key)) {
      await db.update(alertState).set({ active: false, detail: null }).where(eq(alertState.key, s.key));
      await enqueue(db, {
        type: 'email.send',
        payload: { to: input.alertEmail, subject: `Resuelto: ${s.key}`, text: `El problema "${s.key}" ya no se detecta.` },
        idempotencyKey: `alert-resolved:${s.key}:${now.getTime()}`,
      });
      resolved.push(s.key);
    }
  }
  return { notified, resolved };
}
