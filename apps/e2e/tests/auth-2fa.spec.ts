import { expect, test } from '@playwright/test';
import { currentTotpCode, orgIdByName, signInAs } from './helpers';

test.describe.configure({ mode: 'serial' });

test('login page offers email sign-in', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviarme un enlace' })).toBeVisible();
});

test('anonymous visitors are sent to login', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login/);
});

test('an admin without two-step verification cannot see members and is sent to set it up', async ({ page, context }) => {
  await signInAs(context, 'ana@example.test');
  const orgId = await orgIdByName('Acme Demo');
  await page.goto(`/app/org/${orgId}`);
  await expect(page).toHaveURL(/\/app\/security/);
});

test('wrong code is rejected with a clear message', async ({ page, context }) => {
  await signInAs(context, 'ana@example.test');
  await page.goto('/app/security');
  await page.getByRole('button', { name: 'Activar' }).click();
  await page.getByLabel('Código de 6 dígitos').fill('000000');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Código incorrecto');
});

let recoveryCodes: string[] = [];

test('enrolling shows ten recovery codes once, then members are visible', async ({ page, context }) => {
  await signInAs(context, 'ana@example.test');
  await page.goto('/app/security');
  await page.getByLabel('Código de 6 dígitos').fill(await currentTotpCode('ana@example.test'));
  await page.getByRole('button', { name: 'Verificar' }).click();
  const items = page.getByRole('heading', { name: 'Códigos de recuperación' }).locator('..').getByRole('listitem');
  await expect(items).toHaveCount(10);
  recoveryCodes = await items.allTextContents();

  const orgId = await orgIdByName('Acme Demo');
  await page.goto(`/app/org/${orgId}`);
  await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible();
  await expect(page.getByText('beto@example.test')).toBeVisible();
});

test('a new session can be verified with a recovery code, and only once', async ({ page, context, browser }) => {
  const code = recoveryCodes[0]!;
  await signInAs(context, 'ana@example.test');
  await page.goto('/app/security');
  await page.getByLabel('¿Perdiste tu teléfono? Usa un código de recuperación').fill(code);
  await page.getByRole('button', { name: 'Usar código' }).click();
  await expect(page.getByText('Esta sesión está verificada.')).toBeVisible();

  const second = await browser.newContext();
  const page2 = await second.newPage();
  await signInAs(second, 'ana@example.test');
  await page2.goto('/app/security');
  await page2.getByLabel('¿Perdiste tu teléfono? Usa un código de recuperación').fill(code);
  await page2.getByRole('button', { name: 'Usar código' }).click();
  await expect(page2.locator('p[role="alert"]')).toContainText('incorrecto');
  await second.close();
});

test('a plain member cannot open the members page', async ({ page, context }) => {
  await signInAs(context, 'beto@example.test');
  const orgId = await orgIdByName('Acme Demo');
  await page.goto(`/app/org/${orgId}`);
  await expect(page).toHaveURL(/\/app$/);
});

test('a user cannot open another organization, even as owner of their own', async ({ page, context }) => {
  await signInAs(context, 'carla@example.test');
  const other = await orgIdByName('Acme Demo');
  await page.goto(`/app/org/${other}`);
  await expect(page).toHaveURL(/\/app$/);
});
