import { buildProviders } from '@/lib/auth-config';
import { EmailForm, GoogleForm } from './forms';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const ids = buildProviders(process.env).map((p) => (typeof p === 'function' ? p().id : p.id));
  return (
    <main>
      <h1>Iniciar sesión</h1>
      {ids.length === 0 && <p>No hay métodos de inicio de sesión configurados.</p>}
      {ids.includes('google') && <GoogleForm />}
      {ids.includes('nodemailer') && <EmailForm />}
    </main>
  );
}
