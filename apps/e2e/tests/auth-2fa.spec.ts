import { expect, test } from '@playwright/test';
import { currentTotpCode, enrollAndVerify, orgIdByName, signInAs } from './helpers';

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

test.describe('owner resets a colleague two-step verification', () => {
  test('another owner resets it, it is audited, and the colleague must enroll again', async ({ page, context, browser }) => {
    const danToken = await signInAs(context, 'dani@example.test');
    await enrollAndVerify('dani@example.test', danToken);
    const orgId = await orgIdByName('Acme Demo');

    await page.goto(`/app/org/${orgId}`);
    const anaRow = page.getByRole('row', { name: /ana@example\.test/ });
    await expect(anaRow).toContainText('Activo');
    await anaRow.getByLabel(/Confirmo restablecer/).check();
    await anaRow.getByRole('button', { name: 'Restablecer 2FA' }).click();
    await expect(page.getByRole('status')).toContainText('restablecida');
    await expect(page.getByRole('row', { name: /ana@example\.test/ })).toContainText('No activado');

    await page.goto(`/app/org/${orgId}/audit`);
    await expect(page.getByRole('cell', { name: 'mfa.reset_by_owner' }).first()).toBeVisible();

    // Ana's old sessions are gone, so she signs in again and is asked to set up two-step verification.
    const anaCtx = await browser.newContext();
    const anaPage = await anaCtx.newPage();
    await signInAs(anaCtx, 'ana@example.test');
    await anaPage.goto(`/app/org/${orgId}`);
    await expect(anaPage).toHaveURL(/\/app\/security/);
    await anaCtx.close();
  });

  test('an owner cannot reset their own verification', async ({ page, context }) => {
    const token = await signInAs(context, 'dani@example.test');
    await enrollAndVerify('dani@example.test', token);
    const orgId = await orgIdByName('Acme Demo');
    await page.goto(`/app/org/${orgId}`);
    const daniRow = page.getByRole('row', { name: /dani@example\.test/ });
    await daniRow.getByLabel(/Confirmo restablecer/).check();
    await daniRow.getByRole('button', { name: 'Restablecer 2FA' }).click();
    await expect(daniRow.getByRole('status')).toContainText('No puedes restablecer tu propia');
  });

  test('an owner only sees the members of their own organization', async ({ page, context }) => {
    const token = await signInAs(context, 'carla@example.test');
    await enrollAndVerify('carla@example.test', token);
    const orgId = await orgIdByName('Globex Demo');
    await page.goto(`/app/org/${orgId}`);
    await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible();
    await expect(page.getByText('ana@example.test')).toHaveCount(0);
  });
});
