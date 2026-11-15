import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { checkReadiness } from './health';

describe('checkReadiness', () => {
  it('is ready when DATABASE_URL is set', () => {
    const result = checkReadiness(loadConfig({ DATABASE_URL: 'postgres://x' }));
    expect(result.ready).toBe(true);
  });

  it('is not ready when DATABASE_URL is missing', () => {
    const result = checkReadiness(loadConfig({}));
    expect(result.ready).toBe(false);
    expect(result.checks.database_url).toBe('missing');
  });
});
