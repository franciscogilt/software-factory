import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { signInLinkEmail, twoStepResetEmail } from '../lib/emails';
import { formatDateTime, formatMoney, formatSettings } from './format';
import { createTranslate, DEFAULT_LOCALE, getMessages, LOCALES, resolveLocale } from './index';

function keys(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('catalogs', () => {
  it('Spanish and English have exactly the same keys, none empty', () => {
    expect(keys(getMessages('en')).sort()).toEqual(keys(getMessages('es')).sort());
    for (const locale of LOCALES) for (const k of keys(getMessages(locale))) expect(createTranslate(locale)(k as never).trim()).not.toBe('');
  });

  it('English values differ from Spanish except for names that are the same in both', () => {
    const same = keys(getMessages('es')).filter((k) => createTranslate('es')(k as never) === createTranslate('en')(k as never));
    expect(same.sort()).toEqual(['audit.colActor', 'common.appName', 'org.colTwoStep'].sort());
  });
});

describe('createTranslate', () => {
  it('fills placeholders and returns the key for unknown ones', () => {
    expect(createTranslate('en')('app.greeting', { name: 'Ana' })).toBe('Hello, Ana');
    expect(createTranslate('es')('login.tooMany', { minutes: 3, unit: 'minutos' })).toContain('3 minutos');
    expect(createTranslate('es')('nope.missing' as never)).toBe('nope.missing');
  });
});

describe('resolveLocale', () => {
  it('prefers the saved cookie, then Accept-Language, then Spanish', () => {
    expect(resolveLocale('en', 'es-DO')).toBe('en');
    expect(resolveLocale(undefined, 'fr-FR,en-US;q=0.8')).toBe('en');
    expect(resolveLocale('xx', 'de')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined, null)).toBe('es');
  });
});

describe('formatting', () => {
  it('uses the configured time zone and currency', () => {
    const d = new Date('2026-01-01T03:30:00Z');
    expect(formatDateTime(d, 'en', 'America/Santo_Domingo')).toContain('11:30');
    expect(formatDateTime(d, 'en', 'UTC')).toContain('3:30');
    expect(formatMoney(1234.5, 'es', 'DOP')).toMatch(/1\.?234,50|1,234\.50/);
    expect(formatMoney(10, 'en', 'USD')).toBe('$10.00');
    expect(formatSettings({})).toEqual({ timeZone: 'America/Santo_Domingo', currency: 'DOP' });
    expect(formatSettings({ APP_TIMEZONE: 'UTC', APP_CURRENCY: 'USD' })).toEqual({ timeZone: 'UTC', currency: 'USD' });
  });
});

describe('emails', () => {
  it('carry both languages', () => {
    const a = signInLinkEmail('https://x.test/l');
    expect(a.text).toContain('Usa este enlace');
    expect(a.text).toContain('Use this link');
    expect(a.text.match(/https:\/\/x\.test\/l/g)).toHaveLength(2);
    expect(twoStepResetEmail().text).toContain('An owner of your organization');
  });
});

// Guard: user-visible text must go through the catalogs, not be typed into components.
describe('no hardcoded interface text', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
    });
  }
  it('finds no accented Spanish text or ¿/¡ in app components', () => {
    const offenders = files(join(__dirname, '..', 'app')).filter((f) => /[áéíóúñ¿¡]/i.test(readFileSync(f, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')));
    expect(offenders).toEqual([]);
  });
});
