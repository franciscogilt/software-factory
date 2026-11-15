'use client';

import { useActionState } from 'react';
import { useT } from '@/i18n/provider';
import { acceptTermsAction, requestDeletionAction, type PrivacyState } from './actions';

export function DeleteForm({ email, days }: { email: string; days: number }) {
  const { t } = useT();
  const [state, action] = useActionState(requestDeletionAction, null as PrivacyState);
  return (
    <form action={action}>
      <p>{t('privacy.deleteText', { days })}</p>
      <label>
        {t('privacy.deleteConfirm', { email })}
        <input name="email" type="email" required autoComplete="off" />
      </label>
      <button type="submit">{t('privacy.deleteButton')}</button>
      {state && <p role="alert">{state.error}</p>}
    </form>
  );
}

export function TermsForm() {
  const { t } = useT();
  const [state, action] = useActionState(acceptTermsAction, null as PrivacyState);
  return (
    <form action={action}>
      <label>
        <input type="checkbox" name="accept" /> {t('terms.checkbox')}
      </label>
      <button type="submit">{t('terms.accept')}</button>
      {state && <p role="alert">{state.error}</p>}
    </form>
  );
}
