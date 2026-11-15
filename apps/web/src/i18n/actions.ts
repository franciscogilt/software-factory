'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isLocale, LOCALE_COOKIE } from './index';

// Saves the language choice for a year. Only known locales are accepted.
export async function setLocale(data: FormData): Promise<void> {
  const value = String(data.get('locale') ?? '');
  if (!isLocale(value)) return;
  (await cookies()).set(LOCALE_COOKIE, value, { path: '/', maxAge: 365 * 24 * 3600, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  revalidatePath('/', 'layout');
}
