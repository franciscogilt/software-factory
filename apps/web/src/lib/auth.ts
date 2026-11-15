import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { accounts, createDb, sessions, users, verificationTokens } from '@factory/db';
import { enqueue } from '@factory/jobs';
import { createHash } from 'node:crypto';
import NextAuth from 'next-auth';
import { buildProviders } from './auth-config';

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDb(databaseUrl) : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: databaseUrl
    ? DrizzleAdapter(database!.db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      })
    : undefined,
  // Sign-in links go through the job queue so a slow mail server never blocks the request and failed sends are retried.
  providers: buildProviders(process.env, async ({ identifier, url }) => {
    if (!database) throw new Error('DATABASE_URL is required to send sign-in links');
    await enqueue(database.db, {
      type: 'email.send',
      payload: {
        to: identifier,
        subject: 'Tu enlace para iniciar sesión',
        text: `Usa este enlace para iniciar sesión. Caduca pronto y solo sirve una vez:\n\n${url}\n\nSi no lo pediste, ignora este mensaje.`,
      },
      idempotencyKey: `signin:${createHash('sha256').update(url).digest('hex')}`,
      maxAttempts: 5,
    });
  }),
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
  trustHost: true,
});
