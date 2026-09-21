import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CourseProgressStatus } from '@prisma/client';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { PipelineFunnelKit } from '@/components/portal/kit/pages/admin-subviews/PipelineFunnelKit';
import { buildPipelineFunnel, pipelineFunnelSubtitle } from '@/lib/admin/pipelineFunnel';
import PipelineLegacyView from './PipelineLegacyView';
import PlacementRecordedToast from './PlacementRecordedToast';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Applications funnel',
    description: 'Where applicants drop off — the member application-to-active funnel.',
    path: '/admin/pipeline',
    robots: { index: false, follow: false },
  });
}

const FUNNEL_WINDOW_DAYS = 90;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/pipeline');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const sp = await searchParams;
  const requestedUi = typeof sp.ui === 'string' ? sp.ui : null;

  // ── LEGACY PATH (?ui=legacy) — preserves the original client-fetched
  // 7-stage journey view exactly as it rendered before. ──
  if (requestedUi === 'legacy') {
    return <PipelineLegacyView />;
  }

  // ── DEFAULT (design-kit) PATH — runs AFTER the auth/role guard so access
  // control is preserved. All five stages are LEAN tenant-scoped `user.count`
  // calls (no findMany, no $transaction). `User` is a tenant-scoped model, so
  // withTenantScope auto-injects the org filter on every count. ──
  const orgId = scope.orgId;

  // Funnel cohort: members who STARTED their application in the last 90 days,
  // so every stage measures the same cohort and the bars read as a true
  // drop-off funnel (no learner from an older cohort inflating a later stage).
  // "Member" is `profile.role`, the same predicate every roster uses
  // (`MEMBER_ONLY_WHERE`); the old `user_roles` join missed 29 of 49 sign-ups
  // that have no user_roles row (number audit 2026-09-20, F8).
  const windowStart = new Date(Date.now() - FUNNEL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const cohortFilter = {
    deletedAt: null,
    ...MEMBER_ONLY_WHERE,
    createdAt: { gte: windowStart },
  } as const;

  const funnel = await withAdminPageScope(scope, async (db) => {
    // Stage 1 (top of funnel): every member in the cohort "started application".
    // Stage 2: intake/assessment complete.
    // Side count: WIOA eligibility verified — `wioaReviewStatus = 'verified'`,
    //   the value the review flow writes when eligibility is confirmed. Rows
    //   still 'pending' / 'in_review' are not cleared and must not print as
    //   such (number audit 2026-09-20, F8 companion). Screening runs
    //   alongside enrollment and is not a gate, so it is a labelled KPI tile,
    //   not a funnel bar (`lib/admin/pipelineFunnel`).
    // Stage 3: enrolled in at least one course.
    // Stage 4 (success): actively training — has course progress that is
    //   in-progress or completed.
    // All five are lean tenant-scoped `user.count` calls (no findMany/$transaction).
    const [started, intake, eligibility, enrolled, active] = await Promise.all([
      db.user.count({ where: cohortFilter }),
      db.user.count({ where: { ...cohortFilter, assessmentCompleted: true } }),
      db.user.count({ where: { ...cohortFilter, wioaReviewStatus: 'verified' } }),
      db.user.count({ where: { ...cohortFilter, courseEnrollments: { some: {} } } }),
      db.user.count({
        where: {
          ...cohortFilter,
          courseProgress: {
            some: {
              status: {
                in: [CourseProgressStatus.IN_PROGRESS, CourseProgressStatus.COMPLETED],
              },
            },
          },
        },
      }),
    ]);
    return { started, intake, eligibility, enrolled, active };
  });

  // Bars in funnel order (started → intake → enrolled → active) plus the
  // WIOA screening tile with its caption; pure and specced in
  // lib/admin/pipelineFunnel.test.ts.
  const { bars, kpis, hasAny } = buildPipelineFunnel(funnel);

  return (
    <>
      {/* /admin/placements/new redirects here on save; renders a fixed-position
          toast (see PlacementRecordedToast) when ?toast=placed is present. */}
      <PlacementRecordedToast />
      <PipelineFunnelKit
        title="Applications funnel"
        goal="Where applicants drop off"
        kpis={hasAny ? kpis : undefined}
        funnel={hasAny ? bars : []}
        funnelTitle="Funnel"
        funnelSubtitle={pipelineFunnelSubtitle(FUNNEL_WINDOW_DAYS)}
        headerAction={
          <a
            href="/admin/pipeline?ui=legacy"
            className="wa-kit-focus"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              color: 'var(--wa-text)',
              border: '1px solid var(--wa-border, rgba(0,0,0,0.12))',
            }}
          >
            Stale applications
          </a>
        }
      />
    </>
  );
}
