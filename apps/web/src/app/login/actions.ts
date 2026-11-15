'use server';

import { hitRateLimit } from '@factory/db';
import { headers } from 'next/headers';
import { signIn } from '@/lib/auth';
import { getDb } from '@/lib/guard';

export type LoginState = { error: string } | null;

const WINDOW_MS = 15 * 60_000;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;

export async function signInWithGoogle(): Promise<void> {
  await signIn('google', { redirectTo: '/app' });
}

// Limits how many sign-in links one address (and one network address) can request, with progressive blocking.
export async function requestSignInLink(_prev: LoginState, data: FormData): Promise<LoginState> {
  const email = String(data.get('email') ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Escribe un correo válido.' };

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const db = getDb();
  for (const check of [
    { key: `signin-email:${email}`, limit: EMAIL_LIMIT },
    { key: `signin-ip:${ip}`, limit: IP_LIMIT },
  ]) {
    const result = await hitRateLimit(db, { key: check.key, limit: check.limit, windowMs: WINDOW_MS });
    if (!result.allowed) {
      const minutes = Math.ceil(result.retryAfterMs / 60_000);
      return { error: `Demasiados intentos. Vuelve a intentarlo en ${minutes} minuto${minutes === 1 ? '' : 's'}.` };
    }
  }
  await signIn('nodemailer', { email, redirectTo: '/app' });
  return null;
}
