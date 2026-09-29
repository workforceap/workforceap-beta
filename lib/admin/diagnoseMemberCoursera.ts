'use server';

import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import {
  resolveAdminPageTenant,
  withAdminPageScope,
} from '@/lib/tenant/adminPageScope';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { getProgramBySlug } from '@/lib/content/programs';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import {
  reconcileProgramProgress,
  type CourseProgressReconcileRow,
} from '@/lib/coursera/progressReconciliation';
import { resolveActiveDashboardProgram } from '@/lib/member/resolveActiveDashboardProgram';
import {
  freshnessVerdict,
  latestDate,
  type CourseraFreshnessFacts,
} from '@/lib/admin/diagnoseMemberCourseraVerdict';

export type CourseraDiagnoseReport = {
  ok: true;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    enrolledProgram: string | null;
    /** Primary CourseEnrollment row, else the legacy pointer. */
    canonicalProgram: string | null;
    courseraEnrollmentApproved: boolean;
  };
  /** null when the freshness reads failed (unknown, not "never synced"). */
  freshness: CourseraFreshnessFacts | null;
  identityMappings: Array<{
    courseraEmail: string | null;
    actorIdentifier: string | null;
    actorHomePage: string | null;
    source: string;
    lastSeenAt: Date | null;
  }>;
  enrollments: Array<{
    programSlug: string;
    isPrimary: boolean;
    enrolledAt: Date | null;
  }>;
  xapi: {
    totalForActor: number;
    ignoredForActor: number;
    processedForActor: number;
    erroredForActor: number;
    latestIgnored: Array<{
      courseSlug: string | null;
      verbId: string;
      receivedAt: Date;
    }>;
  };
  canonical: {
    courseProgressRows: number;
    courseraCourseProgressRows: number;
    courseraBadgeProgressRows: number;
    canonicalMappingsTotal: number;
  };
  reconciliation: Array<{
    programSlug: string;
    completedCount: number;
    totalCourses: number;
    programPercent: number;
    allComplete: boolean;
    rows: CourseProgressReconcileRow[];
  }>;
  verdict: Array<{
    status: 'ok' | 'warn' | 'fail';
    title: string;
    detail: string;
  }>;
} | { ok: false; error: string };

type IdentityMappingRaw = {
  courseraEmail: string | null;
  actorIdentifier: string | null;
  actorHomePage: string | null;
  source: string;
  lastSeenAt: Date | null;
};

type XapiAggRaw = {
  total: bigint | number;
  ignored: bigint | number;
  unresolved?: bigint | number | null;
  processed: bigint | number;
  errored: bigint | number;
  latest_received?: Date | null;
};

type IgnoredXapiRaw = {
  course_slug: string | null;
  verb_id: string;
  received_at: Date;
};

export async function diagnoseMemberCoursera(
  memberId: string,
): Promise<CourseraDiagnoseReport> {
  const actor = await getUser();
  if (!actor) return { ok: false, error: 'Not authenticated' };
  const scope = await resolveAdminPageTenant(actor.id);
  if (!scope.ok) return { ok: false, error: 'Forbidden' };

  const member = await withAdminPageScope(scope, (db) => db.user.findFirst({
    where: { id: memberId, deletedAt: null },
    select: {
      id: true,
      email: true,
      fullName: true,
      organizationId: true,
      enrolledProgram: true,
      courseraEnrollmentApproved: true,
    },
  }));
  if (!member) return { ok: false, error: 'Member not found' };

  const enrollmentsRaw = await prisma.courseEnrollment.findMany({
    take: 500,
    where: { userId: memberId, organizationId: member.organizationId },
    select: { id: true, programSlug: true, isPrimary: true, enrolledAt: true },
    orderBy: { enrolledAt: 'desc' },
  });
  const { primaryProgramSlug: canonicalProgram } = resolveActiveDashboardProgram({
    enrollments: enrollmentsRaw,
    legacyEnrolledProgram: member.enrolledProgram,
  });

  let identityMappings: IdentityMappingRaw[] = [];
  try {
    identityMappings = await prisma.courseraIdentityMapping.findMany({
      take: 500,
      where: { userId: memberId },
      orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }],
      select: {
        courseraEmail: true,
        actorIdentifier: true,
        actorHomePage: true,
        source: true,
        lastSeenAt: true,
      },
    });
  } catch (err) {
    console.error('[diagnoseMemberCoursera] identity_mappings query failed:', err);
  }

  let xapiAgg: XapiAggRaw = {
    total: 0,
    ignored: 0,
    unresolved: 0,
    processed: 0,
    errored: 0,
  };
  let latestIgnored: IgnoredXapiRaw[] = [];
  try {
    const aggRows = await prisma.$queryRaw<XapiAggRaw[]>`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN completion_status = 'ignored' THEN 1 ELSE 0 END) AS ignored,
        SUM(CASE WHEN completion_status = 'unresolved_course' THEN 1 ELSE 0 END) AS unresolved,
        SUM(CASE WHEN completion_status NOT IN ('ignored', 'unresolved_course') AND error IS NULL THEN 1 ELSE 0 END) AS processed,
        SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errored,
        MAX(received_at) AS latest_received
      FROM coursera_xapi_events
      WHERE organization_id = ${member.organizationId}
        AND (actor_email = ${member.email} OR matched_user_id = ${memberId})
    `;
    if (aggRows[0]) xapiAgg = aggRows[0];
    latestIgnored = await prisma.$queryRaw<IgnoredXapiRaw[]>`
      SELECT course_slug, verb_id, received_at
      FROM coursera_xapi_events
      WHERE organization_id = ${member.organizationId}
        AND (actor_email = ${member.email} OR matched_user_id = ${memberId})
        AND completion_status IN ('unresolved_course', 'ignored')
      ORDER BY (completion_status = 'unresolved_course') DESC, received_at DESC
      LIMIT 5
    `;
  } catch (err) {
    console.error('[diagnoseMemberCoursera] xapi events query failed:', err);
  }

  const [
    courseProgressRows,
    courseraCourseProgressRows,
    courseraBadgeProgressRows,
    canonicalMappingsTotal,
  ] = await Promise.all([
    prisma.courseProgress.count({ where: { userId: memberId } }),
    prisma.courseraCourseProgress.count({
      where: {
        organizationId: member.organizationId,
        OR: [{ userId: memberId }, { externalEmail: member.email }],
      },
    }),
    prisma.courseraBadgeProgress.count({
      where: {
        organizationId: member.organizationId,
        OR: [{ userId: memberId }, { externalEmail: member.email }],
      },
    }),
    prisma.courseraCanonicalCourseMapping.count(),
  ]);

  // Freshness and provenance. Read separately so a failure reports
  // "unknown" instead of a misleading "never synced".
  const memberRawWhere = {
    organizationId: member.organizationId,
    OR: [{ userId: memberId }, { externalEmail: member.email }],
  };
  let freshness: CourseraFreshnessFacts | null = null;
  try {
    const [orgSync, memberLatestRow, memberActivity, localActivity] = await Promise.all([
      prisma.courseraCourseProgress.aggregate({
        where: { organizationId: member.organizationId, source: 'b4b_sync' },
        _max: { lastSyncedAt: true },
      }),
      prisma.courseraCourseProgress.findFirst({
        where: memberRawWhere,
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true, source: true },
      }),
      prisma.courseraCourseProgress.aggregate({
        where: memberRawWhere,
        _max: { lastActivityTime: true },
      }),
      prisma.courseProgress.aggregate({
        where: { userId: memberId },
        _max: { lastActivityAt: true },
      }),
    ]);
    freshness = {
      orgLastB4BSyncAt: orgSync._max.lastSyncedAt ?? null,
      memberLastSyncAt: memberLatestRow?.lastSyncedAt ?? null,
      memberLastSyncSource: memberLatestRow?.source ?? null,
      lastXapiReceivedAt: xapiAgg.latest_received ?? null,
      lastLearnerActivityAt: latestDate(
        memberActivity._max.lastActivityTime,
        localActivity._max.lastActivityAt,
      ),
    };
  } catch (err) {
    console.error('[diagnoseMemberCoursera] freshness query failed:', err);
  }

  const [localProgressFacts, b4bProgressFacts] = await Promise.all([
    prisma.courseProgress.findMany({
      take: 5000,
      where: { userId: memberId },
      select: {
        programSlug: true,
        courseSlug: true,
        courseId: true,
        percentComplete: true,
        status: true,
      },
    }),
    prisma.courseraCourseProgress.findMany({
      take: 5000,
      where: {
        organizationId: member.organizationId,
        OR: [{ userId: memberId }, { externalEmail: member.email }],
      },
      select: {
        programSlug: true,
        courseraCourseId: true,
        overallProgress: true,
        isCompleted: true,
      },
    }),
  ]);

  const b4bProgress = new Map(
    b4bProgressFacts.map((row) => [
      row.courseraCourseId,
      {
        overallProgress: Number(row.overallProgress),
        isCompleted: row.isCompleted,
      },
    ]),
  );
  const programSlugs = Array.from(
    new Set(
      [
        member.enrolledProgram,
        ...enrollmentsRaw.map((row) => row.programSlug),
        ...localProgressFacts.map((row) => row.programSlug),
        ...b4bProgressFacts.map((row) => row.programSlug),
      ]
        .filter((value): value is string => Boolean(value))
        .map((programSlug) =>
          getProgramBySlug(programSlug)?.slug ?? canonicalizeProgramSlug(programSlug),
        )
        .filter((programSlug) => Boolean(getProgramBySlug(programSlug))),
    ),
  );
  const reconciliation = await Promise.all(
    programSlugs.map(async (programSlug) => {
      const validated = await loadValidatedProgramCourses({
        organizationId: member.organizationId,
        programSlug,
        checkB4BContents: false,
      });
      const result = reconcileProgramProgress({
        validatedCourses: validated.courses,
        b4bProgress,
        localRows: localProgressFacts
          .filter((row) => canonicalizeProgramSlug(row.programSlug) === programSlug)
          .map((row) => ({
            courseSlug: row.courseSlug,
            courseId: row.courseId,
            percentComplete: row.percentComplete,
            status: row.status,
          })),
      });
      return { programSlug, ...result };
    }),
  );

  const verdict: Array<{
    status: 'ok' | 'warn' | 'fail';
    title: string;
    detail: string;
  }> = [];

  if (identityMappings.length === 0) {
    verdict.push({
      status: 'fail',
      title: 'No Coursera identity link',
      detail:
        "This member hasn't linked their Coursera email. xAPI events arriving from Coursera will not be matched to this account.",
    });
  } else {
    verdict.push({
      status: 'ok',
      title: `Linked Coursera email (${identityMappings.length})`,
      detail: identityMappings
        .map((m) => m.courseraEmail || m.actorIdentifier || 'unknown')
        .join(', '),
    });
  }

  if (canonicalMappingsTotal === 0) {
    verdict.push({
      status: 'fail',
      title: 'Canonical course mappings table is empty (org-wide)',
      detail:
        'No CourseraCanonicalCourseMapping rows exist. Every xAPI event for every learner is being marked "ignored" because the system cannot translate Coursera course IDs into our program/course slugs. Populate via /admin/coursera "Map this" actions or backfill from B4B.',
    });
  } else {
    verdict.push({
      status: 'ok',
      title: `${canonicalMappingsTotal} canonical course mapping${canonicalMappingsTotal === 1 ? '' : 's'} configured`,
      detail: 'xAPI events have a path to canonical course progress.',
    });
  }

  const xapiTotal = Number(xapiAgg.total);
  const xapiIgnored = Number(xapiAgg.ignored);
  const xapiErrored = Number(xapiAgg.errored);
  const xapiUnresolved = Number(xapiAgg.unresolved ?? 0);
  // The xAPI pipeline upserts CourseProgress unconditionally for matched
  // identities (see lib/xapi/inboundStatementPipeline.ts:98). The
  // `completion_status='ignored'` label means "not a completion verb" (e.g.
  // a `progressed` event), which is NORMAL for in-progress learners — it
  // does NOT mean the event was skipped or that CourseProgress wasn't
  // updated. The real failure signal is `error` rows or zero CourseProgress
  // rows alongside non-zero events. We previously flagged all-ignored as a
  // RED failure, which scared admins about a pipeline that was working fine.
  if (xapiTotal === 0) {
    verdict.push({
      status: 'warn',
      title: 'No xAPI events received',
      detail:
        "Coursera hasn't posted any xAPI activity for this member. Either the member hasn't engaged with course content, the LRS webhook isn't configured, or the actor identity doesn't match.",
    });
  } else if (xapiErrored > 0) {
    verdict.push({
      status: 'fail',
      title: `${xapiErrored} of ${xapiTotal} xAPI events errored`,
      detail:
        'Errored events failed during processing — typically because no enrolled program could be resolved. Check enrollment + identity mapping and reprocess via /admin/coursera.',
    });
  } else if (xapiUnresolved > 0) {
    // WAP-276: course-progress statements whose course didn't resolve wrote no
    // progress. Rows recorded before this status existed still read 'ignored'.
    verdict.push({
      status: 'warn',
      title: `${xapiUnresolved} of ${xapiTotal} xAPI progress events had an unmapped course`,
      detail:
        'These events matched the learner but their Coursera course did not resolve to a program course, so no progress was written. Add the canonical course mapping; the hourly auto-heal replays them once it exists. Their slugs are listed first below.',
    });
  } else if (courseProgressRows === 0 && xapiTotal > 0) {
    verdict.push({
      status: 'warn',
      title: `${xapiTotal} xAPI events received but 0 CourseProgress rows`,
      detail:
        'Events arrived and matched the learner, but none promoted to CourseProgress. Likely cause: course slug in the events does not match any CourseraCanonicalCourseMapping or the program catalog. Inspect ignored event slugs below.',
    });
  } else {
    verdict.push({
      status: 'ok',
      title: `${xapiTotal} xAPI events received · ${courseProgressRows} CourseProgress rows`,
      detail:
        xapiIgnored === xapiTotal
          ? 'All events are non-completion verbs (e.g. progressed). That is normal — completion arrives on the final event. Pipeline healthy.'
          : 'Pipeline healthy for this member.',
    });
  }

  const hasCanonicalEnrollment = Boolean(canonicalProgram) || enrollmentsRaw.length > 0;
  if (freshness) {
    const item = freshnessVerdict({
      facts: freshness,
      hasCanonicalEnrollment,
      allProgramsComplete:
        reconciliation.length > 0 && reconciliation.every((program) => program.allComplete),
      now: new Date(),
    });
    if (item) verdict.push({ status: item.status, title: item.title, detail: item.detail });
  } else if (hasCanonicalEnrollment) {
    verdict.push({
      status: 'warn',
      title: 'Sync freshness unavailable',
      detail:
        'The last-sync and last-activity reads failed, so this report cannot say whether the numbers are current. Re-run the diagnostic; if it keeps failing, check /admin/coursera/health.',
    });
  }

  if (canonicalProgram && !member.courseraEnrollmentApproved) {
    verdict.push({
      status: 'warn',
      title: 'Coursera enrollment not yet approved',
      detail:
        'The member has an enrolled program but has not been approved for a Coursera seat. Approve below to consume a seat.',
    });
  }

  return {
    ok: true,
    user: {
      id: member.id,
      email: member.email,
      fullName: member.fullName,
      enrolledProgram: member.enrolledProgram,
      canonicalProgram,
      courseraEnrollmentApproved: member.courseraEnrollmentApproved,
    },
    freshness,
    identityMappings,
    enrollments: enrollmentsRaw.map(({ programSlug, isPrimary, enrolledAt }) => ({
      programSlug,
      isPrimary,
      enrolledAt,
    })),
    xapi: {
      totalForActor: xapiTotal,
      ignoredForActor: xapiIgnored,
      processedForActor: Number(xapiAgg.processed),
      erroredForActor: Number(xapiAgg.errored),
      latestIgnored: latestIgnored.map((row) => ({
        courseSlug: row.course_slug,
        verbId: row.verb_id,
        receivedAt: row.received_at,
      })),
    },
    canonical: {
      courseProgressRows,
      courseraCourseProgressRows,
      courseraBadgeProgressRows,
      canonicalMappingsTotal,
    },
    reconciliation,
    verdict,
  };
}
