import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepo(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('curriculum-versioned portal reads', () => {
  it.each([
    'lib/admin/trainingDashboard.ts',
    'lib/admin/studentsRosterEnrichment.ts',
    'app/admin/training-progress/page.tsx',
    'lib/admin/trainingRosterLoad.ts',
    'app/admin/members/[id]/page.tsx',
    'app/(portal)/partner/referred-members/[memberId]/page.tsx',
    'app/(portal)/employer/candidates/[studentId]/page.tsx',
    'app/api/member/coursera/route.ts',
    // The member home's single loader (the page itself holds no course list since WAP-195).
    'lib/member/loadMemberDashboardHome.ts',
    'app/admin/members/[id]/stakeholder/page.tsx',
    'app/(portal)/dashboard/program/employer-screening/page.tsx',
    'app/(portal)/dashboard/guide/page.tsx',
    'lib/content/learningPathways.ts',
    'app/(portal)/counselor/students/[memberId]/page.tsx',
    'app/admin/members/page.tsx',
    'app/api/admin/export/members/route.ts',
    'lib/admin/courseraOps.ts',
  ])('%s pins its course list to CourseEnrollment.curriculumVersion', (path) => {
    const source = readRepo(path);

    expect(source).toContain('curriculumVersion');
    expect(source).toContain('getProgramCoursesForCurriculumVersion');
  });

  it('separates admin validated-course caches by curriculum version', () => {
    const dashboard = readRepo('lib/admin/trainingDashboard.ts');
    const roster = readRepo('lib/admin/studentsRosterEnrichment.ts');
    // The training-progress roster loader moved out of the page when the
    // admin rosters were consolidated into one kit; the cache keys did not.
    const progress = readRepo('lib/admin/trainingRosterLoad.ts');

    expect(dashboard).toContain(
      '`${m.organizationId}:${enrolledProgram}:${curriculumVersion}`',
    );
    expect(roster).toContain(
      '`${row.organizationId}:${programSlug}:${curriculumVersion}`',
    );
    expect(roster).toContain('const { programSlug, curriculumVersion } = assignment');
    const rosterFacts = readRepo('lib/admin/studentsRosterFacts.ts');
    expect(rosterFacts).toContain('resolveTrainingProgressAssignment(args.enrolledProgram, args.enrollments)');
    expect(rosterFacts).toContain('canonicalizeProgramSlug(assignment.programSlug)');
    expect(progress).toContain('`${program.slug}:${curriculumVersion}`');
    expect(progress).toContain('`${programSlug}:${curriculumVersion}`');
  });

  it('does not render the public static denominator on learner detail surfaces', () => {
    const adminMember = readRepo('app/admin/members/[id]/page.tsx');
    const partnerMember = readRepo(
      'app/(portal)/partner/referred-members/[memberId]/page.tsx',
    );
    const employerMember = readRepo(
      'app/(portal)/employer/candidates/[studentId]/page.tsx',
    );
    const memberApi = readRepo('app/api/member/coursera/route.ts');

    expect(adminMember).toContain('curriculumCourses.map');
    expect(partnerMember).toContain('curriculumCourses.map');
    expect(employerMember).toContain('trainingCourses.map');
    expect(memberApi).toContain('totalCourses: assignedCourses.length');

    expect(adminMember).not.toContain('program?.courses.map');
    expect(partnerMember).not.toContain('program.courses.map');
    expect(employerMember).not.toContain('trainingProgram.courses.map');
  });

  it('uses the assigned denominator for next-course and readiness decisions', () => {
    const dashboard = readRepo('lib/member/loadMemberDashboardHome.ts');
    const stakeholder = readRepo('app/admin/members/[id]/stakeholder/page.tsx');
    const employerScreening = readRepo(
      'app/(portal)/dashboard/program/employer-screening/page.tsx',
    );
    const guide = readRepo('app/(portal)/dashboard/guide/page.tsx');

    // The member home reconciles progress against the pinned version's courses.
    expect(dashboard).toContain('getProgramCoursesForCurriculumVersion(program, pinnedCurriculumVersion)');
    expect(dashboard).toContain('reconcileProgramProgress({\n    validatedCourses,');
    expect(dashboard).not.toContain('program.courses.find');
    expect(stakeholder).toContain('curriculumCourses.map');
    expect(stakeholder).not.toContain('program.courses.map');
    expect(employerScreening).toContain('validatedCourses: curriculumCourses');
    expect(employerScreening).toContain('reconciliation.programPercent >= 85');
    expect(guide).toContain('curriculumCourseSlugs.has(row.courseSlug)');
  });

  it('builds Learning Hub and certification pathway steps from the pinned version', () => {
    const pathways = readRepo('lib/content/learningPathways.ts');
    const learningHub = readRepo('app/(portal)/dashboard/learning/page.tsx');
    const certifications = readRepo('app/(portal)/dashboard/certifications/page.tsx');

    expect(pathways).toContain(
      'getProgramCoursesForCurriculumVersion(program, curriculumVersion)',
    );
    expect(learningHub).toContain(
      'getPathwayForProgram(enrolledProgram, curriculumVersion)',
    );
    expect(learningHub).toContain(
      'programSlugsEquivalent(enrollment.programSlug, enrolledProgram)',
    );
    expect(learningHub).not.toContain('programMeta.courses');
    expect(certifications).toContain('primaryEnrollment?.curriculumVersion');
  });

  it('resolves dashboard curriculum assignments across historical program aliases', () => {
    const dashboard = readRepo('lib/member/loadMemberDashboardHome.ts');

    expect(dashboard).toContain('canonicalizeProgramSlug(rawSlug)');
    expect(dashboard).toContain('programSlugsEquivalent(row.programSlug, slug)');
  });

  it('keeps staff views and exports on the learner assigned denominator', () => {
    const counselor = readRepo('app/(portal)/counselor/students/[memberId]/page.tsx');
    const members = readRepo('app/admin/members/page.tsx');
    const exportQuery = readRepo('app/api/admin/export/members/_membersExportQuery.ts');
    const exportRoute = readRepo('app/api/admin/export/members/route.ts');
    const audit = readRepo('lib/admin/courseraOps.ts');

    expect(counselor).toContain('const curriculumVersion = trainingAssignment.curriculumVersion');
    expect(counselor).not.toContain('const programCourses = programMeta?.courses');
    expect(members).toContain('const curriculumVersion = assignment.curriculumVersion');
    expect(members).not.toContain('getProgramBySlug(m.enrolledProgram)?.courses.length');
    expect(exportQuery).toContain('curriculumVersion: true');
    expect(exportRoute).toContain('const curriculumVersion = assignment.curriculumVersion');
    expect(exportRoute).toContain('assignedCourses.find');
    expect(audit).toContain("enrollment?.curriculumVersion ?? 'legacy-v1'");
    expect(audit).not.toContain('DISCOVERED_COURSERA_PROGRAMS');
  });
});
