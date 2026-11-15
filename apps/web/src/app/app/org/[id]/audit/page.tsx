import { listAudit } from '@factory/db';
import { redirect } from 'next/navigation';
import { formatDateTime, formatSettings } from '@/i18n/format';
import { getT } from '@/i18n/server';
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
  const { t, locale } = await getT();
  const { timeZone } = formatSettings();
  const rows = await listAudit(getDb(), { organizationId: id, from: parseDate(from, false), to: parseDate(to, true) });
  return (
    <main>
      <h1>{t('audit.title')}</h1>
      <form method="get">
        <label>{t('audit.from')} <input type="date" name="from" defaultValue={from} /></label>
        <label>{t('audit.to')} <input type="date" name="to" defaultValue={to} /></label>
        <button type="submit">{t('audit.filter')}</button>
      </form>
      {rows.length === 0 ? <p>{t('audit.empty')}</p> : (
        <table>
          <thead><tr><th>{t('audit.colDate')}</th><th>{t('audit.colAction')}</th><th>{t('audit.colActor')}</th><th>{t('audit.colTarget')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td><time dateTime={r.createdAt.toISOString()}>{formatDateTime(r.createdAt, locale, timeZone)}</time></td><td>{r.action}</td><td>{r.actorUserId}</td><td>{r.targetId}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
