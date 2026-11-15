import type { AppConfig } from './config';

export type Readiness = { ready: boolean; checks: Record<string, 'ok' | 'missing' | 'down'> };

// Ready only when the database URL is set and the database really answers a trivial query.
export async function checkReadiness(config: AppConfig, ping: () => Promise<void>): Promise<Readiness> {
  const checks: Readiness['checks'] = { database_url: config.databaseUrl ? 'ok' : 'missing' };
  if (config.databaseUrl) {
    try {
      await ping();
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
  }
  return { ready: Object.values(checks).every((c) => c === 'ok'), checks };
}
