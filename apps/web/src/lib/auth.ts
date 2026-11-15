import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { accounts, createDb, sessions, users, verificationTokens } from '@factory/db';
import NextAuth from 'next-auth';
import { buildProviders } from './auth-config';

const databaseUrl = process.env.DATABASE_URL;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: databaseUrl
    ? DrizzleAdapter(createDb(databaseUrl).db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      })
    : undefined,
  providers: buildProviders(process.env),
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
  trustHost: true,
});
