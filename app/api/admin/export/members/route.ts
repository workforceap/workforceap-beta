import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { getPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStage } from '@/lib/pipeline/stage';
import { buildCsv, csvDate } from '@/lib/csv';
import { buildMemberExportWhere, fetchMembersForExport, MEMBER_EXPORT_LIMIT } from './_membersExportQuery';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  ELIGIBILITY_DATASHEET_COLUMNS,
  eligibilityDatasheetCells,
} from '@/lib/apply/eligibilityScreeningFields';

/**
 * GET /api/admin/export/members
 *
 * State-agnostic member training export for workforce reporting.
 * Supports query-param filters: state, stage, program, wioaStatus, dateFrom, dateTo, courseraStatus
 *
 * Designed to satisfy any state's workforce training qualification reporting —
 * columns cover demographics, enrollment, course progress, Coursera access,
 * WIOA qualification, certifications, and placement outcomes.
 */
async function _GET(req: NextRequest) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const filterState = params.get('state') || undefined;
  const filterStage = params.get('stage') || undefined;
  const filterProgram = params.get('program') || undefined;
  const filterWioa = params.get('wioaStatus') || undefined;
  const filterDateFrom = params.get('dateFrom') || undefined;
  const filterDateTo = params.get('dateTo') || undefined;
  const filterCoursera = params.get('courseraStatus') || undefined;

  const where = buildMemberExportWhere({
    state: filterState,
    program: filterProgram,
    wioaStatus: filterWioa,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
    courseraStatus: filterCoursera,
  });

  const orgId = await getActorOrganizationId(user.id);

  const { rows, truncated } = await withTenantScope(orgId, (db) =>
    fetchMembersForExport(db, where, filterStage),
  );

  // Build CSV
  const csvColumns = [
    'Full Name',
    'Email',
    'Phone',
    'State',
    'City',
    'Zip',
    'Date of Birth',
    'Education Level',
    'Employment Status',
    'Veteran Status',
    'Household Income',
    'Ethnicity',
    'Signup Date',
    'Pipeline Stage',
    'Program',
    'Enrollment Date',
    'Funding Source',
    'Courses Completed',
    'Total Courses',
    'Completion %',
    'Completed Course Names',
    'Coursera Access',
    'Coursera Activated',
    'Assessment Done',
    'Assessment Points Score % (legacy, not WAPAT)',
    'WIOA Signal',
    'WIOA Review Status',
    'Certifications',
    'Placed Employer',
    'Placed Job Title',
    'Placed Salary',
    'Placed Date',
    ...ELIGIBILITY_DATASHEET_COLUMNS,
    'Eligibility Screening Submitted',
  ];

  const csvRows = rows.map((u) => {
    const assignment = resolveTrainingProgressAssignment(
      u.enrolledProgram,
      u.courseEnrollments,
    );
    const stage = getPipelineStage({
      ...u,
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
    });
    const stageLabel = PIPELINE_STAGE_LABELS[stage as PipelineStage] ?? stage;

    const selectedProgramSlug = assignment.programSlug;
    const enrollment = selectedProgramSlug
      ? u.courseEnrollments.find(
          (row) =>
            row.isPrimary || programSlugsEquivalent(row.programSlug, selectedProgramSlug),
        ) ?? null
      : null;
    const programSlug = selectedProgramSlug;
    const curriculumVersion = assignment.curriculumVersion;
    const program = programSlug ? getProgramBySlug(programSlug) : null;
    const assignedCourses = program
      ? getProgramCoursesForCurriculumVersion(program, curriculumVersion)
      : [];
    const programTitle = programSlug ? programDisplayTitle(programSlug) : '';
    const totalCourses = assignedCourses.length;
    const completedSlugSet = new Set(
      programSlug
        ? u.courseProgress
            .filter((row) => programSlugsEquivalent(row.programSlug, programSlug))
            .map((row) => row.courseSlug)
        : [],
    );
    const completed = assignedCourses
      .filter((course) => completedSlugSet.has(course.slug))
      .map((course) => course.slug);
    const rollup = programSlug
      ? u.memberProgramProgress.find((row) =>
          programSlugsEquivalent(row.programSlug, programSlug),
        ) ?? null
      : null;
    const completionPct = totalCourses > 0
      ? Math.max(0, Math.min(100, rollup?.averagePercent ?? Math.round((completed.length / totalCourses) * 100)))
      : 0;

    // Map completed slugs to course names from canonical CourseProgress rows.
    const completedNames = program
      ? completed
          .map((slug) => assignedCourses.find((c) => c.slug === slug)?.name ?? slug)
          .join('; ')
      : completed.join('; ');

    const courseraReq = u.trainingAccessRequests.find((r) => r.providerKey === 'coursera');
    const courseraStatus = courseraReq?.status ?? 'None';

    const wioa = u.wioaQualificationJson as { signal?: string } | null;
    const wioaSignal = wioa?.signal ?? '';

    const fundingSource = enrollment?.fundingSource ?? '';

    const certs = u.userCertifications.map((c) => c.certName).join('; ');

    const p = u.placementRecord;
    const screening = u.applyEligibilityScreenings[0] ?? null;

    return [
      u.fullName,
      u.email,
      u.phone,
      u.profile?.state,
      u.profile?.city,
      u.profile?.zip,
      csvDate(u.profile?.dob),
      u.profile?.educationLevel,
      u.profile?.employmentStatus,
      u.profile?.veteranStatus,
      u.profile?.householdIncome,
      u.profile?.ethnicity,
      csvDate(u.createdAt),
      stageLabel,
      programTitle,
      csvDate(enrollment?.enrolledAt ?? u.enrolledAt),
      fundingSource,
      completed.length,
      totalCourses,
      totalCourses > 0 ? `${completionPct}%` : '',
      completedNames,
      courseraStatus,
      csvDate(courseraReq?.activatedAt),
      u.assessmentCompleted ? 'Yes' : 'No',
      u.assessmentScorePct != null ? `${u.assessmentScorePct}%` : '',
      wioaSignal,
      u.wioaReviewStatus,
      certs,
      p?.employerName,
      p?.jobTitle,
      p?.salaryOffered != null ? `$${p.salaryOffered.toLocaleString()}` : '',
      csvDate(p?.placedAt),
      ...eligibilityDatasheetCells(screening),
      csvDate(screening?.createdAt),
    ];
  });

  const csv = buildCsv(csvColumns, csvRows, { reportTitle: 'Member Training Export', notes: 'Workforce training qualification reporting — Workforce Advancement Project' });
  const filename = `workforceap-members-export-${new Date().toISOString().slice(0, 10)}.csv`;

  const headers: Record<string, string> = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  };
  if (truncated) {
    headers['X-Export-Truncated'] = `true`;
    headers['X-Export-Limit'] = `${MEMBER_EXPORT_LIMIT}`;
  }

  return new NextResponse(csv, { status: 200, headers });

  } catch (error) {
    console.error('/admin/export/members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
