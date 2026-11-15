import { PGlite } from '@electric-sql/pglite';
import { alertState, flowMetrics, jobs, type AnyPgDb } from '@factory/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../db/src/schema';
import { flowStats, recordFlow, timedFlow } from './metrics';
import { runMonitor, THRESHOLDS } from './monitor';
import { enqueue } from './queue';

const pg = new PGlite();
const db = drizzle(pg, { schema }) as unknown as AnyPgDb;
const t0 = new Date('2026-01-01T10:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const emails = async () => (await db.select().from(jobs)).filter((j) => j.type === 'email.send');

beforeAll(async () => {
  await migrate(drizzle(pg, { schema }), { migrationsFolder: new URL('../../db/migrations', import.meta.url).pathname });
});

beforeEach(async () => {
  await db.delete(jobs);
  await db.delete(flowMetrics);
  await db.delete(alertState);
});

describe('flowStats', () => {
  it('counts outcomes and computes p95 latency per flow within the window', async () => {
    for (let i = 1; i <= 20; i++) await recordFlow(db, { flow: 'login', outcome: 'success', durationMs: i * 10, now: at(1) });
    await recordFlow(db, { flow: 'login', outcome: 'failure', durationMs: 5, now: at(2) });
    await recordFlow(db, { flow: 'login', outcome: 'limited', now: at(2) });
    await recordFlow(db, { flow: 'old', outcome: 'success', now: at(-60) }); // outside the window
    const stats = await flowStats(db, THRESHOLDS.windowMs, at(5));
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ flow: 'login', success: 20, failure: 1, limited: 1 });
    expect(stats[0]!.p95Ms).toBeGreaterThan(180);
  });
});

describe('timedFlow', () => {
  it('records success, failure on errors (and rethrows), and treats redirects as success', async () => {
    expect(await timedFlow(db, 'f', async () => ({ value: 7, outcome: 'success' }))).toBe(7);
    await expect(timedFlow(db, 'f', async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(timedFlow(db, 'f', async () => { throw Object.assign(new Error('r'), { digest: 'NEXT_REDIRECT;/x' }); })).rejects.toThrow();
    const outcomes = (await db.select().from(flowMetrics)).map((r) => r.outcome);
    expect(outcomes).toEqual(['success', 'failure', 'success']);
  });
});

describe('runMonitor', () => {
  it('does nothing when all is well', async () => {
    expect(await runMonitor(db, { alertEmail: 'owner@example.test', now: at(0) })).toEqual({ notified: [], resolved: [] });
    expect(await emails()).toHaveLength(0);
  });

  it('alerts once when the queue is stuck, reminds after six hours, and resolves when it clears', async () => {
    const { id } = await enqueue(db, { type: 'email.send', payload: { to: 'x@example.test', subject: 's', text: 't' }, runAt: at(0) });
    expect((await runMonitor(db, { alertEmail: 'owner@example.test', now: at(5) })).notified).toEqual([]);
    expect((await runMonitor(db, { alertEmail: 'owner@example.test', now: at(15) })).notified).toEqual(['queue:stuck']);
    expect((await runMonitor(db, { alertEmail: 'owner@example.test', now: at(20) })).notified).toEqual([]); // still stuck, no spam
    expect((await runMonitor(db, { alertEmail: 'owner@example.test', now: at(15 + 6 * 60) })).notified).toEqual(['queue:stuck']); // reminder
    await db.delete(jobs).where((await import('drizzle-orm')).eq(jobs.id, id!));
    expect((await runMonitor(db, { alertEmail: 'owner@example.test', now: at(7 * 60) })).resolved).toEqual(['queue:stuck']);
  });

  it('alerts on dead jobs', async () => {
    await db.insert(jobs).values({ type: 'x', payload: {}, status: 'dead', attempts: 5 });
    expect((await runMonitor(db, { alertEmail: 'o@example.test', now: at(0) })).notified).toEqual(['queue:dead']);
  });

  it('alerts when a flow fails too often, but not with too few events or for refusals', async () => {
    for (let i = 0; i < 5; i++) await recordFlow(db, { flow: 'login', outcome: 'failure', now: at(1) });
    expect((await runMonitor(db, { alertEmail: 'o@example.test', now: at(2) })).notified).toEqual([]); // only 5 events
    for (let i = 0; i < 20; i++) await recordFlow(db, { flow: 'twostep', outcome: 'limited', now: at(1) });
    expect((await runMonitor(db, { alertEmail: 'o@example.test', now: at(2) })).notified).toEqual([]); // refusals are expected
    for (let i = 0; i < 5; i++) await recordFlow(db, { flow: 'login', outcome: 'success', now: at(1) });
    expect((await runMonitor(db, { alertEmail: 'o@example.test', now: at(2) })).notified).toEqual(['flow:login:errors']); // 5 of 10 fail
    const [mail] = await emails();
    expect(mail?.payload.to).toBe('o@example.test');
  });
});
