'use client';

import { useActionState } from 'react';
import { regenerateRecoveryCodes, submitCode, submitRecoveryCode, type CodesState } from './actions';

function Codes({ state }: { state: CodesState }) {
  if (!state) return null;
  if ('error' in state) return <p role="alert">{state.error}</p>;
  return (
    <section>
      <h2>Códigos de recuperación</h2>
      <p>Guárdalos ahora en un lugar seguro. No volverán a mostrarse y cada uno sirve una sola vez.</p>
      <ul>{state.codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
    </section>
  );
}

export function CodeForm() {
  const [state, action] = useActionState(submitCode, null);
  return (
    <>
      <form action={action}>
        <label>
          Código de 6 dígitos
          <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" />
        </label>
        <button type="submit">Verificar</button>
      </form>
      <Codes state={state} />
    </>
  );
}

export function RecoveryForm() {
  const [state, action] = useActionState(submitRecoveryCode, null);
  return (
    <>
      <form action={action}>
        <label>
          ¿Perdiste tu teléfono? Usa un código de recuperación
          <input name="code" required autoComplete="off" />
        </label>
        <button type="submit">Usar código</button>
      </form>
      <Codes state={state} />
    </>
  );
}

export function RegenerateForm() {
  const [state, action] = useActionState(async () => regenerateRecoveryCodes(), null as CodesState);
  return (
    <>
      <form action={action}>
        <button type="submit">Generar códigos de recuperación nuevos</button>
      </form>
      <Codes state={state} />
    </>
  );
}
