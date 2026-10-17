import assert from 'node:assert/strict';
import test from 'node:test';

import { getSkillMissionDefinitionsForProgram } from '@/lib/content/skillMissionCatalog';
import {
  APPROVED_CURRICULUM_VERSION,
  LEGACY_CURRICULUM_VERSION,
} from '@/lib/content/programCurriculumManifest';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  resolveSkillMissionsForCurriculum,
} from '@/lib/member/skillMissionCurriculum';
import { PROGRAM_SYLLABI } from '../../shared/programSyllabi';

const AWS = 'ai-practitioner-professional-certificate-aws';
const IBM_DEVELOPER_KEY = 'ai-professional-developer-certificate-ibm';

const syllabusCourses = PROGRAM_SYLLABI[AWS].courses.map((course) => course.name);

test('AWS practitioner catalog has one mission for each syllabus course', () => {
  const missions = getSkillMissionDefinitionsForProgram(AWS);
  assert.deepEqual(missions.map((mission) => mission.courseTitle), syllabusCourses);
  assert.equal(missions.length, 17);

  const courseSlugs = new Set<string>();
  const keys = new Set<string>();
  for (const mission of missions) {
    assert.equal(mission.programSlug, AWS);
    assert.equal(mission.programTitle, 'AI Practitioner Professional Certificate (AWS)');
    assert.equal(mission.key, `${AWS}:mission:${mission.courseSlug}`);
    assert.equal(mission.quizQuestions.length, 3);
    assert.equal(mission.estimatedMinutes, 15);
    assert.ok(mission.skillLabels.length >= 3);
    assert.ok(mission.scenarioPrompt.includes(mission.courseTitle));
    assert.ok(mission.evidenceHint.length > 40);
    courseSlugs.add(mission.courseSlug);
    keys.add(mission.key);
    for (const question of mission.quizQuestions) {
      assert.equal(question.options.length, 4);
      assert.equal(new Set(question.options).size, 4);
      assert.ok(question.correctIndex >= 0 && question.correctIndex <= 3);
      assert.ok(question.explanation.length > 20);
    }
  }
  assert.equal(courseSlugs.size, missions.length);
  assert.equal(keys.size, missions.length);
});

test('AWS missions attach to the live syllabus courses on both stored versions', () => {
  const program = getProgramBySlug(AWS);
  assert.ok(program);
  assert.deepEqual(program.courses.map((course) => course.name), syllabusCourses);

  for (const curriculumVersion of [LEGACY_CURRICULUM_VERSION, APPROVED_CURRICULUM_VERSION]) {
    const resolved = resolveSkillMissionsForCurriculum({ programSlug: AWS, curriculumVersion });
    assert.deepEqual(
      resolved.map((mission) => mission.definition.courseTitle),
      syllabusCourses,
    );
    resolved.forEach((mission, index) => {
      assert.equal(mission.assignedCourseSlug, program.courses[index]!.slug);
      assert.ok(mission.unlockSlugs.includes(program.courses[index]!.slug));
    });
  }
});

test('legacy IBM developer missions stay off the AWS practitioner catalog', () => {
  const orphan = getSkillMissionDefinitionsForProgram(IBM_DEVELOPER_KEY);
  assert.equal(orphan.length, 8);
  assert.deepEqual(
    orphan.map((mission) => mission.courseSlug),
    [
      'ai-dev-course-1',
      'ai-dev-course-2',
      'ai-dev-course-3',
      'ai-dev-course-4',
      'ai-dev-course-5',
      'ai-dev-course-6',
      'ai-dev-course-7',
      'ai-dev-course-8',
    ],
  );
  assert.ok(orphan.every((mission) => mission.programSlug === IBM_DEVELOPER_KEY));

  const awsTitles = new Set<string>(syllabusCourses);
  const developerOnly = orphan.filter((mission) => !awsTitles.has(mission.courseTitle));
  assert.equal(developerOnly.length, 7);

  for (const requested of [
    IBM_DEVELOPER_KEY,
    'ai-professional-practitioner-certificate',
    'ai-practitioner-professional-certificate',
  ]) {
    const resolved = resolveSkillMissionsForCurriculum({
      programSlug: requested,
      curriculumVersion: LEGACY_CURRICULUM_VERSION,
    });
    assert.deepEqual(
      resolved.map((mission) => mission.definition.courseTitle),
      syllabusCourses,
    );
    assert.ok(resolved.every((mission) => mission.definition.programSlug === AWS));
    assert.ok(resolved.every((mission) => !mission.definition.courseSlug.startsWith('ai-dev-course-')));
  }
});
