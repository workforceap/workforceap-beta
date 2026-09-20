import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getProgramBySlug, PROGRAMS } from '@/lib/content/programs';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { COURSERA_UMBRELLA_PROGRAM_ID, findLearningPathById, isProgramLevelCourseraId } from '@/lib/content/coursera/learningPaths';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { indexCanonicalMappingRows } from '@/lib/coursera/canonicalMapping';
import { emptyCurriculumMappingIndex, legacyCandidatesForProviderCourse, resolveProviderCourseMappings } from '@/lib/coursera/curriculumMapping';
import { isLearningPathProgressRow, planCourseraProgressPromotion } from '@/lib/coursera/progressPromotion';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import {
  describeCourseDenominator,
  formatLearningPathLine,
  formatProgramCoursesNote,
  isCourseraDeliveredCourse,
  isWorkforceApLabRow,
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

describe('member progress miscount: stale program-level mappings and lab rows (number audit M2)', () => {
  const stubDeps = (mappingRows: Array<{ courseraCourseId: string; canonicalProgramSlug: string; canonicalCourseSlug: string }>) => ({
    loadCourseDbRows: async () => [],
    loadCanonicalMappingRows: async () => mappingRows,
    loadCourseraContents: async () => ({ status: 'unavailable' as const, contents: [] as [] }),
  });

  it('isProgramLevelCourseraId names every registered Learning Path and the B4B umbrella, and nothing else', () => {
    assert.equal(isProgramLevelCourseraId(IBM_PATH_ID), true);
    assert.equal(isProgramLevelCourseraId(COURSERA_UMBRELLA_PROGRAM_ID), true);
    for (const slug of Object.keys(DISCOVERED_COURSERA_PROGRAMS)) {
      const pathId = DISCOVERED_COURSERA_PROGRAMS[slug]!.learningPathId;
      if (pathId) assert.equal(isProgramLevelCourseraId(pathId), true, `${slug} path ${pathId}`);
    }
    assert.equal(isProgramLevelCourseraId(INTRO_AI_ID), false);
    assert.equal(isProgramLevelCourseraId(''), false);
    assert.equal(isProgramLevelCourseraId(null), false);
  });

  it('the validated course list refuses a canonical mapping that points a Learning Path at a course slot', async () => {
    const list = await loadValidatedProgramCourses(
      { organizationId: 'org-1', programSlug: PROGRAM_SLUG, checkB4BContents: false, curriculumVersion: 'legacy-v1' },
      stubDeps([
        { courseraCourseId: IBM_PATH_ID, canonicalProgramSlug: PROGRAM_SLUG, canonicalCourseSlug: LAB_SLOT },
        { courseraCourseId: COURSERA_UMBRELLA_PROGRAM_ID, canonicalProgramSlug: PROGRAM_SLUG, canonicalCourseSlug: 'introduction-to-software-engineering' },
      ]),
    );
    const lab = list.courses.find((course) => course.slug === LAB_SLOT);
    assert.ok(lab);
    assert.equal(lab.courseraCourseId, undefined, 'the path id never lands on the lab');
    assert.equal(isCourseraDeliveredCourse(lab), false, 'the lab stays WorkforceAP\'s own course on the tile');
    const se = list.courses.find((course) => course.slug === 'introduction-to-software-engineering');
    assert.equal(se?.courseraCourseId, 'FkAMrrwEEey8ogoy0lwspQ', 'the umbrella id never displaces the real course id');
    // legacy-v1 keeps the lab as a plain outline row (itSupportLabs.test.ts pins
    // that it is not a native module), so it is reported as unmapped, never bound.
    assert.deepEqual(list.unmappedSlugs, [LAB_SLOT]);
  });

  it('a legitimate mapping row for a Coursera course is still honoured', async () => {
    const list = await loadValidatedProgramCourses(
      { organizationId: 'org-1', programSlug: PROGRAM_SLUG, checkB4BContents: false, curriculumVersion: 'legacy-v1' },
      stubDeps([{ courseraCourseId: 'ABC123', canonicalProgramSlug: PROGRAM_SLUG, canonicalCourseSlug: 'introduction-to-software-engineering' }]),
    );
    const se = list.courses.find((course) => course.slug === 'introduction-to-software-engineering');
    assert.equal(se?.courseraCourseId, 'ABC123');
  });

  it('reconciliation ignores local rows keyed by a Learning Path or umbrella id, on any slug', () => {
    const program = ibmProgram();
    const result = reconcileProgramProgress({
      validatedCourses: program.courses,
      localRows: [
        { courseSlug: LAB_SLOT, courseId: IBM_PATH_ID, percentComplete: 100, status: 'COMPLETED' },
        { courseSlug: 'introduction-to-software-engineering', courseId: COURSERA_UMBRELLA_PROGRAM_ID, percentComplete: 90, status: 'IN_PROGRESS' },
        { courseSlug: 'getting-started-with-git-and-github', courseId: null, percentComplete: 100, status: 'COMPLETED' },
      ],
    });
    assert.equal(result.completedCount, 1, 'only the real course completion counts');
    assert.equal(result.rows.find((row) => row.courseSlug === LAB_SLOT)?.displayPercent, 0);
    assert.equal(result.rows.find((row) => row.courseSlug === 'introduction-to-software-engineering')?.displayPercent, 0);
    assert.equal(result.programPercent, Math.round(100 / 17));
  });

  it('every syllabus program keeps its lab row free of provider ids, so the list and the tile agree', () => {
    let labs = 0;
    for (const program of PROGRAMS) {
      if (!program.syllabus) continue;
      for (const course of program.courses) {
        if (!/\bLab\b/.test(course.name)) continue;
        labs += 1;
        assert.equal(course.courseraCourseId, undefined, `${program.slug} / ${course.name}`);
        assert.equal(course.courseraSlug, undefined, `${program.slug} / ${course.name}`);
        assert.equal(isCourseraDeliveredCourse(course), false);
      }
    }
    assert.equal(labs, 8);
  });
});

describe('program tile: the lab stays in the denominator and is named (Mike, 2026-09-20)', () => {
  it('names the single WorkforceAP lab and the Coursera count for the IBM program', () => {
    const program = ibmProgram();
    assert.equal(
      describeCourseDenominator(program.courses),
      "17 courses: 16 on Coursera's learning path plus the WorkforceAP Lab, Project, and Test Preparation (delivered by WorkforceAP, not part of the Coursera path).",
    );
    assert.equal(program.courses.filter(isWorkforceApLabRow).map((course) => course.slug)[0], LAB_SLOT);
  });

  it('is silent for a program without a lab row and never counts an unbound provider row as the lab', () => {
    const noLab = getProgramBySlug('project-management-professional-certificate-microsoft')!;
    assert.equal(describeCourseDenominator(noLab.courses), null);
    const dataScience = getProgramBySlug('data-science-professional-certificate-ibm')!;
    // Three of its rows are unbound provider courses; none of them is a lab.
    assert.equal(describeCourseDenominator(dataScience.courses), null);
    assert.equal(dataScience.courses.filter(isWorkforceApLabRow).length, 0);
  });

  it('works for every syllabus program that carries a lab, on the approved manifests too', () => {
    for (const program of PROGRAMS) {
      if (!program.syllabus) continue;
      const legacyLabs = program.courses.filter(isWorkforceApLabRow);
      const note = describeCourseDenominator(program.courses);
      if (legacyLabs.length === 0) {
        assert.equal(note, null, program.slug);
        continue;
      }
      assert.match(note ?? '', new RegExp(`^${program.courses.length} courses: ${program.courses.length - 1} on Coursera's learning path plus the WorkforceAP `), program.slug);
    }
    // Approved manifest labs are kind:'workforceap' and are named the same way.
    const approved = describeCourseDenominator([
      { name: 'Introduction to Technical Support', kind: 'coursera', courseraCourseId: 'x' },
      { name: 'Lab, Project, and Test Preparation', kind: 'workforceap' },
    ]);
    assert.equal(approved, "2 courses: 1 on Coursera's learning path plus the WorkforceAP Lab, Project, and Test Preparation (delivered by WorkforceAP, not part of the Coursera path).");
  });
});
