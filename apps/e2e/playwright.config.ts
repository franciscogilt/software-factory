import { defineConfig } from '@playwright/test';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/postgres';

// With E2E_BASE_URL the suite runs against an already deployed environment (staging) instead of starting its own server.
// Then AUTH_SECRET, MFA_ENCRYPTION_KEY and METRICS_TOKEN must be the same synthetic values the deployed app uses.
const externalUrl = process.env.E2E_BASE_URL;
export const baseURL = externalUrl ?? 'http://localhost:3100';

export const env = {
  DATABASE_URL: databaseUrl,
  AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-only-secret-not-for-production',
  MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY ?? Buffer.from('e2e-only-32-bytes-key-0123456789').toString('base64'),
  EMAIL_SERVER: 'smtp://127.0.0.1:1025',
  EMAIL_FROM: 'Factory <no-reply@example.test>',
  AUTH_URL: baseURL,
  METRICS_TOKEN: process.env.METRICS_TOKEN ?? 'e2e-only-metrics-token',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL,
    locale: 'es-DO', // the interface follows the browser language; tests assert Spanish unless they switch
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: externalUrl
    ? undefined
    : {
        command: 'pnpm --filter @factory/web exec next start -p 3100',
        url: 'http://localhost:3100/api/health/live',
        reuseExistingServer: false,
        timeout: 60_000,
        env: { ...env, PORT: '3100' },
      },
});
