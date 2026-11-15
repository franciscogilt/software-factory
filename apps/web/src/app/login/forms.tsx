'use client';

import { useActionState } from 'react';
import { requestSignInLink, signInWithGoogle, type LoginState } from './actions';

export function GoogleForm() {
  return (
    <form action={signInWithGoogle}>
      <button type="submit">Continuar con Google</button>
    </form>
  );
}

export function EmailForm() {
  const [state, action] = useActionState(requestSignInLink, null as LoginState);
  return (
    <form action={action}>
      <label>
        Correo
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <button type="submit">Enviarme un enlace</button>
      {state && <p role="alert">{state.error}</p>}
    </form>
  );
}
