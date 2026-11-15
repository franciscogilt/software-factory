'use client';

import { useActionState } from 'react';
import { useT } from '@/i18n/provider';
import { resetMemberTwoStep, type ResetState } from './actions';

export function ResetForm({ organizationId, userId, label }: { organizationId: string; userId: string; label: string }) {
  const { t } = useT();
  const [state, action] = useActionState(resetMemberTwoStep.bind(null, organizationId), null as ResetState);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <label>
        <input type="checkbox" name="confirm" /> {t('org.resetConfirm', { who: label })}
      </label>
      <button type="submit">{t('org.resetButton')}</button>
      {state && <p role="status">{state.message}</p>}
    </form>
  );
}
