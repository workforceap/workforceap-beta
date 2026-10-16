import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PROGRAMS } from '@/lib/content/programs';
import {
  APPROVED_CURRICULUM_VERSION,
  CATALOG_CURRICULUM_VERSION,
  LEGACY_CURRICULUM_VERSION,
} from '@/lib/content/programCurriculumManifest';
import {
  getValidatedProgramCompletionSpec,
  hasValidatedProgramCompletion,
  isValidatedProgramComplete,
} from './programCompletion';

const sampleProgram = PROGRAMS.find((program) => program.courses.length >= 4);
if (!sampleProgram) throw new Error('test fixture: expected a program with at least four courses');

test('validated program completion requires exact X equals Y', () => {
  assert.equal(
    isValidatedProgramComplete(
      sampleProgram.slug,
      LEGACY_CURRICULUM_VERSION,
      sampleProgram.courses.length,
    ),
    true,
  );
  assert.equal(
    isValidatedProgramComplete(
      sampleProgram.slug,
      LEGACY_CURRICULUM_VERSION,
      sampleProgram.courses.length - 1,
    ),
    false,
  );
  assert.equal(
    isValidatedProgramComplete(
      sampleProgram.slug,
      LEGACY_CURRICULUM_VERSION,
      sampleProgram.courses.length + 1,
    ),
    false,
  );
});

test('validated program completion resolves stored titles and legacy aliases', () => {
  const canonical = getValidatedProgramCompletionSpec(
    'data-analytics-professional-certificate-google',
    LEGACY_CURRICULUM_VERSION,
  );
  const legacy = getValidatedProgramCompletionSpec(
    'management-and-data-analyst-professional-certificate-google-ibm',
    LEGACY_CURRICULUM_VERSION,
  );
  const renamedTitle = getValidatedProgramCompletionSpec(
    'Management Analyst & Business Intelligence Professional Certificate',
    LEGACY_CURRICULUM_VERSION,
  );

  assert.ok(canonical);
  assert.equal(legacy?.canonicalSlug, canonical.canonicalSlug);
  assert.equal(renamedTitle?.canonicalSlug, canonical.canonicalSlug);
});

test('approved-v2 denominators are pinned independently of legacy-v1', () => {
  const expectedApprovedCounts = new Map([
    ['data-analytics-professional-certificate-google', 11],
    ['ux-design-professional-certificate-google', 8],
    ['data-science-professional-certificate-ibm', 9],
  ]);

  for (const [programSlug, totalCourses] of expectedApprovedCounts) {
    assert.equal(
      getValidatedProgramCompletionSpec(programSlug, APPROVED_CURRICULUM_VERSION)
        ?.totalCourses,
      totalCourses,
    );
  }

  assert.equal(
    getValidatedProgramCompletionSpec(
      'data-analytics-professional-certificate-google',
      LEGACY_CURRICULUM_VERSION,
    )?.totalCourses,
    13,
  );
  assert.equal(
    getValidatedProgramCompletionSpec(
      'data-analytics-professional-certificate-google',
      CATALOG_CURRICULUM_VERSION,
    )?.totalCourses,
    13,
  );
});

test('completion reporting never infers a missing or unknown curriculum version', () => {
  assert.equal(getValidatedProgramCompletionSpec(sampleProgram.slug, null), null);
  assert.equal(getValidatedProgramCompletionSpec(sampleProgram.slug, ''), null);
  assert.equal(getValidatedProgramCompletionSpec(sampleProgram.slug, 'future-v3'), null);
  assert.equal(
    isValidatedProgramComplete(
      sampleProgram.slug,
      null,
      sampleProgram.courses.length,
    ),
    false,
  );
});

test('an unrelated or partial progress row cannot certify the enrolled program', () => {
  const unrelatedProgram = PROGRAMS.find((program) => program.slug !== sampleProgram.slug);
  assert.ok(unrelatedProgram);
  assert.equal(
    hasValidatedProgramCompletion(sampleProgram.slug, LEGACY_CURRICULUM_VERSION, [
      {
        programSlug: sampleProgram.slug,
        coursesCompleted: sampleProgram.courses.length - 1,
      },
      {
        programSlug: unrelatedProgram.slug,
        coursesCompleted: unrelatedProgram.courses.length,
      },
    ]),
    false,
  );
});

test('production-facing reports consume the shared completion policy, not percent shortcuts', () => {
  const sources = {
    board: readFileSync(path.join(process.cwd(), 'lib/admin/boardOutcomes.ts'), 'utf8'),
    publicImpact: readFileSync(
      path.join(process.cwd(), 'lib/marketing/publicImpactStats.ts'),
      'utf8',
    ),
    funder: readFileSync(path.join(process.cwd(), 'lib/admin/funderProgramMetrics.ts'), 'utf8'),
    analytics: readFileSync(path.join(process.cwd(), 'lib/admin/analytics.ts'), 'utf8'),
    googleIt: readFileSync(
      path.join(process.cwd(), 'lib/marketing/googleItSupportLanding.ts'),
      'utf8',
    ),
    staleTraining: readFileSync(
      path.join(process.cwd(), 'lib/member/staleTrainingCron.ts'),
      'utf8',
    ),
    memberJourney: readFileSync(
      path.join(process.cwd(), 'lib/pipeline/memberJourney.ts'),
      'utf8',
    ),
    adminPrograms: readFileSync(
      path.join(process.cwd(), 'app/admin/programs/page.tsx'),
      'utf8',
    ),
    cohortExport: readFileSync(
      path.join(process.cwd(), 'app/api/admin/cohort-export/route.ts'),
      'utf8',
    ),
  };

  assert.match(sources.board, /validatedProgramCompletionValuesSql/);
  assert.match(sources.publicImpact, /validatedProgramCompletionValuesSql/);
  assert.match(sources.funder, /hasValidatedProgramCompletion/);
  assert.match(sources.analytics, /validatedProgramCompletionValuesSql/);
  assert.match(sources.googleIt, /validatedProgramCompletionValuesSql/);
  assert.match(sources.staleTraining, /curriculumVersion/);
  assert.match(sources.memberJourney, /curriculumVersion/);
  assert.match(sources.publicImpact, /courseEnrollments\.length === 0/);
  assert.match(sources.adminPrograms, /getValidatedProgramCompletionSpec/);
  assert.match(sources.cohortExport, /getValidatedProgramCompletionSpec/);

  for (const source of [
    sources.board,
    sources.publicImpact,
    sources.analytics,
    sources.googleIt,
  ]) {
    assert.match(source, /validated_programs\(canonical_slug, storage_value, curriculum_version, total_courses\)/);
    assert.match(source, /curriculum_version\s*=\s*ce\.curriculum_version/);
  }

  for (const source of Object.values(sources)) {
    assert.doesNotMatch(source, /average_percent\s*>=\s*100/i);
    assert.doesNotMatch(source, /averagePercent:\s*\{\s*gte:\s*100/i);
    assert.doesNotMatch(source, /progress\.pct\s*>=\s*100/i);
  }
  assert.doesNotMatch(sources.analytics, /courses_completed\s*>\s*0/i);
});
