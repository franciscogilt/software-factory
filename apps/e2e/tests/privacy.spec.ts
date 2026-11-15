import { expect, test } from '@playwright/test';
import { auditLog, consents, jobs, sessions, termsAcceptances, users } from '@factory/db';
import { and, eq } from 'drizzle-orm';
import { purgeDueAccounts, DELETION_GRACE_MS } from '@factory/db';
import { createTestUser, db, enrollAndVerify, signInAs, userIdByEmail } from './helpers';
import { randomUUID } from 'node:crypto';

const fresh = () => `p-${randomUUID().slice(0, 8)}@example.test`;

test('someone who has not accepted the terms must accept them before using the app', async ({ page, context }) => {
  const email = fresh();
  await createTestUser(email);
  await signInAs(context, email, { acceptTerms: false });
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Aceptar los términos' })).toBeVisible();
  await page.getByRole('button', { name: 'Acepto los términos' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Marca la casilla');
  await page.getByLabel(/He leído y acepto/).check();
  await page.getByRole('button', { name: 'Acepto los términos' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
  const [row] = await db.select().from(termsAcceptances).where(eq(termsAcceptances.userId, await userIdByEmail(email)));
  expect(row?.version).toBeTruthy();
});

test('the cookie notice is shown once and remembered; legal pages are public', async ({ page }) => {
  await page.goto('/login');
  const notice = page.getByRole('complementary', { name: 'Aviso de cookies' });
  await expect(notice).toContainText('solo cookies esenciales');
  await notice.getByRole('button', { name: 'Entendido' }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(notice).toBeHidden();
  await page.goto('/legal/privacy');
  await expect(page.getByRole('heading', { name: 'Política de privacidad' })).toBeVisible();
  await page.goto('/legal/terms');
  await expect(page.getByRole('heading', { name: 'Términos de uso' })).toBeVisible();
});

test('a person downloads only their own data, without secrets, and it is audited', async ({ context }) => {
  await signInAs(context, 'beto@example.test');
  const res = await context.request.get('/app/privacy/export');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toContain('attachment');
  const text = await res.text();
  const data = JSON.parse(text);
  expect(data.profile.email).toBe('beto@example.test');
  expect(data.memberships[0].organization).toBe('Acme Demo');
  for (const other of ['ana@example.test', 'carla@example.test', 'secretEncrypted', 'codeHash', 'sessionToken']) expect(text).not.toContain(other);
  const logged = await db.select().from(auditLog).where(and(eq(auditLog.action, 'privacy.exported'), eq(auditLog.actorUserId, await userIdByEmail('beto@example.test'))));
  expect(logged.length).toBeGreaterThan(0);

  const anon = await context.browser()!.newContext();
  expect((await anon.request.get('http://localhost:3100/app/privacy/export')).status()).toBe(401);
  await anon.close();
});

test('the only owner of an organization cannot delete their account', async ({ page, context }) => {
  const email = fresh();
  await createTestUser(email, { soleOwnerOf: 'Solo Org' });
  await signInAs(context, email);
  await page.goto('/app/privacy');
  await page.getByLabel(/Escribe tu correo/).fill(email);
  await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('único dueño de: Solo Org');
  const [row] = await db.select().from(users).where(eq(users.email, email));
  expect(row?.deletionRequestedAt).toBeNull();
});

test('the typed email must match', async ({ page, context }) => {
  await signInAs(context, 'beto@example.test');
  await page.goto('/app/privacy');
  await page.getByLabel(/Escribe tu correo/).fill('otro@example.test');
  await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('no coincide');
});

test('deleting an account: sessions end, it can be cancelled, and it is erased after the grace period', async ({ page, context, browser }) => {
  const email = fresh();
  const { userId } = await createTestUser(email);
  await signInAs(context, email);
  await page.goto('/app/privacy');
  await page.getByLabel(/Escribe tu correo/).fill(email);
  await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);

  expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
  const mails = await db.select().from(jobs).where(eq(jobs.type, 'email.send'));
  expect(mails.some((j) => j.payload.to === email && String(j.payload.subject).includes('eliminará'))).toBe(true);

  // Signing in again during the grace period only offers to cancel; the organization stays closed.
  const again = await browser.newContext();
  const p2 = await again.newPage();
  await signInAs(again, email);
  await p2.goto('/app');
  await expect(p2.getByRole('heading', { name: /Tu cuenta se eliminará el/ })).toBeVisible();
  await p2.getByRole('button', { name: 'Cancelar la eliminación' }).click();
  await expect(p2.getByRole('heading', { name: /Hola/ })).toBeVisible();
  await again.close();

  // Ask again and let the grace period pass: everything about the person is erased.
  const third = await browser.newContext();
  const p3 = await third.newPage();
  await signInAs(third, email);
  await p3.goto('/app/privacy');
  await p3.getByLabel(/Escribe tu correo/).fill(email);
  await p3.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await expect(p3).toHaveURL(/localhost:3100\/$/); // the request finished before the context is closed
  await third.close();
  const result = await purgeDueAccounts(db, new Date(Date.now() + DELETION_GRACE_MS + 60_000));
  expect(result.purged.map((p) => p.email)).toContain(email);
  expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
  expect(await db.select().from(consents).where(eq(consents.userId, userId))).toHaveLength(0);
  expect((await db.select().from(auditLog)).filter((a) => a.action === 'privacy.account_purged' && a.targetId === userId)).toHaveLength(1);
});

test('a person with two-step verification must verify the session to download or delete', async ({ context }) => {
  const token = await signInAs(context, 'dani@example.test');
  await enrollAndVerify('dani@example.test', token);
  expect((await context.request.get('/app/privacy/export')).status()).toBe(200);
  const other = await context.browser()!.newContext();
  await signInAs(other, 'dani@example.test'); // a second session, not verified
  expect((await other.request.get('http://localhost:3100/app/privacy/export')).status()).toBe(403);
  await other.close();
});
