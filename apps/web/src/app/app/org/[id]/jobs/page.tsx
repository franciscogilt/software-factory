import { listDead, queueStats } from '@factory/jobs';
import { redirect } from 'next/navigation';
import { getT } from '@/i18n/server';
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
  const { t } = await getT();
  const [dead, stats] = await Promise.all([listDead(getDb(), id), queueStats(getDb())]);
  return (
    <main>
      <h1>{t('jobs.title')}</h1>
      <p>{t('jobs.stats', { queued: stats.queued, running: stats.running, dead: stats.dead })}</p>
      {dead.length === 0 ? <p>{t('jobs.empty')}</p> : (
        <table>
          <thead><tr><th>{t('jobs.colType')}</th><th>{t('jobs.colAttempts')}</th><th>{t('jobs.colError')}</th><th>{t('jobs.colAction')}</th></tr></thead>
          <tbody>
            {dead.map((j) => (
              <tr key={j.id}>
                <td>{j.type}</td><td>{j.attempts}</td><td>{j.lastError}</td>
                <td>
                  <form action={retryJob.bind(null, id)}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <button type="submit">{t('jobs.retry')}</button>
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
