import type { Locale } from './index';

export type FormatSettings = { timeZone: string; currency: string };

// Defaults for the Dominican Republic; each product overrides them with APP_TIMEZONE and APP_CURRENCY.
export function formatSettings(env: Record<string, string | undefined> = process.env): FormatSettings {
  return { timeZone: env.APP_TIMEZONE || 'America/Santo_Domingo', currency: env.APP_CURRENCY || 'DOP' };
}

export function formatDateTime(date: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

export function formatMoney(amount: number, locale: Locale, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
