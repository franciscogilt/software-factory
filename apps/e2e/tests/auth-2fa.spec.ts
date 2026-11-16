import { expect, test } from '@playwright/test';
import { jobs } from '@factory/db';
import { and, eq } from 'drizzle-orm';
import { currentTotpCode, db, enrollAndVerify, orgIdByName, signInAs } from './helpers';

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
    const emailJobs = async () => db.select().from(jobs).where(and(eq(jobs.type, 'email.send'), eq(jobs.organizationId, orgId)));
    const emailsBefore = (await emailJobs()).length;

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

    // The affected user is notified through the job queue. Where a real worker runs (staging) it may already have sent the
    // email and cleared the payload (no personal data is kept), so count the new job instead of reading the recipient.
    const notices = await emailJobs();
    expect(notices.length).toBeGreaterThan(emailsBefore);
    const pending = notices.filter((j) => j.status !== 'succeeded');
    for (const j of pending) expect(j.payload.to).toBe('ana@example.test');
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

test('requesting a sign-in link queues an email instead of sending it inline', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo').fill('nuevo@example.test');
  await page.getByRole('button', { name: 'Enviarme un enlace' }).click();
  await expect.poll(async () => (await db.select().from(jobs).where(eq(jobs.type, 'email.send'))).some((j) => j.payload.to === 'nuevo@example.test' && String(j.payload.text).includes('/api/auth/callback/nodemailer'))).toBe(true);
});

test('admins see failed background jobs of their organization and can retry them', async ({ page, context }) => {
  const token = await signInAs(context, 'dani@example.test');
  await enrollAndVerify('dani@example.test', token);
  const orgId = await orgIdByName('Acme Demo');
  const [dead] = await db.insert(jobs).values({ type: 'email.send', payload: { to: 'x@example.test' }, organizationId: orgId, status: 'dead', attempts: 5, lastError: 'SMTP down' }).returning();
  await page.goto(`/app/org/${orgId}/jobs`);
  await expect(page.getByRole('cell', { name: 'SMTP down' })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).first().click();
  await expect.poll(async () => (await db.select().from(jobs).where(eq(jobs.id, dead!.id)))[0]?.status).toBe('queued');
});

test('a member of another organization cannot see this organization failed jobs', async ({ page, context }) => {
  const token = await signInAs(context, 'carla@example.test');
  await enrollAndVerify('carla@example.test', token);
  const other = await orgIdByName('Acme Demo');
  await page.goto(`/app/org/${other}/jobs`);
  await expect(page).toHaveURL(/\/app$/);
});

test('every page is served with a nonce-based CSP and no script is blocked', async ({ page, context }) => {
  const violations: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
  const response = await page.goto('/login');
  const csp = response!.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[\w=+/]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response!.headers()['x-content-type-options']).toBe('nosniff');

  // A client component with interaction (hydrated under the policy) still works.
  await page.getByLabel('Correo').fill('csp@example.test');
  await page.getByRole('button', { name: 'Enviarme un enlace' }).click();
  await expect.poll(async () => (await db.select().from(jobs).where(eq(jobs.type, 'email.send'))).some((j) => j.payload.to === 'csp@example.test')).toBe(true);

  await page.waitForURL(/verify-request/);
  const token = await signInAs(context, 'ana@example.test');
  await enrollAndVerify('ana@example.test', token);
  await page.goto('/app/security');
  await expect(page.getByText('Esta sesión está verificada.')).toBeVisible();
  expect(violations).toEqual([]);
});

test('sign-in link requests are limited per address with a clear message', async ({ page }) => {
  await page.goto('/login');
  for (let i = 1; i <= 5; i++) {
    await page.getByLabel('Correo').fill('limite@example.test');
    await page.getByRole('button', { name: 'Enviarme un enlace' }).click();
    await expect.poll(async () => (await db.select().from(jobs).where(eq(jobs.type, 'email.send'))).filter((j) => j.payload.to === 'limite@example.test').length).toBe(i);
    await page.waitForURL(/verify-request/);
    await page.goto('/login');
  }
  await page.getByLabel('Correo').fill('limite@example.test');
  await page.getByRole('button', { name: 'Enviarme un enlace' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Demasiados intentos');
  const sent = (await db.select().from(jobs).where(eq(jobs.type, 'email.send'))).filter((j) => j.payload.to === 'limite@example.test');
  expect(sent).toHaveLength(5);
});
