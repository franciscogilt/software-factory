'use client';

import { useActionState } from 'react';
import { resetMemberTwoStep, type ResetState } from './actions';

export function ResetForm({ organizationId, userId, label }: { organizationId: string; userId: string; label: string }) {
  const [state, action] = useActionState(resetMemberTwoStep.bind(null, organizationId), null as ResetState);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <label>
        <input type="checkbox" name="confirm" /> Confirmo restablecer a {label}
      </label>
      <button type="submit">Restablecer 2FA</button>
      {state && <p role="status">{state.message}</p>}
    </form>
  );
}
