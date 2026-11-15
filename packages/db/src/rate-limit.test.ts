import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { hitRateLimit } from './rate-limit';
import * as schema from './schema';

const db = drizzle(new PGlite(), { schema });
const MIN = 60_000;
const t0 = new Date('2026-01-01T10:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * MIN);
const hit = (key: string, minutes: number) => hitRateLimit(db, { key, limit: 3, windowMs: 15 * MIN, now: at(minutes) });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
});

describe('hitRateLimit', () => {
  it('allows up to the limit, then blocks for one window', async () => {
    for (let i = 0; i < 3; i++) expect(await hit('a', i)).toEqual({ allowed: true });
    expect(await hit('a', 3)).toEqual({ allowed: false, retryAfterMs: 15 * MIN });
    const still = await hit('a', 10);
    expect(still).toEqual({ allowed: false, retryAfterMs: 8 * MIN });
  });

  it('lets the key back in after the block, and doubles the block on a repeat offence', async () => {
    expect(await hit('a', 19)).toEqual({ allowed: true });
    expect(await hit('a', 20)).toEqual({ allowed: true });
    expect(await hit('a', 21)).toEqual({ allowed: true });
    expect(await hit('a', 22)).toEqual({ allowed: false, retryAfterMs: 30 * MIN });
  });

  it('keeps keys independent', async () => {
    expect(await hit('b', 0)).toEqual({ allowed: true });
  });

  it('forgets history after a day of quiet', async () => {
    for (let i = 0; i < 3; i++) await hit('c', i);
    expect(await hit('c', 3)).toMatchObject({ allowed: false, retryAfterMs: 15 * MIN });
    const later = 3 + 25 * 60;
    for (let i = 0; i < 3; i++) expect(await hit('c', later + i)).toEqual({ allowed: true });
    expect(await hit('c', later + 3)).toEqual({ allowed: false, retryAfterMs: 15 * MIN });
  });
});
