import { auth, signOut } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AppHome() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <main>
      <h1>Hola, {session.user.name ?? session.user.email}</h1>
      <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
