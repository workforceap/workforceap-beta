import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import DataTable from '@/components/portal/ui/DataTable';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { loadB4BPrograms } from '@/lib/coursera/programContentsCache';
import { prisma } from '@/lib/db/prisma';
import { loadSyncDriftPairs } from '@/lib/admin/courseraSyncDrift';
import { buildCompletionDriftQuery, buildCourseProgramIndex, courseMatchesAssignedProgram, type DiagnosticProgram } from '@/lib/admin/courseraDiagnostics';
import IgnoredXapiSummaryCard from '@/components/admin/IgnoredXapiSummaryCard';
import { auditCourseraLinkHealth } from '@/lib/coursera/linkHealth';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import {
  buildCatalogCoverageReport,
  catalogCoverageIssueLabel,
} from '@/lib/content/coursera/catalogCoverage';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Coursera health',
    description:
      'Read-only diagnostics for the Coursera ingest pipeline: canonical mappings, xAPI traffic, B4B sync state, and the most-ignored signals over the last 7 days.',
    path: '/admin/coursera/health',
  });
}

export const dynamic = 'force-dynamic';

// Cron workflow keys we care about on this page. These match the keys written
// by the Coursera-related cron routes via recordWorkflowDiagnostic / withCronLogging.
const COURSERA_CRON_WORKFLOW_KEYS = [
  'cron_coursera_b4b_sync',
  'cron_coursera_sync',
  'cron_coursera_training_sync',
] as const;

type CardSeverity = 'ok' | 'warn' | 'bad';

type SummaryCard = {
  title: string;
  primary: string;
  secondary?: string;
  hint?: string;
  severity: CardSeverity;
};

type CronRunRow = {
  id: string;
  workflow: string;
  status: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  ranAt: Date;
};

type IgnoredSlugRow = {
  courseSlug: string;
  eventCount: number;
};

type UnmatchedActorRow = {
  actorEmail: string;
  eventCount: number;
};

type DriftRow = {
  key: string;
  email: string;
  courseName: string;
  localProgramSlug: string;
  providerCompleted: boolean;
  localCompleted: boolean;
  lastActivityTime: Date | null;
};

type OutOfCatalogRow = {
  courseSlug: string;
  eventCount: number;
  distinctLearners: number;
  lastSeen: Date | null;
};

type WrongProgramRow = {
  key: string;
  email: string;
  primaryProgramSlug: string | null;
  courseStudied: string;
  courseStudiedProgram: string;
  eventCount: number;
};

function fmtDateTime(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleString();
}

function relativeAge(value: Date | null | undefined, now: Date): string {
  if (!value) return 'never';
  const diffMs = now.getTime() - value.getTime();
  if (diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function severityBackground(severity: CardSeverity): string {
  switch (severity) {
    case 'bad':
      return 'rgba(239, 68, 68, 0.10)';
    case 'warn':
      return 'rgba(251, 191, 36, 0.12)';
    case 'ok':
    default:
      return 'var(--color-light)';
  }
}

function severityBorder(severity: CardSeverity): string {
  switch (severity) {
    case 'bad':
      return '1px solid rgba(239, 68, 68, 0.45)';
    case 'warn':
      return '1px solid rgba(251, 191, 36, 0.45)';
    case 'ok':
    default:
      return '1px solid var(--outline-variant)';
  }
}

function severityAccent(severity: CardSeverity): string {
  switch (severity) {
    case 'bad':
      return 'rgb(220, 38, 38)';
    case 'warn':
      return 'rgb(217, 119, 6)';
    case 'ok':
    default:
      return 'var(--color-accent)';
  }
}

function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? singular + 's'}`;
}

async function loadCanonicalMappingCount(): Promise<number | null> {
  try {
    return await prisma.courseraCanonicalCourseMapping.count();
  } catch (error) {
    console.error('[admin/coursera/health] canonical mapping count failed:', error);
    return null;
  }
}

async function loadXapiTrafficSummary(now: Date, organizationId: string | null): Promise<{
  total: number;
  processed: number;
  unprocessed: number;
} | null> {
  try {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [total, processed] = await Promise.all([
      prisma.xapiStatement.count({ where: { createdAt: { gte: since }, ...(organizationId === null ? {} : { organizationId }) } }),
      prisma.xapiStatement.count({
        where: { createdAt: { gte: since }, processed: true, ...(organizationId === null ? {} : { organizationId }) },
      }),
    ]);
    return { total, processed, unprocessed: total - processed };
  } catch (error) {
    console.error('[admin/coursera/health] xapi traffic summary failed:', error);
    return null;
  }
}

async function loadB4bSummary(organizationId: string | null): Promise<{
  total: number;
  latestSyncedAt: Date | null;
  latestActivityAt: Date | null;
} | null> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ total: bigint | number; latestSync: Date | null; latestActivity: Date | null }>
    >`
      SELECT
        COUNT(*)::bigint AS total,
        MAX(last_synced_at) AS "latestSync",
        MAX(last_activity_time) AS "latestActivity"
      FROM coursera_course_progress
      WHERE source = 'b4b_sync'
        AND (${organizationId}::text IS NULL OR organization_id = ${organizationId})
    `;
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      latestSyncedAt: row?.latestSync ?? null,
      latestActivityAt: row?.latestActivity ?? null,
    };
  } catch (error) {
    console.error('[admin/coursera/health] B4B summary failed:', error);
    return null;
  }
}

async function loadIgnoredRatio(now: Date, organizationId: string | null): Promise<{
  total: number;
  ignored: number;
} | null> {
  try {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<Array<{ total: bigint | number; ignored: bigint | number }>>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE completion_status = 'ignored')::bigint AS ignored
      FROM coursera_xapi_events
      WHERE received_at >= ${since}
        AND (${organizationId}::text IS NULL OR organization_id = ${organizationId})
    `;
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      ignored: Number(row?.ignored ?? 0),
    };
  } catch (error) {
    console.error('[admin/coursera/health] ignored ratio failed:', error);
    return null;
  }
}

async function loadRecentCronRuns(): Promise<CronRunRow[] | null> {
  try {
    const rows = await prisma.workflowDiagnostic.findMany({
      where: { workflow: { in: [...COURSERA_CRON_WORKFLOW_KEYS] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        workflow: true,
        status: true,
        summary: true,
        metadata: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      workflow: r.workflow,
      status: r.status,
      summary: r.summary,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      ranAt: r.createdAt,
    }));
  } catch (error) {
    console.error('[admin/coursera/health] cron runs load failed:', error);
    return null;
  }
}

async function loadTopIgnoredSlugs(now: Date, organizationId: string | null): Promise<IgnoredSlugRow[] | null> {
  try {
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<Array<{ courseSlug: string | null; eventCount: bigint | number }>>`
      SELECT
        course_slug AS "courseSlug",
        COUNT(*)::bigint AS "eventCount"
      FROM coursera_xapi_events
      WHERE completion_status = 'ignored'
        AND (${organizationId}::text IS NULL OR organization_id = ${organizationId})
        AND received_at >= ${since}
        AND course_slug IS NOT NULL
        AND course_slug <> ''
      GROUP BY course_slug
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `;
    return rows
      .filter((r): r is { courseSlug: string; eventCount: bigint | number } => Boolean(r.courseSlug))
      .map((r) => ({
        courseSlug: r.courseSlug,
        eventCount: Number(r.eventCount ?? 0),
      }));
  } catch (error) {
    console.error('[admin/coursera/health] top ignored slugs failed:', error);
    return null;
  }
}

async function loadTopUnmatchedActors(now: Date, organizationId: string | null): Promise<UnmatchedActorRow[] | null> {
  try {
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<Array<{ actorEmail: string | null; eventCount: bigint | number }>>`
      SELECT
        LOWER(actor_email) AS "actorEmail",
        COUNT(*)::bigint AS "eventCount"
      FROM coursera_xapi_events
      WHERE matched_user_id IS NULL
        AND (${organizationId}::text IS NULL OR organization_id = ${organizationId})
        AND received_at >= ${since}
        AND actor_email IS NOT NULL
        AND actor_email <> ''
      GROUP BY LOWER(actor_email)
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `;
    return rows
      .filter((r): r is { actorEmail: string; eventCount: bigint | number } => Boolean(r.actorEmail))
      .map((r) => ({
        actorEmail: r.actorEmail,
        eventCount: Number(r.eventCount ?? 0),
      }));
  } catch (error) {
    console.error('[admin/coursera/health] top unmatched actors failed:', error);
    return null;
  }
}

// ─── B4B vs xAPI cross-check loaders ──────────────────────────────────────
//
// These four queries surface drift between the two Coursera data sources we
// now run in parallel (B4B sync → coursera_course_progress; xAPI webhook →
// coursera_xapi_events + course_progress). Failed checks remain unavailable,
// distinct from a successful check with no findings.

async function loadB4BvsOursDrift(organizationId: string | null): Promise<DriftRow[] | null> {
  try {
    return await prisma.$queryRaw<DriftRow[]>(buildCompletionDriftQuery(organizationId));
  } catch (error) {
    console.error('[admin/coursera/health] B4B vs ours drift failed:', error);
    return null;
  }
}

async function loadOutOfCatalogXapi(
  now: Date,
  b4bCourseSlugs: Set<string>,
  organizationId: string | null,
): Promise<OutOfCatalogRow[] | null> {
  try {
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<
      Array<{
        courseSlug: string | null;
        eventCount: bigint | number;
        distinctLearners: bigint | number;
        lastSeen: Date | null;
      }>
    >`
      SELECT
        course_slug AS "courseSlug",
        COUNT(*)::bigint AS "eventCount",
        COUNT(DISTINCT COALESCE(matched_user_id, LOWER(actor_email), actor_identifier))::bigint AS "distinctLearners",
        MAX(received_at) AS "lastSeen"
      FROM coursera_xapi_events
      WHERE received_at >= ${since}
        AND (${organizationId}::text IS NULL OR organization_id = ${organizationId})
        AND course_slug IS NOT NULL
        AND course_slug <> ''
      GROUP BY course_slug
      ORDER BY COUNT(*) DESC
    `;
    // Filter in JS — the B4B program list comes from an in-memory cache that
    // the SQL layer can't see.
    return rows
      .filter((r): r is { courseSlug: string; eventCount: bigint | number; distinctLearners: bigint | number; lastSeen: Date | null } => Boolean(r.courseSlug))
      .filter((r) => !b4bCourseSlugs.has(r.courseSlug))
      .slice(0, 20)
      .map((r) => ({
        courseSlug: r.courseSlug,
        eventCount: Number(r.eventCount ?? 0),
        distinctLearners: Number(r.distinctLearners ?? 0),
        lastSeen: r.lastSeen,
      }));
  } catch (error) {
    console.error('[admin/coursera/health] out-of-catalog xapi failed:', error);
    return null;
  }
}

async function loadWrongProgramStudying(
  now: Date,
  slugToProgram: Map<string, DiagnosticProgram[]>,
  organizationId: string | null,
): Promise<WrongProgramRow[] | null> {
  try {
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<
      Array<{
        userId: string;
        email: string | null;
        courseSlug: string;
        primaryProgramSlug: string | null;
        assignedPrograms: string[];
        eventCount: bigint | number;
      }>
    >`
      SELECT
        cxe.matched_user_id AS "userId",
        u.email AS "email",
        cxe.course_slug AS "courseSlug",
        MAX(ce.program_slug) FILTER (WHERE ce.is_primary) AS "primaryProgramSlug",
        ARRAY_AGG(DISTINCT ce.program_slug) FILTER (WHERE ce.program_slug IS NOT NULL) AS "assignedPrograms",
        COUNT(DISTINCT cxe.id)::bigint AS "eventCount"
      FROM coursera_xapi_events cxe
      JOIN users u ON u.id = cxe.matched_user_id
      LEFT JOIN course_enrollments ce
        ON ce.user_id = cxe.matched_user_id AND ce.organization_id = u.organization_id
      WHERE cxe.received_at >= ${since}
        AND u.deleted_at IS NULL
        AND (${organizationId}::text IS NULL OR (u.organization_id = ${organizationId} AND cxe.organization_id = ${organizationId}))
        AND cxe.matched_user_id IS NOT NULL
        AND cxe.course_slug IS NOT NULL
        AND cxe.course_slug <> ''
      GROUP BY cxe.matched_user_id, u.email, cxe.course_slug
      ORDER BY COUNT(*) DESC
      LIMIT 200
    `;
    const findings: WrongProgramRow[] = [];
    for (const r of rows) {
      const programs = slugToProgram.get(r.courseSlug);
      if (!programs || !r.assignedPrograms?.length) continue;
      if (courseMatchesAssignedProgram(programs, r.assignedPrograms)) continue;
      findings.push({
        key: `${r.userId}::${r.courseSlug}`,
        email: r.email ?? '(unknown)',
        primaryProgramSlug: r.primaryProgramSlug,
        courseStudied: r.courseSlug,
        courseStudiedProgram: programs.map((program) => program.slug ?? program.name).join(', '),
        eventCount: Number(r.eventCount ?? 0),
      });
      if (findings.length >= 20) break;
    }
    return findings;
  } catch (error) {
    console.error('[admin/coursera/health] wrong-program studying failed:', error);
    return null;
  }
}

async function loadB4BProgramsSafe(): Promise<
  Awaited<ReturnType<typeof loadB4BPrograms>> | null
> {
  try {
    const programs = await loadB4BPrograms();
    // This cache collapses provider failure into []; do not treat that as a
    // verified empty catalog or derive out-of-catalog findings from it.
    return programs.some((program) => program.courses.length > 0) ? programs : null;
  } catch (error) {
    console.error('[admin/coursera/health] loadB4BPrograms failed:', error);
    return null;
  }
}

const cardStyle: CSSProperties = {
  padding: '1.1rem 1.2rem',
  borderRadius: 'var(--radius-md)',
  display: 'grid',
  gap: '0.45rem',
  minHeight: 0,
};

const cardTitleStyle: CSSProperties = {
  fontSize: '0.8125rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  color: 'var(--color-on-surface-variant)',
};

const cardPrimaryStyle: CSSProperties = {
  fontSize: '1.65rem',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.1,
};

const cardSecondaryStyle: CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--color-on-surface-variant)',
};

const cardHintStyle: CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  marginTop: '0.15rem',
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  margin: '0 0 0.6rem 0',
};

const sectionStyle: CSSProperties = {
  padding: '1.1rem 1.2rem',
  marginBottom: '1rem',
};

function pickStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'success') return 'rgb(22, 163, 74)';
  if (s === 'started') return 'var(--color-on-surface-variant)';
  if (s === 'fallback') return 'rgb(217, 119, 6)';
  if (s === 'inspection') return 'var(--color-on-surface-variant)';
  return 'rgb(220, 38, 38)'; // error / unknown
}

function summarizeMetadataCounts(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '—';
  // Pull a handful of common count-ish fields if present, in priority order.
  const interestingKeys = [
    'rowsUpserted',
    'rowsWritten',
    'rowsProcessed',
    'rowsRead',
    'enrollmentsProcessed',
    'membersProcessed',
    'updated',
    'created',
    'skipped',
    'errors',
    'matched',
    'unmatched',
    'count',
    'durationMs',
  ];
  const parts: string[] = [];
  for (const key of interestingKeys) {
    const v = metadata[key];
    if (typeof v === 'number') {
      parts.push(`${key}=${v}`);
    } else if (typeof v === 'string' && /^\d+$/.test(v)) {
      parts.push(`${key}=${v}`);
    }
    if (parts.length >= 4) break;
  }
  if (parts.length === 0) return '—';
  return parts.join(' · ');
}

export default async function AdminCourseraHealthPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/coursera/health');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  if (readOnlyAudit) {
    return (
      <PortalPageFrame>
        <div data-portal-audit-suppressed="admin-coursera-health-ddl-and-external-sync">
          <PageHeader
            title="Coursera health"
            subtitle="xAPI, mapping, and Business-program diagnostics"
          />
          <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
            <p style={{ marginTop: 0 }}>
              The route and admin access shell are verified here. DDL probes and Coursera API calls are reserved for the
              attended Coursera health check.
            </p>
            <Link href="/admin/coursera" className="btn btn-outline btn-sm">Coursera admin</Link>
          </div>
        </div>
      </PortalPageFrame>
    );
  }

  const now = new Date();
  const organizationId = scope.superAdmin ? null : scope.orgId;

  const [
    canonicalCount,
    xapiTraffic,
    b4bSummary,
    ignoredRatio,
    cronRuns,
    topIgnoredSlugs,
    topUnmatchedActors,
    b4bPrograms,
    driftRows,
    syncDrift,
    linkHealth,
  ] = await Promise.all([
    loadCanonicalMappingCount(),
    loadXapiTrafficSummary(now, organizationId),
    loadB4bSummary(organizationId),
    loadIgnoredRatio(now, organizationId),
    scope.superAdmin ? loadRecentCronRuns() : Promise.resolve(null),
    loadTopIgnoredSlugs(now, organizationId),
    loadTopUnmatchedActors(now, organizationId),
    loadB4BProgramsSafe(),
    loadB4BvsOursDrift(organizationId),
    loadSyncDriftPairs((sql) => prisma.$queryRaw(sql), { organizationId }),
    !scope.superAdmin
      ? Promise.resolve(null)
      : auditCourseraLinkHealth().catch((error) => {
          console.error('[admin/coursera/health] link health failed:', error);
          return null;
        }),
  ]);

  // Build the B4B course-slug index used by the out-of-catalog and wrong-
  // program checks. We do this once and pass it into both loaders so a single
  // B4B fetch supports two cross-checks.
  const slugToProgram = buildCourseProgramIndex(b4bPrograms ?? []);
  const b4bCourseSlugs = new Set(slugToProgram.keys());
  const [outOfCatalogRows, wrongProgramRows] = b4bPrograms === null
    ? [null, null]
    : await Promise.all([
        loadOutOfCatalogXapi(now, b4bCourseSlugs, organizationId),
        loadWrongProgramStudying(now, slugToProgram, organizationId),
      ]);

  const lastB4bCron = cronRuns?.find((r) => r.workflow === 'cron_coursera_b4b_sync');
  const lastB4bCronFailed = lastB4bCron?.status === 'error';

  const catalogCoverage = buildCatalogCoverageReport();

  // --- Build the four summary cards. ---

  const cards: SummaryCard[] = [];

  // Card 1: canonical mappings
  if (canonicalCount === null) {
    cards.push({
      title: 'Canonical mappings',
      primary: '—',
      secondary: 'Unable to load count',
      severity: 'bad',
    });
  } else {
    const isZero = canonicalCount === 0;
    cards.push({
      title: 'Canonical mappings',
      primary: canonicalCount.toLocaleString(),
      secondary: isZero
        ? 'CourseraCanonicalCourseMapping is empty'
        : `${pluralize(canonicalCount, 'row')} in CourseraCanonicalCourseMapping`,
      hint: isZero
        ? 'No database canonical mappings. Static or versioned course mappings may still resolve events; inspect mapping coverage below.'
        : undefined,
      severity: isZero ? 'bad' : 'ok',
    });
  }

  // Card 1b: committed catalog coverage (curated vs discovered)
  {
    const { summary } = catalogCoverage;
    const severity: CardSeverity =
      summary.missingDiscoveredCatalog > 0 || summary.missingLearningPathIds > 0
        ? 'warn'
        : summary.pathsWithCourseDrift > 0
          ? 'warn'
          : 'ok';
    cards.push({
      title: 'Catalog coverage',
      primary: `${summary.pathsWithIssues}/${summary.pathCount}`,
      secondary: `${summary.pathsWithIssues} path(s) with gaps · drift ${summary.pathsWithCourseDrift}`,
      hint:
        severity === 'warn'
          ? 'Curated Curriculum download vs discovered catalog — see table below. Refreshing course lists changes member progress keys.'
          : undefined,
      severity,
    });
  }

  // Card 2: xAPI events 24h
  if (!xapiTraffic) {
    cards.push({
      title: 'xAPI events (last 24h)',
      primary: '—',
      secondary: 'Unable to load xAPI counts',
      severity: 'bad',
    });
  } else {
    const { total, processed, unprocessed } = xapiTraffic;
    const unprocessedRatio = total > 0 ? unprocessed / total : 0;
    const severity: CardSeverity =
      total === 0 ? 'warn' : unprocessedRatio > 0.2 ? 'warn' : 'ok';
    cards.push({
      title: 'xAPI events (last 24h)',
      primary: total.toLocaleString(),
      secondary:
        total === 0
          ? 'No xAPI traffic in 24h'
          : `processed=${processed.toLocaleString()} · unprocessed=${unprocessed.toLocaleString()} (${(
              unprocessedRatio * 100
            ).toFixed(1)}%)`,
      hint:
        severity === 'warn' && total > 0
          ? 'More than 20% of recent xAPI rows are unprocessed.'
          : severity === 'warn'
            ? 'No traffic — confirm Coursera webhook is firing.'
            : undefined,
      severity,
    });
  }

  // Card 3: B4B course rows
  if (!b4bSummary) {
    cards.push({
      title: 'B4B course rows',
      primary: '—',
      secondary: 'Unable to load coursera_course_progress',
      severity: 'bad',
    });
  } else {
    const lastSync = b4bSummary.latestSyncedAt;
    const lastSyncMs = lastSync ? now.getTime() - lastSync.getTime() : null;
    const isStale = lastSyncMs === null ? true : lastSyncMs > 12 * 60 * 60 * 1000;
    let severity: CardSeverity = b4bSummary.total === 0 || isStale ? 'warn' : 'ok';
    if (lastB4bCronFailed) severity = 'bad';

    const hintParts: string[] = [];
    if (b4bSummary.total === 0) {
      hintParts.push('No B4B course rows recorded in this scope. This does not prove the cron never ran.');
    } else if (isStale) {
      hintParts.push('No B4B row write in the last 12h. Check job receipts; quiet or unchanged data can also explain this.');
    }
    if (lastB4bCronFailed) {
      hintParts.push(
        'Latest cron_coursera_b4b_sync run logged an error — see workflow diagnostics below.',
      );
    }

    cards.push({
      title: 'B4B course rows',
      primary: b4bSummary.total.toLocaleString(),
      secondary: lastSync
        ? `last row write ${fmtDateTime(lastSync)} (${relativeAge(lastSync, now)})`
        : 'no B4B row-write timestamp on file',
      hint: hintParts.length > 0 ? hintParts.join(' ') : undefined,
      severity: cronRuns === null ? 'warn' : severity,
    });
  }

  // Card 4: xAPI ignored ratio 24h
  if (!ignoredRatio) {
    cards.push({
      title: 'xAPI ignored ratio (24h)',
      primary: '—',
      secondary: 'Unable to load coursera_xapi_events',
      severity: 'bad',
    });
  } else {
    const { total, ignored } = ignoredRatio;
    const ratio = total > 0 ? ignored / total : 0;
    const severity: CardSeverity = total === 0 ? 'ok' : ratio > 0.5 ? 'bad' : ratio > 0.2 ? 'warn' : 'ok';
    cards.push({
      title: 'xAPI ignored ratio (24h)',
      primary: total === 0 ? '—' : `${(ratio * 100).toFixed(1)}%`,
      secondary:
        total === 0
          ? 'No coursera_xapi_events in 24h'
          : `ignored=${ignored.toLocaleString()} of ${total.toLocaleString()}`,
      hint:
        severity === 'bad'
          ? 'Most events are being ignored — likely missing canonical mappings.'
          : undefined,
      severity,
    });
  }

  // Card 5: Coursera → portal identity link coverage
  if (!linkHealth) {
    cards.push({
      title: 'Member link coverage',
      primary: '—',
      secondary: 'Unable to load link health',
      severity: 'bad',
    });
  } else {
    const orphanTotal =
      linkHealth.courseProgress.orphan + linkHealth.badgeProgress.orphan;
    const healable =
      linkHealth.healableOrphans.courseProgress +
      linkHealth.healableOrphans.badgeProgress;
    const unmatched = linkHealth.xapiEvents.unmatched;
    const severity: CardSeverity =
      unmatched > 0 || healable > 0 ? 'warn' : orphanTotal > 0 ? 'warn' : 'ok';
    cards.push({
      title: 'Member link coverage',
      primary: `${linkHealth.identityMappings.toLocaleString()} maps`,
      secondary: `course ${linkHealth.courseProgress.linked}/${linkHealth.courseProgress.total} linked · badge ${linkHealth.badgeProgress.linked}/${linkHealth.badgeProgress.total} · xAPI unmatched ${unmatched}`,
      hint:
        healable > 0
          ? `${healable} orphan row(s) already have a mapping — run Backfill orphans on /admin/coursera.`
          : unmatched > 0
            ? 'Unmatched xAPI actors need identity mappings under /admin/coursera.'
            : undefined,
      severity,
    });
  }

  return (
    <PortalPageFrame>
      <PageHeader
        title="Coursera health"
        subtitle="Read-only diagnostics for the xAPI ingest, canonical mappings, and B4B sync. Updated on every page load."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Coursera', href: '/admin/coursera' },
          { label: 'Health' },
        ]}
        action={
          <Link href="/admin/coursera/enrollment" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
            Enrollment pipeline →
          </Link>
        }
      />

      {/* Section 1 — health summary cards. */}
      <section
        aria-label="Coursera ingest health summary"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1rem',
        }}
      >
        {cards.map((card) => (
          <div
            key={card.title}
            className="content-card"
            style={{
              ...cardStyle,
              background: severityBackground(card.severity),
              border: severityBorder(card.severity),
            }}
          >
            <span style={cardTitleStyle}>{card.title}</span>
            <span style={{ ...cardPrimaryStyle, color: severityAccent(card.severity) }}>
              {card.primary}
            </span>
            {card.secondary ? <span style={cardSecondaryStyle}>{card.secondary}</span> : null}
            {card.hint ? (
              <span style={{ ...cardHintStyle, color: severityAccent(card.severity) }}>
                {card.hint}
              </span>
            ) : null}
          </div>
        ))}
      </section>

      {/* Section 1.5 — ignored xAPI events (top stuck slugs). */}
      <section style={{ marginBottom: '1rem' }}>
        <IgnoredXapiSummaryCard />
      </section>

      {/* Section 1.6 — committed Coursera catalog coverage (no live API). */}
      <section className="content-card" style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Learning Path catalog coverage</h2>
        <p style={{ ...cardSecondaryStyle, marginBottom: '0.6rem' }}>
          Compares the committed Curriculum download, Learning Path registry, and{' '}
          <code>courseraDiscoveredCatalog</code>. No live Coursera call. Course-list
          refreshes change member-visible progress keys — treat drift as ops work, not a
          silent rewrite.
        </p>
        {catalogCoverage.summary.pathsWithIssues === 0 ? (
          <span style={cardSecondaryStyle}>All registered paths match curated membership and the discovered catalog.</span>
        ) : (
          <DataTable
            density="compact"
            rows={catalogCoverage.rows.filter((row) => row.issues.length > 0)}
            rowKey={(row) => row.collectionId}
            columns={[
              {
                key: 'collection',
                header: 'Collection',
                cell: (row) => (
                  <>
                    <code>{row.collectionId}</code>
                    <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.15rem' }}>
                      {row.name}
                    </div>
                    {!row.learningPathId ? (
                      <div style={{ color: 'var(--color-warn, #b45309)', marginTop: '0.15rem' }}>
                        No Learning Path ID registered
                      </div>
                    ) : null}
                  </>
                ),
              },
              {
                key: 'program',
                header: 'WAP program',
                cell: (row) => (row.programSlug ? <code>{row.programSlug}</code> : '—'),
              },
              {
                key: 'curated',
                header: 'Curated',
                cell: (row) => row.curatedCourseCount,
              },
              {
                key: 'discovered',
                header: 'Discovered',
                cell: (row) => (
                  <>
                    {row.discoveredCourseCount === null ? '—' : row.discoveredCourseCount}
                    {row.curatedOnlyCourseIds.length > 0 ? (
                      <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.15rem' }}>
                        +{row.curatedOnlyCourseIds.length} curated-only
                      </div>
                    ) : null}
                    {row.discoveredOnlyCourseIds.length > 0 ? (
                      <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.15rem' }}>
                        +{row.discoveredOnlyCourseIds.length} discovered-only
                      </div>
                    ) : null}
                  </>
                ),
              },
              {
                key: 'issues',
                header: 'Issues',
                cell: (row) =>
                  row.issues.map((issue) => catalogCoverageIssueLabel(issue)).join(' · '),
              },
            ]}
          />
        )}
      </section>

      {/* Section 2 — recent cron runs. */}
      <section className="content-card" style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Recent Coursera cron runs</h2>
        <p style={{ ...cardSecondaryStyle, marginBottom: '0.6rem' }}>
          Last 20 entries from <code>workflow_diagnostics</code> for{' '}
          <code>cron_coursera_b4b_sync</code>, <code>cron_coursera_sync</code>, and{' '}
          <code>cron_coursera_training_sync</code>.
        </p>
        {cronRuns === null ? (
          <p role="status" style={cardSecondaryStyle}>Job diagnostics unavailable in this view. Platform administrators can inspect scheduled-run receipts.</p>
        ) : cronRuns.length === 0 ? (
          <span style={cardSecondaryStyle}>
            No cron run history found. The cron jobs have not logged a diagnostic recently.
          </span>
        ) : (
          <DataTable
            density="compact"
            rows={cronRuns}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'workflow',
                header: 'Workflow',
                cell: (row) => <code style={{ fontSize: '0.85rem' }}>{row.workflow}</code>,
              },
              {
                key: 'status',
                header: 'Status',
                cell: (row) => (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      padding: '0.1rem 0.4rem',
                      borderRadius: '0.4rem',
                      color: pickStatusColor(row.status),
                      background: 'var(--color-light)',
                    }}
                  >
                    {row.status}
                  </span>
                ),
              },
              {
                key: 'summary',
                header: 'Summary',
                cell: (row) => (
                  <span style={{ fontSize: '0.85rem' }}>{row.summary || '—'}</span>
                ),
              },
              {
                key: 'metadata',
                header: 'Result counts',
                cell: (row) => (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--color-on-surface-variant)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {summarizeMetadataCounts(row.metadata)}
                  </span>
                ),
              },
              {
                key: 'ran',
                header: 'Ran at',
                cell: (row) => (
                  <span style={{ fontSize: '0.85rem' }}>
                    {fmtDateTime(row.ranAt)}{' '}
                    <span style={{ color: 'var(--color-on-surface-variant)' }}>
                      ({relativeAge(row.ranAt, now)})
                    </span>
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>

      {/* Section 3 — top ignored course slugs (7d). */}
      <section className="content-card" style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Top ignored course slugs (last 7 days)</h2>
        <p style={{ ...cardSecondaryStyle, marginBottom: '0.6rem' }}>
          xAPI events whose <code>completion_status = &apos;ignored&apos;</code>, grouped by{' '}
          <code>course_slug</code>. Each row links to the Coursera admin where you can wire it up
          via the canonical course mapping table.
        </p>
        {topIgnoredSlugs === null ? (
          <p role="status" style={cardSecondaryStyle}>Ignored-event check unavailable. No verdict is available.</p>
        ) : topIgnoredSlugs.length === 0 ? (
          <span style={cardSecondaryStyle}>
            No ignored xAPI events with a <code>course_slug</code> in the last 7 days.
          </span>
        ) : (
          <DataTable
            density="compact"
            rows={topIgnoredSlugs}
            rowKey={(row) => row.courseSlug}
            columns={[
              {
                key: 'slug',
                header: 'course_slug',
                cell: (row) => <code style={{ fontSize: '0.85rem' }}>{row.courseSlug}</code>,
              },
              {
                key: 'count',
                header: 'Ignored events',
                align: 'right',
                cell: (row) => (
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {row.eventCount.toLocaleString()}
                  </span>
                ),
              },
              {
                key: 'action',
                header: 'Action',
                cell: () => (
                  <Link href="/admin/coursera?ui=legacy" style={{ fontWeight: 600 }}>
                    Map this →
                  </Link>
                ),
              },
            ]}
          />
        )}
      </section>

      {/* Section 4 — top unmatched actor emails (7d). */}
      <section className="content-card" style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Top unmatched actor emails (last 7 days)</h2>
        <p style={{ ...cardSecondaryStyle, marginBottom: '0.6rem' }}>
          xAPI actors with <code>matched_user_id IS NULL</code>. Each link goes to the
          per-learner unmatched-events page where you can manually bind them.
        </p>
        {topUnmatchedActors === null ? (
          <p role="status" style={cardSecondaryStyle}>Unmatched-actor check unavailable. No verdict is available.</p>
        ) : topUnmatchedActors.length === 0 ? (
          <span style={cardSecondaryStyle}>
            No unmatched xAPI actors in the last 7 days.
          </span>
        ) : (
          <DataTable
            density="compact"
            rows={topUnmatchedActors}
            rowKey={(row) => row.actorEmail}
            columns={[
              {
                key: 'email',
                header: 'actor_email',
                cell: (row) => <code style={{ fontSize: '0.85rem' }}>{row.actorEmail}</code>,
              },
              {
                key: 'count',
                header: 'Events',
                align: 'right',
                cell: (row) => (
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {row.eventCount.toLocaleString()}
                  </span>
                ),
              },
              {
                key: 'action',
                header: 'Action',
                cell: (row) => (
                  <Link
                    href={`/admin/coursera/learners/unmatched/${encodeURIComponent(row.actorEmail)}`}
                    style={{ fontWeight: 600 }}
                  >
                    Inspect →
                  </Link>
                ),
              },
            ]}
          />
        )}
      </section>

      {/* Cross-check intro — B4B vs xAPI alerts. */}
      <section style={{ marginBottom: '0.6rem' }}>
        <h2 style={{ ...sectionHeadingStyle, fontSize: '1.15rem', marginBottom: '0.35rem' }}>
          B4B vs xAPI cross-checks
        </h2>
        <p style={cardSecondaryStyle}>
          These checks compare stored B4B completion and activity evidence with local course records.
          Local progress can also include B4B, CSV, and manual updates. A disagreement needs review;
          it does not identify its cause. Empty results cover only matched rows with comparable evidence.
        </p>
      </section>

      {/* Section 5 — comparable completion observations. */}
      <section className="content-card" style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Course completion disagreements (B4B vs local records)</h2>
        <p style={{ ...cardSecondaryStyle, marginBottom: '0.6rem' }}>
          Compare B4B&apos;s explicit completion flag with the local course completion status.
          B4B percentage values are not compared: an omitted percentage is currently stored as zero.
          Newer local completion can precede provider reporting. These differences are observations,
          not failures, and each local program is shown separately.
        </p>
        {driftRows === null ? (
          <p role="status" style={cardSecondaryStyle}>Completion comparison unavailable. No verdict is available.</p>
        ) : driftRows.length === 0 ? (
          <span style={cardSecondaryStyle}>
            No completion disagreements found among matched B4B and local course rows. Unmatched rows are not covered.
          </span>
        ) : (
          <DataTable
            density="compact"
            rows={driftRows}
            rowKey={(row) => row.key}
            columns={[
              {
                key: 'email',
                header: 'Member',
                cell: (row) => <code style={{ fontSize: '0.85rem' }}>{row.email}</code>,
              },
              {
                key: 'localProgram',
                header: 'Local program',
                cell: (row) => <span>{row.localProgramSlug}</span>,
              },
              {
                key: 'course',
                header: 'Course',
                cell: (row) => <span style={{ fontSize: '0.85rem' }}>{row.courseName}</span>,
              },
              {
                key: 'providerCompleted',
                header: 'B4B completion',
                cell: (row) => row.providerCompleted ? 'Completed' : 'Not completed',
              },
              {
                key: 'localCompleted',
                header: 'Local completion',
                cell: (row) => row.localCompleted ? 'Completed' : 'Not completed',
              },
              {
                key: 'lastActivity',
                header: 'B4B last activity',
                cell: (row) => (
                  <span style={{ fontSize: '0.85rem' }}>{fmtDateTime(row.lastActivityTime)}</span>
                ),
              },
            ]}
          />
        )}
      </section>

      {/* Section 6 — out-of-catalog xAPI activity (7d). */}
      <section className="content-card" style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>xAPI events on out-of-catalog courses (last 7 days)</h2>
        <p style={{ ...cardSecondaryStyle, marginBottom: '0.6rem' }}>
          xAPI events arriving for a <code>course_slug</code> that isn&apos;t in any
          B4B program (per <code>loadB4BPrograms()</code>). Means the learner is on a
          course that&apos;s not in the org&apos;s curriculum — curriculum changed,
          course was added on Coursera without WAP knowing, or the canonical mapping
          is wrong.
        </p>
        {outOfCatalogRows === null ? (
          <p role="status" style={cardSecondaryStyle}>Catalog comparison unavailable. Provider catalog coverage or event loading could not be verified.</p>
        ) : outOfCatalogRows.length === 0 ? (
          <span style={cardSecondaryStyle}>
            All recent xAPI traffic is on courses that exist in B4B programs.
          </span>
        ) : (
          <DataTable
            density="compact"
            rows={outOfCatalogRows}
            rowKey={(row) => row.courseSlug}
            columns={[
              {
                key: 'slug',
                header: 'course_slug',
                cell: (row) => <code style={{ fontSize: '0.85rem' }}>{row.courseSlug}</code>,
              },
              {
                key: 'events',
                header: 'Events',
                align: 'right',
                cell: (row) => (
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {row.eventCount.toLocaleString()}
                  </span>
                ),
              },
              {
                key: 'learners',
                header: 'Distinct learners',
                align: 'right',
                cell: (row) => (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.distinctLearners.toLocaleString()}
                  </span>
                ),
              },
              {
                key: 'lastSeen',
                header: 'Last seen',
                cell: (row) => (
                  <span style={{ fontSize: '0.85rem' }}>
                    {fmtDateTime(row.lastSeen)}{' '}
                    <span style={{ color: 'var(--color-on-surface-variant)' }}>
                      ({relativeAge(row.lastSeen, now)})
                    </span>
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>

      {/* Section 7 — sync drift (lastActivity > 24h apart). */}
      <section className="content-card" style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>B4B/xAPI sync drift (lastActivity &gt; 24h apart)</h2>
        <p style={{ ...cardSecondaryStyle, marginBottom: '0.6rem' }}>
          Pairs where B4B&apos;s <code>last_activity_time</code> and our{' '}
          <code>course_progress.last_activity_at</code> disagree by more than 24 hours
          for the same learner and provider course, shown separately by local program.
          A database write or replay timestamp is not learner activity.
        </p>
        {syncDrift.status === 'error' ? (
          <p role="alert" style={{ ...cardSecondaryStyle, color: 'var(--color-error, #dc2626)', margin: 0 }}>
            Couldn&apos;t run the sync-drift check, so no drift verdict is available.{' '}

          </p>
        ) : syncDrift.rows.length === 0 ? (
          <span style={cardSecondaryStyle}>
            No activity gap above 24h found among matched rows with both activity timestamps. Missing timestamps and unmatched rows are not covered.
          </span>
        ) : (
          <DataTable
            density="compact"
            rows={syncDrift.rows}
            rowKey={(row) => row.key}
            columns={[
              {
                key: 'email',
                header: 'Member',
                cell: (row) => <code style={{ fontSize: '0.85rem' }}>{row.email}</code>,
              },
              {
                key: 'localProgram',
                header: 'Local program',
                cell: (row) => <span>{row.localProgramSlug}</span>,
              },
              {
                key: 'course',
                header: 'Course',
                cell: (row) => <span style={{ fontSize: '0.85rem' }}>{row.courseName}</span>,
              },
              {
                key: 'b4bAt',
                header: 'B4B last activity',
                cell: (row) => (
                  <span style={{ fontSize: '0.85rem' }}>{fmtDateTime(row.b4bLastActivity)}</span>
                ),
              },
              {
                key: 'ourAt',
                header: 'Local last activity',
                cell: (row) => (
                  <span style={{ fontSize: '0.85rem' }}>{fmtDateTime(row.ourLastActivity)}</span>
                ),
              },
              {
                key: 'deltaHours',
                header: 'Δ hours',
                align: 'right',
                cell: (row) => (
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                      color: 'rgb(217, 119, 6)',
                    }}
                  >
                    {row.deltaHours.toLocaleString()}
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>

      {/* Section 8 — wrong-program studying (7d). */}
      <section className="content-card" style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>
          Course activity without a matching assigned program (last 7 days)
        </h2>
        <p style={{ ...cardSecondaryStyle, marginBottom: '0.6rem' }}>
          Compare every recorded assignment with all B4B programs containing the course.
          Shared courses and secondary assignments count as matches. Different provider and WAP
          program identifiers still require review; this is not proof of a wrong enrollment or unused paid seat.
        </p>
        {wrongProgramRows === null ? (
          <p role="status" style={cardSecondaryStyle}>Program comparison unavailable. Provider catalog coverage or event loading could not be verified.</p>
        ) : wrongProgramRows.length === 0 ? (
          <span style={cardSecondaryStyle}>
            No unmatched program associations found in the reviewed event rows. This does not verify provider enrollment or billing.
          </span>
        ) : (
          <DataTable
            density="compact"
            rows={wrongProgramRows}
            rowKey={(row) => row.key}
            columns={[
              {
                key: 'email',
                header: 'Member',
                cell: (row) => <code style={{ fontSize: '0.85rem' }}>{row.email}</code>,
              },
              {
                key: 'primary',
                header: 'Primary program',
                cell: (row) => (
                  <span style={{ fontSize: '0.85rem' }}>{row.primaryProgramSlug ?? '—'}</span>
                ),
              },
              {
                key: 'studied',
                header: 'Course studied',
                cell: (row) => (
                  <code style={{ fontSize: '0.85rem' }}>{row.courseStudied}</code>
                ),
              },
              {
                key: 'studiedProgram',
                header: 'Course belongs to',
                cell: (row) => (
                  <span style={{ fontSize: '0.85rem' }}>{row.courseStudiedProgram}</span>
                ),
              },
              {
                key: 'count',
                header: 'Events',
                align: 'right',
                cell: (row) => (
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {row.eventCount.toLocaleString()}
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>
    </PortalPageFrame>
  );
}
