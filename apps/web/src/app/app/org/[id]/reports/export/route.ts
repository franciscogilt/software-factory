import { exportActivity, exportMembers, hitRateLimit, orgReport, organizations, recordAudit } from '@factory/db';
import { timedFlow } from '@factory/jobs';
import { eq } from 'drizzle-orm';
import { formatDateTime, formatSettings } from '@/i18n/format';
import { getT } from '@/i18n/server';
import { toCsv } from '@/lib/csv';
import { reportRange } from '@/lib/dates';
import { auth } from '@/lib/auth';
import { getDb, requireOrgRole } from '@/lib/guard';
import { buildPdf, type PdfSection } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['summary', 'members', 'activity'] as const;
const FORMATS = ['csv', 'pdf'] as const;
type Kind = (typeof KINDS)[number];
type Format = (typeof FORMATS)[number];

type Table = { header: string[]; rows: (string | number | null)[][] };

function text(status: number, body: string): { value: Response; outcome: 'limited' } {
  return { value: new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }), outcome: 'limited' };
}

// Downloads a report as CSV or PDF. Same rules as the page: admin or owner of this organization with a verified
// second step. Every export is limited per user and written to the audit log.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return timedFlow(getDb(), 'export', () => handle(request, id));
}

async function handle(request: Request, id: string): Promise<{ value: Response; outcome: 'success' | 'limited' }> {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') as Kind;
  const format = url.searchParams.get('format') as Format;
  if (!UUID.test(id) || !KINDS.includes(kind) || !FORMATS.includes(format)) return text(400, 'Bad request');

  const { t, locale } = await getT();
  const allowed = await requireOrgRole(id, 'admin');
  const session = await auth();
  if (!allowed.allowed || !session?.user?.id) return text(403, t('reports.forbidden'));

  const db = getDb();
  const limit = await hitRateLimit(db, { key: `export:${session.user.id}`, limit: 20, windowMs: 10 * 60_000 });
  if (!limit.allowed) return text(429, t('reports.tooMany'));

  const { timeZone } = formatSettings();
  const range = reportRange(url.searchParams.get('from') ?? undefined, url.searchParams.get('to') ?? undefined);
  const fmt = (d: Date) => formatDateTime(d, locale, timeZone);
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, id));
  const subtitle = t('reports.generatedFor', { org: org?.name ?? '', from: range.fromDay, to: range.toDay });

  let table: Table;
  let sections: PdfSection[];
  if (kind === 'members') {
    const rows = await exportMembers(db, id);
    table = {
      header: [t('org.colName'), t('org.colEmail'), t('org.colRole'), t('org.colTwoStep'), t('reports.colJoined')],
      rows: rows.map((r) => [r.name, r.email, t(`org.role.${r.role}`), t(`org.twoStep.${r.twoStep}`), fmt(r.joinedAt)]),
    };
    sections = [{ heading: t('reports.exportMembers'), lines: table.rows.map((r) => r.filter(Boolean).join(' | ')) }];
  } else if (kind === 'activity') {
    const rows = await exportActivity(db, { organizationId: id, from: range.from, to: range.to });
    table = {
      header: [t('audit.colDate'), t('audit.colAction'), t('reports.colActorEmail'), t('reports.colTargetType'), t('reports.colTargetId')],
      rows: rows.map((r) => [fmt(r.at), r.action, r.actorEmail, r.targetType, r.targetId]),
    };
    sections = [{ heading: t('reports.exportActivity'), lines: table.rows.length ? table.rows.map((r) => r.filter(Boolean).join(' | ')) : [t('reports.noActivity')] }];
  } else {
    const r = await orgReport(db, { organizationId: id, from: range.from, to: range.to, timeZone });
    const metrics: [string, string | number][] = [
      [t('reports.membersTotal'), r.members.total],
      [t('reports.newMembers'), r.members.newInRange],
      [t('reports.twoStepAdoption'), `${r.members.twoStepActive} / ${r.members.total}`],
      [t('org.role.owner'), r.members.byRole.owner],
      [t('org.role.admin'), r.members.byRole.admin],
      [t('org.role.member'), r.members.byRole.member],
      [t('reports.activityTotal'), r.activity.total],
      [t('reports.jobsCreated'), r.jobs.createdInRange],
      [t('reports.jobsDead'), r.jobs.dead],
    ];
    table = { header: [t('reports.metric'), t('reports.value')], rows: metrics };
    sections = [
      { heading: t('reports.exportSummary'), lines: metrics.map(([k, v]) => `${k}: ${v}`) },
      { heading: t('reports.byDay'), lines: r.activity.byDay.length ? r.activity.byDay.map((d) => `${d.day}: ${d.count}`) : [t('reports.noActivity')] },
      { heading: t('reports.topActions'), lines: r.activity.byAction.map((a) => `${a.action}: ${a.count}`) },
    ];
  }

  await recordAudit(db, {
    organizationId: id,
    actorUserId: session.user.id,
    action: 'report.exported',
    targetType: 'report',
    targetId: kind,
    metadata: { format, from: range.fromDay, to: range.toDay, rows: table.rows.length },
  });

  const filename = `${kind}-${range.fromDay}_${range.toDay}.${format}`;
  const headers = { 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' };
  if (format === 'csv') {
    return { value: new Response(toCsv(table.header, table.rows), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8' } }), outcome: 'success' };
  }
  const pdf = await buildPdf(`${t('reports.title')} - ${t(kind === 'members' ? 'reports.exportMembers' : kind === 'activity' ? 'reports.exportActivity' : 'reports.exportSummary')}`, subtitle, sections);
  return { value: new Response(pdf as BodyInit, { headers: { ...headers, 'content-type': 'application/pdf' } }), outcome: 'success' };
}
