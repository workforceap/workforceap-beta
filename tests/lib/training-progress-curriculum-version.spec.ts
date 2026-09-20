import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('training progress curriculum-version propagation', () => {
  it('uses a named options contract and the immutable versioned course list', () => {
    const trainingProgress = source('lib/member/trainingProgress.ts');
    const partnerProgress = source('lib/partner/memberProgress.ts');

    expect(trainingProgress).toContain('type ComputeTrainingProgressArgs');
    expect(trainingProgress).toContain(
      'getProgramCoursesForCurriculumVersion(program, curriculumVersion)',
    );
    expect(partnerProgress).toContain('args: ComputeTrainingProgressArgs');
  });

  it.each([
    'lib/admin/courseraEnrollmentPipeline.ts',
    'lib/partner/referralBundle.ts',
    'lib/partner/attentionQueue.ts',
    'lib/analytics/quarterlyOutcomes.ts',
    'lib/analytics/partnerQuarterlyOutcomes.ts',
    'app/admin/members/job-ready/page.tsx',
    'app/admin/partners/[id]/page.tsx',
    'app/admin/subgroups/[id]/page.tsx',
    'app/api/admin/subgroups/[id]/members/route.ts',
    'app/api/subgroup/members/[id]/route.ts',
    'app/api/subgroup/members/route.ts',
    'app/api/subgroup/dashboard/route.ts',
    'app/api/cron/partner-outcome-digest/route.ts',
    'app/(portal)/counselor/overview/page.tsx',
    'app/(portal)/counselor/students/page.tsx',
    'app/(portal)/dashboard/career-brief/page.tsx',
    'app/api/admin/export/members/_membersExportQuery.ts',
    'lib/member/memberProgramTrainingView.ts',
    'lib/member/atRiskScoring.ts',
    'app/api/counselor/members/[memberId]/route.ts',
  ])('%s selects a CourseEnrollment curriculum version', (path) => {
    const text = source(path);
    expect(text).toContain('courseEnrollments');
    expect(text).toContain('curriculumVersion');
  });

  it.each([
    'lib/member/memberProgramTrainingView.ts',
    'lib/member/atRiskScoring.ts',
    'app/api/counselor/members/[memberId]/route.ts',
  ])('%s resolves the authoritative assignment before reading progress', (path) => {
    const text = source(path);
    expect(text).toContain('resolveTrainingProgressAssignment');
  });

  it.each([
    'app/admin/members/page.tsx',
    'app/(portal)/counselor/students/[memberId]/page.tsx',
    'app/api/admin/export/members/route.ts',
  ])('%s renders the assigned version instead of a static denominator', (path) => {
    const text = source(path);
    expect(text).toContain('resolveTrainingProgressAssignment');
    expect(text).toContain('curriculumVersion');
    expect(text).toContain('getProgramCoursesForCurriculumVersion');
  });

  it('passes the resolved version through the client counselor roster', () => {
    const page = source('app/(portal)/counselor/students/page.tsx');
    const client = source(
      'components/portal/counselor/CounselorStudentsRosterClient.tsx',
    );

    expect(page).toContain('curriculumVersion: assignment.curriculumVersion');
    expect(client).toContain('curriculumVersion: row.curriculumVersion');
  });
});
