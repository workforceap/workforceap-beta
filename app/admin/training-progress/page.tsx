import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { ADMIN_SSR_LIST_CAP, showingFirstLabel } from '@/lib/db/queryCaps';
import { MEMBER_OR_DOGFOOD_WHERE } from '@/lib/admin/memberOnlyWhere';
import { getProgramBySlug, PROGRAMS } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';
import { parseCourseGradeString, scoreScaledToDisplayPercent } from '@/lib/coursera/courseGradeDisplay';
import { humanizeCourseraCourseTitle } from '@/lib/coursera/courseTitle';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { STUDENTS_SECONDARY_LOAD_NOTICE } from '@/lib/admin/studentsRosterLoad';
import { loadTrainingRoster } from '@/lib/admin/trainingRosterLoad';
import { TRAINING_PROGRESS_LEGACY_HREF } from '@/lib/admin/studentsRosterView';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import TrainingProgressClient, {
  type CurriculumRow,
  type RawCourseraRow,
} from '@/components/admin/TrainingProgressClient';
import { StudentsRosterKit } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Training progress',
    description:
      'Per-learner training progress across both the canonical curriculum and raw Coursera enrollments. Sortable.',
    path: '/admin/training-progress',
  });
}

export const dynamic = 'force-dynamic';

/**
 * Training progress is the training preset of the one admin roster
 * (`StudentsRosterKit view="training"`, also at /admin/students?view=training).
 * The original sortable dual-table (canonical + raw Coursera) stays behind
 * `?ui=legacy`.
 */
export default async function AdminTrainingProgressPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/training-progress');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // ─── Legacy: the original sortable dual-table (canonical + raw Coursera) ───
  if (requestedUi === 'legacy') {
    return renderLegacy(scope);
  }

  // ─── DEFAULT: the shared roster kit with the training column preset ───
  const training = await loadTrainingRoster(scope, { readOnlyAudit });
  if (!training.ok) redirect(TRAINING_PROGRESS_LEGACY_HREF);

  return (
    <>
      {training.secondaryLoadFailed ? (
        <span hidden data-portal-error-state="admin-training-progress-secondary-load" />
      ) : null}
      <StudentsRosterKit
        view="training"
        viewHrefs={{ roster: '/admin/students', training: '/admin/training-progress' }}
        students={training.students}
        total={training.total}
        showingLabel={training.showingLabel}
        notice={training.secondaryLoadFailed ? STUDENTS_SECONDARY_LOAD_NOTICE : undefined}
      />
    </>
  );
}

/** Original sortable dual-table view (canonical curriculum + raw Coursera). */
async function renderLegacy(scope: import("@/lib/tenant/adminPageScope").AdminPageTenantOk) {
  const [learners, learnerTotal] = await Promise.all([
    withAdminPageScope(scope, (db) => db.user.findMany({
      take: ADMIN_SSR_LIST_CAP,
      where: { deletedAt: null, ...MEMBER_OR_DOGFOOD_WHERE },
      orderBy: [{ fullName: 'asc' }],
      select: {
        id: true,
        fullName: true,
        email: true,
        enrolledProgram: true,
        profile: { select: { role: true } },
      },
    })),
    withAdminPageScope(scope, (db) => db.user.count({
      where: { deletedAt: null, ...MEMBER_OR_DOGFOOD_WHERE },
    })),
  ]);

  const learnerIds = learners.map((l) => l.id);

  const [canonicalProgressRows, rawCourseraRows, rawCourseraTotal, courseEnrollmentRows] = await Promise.all([
    prisma.courseProgress.findMany({
      where: { userId: { in: learnerIds } },
      select: {
        userId: true,
        programSlug: true,
        courseSlug: true,
        courseId: true,
        status: true,
        percentComplete: true,
        lastActivityAt: true,
        lastUpdatedAt: true,
        scoreScaled: true,
      },
    }),
    prisma.courseraCourseProgress.findMany({
      take: ADMIN_SSR_LIST_CAP,
      // Intentionally not filtered only by `userId in learnerIds`: we want to
      // surface every Coursera enrollment in this tenant — including rows whose
      // courseraEmail never matched a WAP user. Those orphans are exactly the
      // ones an admin needs to reconcile (matching `/admin/coursera`'s
      // unmatched-learners panel). The organization predicate is mandatory;
      // raw rows contain learner PII and must never cross tenant boundaries.
      where: { organizationId: scope.orgId },
      orderBy: [{ lastActivityTime: 'desc' }],
      select: {
        userId: true,
        externalEmail: true,
        externalName: true,
        courseraCourseId: true,
        courseraCourseSlug: true,
        courseName: true,
        university: true,
        programSlug: true,
        programName: true,
        overallProgress: true,
        courseGrade: true,
        learningHours: true,
        isCompleted: true,
        enrollmentTime: true,
        lastActivityTime: true,
        completionTime: true,
      },
    }),
    prisma.courseraCourseProgress.count({
      where: { organizationId: scope.orgId },
    }),
    // Multi-program: drive the curriculum view from EVERY enrollment row
    // (primary + secondary), not just `User.enrolledProgram`. The legacy
    // single-program field stays as a fallback below for users without any
    // CourseEnrollment rows yet (seeded test users).
    withAdminPageScope(scope, (db) => db.courseEnrollment.findMany({
      where: { userId: { in: learnerIds } },
      orderBy: [{ userId: 'asc' }, { isPrimary: 'desc' }, { enrolledAt: 'desc' }],
      select: {
        userId: true,
        programSlug: true,
        curriculumVersion: true,
        isPrimary: true,
      },
    })),
  ]);

  const rawCourseraIds = Array.from(
    new Set(rawCourseraRows.map((row) => row.courseraCourseId).filter(Boolean)),
  );
  const dbMappings = rawCourseraIds.length > 0
    ? await prisma.courseraCanonicalCourseMapping.findMany({
        where: { courseraCourseId: { in: rawCourseraIds } },
        select: {
          courseraCourseId: true,
          canonicalProgramSlug: true,
          canonicalCourseSlug: true,
        },
      })
    : [];

  const dbMappingByCourseraId = new Map(
    dbMappings.map((m) => [m.courseraCourseId, m]),
  );

  const canonicalByKey = new Map<string, (typeof canonicalProgressRows)[number]>();
  const statusRank = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2 } as const;
  for (const row of canonicalProgressRows) {
    const canonicalProgramSlug = canonicalizeProgramSlug(row.programSlug);
    const key = `${row.userId}:${canonicalProgramSlug}:${row.courseSlug}`;
    const current = canonicalByKey.get(key);
    if (!current) {
      canonicalByKey.set(key, row);
      continue;
    }
    const status = statusRank[current.status] >= statusRank[row.status]
      ? current.status
      : row.status;
    const stronger = statusRank[current.status] >= statusRank[row.status] ? current : row;
    canonicalByKey.set(key, {
      ...stronger,
      programSlug: canonicalProgramSlug,
      status,
      percentComplete:
        status === 'COMPLETED'
          ? 100
          : Math.max(current.percentComplete, row.percentComplete),
      courseId: current.courseId ?? row.courseId,
      lastActivityAt:
        !current.lastActivityAt || (row.lastActivityAt && row.lastActivityAt > current.lastActivityAt)
          ? row.lastActivityAt
          : current.lastActivityAt,
      lastUpdatedAt: row.lastUpdatedAt > current.lastUpdatedAt
        ? row.lastUpdatedAt
        : current.lastUpdatedAt,
    });
  }

  // Multi-program: bucket every CourseEnrollment row by user so we can
  // emit curriculum rows for primary + secondary programs in one pass.
  const enrollmentsByUser = new Map<string, typeof courseEnrollmentRows>();
  for (const row of courseEnrollmentRows) {
    const bucket = enrollmentsByUser.get(row.userId);
    if (bucket) bucket.push(row);
    else enrollmentsByUser.set(row.userId, [row]);
  }

  // Curriculum view: row per (learner × enrolled program × canonical course).
  // For multi-program learners we emit one block per enrolled program, in
  // this order: primary first, then each secondary alphabetically by program
  // title. The `programRole` field lets the client component show a
  // `secondary` pill on rows from non-primary programs.
  const curriculumRows: CurriculumRow[] = [];
  for (const learner of learners) {
    const learnerEnrollments = enrollmentsByUser.get(learner.id) ?? [];

    // Build the ordered list of programs to render for this learner. When
    // CourseEnrollment rows exist, they drive the view (primary first, then
    // secondaries alpha by program title). Otherwise fall back to the
    // legacy `User.enrolledProgram` so seeded users without a backfilled
    // enrollment row still get a curriculum block (treated as primary).
    type ProgramEmit = {
      programSlug: string;
      curriculumVersion: string;
      programRole: 'primary' | 'secondary';
    };
    let programsToEmit: ProgramEmit[] = [];

    if (learnerEnrollments.length > 0) {
      const primary = learnerEnrollments.find((e) => e.isPrimary) ?? null;
      const secondaries = learnerEnrollments
        .filter((e) => e !== primary)
        .map((e) => ({
          programSlug: e.programSlug,
          curriculumVersion: e.curriculumVersion,
          programTitle: programDisplayTitle(e.programSlug),
        }))
        .sort((a, b) => a.programTitle.localeCompare(b.programTitle));

      if (primary) {
        programsToEmit.push({
          programSlug: primary.programSlug,
          curriculumVersion: primary.curriculumVersion,
          programRole: 'primary',
        });
      }
      for (const s of secondaries) {
        programsToEmit.push({
          programSlug: s.programSlug,
          curriculumVersion: s.curriculumVersion,
          programRole: 'secondary',
        });
      }
    } else if (learner.enrolledProgram) {
      programsToEmit = [{
        programSlug: learner.enrolledProgram,
        curriculumVersion: 'legacy-v1',
        programRole: 'primary',
      }];
    }

    for (const { programSlug, curriculumVersion, programRole } of programsToEmit) {
      const program = getProgramBySlug(programSlug);
      if (!program) continue;
      const canonicalProgramSlug = program.slug;
      const assignedCourses = getProgramCoursesForCurriculumVersion(
        program,
        curriculumVersion,
      );
      for (const course of assignedCourses) {
        const progress = canonicalByKey.get(`${learner.id}:${canonicalProgramSlug}:${course.slug}`);
        curriculumRows.push({
          key: `${learner.id}:${canonicalProgramSlug}:${course.slug}`,
          learnerId: learner.id,
          learnerName: learner.fullName ?? '',
          learnerEmail: learner.email ?? '',
          learnerRole: learner.profile?.role ?? 'member',
          programSlug: canonicalProgramSlug,
          programTitle: program.title,
          programRole,
          courseSlug: course.slug,
          courseName: course.name,
          courseraCourseId: progress?.courseId ?? course.courseraCourseId ?? null,
          status: progress?.status ?? 'NOT_STARTED',
          percentComplete: progress?.percentComplete ?? 0,
          gradePercent: scoreScaledToDisplayPercent(progress?.scoreScaled),
          lastActivityAt: progress?.lastActivityAt?.toISOString() ?? null,
          lastUpdatedAt: progress?.lastUpdatedAt?.toISOString() ?? null,
        });
      }
    }
  }

  // Raw Coursera view: row per (learner × actual Coursera course they're in)
  // Mapping resolution order:
  //   1. DB-curated mapping in coursera_canonical_course_mappings (admin-edited)
  //   2. Static program-def mapping via courseraCourseId / slug
  //   3. Unmapped — surface the inline "Map this" form in the UI
  const learnersById = new Map(learners.map((l) => [l.id, l]));
  const rawRows: RawCourseraRow[] = rawCourseraRows.map((row) => {
    const learner = row.userId ? learnersById.get(row.userId) : null;
    const learnerEnrollments = row.userId ? enrollmentsByUser.get(row.userId) ?? [] : [];
    const activeEnrollment =
      learnerEnrollments.find((enrollment) => enrollment.isPrimary) ??
      (learner?.enrolledProgram
        ? learnerEnrollments.find((enrollment) =>
            programSlugsEquivalent(enrollment.programSlug, learner.enrolledProgram as string),
          )
        : null) ??
      learnerEnrollments[0] ??
      null;
    const suggestedProgramSlug = activeEnrollment?.programSlug ?? learner?.enrolledProgram ?? null;
    let mappedProgramSlug: string | null = null;
    let mappedCourseSlug: string | null = null;
    let mappingSource: 'db' | 'static' | null = null;

    const dbMatch = dbMappingByCourseraId.get(row.courseraCourseId);
    if (dbMatch) {
      mappedProgramSlug = dbMatch.canonicalProgramSlug;
      mappedCourseSlug = dbMatch.canonicalCourseSlug;
      mappingSource = 'db';
    } else if (suggestedProgramSlug) {
      const program = getProgramBySlug(suggestedProgramSlug);
      const curriculumVersion =
        activeEnrollment &&
        programSlugsEquivalent(activeEnrollment.programSlug, suggestedProgramSlug)
          ? activeEnrollment.curriculumVersion
          : 'legacy-v1';
      const assignedCourses = program
        ? getProgramCoursesForCurriculumVersion(program, curriculumVersion)
        : [];
      const match = assignedCourses.find(
        (c) =>
          (c.courseraCourseId && c.courseraCourseId === row.courseraCourseId) ||
          (row.courseraCourseSlug && c.slug === row.courseraCourseSlug),
      );
      if (match) {
        mappedProgramSlug = program?.slug ?? suggestedProgramSlug;
        mappedCourseSlug = match.slug;
        mappingSource = 'static';
      }
    }
    return {
      key: `${row.userId ?? row.externalEmail}:${row.courseraCourseId}`,
      learnerId: row.userId,
      // When a learner's Coursera email never matched a WAP user, fall back
      // to the externalName from the Coursera CSV/API so the row is still
      // identifiable in the table — and flag the identity gap explicitly.
      learnerName: learner?.fullName ?? row.externalName ?? null,
      learnerEmail: learner?.email ?? row.externalEmail,
      learnerRole: learner?.profile?.role ?? null,
      identityMatched: Boolean(learner),
      courseraCourseId: row.courseraCourseId,
      courseraCourseSlug: row.courseraCourseSlug,
      courseName: humanizeCourseraCourseTitle(row.courseName, row.courseraCourseSlug),
      university: row.university,
      courseraProgramSlug: row.programSlug,
      courseraProgramName: row.programName,
      mappedProgramSlug,
      mappedCourseSlug,
      mappingSource,
      suggestedProgramSlug,
      percentComplete: Number(row.overallProgress),
      gradePercent: parseCourseGradeString(row.courseGrade),
      learningHours: Number(row.learningHours),
      isCompleted: row.isCompleted,
      enrollmentTime: row.enrollmentTime?.toISOString() ?? null,
      lastActivityTime: row.lastActivityTime?.toISOString() ?? null,
      completionTime: row.completionTime?.toISOString() ?? null,
    };
  });

  // Catalog of canonical (programSlug, courseSlug, courseName) options the
  // client can offer in the "Map this" dropdown. Built from the static
  // program definitions in lib/content/programs.ts.
  const canonicalCatalog = PROGRAMS.map((program) => ({
    programSlug: program.slug,
    programTitle: program.title,
    courses: program.courses.map((c) => ({
      slug: c.slug,
      name: c.name,
      courseraCourseId: c.courseraCourseId ?? null,
    })),
  }));

  return (
    <PortalPageFrame>
      <PageHeader
        title="Training progress"
        subtitle="All learners across both canonical curriculum (DB course_progress) and raw Coursera enrollments (coursera_course_progress). Sort any column."
      />
      <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
        {showingFirstLabel(learners.length, learnerTotal, 'member records')} ·{' '}
        {showingFirstLabel(rawCourseraRows.length, rawCourseraTotal, 'raw Coursera rows')}
      </p>
      <TrainingProgressClient
        curriculumRows={curriculumRows}
        rawRows={rawRows}
        canonicalCatalog={canonicalCatalog}
      />
    </PortalPageFrame>
  );
}
