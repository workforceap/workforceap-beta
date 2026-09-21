import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { withAdminPageScope, type AdminPageTenantOk } from '@/lib/tenant/adminPageScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { deriveCourseraOverviewHealth } from '@/lib/admin/courseraDiagnostics';
import { getCourseraSyncStatus } from '@/lib/admin/courseraOps';
import { countUnresolvedXapiOrganizations } from '@/lib/coursera/replayPendingXapi';
import {
  loadValidatedProgramCatalog,
  type ValidatedProgramCatalogEntry,
} from '@/lib/coursera/programCourseList';
import {
  countHiddenTestAccountUnmatchedLearners,
  countUnmatchedLearners,
  loadUnmatchedLearners,
} from '@/lib/coursera/progressQueries';
import { CourseraCatalogHealthSection } from '@/components/admin/CourseraCatalogHealthTable';
import {
  CourseraSyncKit,
  type UnmatchedLearnerRow,
} from '@/components/portal/kit/pages/admin-subviews/CourseraSyncKit';

/**
 * Coursera tab: the Sync Status card + Unmatched Learners list + catalog
 * health that were the default (kit) view of `/admin/coursera`, moved here
 * with the same loaders. The full mapping / CSV / audit tooling stays on
 * `/admin/coursera?ui=legacy`. One batched contents audit powers catalog
 * health; when B4B credentials are unavailable (for example in preview), that
 * state is shown explicitly instead of treating an unavailable provider as an
 * empty list.
 */
export async function ReportingCourseraSection({
  scope,
  userId,
  readOnlyAudit,
}: {
  scope: AdminPageTenantOk;
  userId: string;
  readOnlyAudit: boolean;
}) {
  if (readOnlyAudit) {
    return (
      <div data-portal-audit-suppressed="admin-coursera-schema-and-external-sync" className="wa-kit-card">
        <p style={{ marginTop: 0 }}>
          The route and admin access shell are verified here. Schema checks, OAuth calls, and live sync operations are
          reserved for the attended Coursera release check.
        </p>
        <Link href="/admin" className="btn btn-outline btn-sm">Admin home</Link>
      </div>
    );
  }

  const organizationId = await getActorOrganizationId(userId);
  const catalogHealthPromise = loadValidatedProgramCatalog({ organizationId: scope.orgId })
    .then((rows) => ({ rows, loadFailed: false }))
    .catch((error: unknown) => {
      console.error('[admin/reporting/coursera] catalog health load failed:', error);
      return { rows: [] as ValidatedProgramCatalogEntry[], loadFailed: true };
    });

  let kitSyncStatus = {
    lastXapiReceivedAt: null as Date | null,
    distinctMembersWithCourseProgress: 0,
    attentionStatementCount: 0,
  };
  let kitSyncOk = true;
  try {
    kitSyncStatus = await getCourseraSyncStatus({ organizationId });
  } catch (error) {
    kitSyncOk = false;
    console.error('[admin/reporting/coursera] kit sync status failed:', error);
  }

  const [unmatchedResult, hiddenTestResult, unmatchedCountResult, approvedResult, activityResult, unresolvedOrgResult] = await Promise.allSettled([
    loadUnmatchedLearners(organizationId, 500, { includeTestAccounts: false, strict: true }),
    countHiddenTestAccountUnmatchedLearners(organizationId, { strict: true }),
    countUnmatchedLearners(organizationId, { includeTestAccounts: false, strict: true }),
    withAdminPageScope(scope, (db) => db.user.count({
      where: { organizationId, deletedAt: null, courseraEnrollmentApproved: true },
    })),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT u.id)::bigint AS count
      FROM coursera_xapi_events cxe
      JOIN users u ON u.id = cxe.matched_user_id
      WHERE cxe.received_at >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        AND cxe.organization_id = ${organizationId}
        AND u.organization_id = ${organizationId} AND u.deleted_at IS NULL
    `,
    // WAP-33: statements still carrying an 'unresolved-%' sentinel org. They
    // belong to no tenant yet, so this is a platform-wide count by definition.
    countUnresolvedXapiOrganizations(),
  ]);
  const kitUnmatched = unmatchedResult.status === 'fulfilled' ? unmatchedResult.value : [];
  const kitHiddenTest = hiddenTestResult.status === 'fulfilled' ? hiddenTestResult.value : null;
  const kitUnmatchedTotal = unmatchedCountResult.status === 'fulfilled' ? unmatchedCountResult.value : null;
  const kitUnmatchedLoaded = unmatchedResult.status === 'fulfilled' && unmatchedCountResult.status === 'fulfilled';
  const kitApprovedForEnrollment = approvedResult.status === 'fulfilled' ? String(approvedResult.value) : '—';
  const kitActiveLast30Days = activityResult.status === 'fulfilled' ? String(activityResult.value[0]?.count ?? 0) : '—';
  const kitUnresolvedOrgSentinels = unresolvedOrgResult.status === 'fulfilled' ? String(unresolvedOrgResult.value) : '—';
  for (const result of [unmatchedResult, hiddenTestResult, unmatchedCountResult, approvedResult, activityResult, unresolvedOrgResult]) {
    if (result.status === 'rejected') console.error('[admin/reporting/coursera] overview evidence unavailable:', result.reason);
  }

  const unmatchedRows: UnmatchedLearnerRow[] = kitUnmatched.map((learner) => {
    const topBadge = learner.badges[0];
    const gradeCaption =
      learner.latestGradePercent != null
        ? `Grade ${Math.round(learner.latestGradePercent * 100) / 100}%`
        : null;
    const caption = [
      gradeCaption,
      topBadge
        ? `${topBadge.badgeTitle} · ${Math.round(topBadge.progressPercent)}%`
        : [
            learner.courseCount > 0 ? `${learner.courseCount} course${learner.courseCount === 1 ? '' : 's'}` : null,
            learner.badgeCount > 0 ? `${learner.badgeCount} badge${learner.badgeCount === 1 ? '' : 's'}` : null,
            learner.xapiCount > 0 ? `${learner.xapiCount} event${learner.xapiCount === 1 ? '' : 's'}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
    ]
      .filter(Boolean)
      .join(' · ') || 'No matched member';
    return {
      email: learner.externalEmail,
      name: learner.externalName,
      caption,
      href: `/admin/coursera/learners/unmatched/${encodeURIComponent(learner.externalEmail)}`,
      gradePercent: learner.latestGradePercent,
    };
  });

  const health = deriveCourseraOverviewHealth({
    loaded: kitSyncOk && kitUnmatchedLoaded && approvedResult.status === 'fulfilled' && activityResult.status === 'fulfilled',
    unmatchedTotal: kitUnmatchedTotal,
    attentionStatements: kitSyncStatus.attentionStatementCount,
    lastXapiReceivedAt: kitSyncStatus.lastXapiReceivedAt,
    now: new Date(),
  });
  const healthLabel = health === 'unavailable'
    ? 'Evidence unavailable'
    : health === 'attention'
      ? 'Review needed'
      : health === 'idle'
        ? 'Awaiting events'
        : 'Recent events received';
  const catalogHealth = await catalogHealthPromise;

  return (
    <>
      <CourseraSyncKit
        embedded
        health={health}
        healthLabel={healthLabel}
        lastSync={kitSyncOk ? fmtRelative(kitSyncStatus.lastXapiReceivedAt) : '—'}
        learnersSynced={kitSyncOk ? String(kitSyncStatus.distinctMembersWithCourseProgress) : '—'}
        // Catalog health verifies contents, but it is not a latency probe.
        // Honest null keeps the sync card from fabricating a duration.
        b4bLatency={null}
        errors={kitSyncOk ? String(kitSyncStatus.attentionStatementCount) : '—'}
        unmatched={unmatchedRows}
        unmatchedTotal={kitUnmatchedTotal}
        unmatchedLoaded={kitUnmatchedLoaded}
        hiddenTestCount={kitHiddenTest}
        approvedForEnrollment={kitApprovedForEnrollment}
        activeLast30Days={kitActiveLast30Days}
        unresolvedOrgSentinels={kitUnresolvedOrgSentinels}
        forceSyncHref="/admin/coursera?ui=legacy"
        headerAction={
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link
              href="/admin/coursera/enrollment"
              style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-info)' }}
            >
              Enrollment pipeline →
            </Link>
            <Link
              href="/admin/coursera/provisioning"
              style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-info)' }}
            >
              Provisioning queue →
            </Link>
            <Link
              href="/admin/coursera/health"
              style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-info)' }}
            >
              Coursera health →
            </Link>
            <Link
              href="/admin/coursera?ui=legacy"
              style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-info)' }}
            >
              Mapping &amp; sync tools →
            </Link>
          </div>
        }
      />
      <div className="wa-mt-6">
        <CourseraCatalogHealthSection {...catalogHealth} />
      </div>
    </>
  );
}

function fmtRelative(value: Date | null): string {
  if (!value) return '—';
  const diffMs = Date.now() - value.getTime();
  if (diffMs < 0) return value.toLocaleString();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
