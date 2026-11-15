import { deletionStatus, hasAcceptedTerms } from '@factory/db';
import type { ReactNode } from 'react';
import { formatDateTime, formatSettings } from '@/i18n/format';
import { getT } from '@/i18n/server';
import { auth, signOut } from '@/lib/auth';
import { getDb } from '@/lib/guard';
import { TERMS_VERSION } from '@/lib/terms';
import { cancelDeletionAction } from './privacy/actions';
import { TermsForm } from './privacy/forms';

export const dynamic = 'force-dynamic';

// Gate for everything under /app: a person with a pending deletion only sees how to cancel it, and everyone must
// have accepted the current terms. (Server actions and routes check authorization themselves.)
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) return children;
  const { t, locale } = await getT();
  const db = getDb();

  const pending = await deletionStatus(db, session.user.id);
  if (pending) {
    return (
      <main>
        <h1>{t('privacy.pendingTitle', { date: formatDateTime(pending.scheduledFor, locale, formatSettings().timeZone) })}</h1>
        <p>{t('privacy.pendingText')}</p>
        <form action={cancelDeletionAction}><button type="submit">{t('privacy.cancelButton')}</button></form>
        <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}><button type="submit">{t('common.signOut')}</button></form>
      </main>
    );
  }
  if (!(await hasAcceptedTerms(db, session.user.id, TERMS_VERSION))) {
    return (
      <main>
        <h1>{t('terms.title')}</h1>
        <p>{t('terms.text', { version: TERMS_VERSION })}</p>
        <p><a href="/legal/terms">{t('privacy.seeTerms')}</a> · <a href="/legal/privacy">{t('privacy.seePolicy')}</a></p>
        <TermsForm />
      </main>
    );
  }
  return children;
}
