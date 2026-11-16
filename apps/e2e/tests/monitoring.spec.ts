import { expect, test } from '@playwright/test';
import { flowMetrics } from '@factory/db';
import { eq } from 'drizzle-orm';
import { db, signInAs } from './helpers';
import { env } from '../playwright.config';

test('readiness really checks the database', async ({ request }) => {
  const res = await request.get('/api/health/ready');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ready: true, checks: { database_url: 'ok', database: 'ok' } });
});

test('metrics are closed without the token and open with it', async ({ request }) => {
  expect((await request.get('/api/metrics')).status()).toBe(401);
  expect((await request.get('/api/metrics', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401);
  const ok = await request.get('/api/metrics', { headers: { authorization: `Bearer ${env.METRICS_TOKEN}` } });
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toContain('factory_queue_jobs{status="dead"}');
});

test('a wrong two-step code is recorded as a refusal, not a failure, and shows in metrics', async ({ page, context, request }) => {
  await db.delete(flowMetrics).where(eq(flowMetrics.flow, 'twostep_code'));
  await signInAs(context, 'dani@example.test'); // owner already enrolled by earlier tests: the page asks for the code directly
  await page.goto('/app/security');
  await page.getByLabel('Código de 6 dígitos').fill('000000');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Código incorrecto');
  const rows = await db.select().from(flowMetrics).where(eq(flowMetrics.flow, 'twostep_code'));
  expect(rows.map((r) => r.outcome)).toEqual(['limited']);
  const text = await (await request.get('/api/metrics', { headers: { authorization: `Bearer ${env.METRICS_TOKEN}` } })).text();
  expect(text).toContain('factory_flow_events{flow="twostep_code",outcome="limited",window="900s"} 1');
});
