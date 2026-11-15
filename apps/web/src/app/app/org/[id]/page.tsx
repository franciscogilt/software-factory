import { listMembers } from '@factory/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb, requireOrgRole } from '@/lib/guard';
import { ResetForm } from './reset-form';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = { active: 'Activo', pending: 'Pendiente', off: 'No activado' } as const;

// Organization admin panel. Only admins and owners with a verified second step can see it.
export default async function OrgMembersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reset?: string }> }) {
  const { id } = await params;
  const { reset } = await searchParams;
  if (!UUID.test(id)) redirect('/app');
  const result = await requireOrgRole(id, 'admin');
  if (!result.allowed) {
    if (result.reason === 'mfa_required') redirect('/app/security');
    redirect('/app');
  }
  const members = await listMembers(getDb(), id);
  const withTwoStep = members.filter((m) => m.twoStep === 'active').length;
  const isOwner = result.role === 'owner';
  return (
    <main>
      <h1>Miembros</h1>
      {reset === 'ok' && <p role="status">Verificación en dos pasos restablecida. El usuario deberá iniciar sesión de nuevo.</p>}
      <p>
        {members.length} miembros, {withTwoStep} con verificación en dos pasos activa. <Link href={`/app/org/${id}/audit`}>Ver auditoría</Link> · <Link href={`/app/org/${id}/jobs`}>Trabajos en segundo plano</Link>
      </p>
      {members.length === 0 ? <p>Aún no hay miembros.</p> : (
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>2FA</th>{isOwner && <th>Acciones</th>}</tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>{m.name}</td><td>{m.email}</td><td>{m.role}</td><td>{STATUS[m.twoStep]}</td>
                {isOwner && <td>{m.twoStep !== 'off' && <ResetForm organizationId={id} userId={m.userId} label={m.email ?? m.userId} />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
