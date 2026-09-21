/**
 * The remap table is data about code, so it is re-derived from the code here
 * rather than trusted. If a syllabus row moves, is renamed, or loses its
 * catalog binding, these assertions fail and the migration must be revisited
 * before it is run against production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { getProgramBySlug } from '@/lib/content/programs';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

import { COURSE_SLUG_REMAP, REMAPPED_SOURCE_SLUGS, remapCourseSlug } from './courseSlugRemap';

test('every mapped destination is the slug mkProgram produces for that syllabus row today', () => {
  for (const row of COURSE_SLUG_REMAP) {
    const program = getProgramBySlug(row.programSlug);
    assert.ok(program, `${row.programSlug} is not a WAP program`);
    const course = program.courses[row.syllabusIndex - 1];
    assert.ok(course, `${row.programSlug} has no course at position ${row.syllabusIndex}`);
    assert.equal(
      course.slug,
      row.to,
      `${row.programSlug} #${row.syllabusIndex} is keyed ${course.slug}, not ${row.to}`,
    );
    assert.equal(
      course.name,
      row.courseName,
      `${row.programSlug} #${row.syllabusIndex} is named ${course.name}, not ${row.courseName}`,
    );
  }
});

test('every mapped source is the synthetic key that row used to carry, and is now unused', () => {
  for (const row of COURSE_SLUG_REMAP) {
    assert.equal(
      row.from,
      `${row.programSlug}-course-${row.syllabusIndex}`,
      'the source must be exactly the fallback key mkProgram builds',
    );
    assert.notEqual(row.from, row.to, 'a no-op mapping would rewrite rows for nothing');
    const program = getProgramBySlug(row.programSlug);
    assert.equal(
      program?.courses.some((course) => course.slug === row.from),
      false,
      `${row.from} is still a live course key; moving those rows would orphan them`,
    );
  }
});

test('every mapped destination now carries a Coursera id, which is why the key moved', () => {
  for (const row of COURSE_SLUG_REMAP) {
    const course = getProgramBySlug(row.programSlug)?.courses[row.syllabusIndex - 1];
    assert.ok(
      course?.courseraCourseId,
      `${row.to} has no Coursera id, so it should never have been re-keyed`,
    );
  }
});

test('the mapping is unambiguous: one destination per (program, source)', () => {
  const keys = COURSE_SLUG_REMAP.map((row) => `${row.programSlug}\u0000${row.from}`);
  assert.equal(new Set(keys).size, keys.length, 'duplicate source key');
  const destinations = COURSE_SLUG_REMAP.map((row) => `${row.programSlug}\u0000${row.to}`);
  assert.equal(new Set(destinations).size, destinations.length, 'two sources collapse onto one destination');
  assert.equal(REMAPPED_SOURCE_SLUGS.length, COURSE_SLUG_REMAP.length);
});

test('program slug candidates cover the stored aliases for each program', () => {
  const mchit = COURSE_SLUG_REMAP.find((row) => row.programSlug === 'health-information-technology-mchit');
  assert.ok(mchit);
  assert.ok(
    mchit.programSlugCandidates.includes('medical-billing-and-coding-certificate'),
    'MCHIT rows stored under the legacy alias must be in scope',
  );
  const aPlus = COURSE_SLUG_REMAP.find((row) => row.programSlug === 'comptia-a-professional-certificate');
  assert.ok(aPlus);
  assert.ok(
    aPlus.programSlugCandidates.includes('comptia-a-plus'),
    'CompTIA A+ rows stored under comptia-a-plus must be in scope',
  );
  for (const row of COURSE_SLUG_REMAP) {
    for (const candidate of row.programSlugCandidates) {
      assert.equal(canonicalizeProgramSlug(candidate), row.programSlug);
    }
  }
});

test('remapCourseSlug resolves through a program alias and ignores everything else', () => {
  assert.equal(
    remapCourseSlug('comptia-a-plus', 'comptia-a-professional-certificate-course-5')?.to,
    'packt-operating-systems-and-networking-fundamentals-bokjh',
  );
  assert.equal(remapCourseSlug('comptia-a-professional-certificate', 'technical-support-fundamentals'), null);
  assert.equal(
    remapCourseSlug('ux-design-professional-certificate-google', 'comptia-a-professional-certificate-course-5'),
    null,
    'a source key only applies inside its own program',
  );
});
