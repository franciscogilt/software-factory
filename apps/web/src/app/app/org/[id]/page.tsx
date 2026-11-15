import { memberships, users } from '@factory/db';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, requireOrgRole } from '@/lib/guard';

export const dynamic = 'force-dynamic';

// Members of an organization. Only admins and owners with a verified second step can see it.
export default async function OrgMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) redirect('/app');
  const result = await requireOrgRole(id, 'admin');
  if (!result.allowed) {
    if (result.reason === 'mfa_required') redirect('/app/security');
    redirect('/app');
  }
  const rows = await getDb()
    .select({ email: users.email, name: users.name, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, id));
  return (
    <main>
      <h1>Miembros</h1>
      {rows.length === 0 ? <p>Aún no hay miembros.</p> : (
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.email}><td>{r.name}</td><td>{r.email}</td><td>{r.role}</td></tr>)}</tbody>
        </table>
      )}
    </main>
  );
}
