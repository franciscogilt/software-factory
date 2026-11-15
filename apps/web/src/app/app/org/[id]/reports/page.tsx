import { EXPORT_ROW_LIMIT, orgReport } from '@factory/db';
import { redirect } from 'next/navigation';
import { formatSettings } from '@/i18n/format';
import { getT } from '@/i18n/server';
import { reportRange } from '@/lib/dates';
import { getDb, requireOrgRole } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Organization dashboard: members and activity for a date range, with CSV and PDF exports. Admins and owners only.
export default async function ReportsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  if (!UUID.test(id)) redirect('/app');
  const result = await requireOrgRole(id, 'admin');
  if (!result.allowed) redirect(result.reason === 'mfa_required' ? '/app/security' : '/app');
  const { t } = await getT();
  const { timeZone } = formatSettings();
  const range = reportRange(query.from, query.to);
  const report = await orgReport(getDb(), { organizationId: id, from: range.from, to: range.to, timeZone });
  const maxDay = Math.max(1, ...report.activity.byDay.map((d) => d.count));
  const exportHref = (kind: string, format: string) => `/app/org/${id}/reports/export?kind=${kind}&format=${format}&from=${range.fromDay}&to=${range.toDay}`;
  const kinds = [['summary', 'reports.exportSummary'], ['members', 'reports.exportMembers'], ['activity', 'reports.exportActivity']] as const;

  return (
    <main>
      <h1>{t('reports.title')}</h1>
      <form method="get">
        <label>{t('audit.from')} <input type="date" name="from" defaultValue={range.fromDay} /></label>
        <label>{t('audit.to')} <input type="date" name="to" defaultValue={range.toDay} /></label>
        <button type="submit">{t('reports.apply')}</button>
      </form>

      <section aria-labelledby="kpis">
        <h2 id="kpis">{t('reports.members')}</h2>
        <dl>
          <dt>{t('reports.membersTotal')}</dt><dd>{report.members.total}</dd>
          <dt>{t('reports.newMembers')}</dt><dd>{report.members.newInRange}</dd>
          <dt>{t('reports.twoStepAdoption')}</dt><dd>{report.members.twoStepActive} / {report.members.total}</dd>
          <dt>{t('org.role.owner')}</dt><dd>{report.members.byRole.owner}</dd>
          <dt>{t('org.role.admin')}</dt><dd>{report.members.byRole.admin}</dd>
          <dt>{t('org.role.member')}</dt><dd>{report.members.byRole.member}</dd>
          <dt>{t('reports.activityTotal')}</dt><dd>{report.activity.total}</dd>
          <dt>{t('reports.jobsCreated')}</dt><dd>{report.jobs.createdInRange}</dd>
          <dt>{t('reports.jobsDead')}</dt><dd>{report.jobs.dead}</dd>
        </dl>
      </section>

      <section aria-labelledby="by-day">
        <h2 id="by-day">{t('reports.byDay')}</h2>
        {report.activity.byDay.length === 0 ? <p>{t('reports.noActivity')}</p> : (
          <table>
            <thead><tr><th>{t('reports.colDay')}</th><th>{t('reports.colCount')}</th><th aria-hidden="true"></th></tr></thead>
            <tbody>
              {report.activity.byDay.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td><td>{d.count}</td>
                  <td aria-hidden="true"><div style={{ background: '#2563eb', height: 10, width: `${Math.round((d.count / maxDay) * 200)}px` }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {report.activity.byAction.length > 0 && (
        <section aria-labelledby="top-actions">
          <h2 id="top-actions">{t('reports.topActions')}</h2>
          <table>
            <thead><tr><th>{t('reports.colAction')}</th><th>{t('reports.colCount')}</th></tr></thead>
            <tbody>{report.activity.byAction.map((a) => <tr key={a.action}><td>{a.action}</td><td>{a.count}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <section aria-labelledby="export">
        <h2 id="export">{t('reports.exportTitle')}</h2>
        <ul>
          {kinds.map(([kind, label]) => (
            <li key={kind}>{t(label)}: <a href={exportHref(kind, 'csv')}>{t('reports.csv')}</a> · <a href={exportHref(kind, 'pdf')}>{t('reports.pdf')}</a></li>
          ))}
        </ul>
        <p>{t('reports.exportLimit', { limit: EXPORT_ROW_LIMIT })}</p>
      </section>
    </main>
  );
}
