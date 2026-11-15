import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { checkReadiness } from './health';

const up = async () => undefined;

describe('checkReadiness', () => {
  it('is ready when DATABASE_URL is set and the database answers', async () => {
    const result = await checkReadiness(loadConfig({ DATABASE_URL: 'postgres://x' }), up);
    expect(result).toEqual({ ready: true, checks: { database_url: 'ok', database: 'ok' } });
  });

  it('is not ready when DATABASE_URL is missing, without pinging', async () => {
    let pinged = false;
    const result = await checkReadiness(loadConfig({}), async () => { pinged = true; });
    expect(result.ready).toBe(false);
    expect(result.checks.database_url).toBe('missing');
    expect(pinged).toBe(false);
  });

  it('is not ready when the database does not answer', async () => {
    const result = await checkReadiness(loadConfig({ DATABASE_URL: 'postgres://x' }), async () => { throw new Error('down'); });
    expect(result.ready).toBe(false);
    expect(result.checks.database).toBe('down');
  });
});
