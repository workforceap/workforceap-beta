import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { LEGACY_CURRICULUM_VERSION } from '@/lib/content/programCurriculumManifest';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import {
  getValidatedProgramCompletionSpec,
  VALIDATED_PROGRAM_COMPLETION_SPECS,
} from '@/lib/reporting/programCompletion';
import { buildCsv, csvDate } from '@/lib/csv';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { getActorOrganizationId } from '@/lib/tenant/organization';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async (req: NextRequest) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const superAdmin = await isSuperAdmin(user.id);
  const orgId = superAdmin ? null : await getActorOrganizationId(user.id);

  const slug = req.nextUrl.searchParams.get('program')?.trim() ?? '';
  if (!slug) {
    return NextResponse.json(
      { error: 'Missing required `program` query parameter (program slug).' },
      { status: 400 },
    );
  }

  const program = getProgramBySlug(slug);
  if (!program) {
    return NextResponse.json(
      { error: `Unknown program slug: ${slug}` },
      { status: 404 },
    );
  }

  const programStorageValues = Array.from(
    new Set(
      VALIDATED_PROGRAM_COMPLETION_SPECS
        .filter((spec) => spec.canonicalSlug === program.slug)
        .flatMap((spec) => spec.storageValues),
    ),
  );

  try {
  const EXPORT_LIMIT = 10_000;
  // Strict member filter: WIOA / funder cohort exports must never include
  // admin-dogfood rows. Use MEMBER_OR_DOGFOOD_WHERE only on internal admin
  // surfaces.
  const users = await prisma.$transaction((tx) => tx.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { courseEnrollments: { some: { programSlug: { in: programStorageValues } } } },
        {
          enrolledProgram: { in: programStorageValues },
          courseEnrollments: { none: {} },
        },
      ],
      ...(orgId ? { organizationId: orgId } : {}),
      ...MEMBER_ONLY_WHERE,
    },
    orderBy: { createdAt: 'desc' },
    take: EXPORT_LIMIT,
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledAt: true,
      assessmentCompleted: true,
      courseEnrollments: {
        where: { programSlug: { in: programStorageValues } },
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        take: 1,
        select: { programSlug: true, curriculumVersion: true, enrolledAt: true },
      },
      memberProgramProgress: {
        where: { programSlug: { in: programStorageValues } },
        orderBy: { lastUpdatedAt: 'desc' },
        select: { programSlug: true, coursesCompleted: true },
      },
      courseProgress: {
        where: { programSlug: { in: programStorageValues }, status: 'COMPLETED' },
        select: { courseSlug: true },
      },
      assessmentScorePct: true,
      profile: {
        select: {
          employmentStatus: true,
        },
      },
      preScreeningResponse: {
        select: {
          employmentStatus: true,
          barrier: true,
        },
      },
      placementRecord: {
        select: {
          employerName: true,
          jobTitle: true,
          startDate: true,
          salaryOffered: true,
          wageAtFollowUp: true,
          retentionStatus: true,
          placedAt: true,
        },
      },
    },
  }));

  const csvColumns = [
    'Member Name',
    'Email',
    'Enrollment Date',
    'Program Slug',
    'Courses Completed',
    'Total Courses',
    'Completion %',
    'Assessment Completed',
    'Assessment Points Score % (legacy not WAPAT)',
    'Employer',
    'Job Title',
    'Start Date',
    'Annual Salary',
    'Hourly Wage (est.)',
    'Wage at Follow-Up',
    'Retention Status',
    'Employment Status at Enroll',
    'Employment Barriers',
  ];

  const csvRows = users.map((u) => {
    const completed = u.courseProgress.map((row) => row.courseSlug);
    const enrollment = u.courseEnrollments[0] ?? null;
    const rollup =
      u.memberProgramProgress.find(
        (row) => row.programSlug === enrollment?.programSlug,
      )
      ?? u.memberProgramProgress[0]
      ?? null;
    const completionSpec = getValidatedProgramCompletionSpec(
      enrollment?.programSlug ?? program.slug,
      enrollment?.curriculumVersion ?? LEGACY_CURRICULUM_VERSION,
    );
    const totalCourses = completionSpec?.totalCourses ?? 0;
    const assignedCourseSlugs = new Set(
      getProgramCoursesForCurriculumVersion(
        program,
        enrollment?.curriculumVersion ?? LEGACY_CURRICULUM_VERSION,
      ).map((course) => course.slug),
    );
    const completedAssignedCourses = new Set(
      completed.filter((courseSlug) => assignedCourseSlugs.has(courseSlug)),
    ).size;
    const coursesCompleted = rollup?.coursesCompleted ?? completedAssignedCourses;
    const completionPct = totalCourses > 0
      ? Math.max(0, Math.min(100, Math.round((coursesCompleted / totalCourses) * 100)))
      : 0;

    const p = u.placementRecord;
    // Hourly wage estimate from annual salary (40h/wk × 52wk = 2080h)
    const hourly =
      p?.salaryOffered != null
        ? `$${(p.salaryOffered / 2080).toFixed(2)}`
        : '';
    const annual =
      p?.salaryOffered != null
        ? `$${p.salaryOffered.toLocaleString()}`
        : '';
    const followUp =
      p?.wageAtFollowUp != null
        ? `$${p.wageAtFollowUp.toLocaleString()}`
        : '';

    // Prefer pre-screening employment status (captured at enroll); fall back to profile.
    const employmentAtEnroll =
      u.preScreeningResponse?.employmentStatus ??
      u.profile?.employmentStatus ??
      '';

    const barriers = u.preScreeningResponse?.barrier ?? '';

    return [
      u.fullName,
      u.email,
      csvDate(enrollment?.enrolledAt ?? u.enrolledAt),
      slug,
      coursesCompleted,
      totalCourses,
      totalCourses > 0 ? `${completionPct}%` : '',
      u.assessmentCompleted ? 'Yes' : 'No',
      u.assessmentScorePct != null ? `${u.assessmentScorePct}%` : '',
      p?.employerName ?? '',
      p?.jobTitle ?? '',
      csvDate(p?.startDate ?? p?.placedAt),
      annual,
      hourly,
      followUp,
      p?.retentionStatus ?? '',
      employmentAtEnroll,
      barriers,
    ];
  });

  const csv = buildCsv(csvColumns, csvRows, {
    reportTitle: `Cohort Export — ${program.title}`,
    notes:
      'Placement + wage cohort export for grant reporting (e.g. WIOA). Generated by WorkforceAP.',
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `cohort-${slug}-${date}.csv`;

  const headers: Record<string, string> = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  };
  if (users.length >= EXPORT_LIMIT) {
    headers['X-Export-Truncated'] = 'true';
    headers['X-Export-Limit'] = `${EXPORT_LIMIT}`;
  }

  // AUDIT §H-DEP4: federal-grant exports must leave an audit trail.
  await auditLog({
    actorUserId: user.id,
    action: 'admin.export.cohort',
    targetType: 'CohortExport',
    metadata: {
      orgId,
      programSlug: slug,
      rowCount: users.length,
      truncated: users.length >= EXPORT_LIMIT,
      limit: EXPORT_LIMIT,
    },
  }).catch((err) => console.error('[admin/cohort-export] audit log failed:', err));
  await logAuditEvent({
    user: { id: user.id, role: 'admin' },
    verb: 'exported',
    object: { type: 'CohortExport', id: slug },
    result: {
      success: true,
      extensions: {
        orgId,
        programSlug: slug,
        rowCount: users.length,
        truncated: users.length >= EXPORT_LIMIT,
        limit: EXPORT_LIMIT,
      },
    },
    request: auditRequestMeta(req),
    orgId,
  }).catch((err) => console.error('[admin/cohort-export] xAPI audit log failed:', err));

  return new NextResponse(csv, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }

  } catch (error) {
    console.error('/admin/cohort-export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

