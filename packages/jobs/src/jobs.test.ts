import { PGlite } from '@electric-sql/pglite';
import { jobs, type AnyPgDb } from '@factory/db';
import * as schema from '../../db/src/schema';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import nodemailer from 'nodemailer';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEmailHandler, EMAIL_JOB } from './email';
import { backoffMs, claimNext, enqueue, listDead, queueStats, retryDead } from './queue';
import { runOnce } from './runner';

const pg = new PGlite();
const db = drizzle(pg, { schema }) as unknown as AnyPgDb;
const t0 = new Date('2026-01-01T10:00:00Z');
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

beforeAll(async () => {
  await migrate(drizzle(pg, { schema }), { migrationsFolder: new URL('../../db/migrations', import.meta.url).pathname });
});

beforeEach(async () => {
  await db.delete(jobs);
});

describe('backoff', () => {
  it('grows by doubling and is capped at one hour', () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(backoffMs(30)).toBe(3_600_000);
  });
});

describe('enqueue', () => {
  it('ignores a second job with the same idempotency key', async () => {
    const a = await enqueue(db, { type: 'x', payload: {}, idempotencyKey: 'k1', runAt: t0 });
    const b = await enqueue(db, { type: 'x', payload: {}, idempotencyKey: 'k1', runAt: t0 });
    expect(a.duplicate).toBe(false);
    expect(b).toEqual({ id: null, duplicate: true });
    expect(await db.select().from(jobs)).toHaveLength(1);
  });
});

describe('claimNext', () => {
  it('does not claim jobs scheduled for the future, and claims each due job once', async () => {
    await enqueue(db, { type: 'x', payload: {}, runAt: at(100) });
    expect(await claimNext(db, t0)).toBeNull();
    const job = await claimNext(db, at(100));
    expect(job).toMatchObject({ status: 'running', attempts: 1 });
    expect(await claimNext(db, at(100))).toBeNull();
  });

  it('recovers a job whose worker crashed, after the lock timeout', async () => {
    await enqueue(db, { type: 'x', payload: {}, runAt: t0 });
    await claimNext(db, t0);
    expect(await claimNext(db, at(60))).toBeNull();
    const again = await claimNext(db, at(6 * 60));
    expect(again?.attempts).toBe(2);
  });
});

describe('runOnce', () => {
  it('retries with growing delays, then marks the job dead and lets it be retried by an admin', async () => {
    const { id } = await enqueue(db, { type: 'boom', payload: {}, maxAttempts: 3, runAt: t0 });
    const handlers = { boom: async () => { throw new Error('nope'); } };
    expect(await runOnce(db, handlers, t0)).toBe('retry');
    expect(await runOnce(db, handlers, at(10))).toBe('idle'); // delay of 30 s not over yet
    expect(await runOnce(db, handlers, at(30))).toBe('retry');
    expect(await runOnce(db, handlers, at(30 + 60))).toBe('dead');
    const [dead] = await db.select().from(jobs).where(eq(jobs.id, id!));
    expect(dead).toMatchObject({ status: 'dead', attempts: 3, lastError: 'nope' });
    expect(await queueStats(db)).toMatchObject({ dead: 1, queued: 0 });

    expect(await retryDead(db, id!, at(1000))).toBe(true);
    expect(await retryDead(db, id!, at(1000))).toBe(false); // only dead jobs can be retried
    expect((await db.select().from(jobs).where(eq(jobs.id, id!)))[0]).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('fails jobs with an unknown type instead of ignoring them', async () => {
    await enqueue(db, { type: 'unknown', payload: {}, maxAttempts: 1, runAt: t0 });
    expect(await runOnce(db, {}, t0)).toBe('dead');
    const [row] = await db.select().from(jobs);
    expect(row?.lastError).toContain('No handler');
  });

  it('lists dead jobs only for their own organization', async () => {
    const org = '11111111-1111-1111-1111-111111111111';
    await enqueue(db, { type: 'unknown', payload: {}, maxAttempts: 1, runAt: t0, organizationId: org });
    await enqueue(db, { type: 'unknown', payload: {}, maxAttempts: 1, runAt: t0 });
    await runOnce(db, {}, t0);
    await runOnce(db, {}, t0);
    expect(await listDead(db, org)).toHaveLength(1);
    expect(await listDead(db, '22222222-2222-2222-2222-222222222222')).toHaveLength(0);
  });
});

describe('retryDead scoped to an organization', () => {
  it('does not retry a dead job of another organization', async () => {
    const org = '11111111-1111-1111-1111-111111111111';
    const { id } = await enqueue(db, { type: 'unknown', payload: {}, maxAttempts: 1, runAt: t0, organizationId: org });
    await runOnce(db, {}, t0);
    expect(await retryDead(db, id!, at(10), '22222222-2222-2222-2222-222222222222')).toBe(false);
    expect(await retryDead(db, id!, at(10), org)).toBe(true);
  });
});

describe('email handler', () => {
  it('sends the email described by the job', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sent: unknown[] = [];
    const originalSend = transport.sendMail.bind(transport);
    transport.sendMail = (async (message: Parameters<typeof originalSend>[0]) => { sent.push(message); return originalSend(message); }) as typeof transport.sendMail;
    await enqueue(db, { type: EMAIL_JOB, payload: { to: 'a@example.test', subject: 'Hola', text: 'Cuerpo' }, runAt: t0 });
    expect(await runOnce(db, { [EMAIL_JOB]: createEmailHandler({ from: 'f@example.test', transport }) }, t0)).toBe('succeeded');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'a@example.test', subject: 'Hola', from: 'f@example.test' });
    const [done] = await db.select().from(jobs);
    expect(done).toMatchObject({ status: 'succeeded', payload: {} }); // one-time links do not stay in the database
  });

  it('rejects malformed email payloads', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    await enqueue(db, { type: EMAIL_JOB, payload: { to: 5 }, maxAttempts: 1, runAt: t0 });
    expect(await runOnce(db, { [EMAIL_JOB]: createEmailHandler({ from: 'f@example.test', transport }) }, t0)).toBe('dead');
  });
});
