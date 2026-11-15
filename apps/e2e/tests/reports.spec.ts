import { expect, test } from '@playwright/test';
import { enrollAndVerify, orgIdByName, signInAs } from './helpers';

const exportUrl = (org: string, kind: string, format: string) => `/app/org/${org}/reports/export?kind=${kind}&format=${format}`;

test('an owner sees the dashboard for this organization only', async ({ page, context }) => {
  const token = await signInAs(context, 'dani@example.test');
  await enrollAndVerify('dani@example.test', token);
  const org = await orgIdByName('Acme Demo');
  await page.goto(`/app/org/${org}/reports`);
  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
  await expect(page.getByRole('term').filter({ hasText: /^Miembros$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CSV' }).first()).toBeVisible();
  // The period can be changed from the form.
  await page.getByLabel('Desde').fill('2020-01-01');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/from=2020-01-01/);
});

test('exports download as CSV and PDF, are limited to the organization, and are audited', async ({ context, page }) => {
  const token = await signInAs(context, 'dani@example.test');
  await enrollAndVerify('dani@example.test', token);
  const org = await orgIdByName('Acme Demo');

  const members = await context.request.get(exportUrl(org, 'members', 'csv'));
  expect(members.status()).toBe(200);
  expect(members.headers()['content-type']).toContain('text/csv');
  expect(members.headers()['content-disposition']).toContain('attachment');
  const csv = await members.text();
  expect(csv).toContain('ana@example.test');
  expect(csv).toContain('dani@example.test');
  expect(csv).not.toContain('carla@example.test'); // belongs to the other organization

  const pdf = await context.request.get(exportUrl(org, 'summary', 'pdf'));
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const activity = await context.request.get(exportUrl(org, 'activity', 'csv'));
  expect(await activity.text()).toContain('report.exported');

  await page.goto(`/app/org/${org}/audit`);
  await expect(page.getByRole('cell', { name: 'report.exported' }).first()).toBeVisible();
});

test('exports are refused for members, for another organization, without a verified second step, and for bad input', async ({ browser, context }) => {
  const org = await orgIdByName('Acme Demo');

  await signInAs(context, 'beto@example.test'); // plain member
  expect((await context.request.get(exportUrl(org, 'members', 'csv'))).status()).toBe(403);

  const carla = await browser.newContext();
  const carlaToken = await signInAs(carla, 'carla@example.test'); // owner of Globex, verified
  await enrollAndVerify('carla@example.test', carlaToken);
  expect((await carla.request.get(exportUrl(org, 'members', 'csv'))).status()).toBe(403);
  const globex = await orgIdByName('Globex Demo');
  expect((await carla.request.get(exportUrl(globex, 'nope', 'csv'))).status()).toBe(400);
  expect((await carla.request.get(exportUrl('not-a-uuid', 'members', 'csv'))).status()).toBe(400);
  await carla.close();

  const anon = await browser.newContext();
  expect((await anon.request.get(exportUrl(org, 'members', 'csv'))).status()).toBe(403);
  await anon.close();
});
