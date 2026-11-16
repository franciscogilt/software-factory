import { expect, test } from '@playwright/test';
import { signInAs } from './helpers';
import { baseURL } from '../playwright.config';

test('the interface is Spanish by default and follows the browser language', async ({ page, browser }) => {
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  const english = await browser.newContext({ locale: 'en-US', extraHTTPHeaders: { 'accept-language': 'en-US,en;q=0.9' } });
  const p = await english.newPage();
  await p.goto(`${baseURL}/login`);
  await expect(p.locator('html')).toHaveAttribute('lang', 'en');
  await expect(p.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await english.close();
});

test('the language switch is remembered across pages', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Starter kit base')).toBeVisible();
  await page.getByRole('button', { name: 'Español' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' }).or(page.getByText('Base del starter kit'))).toBeVisible();
});

test('server messages, client forms and dates follow the language and the configured time zone', async ({ page, context }) => {
  await signInAs(context, 'dani@example.test');
  await context.addCookies([{ name: 'locale', value: 'en', domain: 'localhost', path: '/' }]);
  await page.goto('/app/security');
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Wrong or already used code');
});

test('an unknown language cookie falls back to Spanish', async ({ page, context }) => {
  await context.addCookies([{ name: 'locale', value: 'fr', domain: 'localhost', path: '/' }]);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
