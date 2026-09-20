import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Merge } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { getActivePrograms } from '@/lib/platform/programCatalog';
import { buildAssignableProgramOptions } from '@/lib/admin/assignableProgramOptions';
import { calculateFitScore } from '@/lib/admin/fitScore';
import { calculateHealthStatus, MEMBER_ACTIVITY_EVENT_WHERE } from '@/lib/admin/healthScore';
import { buildStatusWhere, type StudentStatus } from '@/lib/admin/studentStatus';
import { APPLICANT_TRIAGE_BUCKETS, type ApplicantTriageBucket } from '@/lib/admin/applicantTriage';
import { loadApplicantTriageByUserIds, localizeApplicantTriageMap } from '@/lib/admin/applicantTriageLoad';
import MembersTable from '@/components/admin/MembersTable';
import MembersListNav from '@/components/admin/MembersListNav';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getTranslations } from 'next-intl/server';
import { MEMBER_ONLY_WHERE, MEMBER_OR_DOGFOOD_WHERE } from '@/lib/admin/memberOnlyWhere';
import { buildDirectorySearchWhere, normalizeDirectorySearch } from '@/lib/admin/directorySearch';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('adminMembers'),
    description: t('memberListAndManagement'),
    path: '/admin/members',
  });
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const t = await getTranslations('admin');

  const params = (await searchParams) ?? {};
  const searchQuery = typeof params.search === 'string' ? normalizeDirectorySearch(params.search) : '';
  const programFilter = typeof params.program === 'string' ? params.program.trim() : '';
  const statusFilter = typeof params.status === 'string' ? params.status.trim() : '';
  const partnerFilter = typeof params.partner === 'string' ? params.partner.trim() : '';
  const startDateFilter = typeof params.startDate === 'string' ? params.startDate.trim() : '';
  const endDateFilter = typeof params.endDate === 'string' ? params.endDate.trim() : '';
  // Staff and dogfood admin accounts are not members and must not sit in the
  // roster or its count line: /admin/members printed 131 while /admin/students
  // printed 126 for the same question (audit 2026-09-20, S3; Mike, "remove
  // staff in count"). `?staff=1` restores the dogfood view so admins can still
  // find their own account while testing member surfaces.
  const includeStaff = params.staff === '1';
  const pageParam = typeof params.page === 'string' ? parseInt(params.page, 10) : 1;
  const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSize = 50;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Build the where clause based on filters
  const whereClause: Prisma.UserWhereInput = {
    ...(includeStaff ? MEMBER_OR_DOGFOOD_WHERE : MEMBER_ONLY_WHERE),
    AND: [buildDirectorySearchWhere(searchQuery)],
  };

  // Status filter: dropped includes soft-deleted members; others exclude them.
  const validStatus = statusFilter as StudentStatus;
  if (validStatus === 'dropped') {
    whereClause.deletedAt = { not: null };
  } else {
    whereClause.deletedAt = null;
  }

  if (programFilter) {
    whereClause.courseEnrollments = {
      some: { programSlug: programFilter },
    };
  }

  if (validStatus && validStatus !== 'dropped') {
    whereClause.AND = [
      buildDirectorySearchWhere(searchQuery),
      buildStatusWhere(validStatus) as Prisma.UserWhereInput,
    ];
  }

  // Partner + enrolled-date filters are applied server-side so they span the
  // whole member list (not just the loaded page) and match the CSV export's
  // semantics (export route filters on enrolledAt the same way).
  if (partnerFilter) {
    whereClause.partnerReferrals =
      partnerFilter === '__none' ? { none: {} } : { some: { partnerId: partnerFilter } };
  }
  {
    const enrolledAt: { gte?: Date; lte?: Date } = {};
    if (startDateFilter) {
      const d = new Date(startDateFilter);
      if (!Number.isNaN(d.getTime())) enrolledAt.gte = d;
    }
    if (endDateFilter) {
      const d = new Date(endDateFilter);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        enrolledAt.lte = d;
      }
    }
    if (enrolledAt.gte || enrolledAt.lte) whereClause.enrolledAt = enrolledAt;
  }

  // Phase 1: page of members + the two org-wide (not member-scoped) lookups
  // in parallel. The event/progress aggregates below only ever get looked up
  // for members in this page (see membersWithProgram.map below), so they are
  // deferred until we know which userIds are on this page — that turns 4
  // full-table scans into <=50-key index lookups with identical output, and
  // skips them entirely when the member list itself fails to load.
  const [membersResult, totalCountResult, partnerOptionsResult, activeProgramsResult] = await withAdminPageScope(scope, (db) => Promise.allSettled([
    db.user.findMany({
      where: whereClause,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        enrolledProgram: true,
        enrolledAt: true,
        lastLoginAt: true,
        staleTrainingDetectedAt: true,
        assessmentScorePct: true,
        assessmentCompleted: true,
        programInterest: true,
        updatedAt: true,
        createdAt: true,
        memberStatus: true,
        // Multi-program-aware: pull every program slug the member has an
        // enrollment row for so the MembersTable filter dropdown can include
        // ALL programs each member is in (not just the denormalized primary
        // on `enrolledProgram`) and so filtering by program matches
        // secondary-enrolled members too.
        courseEnrollments: {
          select: { programSlug: true, curriculumVersion: true, isPrimary: true },
        },
        profile: {
          select: {
            profilePhone: true,
            profileAddress: true,
            city: true,
            state: true,
            zip: true,
            address: true,
            employmentStatus: true,
            educationLevel: true,
            financialAidInterest: true,
          },
        },
        partnerReferrals: {
          take: 1,
          orderBy: { referredAt: 'desc' },
          select: { partner: { select: { id: true, name: true } } },
        },
      },
    }),
    db.user.count({ where: whereClause }),
    // Org-wide partner list for the filter dropdown (page-derived options
    // would shrink to whatever partners appear on the loaded page).
    db.partner.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // The bulk-program picker must reflect the tenant's active catalog, not
    // only programs represented by the current <=50-member page.
    getActivePrograms(scope.orgId),
  ]));

  if (membersResult.status === 'rejected') {
    console.error('[admin/members] user list load failed', membersResult.reason);
    return (
      <PortalPageFrame>
        <AdminDataLoadError title={t('membersListUnavailable')} />
      </PortalPageFrame>
    );
  }

  const members = membersResult.value;
  const pageMemberIds = members.map((m) => m.id);
  const assignableProgramOptions = activeProgramsResult.status === 'fulfilled'
    ? buildAssignableProgramOptions(activeProgramsResult.value)
    : [];
  if (activeProgramsResult.status === 'rejected') {
    console.error('[admin/members] active program catalog load failed', activeProgramsResult.reason);
  }

  // Phase 2: decorating aggregates, scoped to just this page's members.
  // Full-table `memberEvent` groupBy can time out or fail under load;
  // degrading aggregates must not hide the member list, so this stays a
  // Promise.allSettled independent of phase 1.
  const [
    lastEventsResult,
    recentEventsResult,
    canonicalCompletionsResult,
    programProgressResult,
    activeCourseProgressResult,
    courseActivityResult,
    applicantTriageResult,
  ] = await Promise.allSettled([
    // PERF: Bound last-event scan to 30 days. Users absent from this map
    // are treated as inactive by calculateHealthStatus (correct behavior).
    // MEMBER_ACTIVITY_EVENT_WHERE drops the rows the platform writes *to* the
    // member (nudge emails, recap digests): counting them marked 114 members
    // with no sign-in in 30+ days "Active" (audit 2026-09-20, S1).
    withAdminPageScope(scope, (db) => db.memberEvent.groupBy({
      by: ['userId'],
      where: { userId: { in: pageMemberIds }, createdAt: { gte: thirtyDaysAgo }, ...MEMBER_ACTIVITY_EVENT_WHERE },
      _max: { createdAt: true },
    })),
    withAdminPageScope(scope, (db) => db.memberEvent.groupBy({
      by: ['userId'],
      where: { userId: { in: pageMemberIds }, createdAt: { gte: thirtyDaysAgo }, ...MEMBER_ACTIVITY_EVENT_WHERE },
      _count: { _all: true },
    })),
    // Canonical completed-course count from `course_progress` (includes CSV-promoted Coursera rows).
    prisma.courseProgress.groupBy({
      by: ['userId', 'programSlug'],
      where: { userId: { in: pageMemberIds }, status: 'COMPLETED' },
      _count: { _all: true },
    }),
    prisma.memberProgramProgress.findMany({
      where: { userId: { in: pageMemberIds } },
      select: {
        userId: true,
        programSlug: true,
        averagePercent: true,
        coursesCompleted: true,
        lastUpdatedAt: true,
      },
    }),
    // "N active" on the Training cell: courses the member is working on *in
    // the program the row shows*. Grouping by userId alone and counting
    // COMPLETED rows too printed "11 active" for a learner with 3 in progress
    // (audit 2026-09-20, S15). Same rule as the legacy training dashboard
    // (lib/admin/trainingDashboard.ts: not complete, some progress).
    prisma.courseProgress.groupBy({
      by: ['userId', 'programSlug'],
      where: {
        userId: { in: pageMemberIds },
        status: 'IN_PROGRESS',
        percentComplete: { gt: 0 },
      },
      _count: { _all: true },
    }),
    // Coursera / course work writes no member_events row, so Health has to
    // read it here or a learner who only studies scores red (Mike, 2026-09-20:
    // activity is "login, any Coursera action, any tools skills etc.").
    prisma.courseProgress.groupBy({
      by: ['userId'],
      where: { userId: { in: pageMemberIds } },
      _max: { lastActivityAt: true },
    }),
    // Applicant intake triage for members on this page with an open application.
    // Read-only pre-sort; the approve/deny buttons and who may press them are untouched.
    withAdminPageScope(scope, (db) => loadApplicantTriageByUserIds(db, pageMemberIds)),
  ]);

  const lastEventMap: Map<string, Date | null> = new Map();
  if (lastEventsResult.status === 'fulfilled') {
    for (const row of lastEventsResult.value) {
      lastEventMap.set(row.userId, row._max.createdAt);
    }
  } else {
    console.error('[admin/members] last-event aggregate failed', lastEventsResult.reason);
  }

  const recentEventMap: Map<string, number> = new Map();
  if (recentEventsResult.status === 'fulfilled') {
    for (const row of recentEventsResult.value) {
      recentEventMap.set(row.userId, row._count._all);
    }
  } else {
    console.error('[admin/members] recent-event aggregate failed', recentEventsResult.reason);
  }

  const courseActivityMap: Map<string, Date> = new Map();
  if (courseActivityResult.status === 'fulfilled') {
    for (const row of courseActivityResult.value) {
      if (row._max.lastActivityAt) courseActivityMap.set(row.userId, row._max.lastActivityAt);
    }
  } else {
    console.error('[admin/members] course activity aggregate failed', courseActivityResult.reason);
  }

  /** Health needs every aggregate; one failure + zeros mislabels members as inactive. */
  const eventAggregatesOk =
    lastEventsResult.status === 'fulfilled' &&
    recentEventsResult.status === 'fulfilled' &&
    courseActivityResult.status === 'fulfilled';

  const canonicalCompletionMap: Map<string, number> = new Map();
  if (canonicalCompletionsResult.status === 'fulfilled') {
    for (const row of canonicalCompletionsResult.value) {
      const key = `${row.userId}:${canonicalizeProgramSlug(row.programSlug)}`;
      canonicalCompletionMap.set(
        key,
        Math.max(canonicalCompletionMap.get(key) ?? 0, row._count._all),
      );
    }
  } else {
    console.error('[admin/members] canonical course_progress count failed', canonicalCompletionsResult.reason);
  }

  const programProgressMap: Map<string, { averagePercent: number; coursesCompleted: number; lastUpdatedAt: Date }> = new Map();
  if (programProgressResult.status === 'fulfilled') {
    for (const row of programProgressResult.value) {
      const key = `${row.userId}:${canonicalizeProgramSlug(row.programSlug)}`;
      const existing = programProgressMap.get(key);
      if (existing && existing.lastUpdatedAt >= row.lastUpdatedAt) continue;
      programProgressMap.set(key, {
        averagePercent: row.averagePercent,
        coursesCompleted: row.coursesCompleted,
        lastUpdatedAt: row.lastUpdatedAt,
      });
    }
  } else {
    console.error('[admin/members] member_program_progress load failed', programProgressResult.reason);
  }

  const applicantTriageById =
    applicantTriageResult.status === 'fulfilled'
      ? localizeApplicantTriageMap(applicantTriageResult.value, (key) => t(key))
      : {};
  if (applicantTriageResult.status === 'rejected') {
    console.error('[admin/members] applicant triage load failed', applicantTriageResult.reason);
  }
  const applicantTriageCopy = {
    filterLabel: t('applicantTriage.filterLabel'),
    filterAll: t('applicantTriage.filterAll'),
    buckets: Object.fromEntries(
      APPLICANT_TRIAGE_BUCKETS.map((bucket) => [bucket, t(`applicantTriage.bucket.${bucket}`)]),
    ) as Record<ApplicantTriageBucket, string>,
  };

  /** Keyed `userId:canonicalProgramSlug` — an active count belongs to one program. */
  const activeCourseCountMap: Map<string, number> = new Map();
  if (activeCourseProgressResult.status === 'fulfilled') {
    for (const row of activeCourseProgressResult.value) {
      const key = `${row.userId}:${canonicalizeProgramSlug(row.programSlug)}`;
      activeCourseCountMap.set(key, (activeCourseCountMap.get(key) ?? 0) + row._count._all);
    }
  } else {
    console.error('[admin/members] active course_progress count failed', activeCourseProgressResult.reason);
  }

  const membersWithProgram = members.map((m) => {
    const fitScore = calculateFitScore({
      enrolledProgram: m.enrolledProgram,
      programInterest: m.programInterest,
      assessmentScorePct: m.assessmentScorePct,
      profile: m.profile,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone,
    });

    const healthStatus = eventAggregatesOk
      ? calculateHealthStatus({
          lastEventAt: lastEventMap.get(m.id) ?? null,
          recentEventCount: recentEventMap.get(m.id) ?? 0,
          enrolledAt: m.enrolledAt,
          lastLoginAt: m.lastLoginAt,
          lastCourseActivityAt: courseActivityMap.get(m.id) ?? null,
        })
      : undefined;

    const assignment = resolveTrainingProgressAssignment(
      m.enrolledProgram,
      m.courseEnrollments,
    );
    const activeProgramSlug = assignment.programSlug;
    const curriculumVersion = assignment.curriculumVersion;
    const canonicalCount = activeProgramSlug
      ? canonicalCompletionMap.get(
          `${m.id}:${canonicalizeProgramSlug(activeProgramSlug)}`,
        ) ?? 0
      : 0;
    // The table only uses .length when no live rollup exists, so a length-stub list is sufficient.
    const coursesCompletedDisplay = new Array(canonicalCount).fill('') as string[];

    const activeProgram = activeProgramSlug ? getProgramBySlug(activeProgramSlug) : null;
    const programTitle = activeProgram?.title ?? null;
    const totalCourses = activeProgram && curriculumVersion
      ? getProgramCoursesForCurriculumVersion(activeProgram, curriculumVersion).length
      : 0;
    const liveProgress = activeProgramSlug
      ? programProgressMap.get(
          `${m.id}:${canonicalizeProgramSlug(activeProgramSlug)}`,
        ) ?? null
      : null;
    const activeCourses = activeProgramSlug
      ? activeCourseCountMap.get(`${m.id}:${canonicalizeProgramSlug(activeProgramSlug)}`) ?? 0
      : 0;

    // Multi-program-aware: surface every program slug the learner has an
    // enrollment row for. Falls back to legacy `enrolledProgram` when the
    // member has no `course_enrollments` rows yet (legacy / seeded users).
    const enrollmentProgramSlugs = Array.from(
      new Set<string>([
        ...(m.enrolledProgram ? [m.enrolledProgram] : []),
        ...m.courseEnrollments.map((row) => row.programSlug),
      ]),
    );
    const enrollmentProgramTitleBySlug: Record<string, string> = {};
    for (const slug of enrollmentProgramSlugs) {
      enrollmentProgramTitleBySlug[slug] = programDisplayTitle(slug);
    }

    return {
      ...m,
      programTitle,
      coursesCompleted: coursesCompletedDisplay,
      totalCourses,
      liveTraining: liveProgress
        ? {
            percent: liveProgress.averagePercent,
            coursesCompleted: liveProgress.coursesCompleted,
            coursesActive: activeCourses,
            totalCourses,
            lastUpdatedAt: liveProgress.lastUpdatedAt,
          }
        : null,
      partnerName: m.partnerReferrals[0]?.partner.name ?? null,
      partnerId: m.partnerReferrals[0]?.partner.id ?? null,
      fitScore,
      healthStatus,
      applicantTriage: applicantTriageById[m.id] ?? null,
      enrollmentProgramSlugs,
      enrollmentProgramTitleBySlug,
    };
  });

  // Sort by most recently active first by default (dad-safe: surfaces who needs follow-up).
  // The client table immediately re-sorts via its `sortKey/sortDir` state on the same key,
  // so this controls the first-paint order and matches the client's initial sort.
  membersWithProgram.sort((a, b) => {
    const ta = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt).getTime();
    const tb = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  return (
    <PortalPageFrame>
      <PageHeader
        title={t('members')}
        subtitle={t('viewAndManageAccounts')}
        action={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link href="/admin/members/merge" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Merge size={16} /> Merge</Link>
            <Link href="/admin/members/new" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Plus size={16} /> {t('addMember')}</Link>
          </div>
        }
      />

      <MembersListNav />

      <MembersTable
        members={membersWithProgram}
        totalCount={totalCountResult.status === 'fulfilled' ? totalCountResult.value : members.length}
        currentPage={currentPage}
        pageSize={pageSize}
        searchQuery={searchQuery}
        programFilter={programFilter}
        statusFilter={statusFilter}
        partnerFilter={partnerFilter}
        startDateFilter={startDateFilter}
        endDateFilter={endDateFilter}
        allPartnerOptions={partnerOptionsResult.status === 'fulfilled' ? partnerOptionsResult.value : []}
        allAssignablePrograms={assignableProgramOptions}
        includeStaff={includeStaff}
        applicantTriageCopy={applicantTriageCopy}
      />
    </PortalPageFrame>
  );
}
