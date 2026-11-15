'use client';

import { useActionState } from 'react';
import { useT } from '@/i18n/provider';
import { requestSignInLink, signInWithGoogle, type LoginState } from './actions';

export function GoogleForm() {
  const { t } = useT();
  return (
    <form action={signInWithGoogle}>
      <button type="submit">{t('login.google')}</button>
    </form>
  );
}

export function EmailForm() {
  const { t } = useT();
  const [state, action] = useActionState(requestSignInLink, null as LoginState);
  return (
    <form action={action}>
      <label>
        {t('login.emailLabel')}
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <button type="submit">{t('login.sendLink')}</button>
      {state && <p role="alert">{state.error}</p>}
    </form>
  );
}
