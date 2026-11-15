import { createDb, jobs } from '@factory/db';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { claimNext, enqueue } from './queue';

// Needs a real PostgreSQL (row locking is what is being tested). Skipped when TEST_DATABASE_URL is not set.
const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('claimNext with several workers on a real PostgreSQL', () => {
  const { db, close } = createDb(url ?? 'postgres://unused');
  afterAll(async () => { await close(); });

  it('hands every job to exactly one of five parallel workers', async () => {
    await db.delete(jobs);
    for (let i = 0; i < 25; i++) await enqueue(db, { type: 'x', payload: { i }, runAt: new Date(0) });
    const claimed: string[] = [];
    const worker = async () => {
      for (;;) {
        const job = await claimNext(db, new Date());
        if (!job) return;
        claimed.push(job.id);
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    expect(claimed).toHaveLength(25);
    expect(new Set(claimed).size).toBe(25);
    await db.execute(sql`select 1`);
  });
});
