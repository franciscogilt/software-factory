export const dynamic = 'force-dynamic';

import { buildProviders } from '@/lib/auth-config';
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  const ids = buildProviders(process.env).map((p) => (typeof p === 'function' ? p().id : p.id));
  return (
    <main>
      <h1>Iniciar sesión</h1>
      {ids.length === 0 && <p>No hay métodos de inicio de sesión configurados.</p>}
      {ids.includes('google') && (
        <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/app' }); }}>
          <button type="submit">Continuar con Google</button>
        </form>
      )}
      {ids.includes('nodemailer') && (
        <form action={async (data: FormData) => { 'use server'; await signIn('nodemailer', { email: String(data.get('email')), redirectTo: '/app' }); }}>
          <label>
            Correo
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <button type="submit">Enviarme un enlace</button>
        </form>
      )}
    </main>
  );
}
