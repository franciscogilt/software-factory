'use client';

import { useActionState } from 'react';
import { useT } from '@/i18n/provider';
import { regenerateRecoveryCodes, submitCode, submitRecoveryCode, type CodesState } from './actions';

function Codes({ state }: { state: CodesState }) {
  const { t } = useT();
  if (!state) return null;
  if ('error' in state) return <p role="alert">{state.error}</p>;
  return (
    <section>
      <h2>{t('security.recoveryTitle')}</h2>
      <p>{t('security.recoveryWarning')}</p>
      <ul>{state.codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
    </section>
  );
}

export function CodeForm() {
  const { t } = useT();
  const [state, action] = useActionState(submitCode, null);
  return (
    <>
      <form action={action}>
        <label>
          {t('security.codeLabel')}
          <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" />
        </label>
        <button type="submit">{t('security.verify')}</button>
      </form>
      <Codes state={state} />
    </>
  );
}

export function RecoveryForm() {
  const { t } = useT();
  const [state, action] = useActionState(submitRecoveryCode, null);
  return (
    <>
      <form action={action}>
        <label>
          {t('security.recoveryLabel')}
          <input name="code" required autoComplete="off" />
        </label>
        <button type="submit">{t('security.useRecovery')}</button>
      </form>
      <Codes state={state} />
    </>
  );
}

export function RegenerateForm() {
  const { t } = useT();
  const [state, action] = useActionState(async () => regenerateRecoveryCodes(), null as CodesState);
  return (
    <>
      <form action={action}>
        <button type="submit">{t('security.regenerate')}</button>
      </form>
      <Codes state={state} />
    </>
  );
}
