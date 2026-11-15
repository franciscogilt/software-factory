import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';

type Env = Record<string, string | undefined>;

// Builds the provider list from environment variables. A provider is only enabled when configured.
type SendLink = NonNullable<Parameters<typeof Nodemailer>[0]>['sendVerificationRequest'];

export function buildProviders(env: Env, sendVerificationRequest?: SendLink): NextAuthConfig['providers'] {
  const providers: NextAuthConfig['providers'] = [];
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    // Google verifies emails, so linking to an existing account with the same email is safe here.
    providers.push(
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
        authorization: { params: { scope: 'openid email profile' } },
      }),
    );
  }
  if (env.EMAIL_SERVER && env.EMAIL_FROM) {
    providers.push(Nodemailer({ server: env.EMAIL_SERVER, from: env.EMAIL_FROM, sendVerificationRequest }));
  }
  return providers;
}
