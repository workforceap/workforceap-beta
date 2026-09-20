import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getProgramBySlug } from '@/lib/content/programs';
import { findLearningPathById } from '@/lib/content/coursera/learningPaths';
import { indexCanonicalMappingRows } from '@/lib/coursera/canonicalMapping';
import { emptyCurriculumMappingIndex, legacyCandidatesForProviderCourse, resolveProviderCourseMappings } from '@/lib/coursera/curriculumMapping';
import { isLearningPathProgressRow, planCourseraProgressPromotion } from '@/lib/coursera/progressPromotion';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import {
  formatLearningPathLine,
  formatProgramCoursesNote,
  isCourseraDeliveredCourse,
  learningPathPercent,
  summarizeProgramCourseProgress,
} from '@/lib/coursera/progressTileSummary';

const PROGRAM_SLUG = 'software-developer-professional-certificate-ibm';
const INTRO_AI_ID = 'mR7MlUaTEemuHQ4HpHozrA';
const PROMPT_ENGINEERING_ID = 'nI__WUzdEe64qQ7qqom4Rw';
const IBM_PATH_ID = 'fT-1P-CkT6q_tT_gpM-qJw';
const LAB_SLOT = `${PROGRAM_SLUG}-course-17`;

function ibmProgram() {
  const program = getProgramBySlug(PROGRAM_SLUG);
  assert.ok(program, 'IBM software developer program must exist');
  return program;
}

describe('member progress miscount: syllabus courses whose title differs from Coursera', () => {
  it('credits the two renamed IBM courses with their Coursera ids without loosening the name matcher', () => {
    const program = ibmProgram();
    assert.equal(program.courses.length, 17);

    const introAi = program.courses.find((course) => course.name === 'Introduction to Artificial Intelligence');
    const promptEngineering = program.courses.find((course) => course.name === 'Generative AI: Prompt Engineering');
    assert.ok(introAi && promptEngineering);
    assert.equal(introAi.courseraCourseId, INTRO_AI_ID);
    assert.equal(introAi.slug, 'introduction-to-ai');
    assert.equal(promptEngineering.courseraCourseId, PROMPT_ENGINEERING_ID);
    assert.equal(promptEngineering.slug, 'generative-ai-prompt-engineering-for-everyone');

    // The regulated wording is preserved verbatim; only the binding changed.
    assert.equal(introAi.name, 'Introduction to Artificial Intelligence');
    // Every synthetic slot left is WorkforceAP's own course, not a Coursera one.
    const synthetic = program.courses.filter((course) => course.slug.startsWith(`${PROGRAM_SLUG}-course-`));
    assert.deepEqual(synthetic.map((course) => course.name), ['Lab, Project, and Test Preparation']);
    assert.equal(synthetic[0].courseraCourseId, undefined);
  });

  it('a completion reported under either Coursera id now counts toward the program total', () => {
    const program = ibmProgram();
    const before = reconcileProgramProgress({
      validatedCourses: program.courses.map((course) =>
        [INTRO_AI_ID, PROMPT_ENGINEERING_ID].includes(course.courseraCourseId ?? '')
          ? { ...course, courseraCourseId: undefined, slug: `${PROGRAM_SLUG}-unmatched-${course.slug}` }
          : course,
      ),
      localRows: [
        { courseSlug: 'introduction-to-ai', courseId: INTRO_AI_ID, percentComplete: 100, status: 'COMPLETED' },
        { courseSlug: 'generative-ai-prompt-engineering-for-everyone', courseId: PROMPT_ENGINEERING_ID, percentComplete: 100, status: 'COMPLETED' },
      ],
    });
    assert.equal(before.completedCount, 0, 'without the id override neither completion is credited');

    const after = reconcileProgramProgress({
      validatedCourses: program.courses,
      localRows: [
        { courseSlug: 'introduction-to-ai', courseId: INTRO_AI_ID, percentComplete: 100, status: 'COMPLETED' },
        { courseSlug: 'generative-ai-prompt-engineering-for-everyone', courseId: PROMPT_ENGINEERING_ID, percentComplete: 100, status: 'COMPLETED' },
      ],
    });
    assert.equal(after.completedCount, 2);
    assert.equal(after.totalCourses, 17);

    // Rows written under the old synthetic slugs (before this fix) still count via the Coursera id.
    const legacyRows = reconcileProgramProgress({
      validatedCourses: program.courses,
      localRows: [
        { courseSlug: `${PROGRAM_SLUG}-course-2`, courseId: INTRO_AI_ID, percentComplete: 100, status: 'COMPLETED' },
      ],
    });
    assert.equal(legacyRows.completedCount, 1);
    assert.equal(legacyRows.rows.find((row) => row.courseraCourseId === INTRO_AI_ID)?.drift, 'slug_mismatch');
  });
});

describe('member progress miscount: a Learning Path row is never a course', () => {
  it('the IBM path id is registered so the SQL exclusions and guards all see it', () => {
    assert.ok(findLearningPathById(IBM_PATH_ID));
    assert.ok(findLearningPathById(`Course~${IBM_PATH_ID}`));
    assert.equal(isLearningPathProgressRow({ courseraCourseId: IBM_PATH_ID }), true);
    assert.equal(isLearningPathProgressRow({ courseraCourseId: INTRO_AI_ID }), false);
  });

  it('a stale canonical mapping of the path id onto the lab slot yields no promotion target', async () => {
    const canonicalIndex = indexCanonicalMappingRows([
      {
        courseraCourseId: IBM_PATH_ID,
        courseraCourseSlug: 'software-developer-professional-certificate-ibm-drln2',
        canonicalProgramSlug: PROGRAM_SLUG,
        canonicalCourseSlug: LAB_SLOT,
      },
    ]);
    assert.deepEqual(
      legacyCandidatesForProviderCourse({ courseraCourseId: IBM_PATH_ID, canonicalIndex }),
      [],
    );

    const resolution = await resolveProviderCourseMappings({
      courseraCourseId: IBM_PATH_ID,
      assignments: [{ programSlug: PROGRAM_SLUG, curriculumVersion: 'legacy-v1', isPrimary: true }],
      curriculumIndex: emptyCurriculumMappingIndex(),
      canonicalIndex,
      allowLegacyDiscovery: true,
      collectionProgramSlug: PROGRAM_SLUG,
    });
    assert.deepEqual(resolution.targets, []);

    // A real course through the same index still resolves, so the guard is specific to path ids.
    const courseIndex = indexCanonicalMappingRows([
      {
        courseraCourseId: INTRO_AI_ID,
        courseraCourseSlug: 'introduction-to-ai',
        canonicalProgramSlug: PROGRAM_SLUG,
        canonicalCourseSlug: 'introduction-to-ai',
      },
    ]);
    assert.equal(
      legacyCandidatesForProviderCourse({ courseraCourseId: INTRO_AI_ID, canonicalIndex: courseIndex }).length > 0,
      true,
    );
  });

  it('the promotion planner refuses to write a path row onto the lab slot', () => {
    assert.throws(
      () =>
        planCourseraProgressPromotion({
          mapping: { programSlug: PROGRAM_SLUG, courseSlug: LAB_SLOT },
          existing: null,
          row: {
            courseraCourseId: IBM_PATH_ID,
            overallProgress: 41,
            isCompleted: false,
            enrollmentTime: null,
            classStartTime: null,
            lastActivityTime: null,
            completionTime: null,
            courseGrade: null,
          },
        }),
      /Learning Path/,
    );
  });
});

describe('progress tiles read the same way for a funder and a member', () => {
  it('splits the program count into Coursera, WorkforceAP and in-progress courses', () => {
    const program = ibmProgram();
    const reconciliation = reconcileProgramProgress({
      validatedCourses: program.courses,
      localRows: [
        { courseSlug: 'introduction-to-software-engineering', percentComplete: 100, status: 'COMPLETED' },
        { courseSlug: 'introduction-to-ai', courseId: INTRO_AI_ID, percentComplete: 100, status: 'COMPLETED' },
        { courseSlug: 'getting-started-with-git-and-github', percentComplete: 35, status: 'IN_PROGRESS' },
        { courseSlug: LAB_SLOT, percentComplete: 100, status: 'COMPLETED' },
      ],
    });
    const summary = summarizeProgramCourseProgress({ courses: program.courses, reconciliation });
    assert.deepEqual(summary, {
      total: 17,
      completed: 3,
      courseraTotal: 16,
      courseraCompleted: 2,
      ownTotal: 1,
      ownCompleted: 1,
      inProgress: 1,
    });
    assert.equal(formatProgramCoursesNote(summary), '2 of 16 Coursera · 1 of 1 WorkforceAP · 1 in progress');
    assert.equal(isCourseraDeliveredCourse(program.courses[16]), false);
  });

  it("reports Coursera's path percentage as Coursera's figure, on its own line", () => {
    assert.equal(learningPathPercent([{ overallProgress: 41.4, isCompleted: false }]), 41);
    assert.equal(learningPathPercent([{ overallProgress: 20, isCompleted: true }]), 100);
    assert.equal(learningPathPercent([]), null);
    assert.equal(formatLearningPathLine(41), "Coursera learning path: 41% (Coursera's figure)");
    assert.equal(formatLearningPathLine(null), "Coursera learning path: not reported (Coursera's figure)");
  });
});
