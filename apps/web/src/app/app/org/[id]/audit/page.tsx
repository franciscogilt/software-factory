import { listAudit } from '@factory/db';
import { redirect } from 'next/navigation';
import { getDb, requireOrgRole } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDate(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
}

export default async function AuditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params;
  const { from, to } = await searchParams;
  if (!UUID.test(id)) redirect('/app');
  const result = await requireOrgRole(id, 'admin');
  if (!result.allowed) redirect(result.reason === 'mfa_required' ? '/app/security' : '/app');
  const rows = await listAudit(getDb(), { organizationId: id, from: parseDate(from, false), to: parseDate(to, true) });
  return (
    <main>
      <h1>Auditoría</h1>
      <form method="get">
        <label>Desde <input type="date" name="from" defaultValue={from} /></label>
        <label>Hasta <input type="date" name="to" defaultValue={to} /></label>
        <button type="submit">Filtrar</button>
      </form>
      {rows.length === 0 ? <p>No hay acciones registradas en este periodo.</p> : (
        <table>
          <thead><tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Objetivo</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.createdAt.toISOString()}</td><td>{r.action}</td><td>{r.actorUserId}</td><td>{r.targetId}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
