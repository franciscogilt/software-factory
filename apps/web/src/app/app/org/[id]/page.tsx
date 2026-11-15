import { listMembers } from '@factory/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getT } from '@/i18n/server';
import { getDb, requireOrgRole } from '@/lib/guard';
import { ResetForm } from './reset-form';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const { t } = await getT();
  const members = await listMembers(getDb(), id);
  const withTwoStep = members.filter((m) => m.twoStep === 'active').length;
  const isOwner = result.role === 'owner';
  return (
    <main>
      <h1>{t('org.members')}</h1>
      {reset === 'ok' && <p role="status">{t('org.resetDone')}</p>}
      <p>
        {t('org.summary', { count: members.length, withTwoStep })} <Link href={`/app/org/${id}/reports`}>{t('reports.viewReports')}</Link> · <Link href={`/app/org/${id}/audit`}>{t('org.viewAudit')}</Link> · <Link href={`/app/org/${id}/jobs`}>{t('org.viewJobs')}</Link>
      </p>
      {members.length === 0 ? <p>{t('org.noMembers')}</p> : (
        <table>
          <thead><tr><th>{t('org.colName')}</th><th>{t('org.colEmail')}</th><th>{t('org.colRole')}</th><th>{t('org.colTwoStep')}</th>{isOwner && <th>{t('org.colActions')}</th>}</tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>{m.name}</td><td>{m.email}</td><td>{t(`org.role.${m.role}`)}</td><td>{t(`org.twoStep.${m.twoStep}`)}</td>
                {isOwner && <td>{m.twoStep !== 'off' && <ResetForm organizationId={id} userId={m.userId} label={m.email ?? m.userId} />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
