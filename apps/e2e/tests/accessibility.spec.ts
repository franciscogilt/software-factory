import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { userTotp } from '@factory/db';
import { eq } from 'drizzle-orm';
import { db, enrollAndVerify, orgIdByName, signInAs, userIdByEmail } from './helpers';

// WCAG 2.2 level AA gate: any violation on a key screen fails CI, so a PR with accessibility problems cannot merge.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(summary, `Accessibility violations on ${name}`).toEqual([]);
}

for (const locale of ['es', 'en'] as const) {
  test.describe(`accessibility (${locale})`, () => {
    // Leave two-step state as found: other specs expect these users not to be enrolled.
    test.afterEach(async () => {
      for (const email of ['beto@example.test', 'dani@example.test']) await db.delete(userTotp).where(eq(userTotp.userId, await userIdByEmail(email)));
    });

    test.beforeEach(async ({ context }) => {
      await context.addCookies([{ name: 'locale', value: locale, domain: 'localhost', path: '/' }]);
    });

    test('public screens', async ({ page }) => {
      await page.goto('/');
      await expectAccessible(page, 'home');
      await page.goto('/login');
      await expectAccessible(page, 'login');
      for (const path of ['/legal/terms', '/legal/privacy']) {
        await page.goto(path);
        await expectAccessible(page, path);
      }
    });

    test('two-step setup screens', async ({ page, context }) => {
      await db.delete(userTotp).where(eq(userTotp.userId, await userIdByEmail('beto@example.test'))); // start not enrolled in each language
      await signInAs(context, 'beto@example.test');
      await page.goto('/app');
      await expectAccessible(page, 'app home');
      await page.goto('/app/security');
      await expectAccessible(page, 'security (not enrolled)');
      await page.getByRole('button', { name: locale === 'es' ? 'Activar' : 'Enable' }).click();
      await expect(page.getByRole('img')).toBeVisible(); // the QR code
      await expectAccessible(page, 'security (QR shown)');
    });

    test('admin screens', async ({ page, context }) => {
      const token = await signInAs(context, 'dani@example.test');
      await enrollAndVerify('dani@example.test', token);
      const org = await orgIdByName('Acme Demo');
      for (const path of ['', '/audit', '/jobs', '/reports']) {
        await page.goto(`/app/org/${org}${path}`);
        await expect(page.locator('h1')).toBeVisible();
        await expectAccessible(page, `org${path || ' members'}`);
      }
      await page.goto('/app/security');
      await expectAccessible(page, 'security (verified)');
      await page.goto('/app/privacy');
      await expectAccessible(page, 'privacy and data');
    });
  });
}

// Proves the gate can fail: a deliberately broken page must produce violations.
test('the accessibility check detects real problems', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<img src="/x.png"><input><button></button>');
  });
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => v.id)).toEqual(expect.arrayContaining(['image-alt', 'label', 'button-name']));
});
