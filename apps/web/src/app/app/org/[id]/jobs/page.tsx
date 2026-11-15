import { listDead, queueStats } from '@factory/jobs';
import { redirect } from 'next/navigation';
import { getDb, requireOrgRole } from '@/lib/guard';
import { retryJob } from '../actions';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Failed-jobs queue of the organization (emails and other background work that ran out of attempts).
export default async function JobsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) redirect('/app');
  const result = await requireOrgRole(id, 'admin');
  if (!result.allowed) redirect(result.reason === 'mfa_required' ? '/app/security' : '/app');
  const [dead, stats] = await Promise.all([listDead(getDb(), id), queueStats(getDb())]);
  return (
    <main>
      <h1>Trabajos en segundo plano</h1>
      <p>En cola: {stats.queued}. En ejecución: {stats.running}. Fallidos en todo el sistema: {stats.dead}.</p>
      {dead.length === 0 ? <p>No hay trabajos fallidos en esta organización.</p> : (
        <table>
          <thead><tr><th>Tipo</th><th>Intentos</th><th>Último error</th><th>Acción</th></tr></thead>
          <tbody>
            {dead.map((j) => (
              <tr key={j.id}>
                <td>{j.type}</td><td>{j.attempts}</td><td>{j.lastError}</td>
                <td>
                  <form action={retryJob.bind(null, id)}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <button type="submit">Reintentar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
