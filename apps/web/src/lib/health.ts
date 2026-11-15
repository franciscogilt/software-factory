import type { AppConfig } from './config';

export type Readiness = { ready: boolean; checks: Record<string, 'ok' | 'missing'> };

// Readiness only reports configuration for now; a real database ping arrives with packages/db.
export function checkReadiness(config: AppConfig): Readiness {
  const checks: Readiness['checks'] = {
    database_url: config.databaseUrl ? 'ok' : 'missing',
  };
  return { ready: Object.values(checks).every((c) => c === 'ok'), checks };
}
