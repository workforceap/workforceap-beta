import test from 'node:test';
import assert from 'node:assert/strict';

import { matchCourseToCatalog,
  selectSeedableB4BContents,
} from './seedCanonicalMappingsFromB4B';
import type { Program } from '@/lib/content/programs';

function mkProgram(slug: string, title: string, courseNames: string[]): Program {
  return {
    slug,
    title,
    category: 'test',
    categoryLabel: 'Test',
    categoryColor: '#000',
    borderColor: '#000',
    icon: '🧪',
    duration: '—',
    skills: [],
    courses: courseNames.map((name, i) => ({
      slug: `${slug}-course-${i + 1}`,
      name,
      estimatedHours: 10,
    })),
    partner: 'Test',
  };
}

test('matches a Coursera course name to the catalog program that contains it', () => {
  const catalog = [
    mkProgram('it-support-ibm', 'IT Support', ['Introduction to Technical Support', 'Networking']),
    mkProgram('data-analytics', 'Data Analytics', ['Foundations: Data, Data, Everywhere']),
  ];
  const match = matchCourseToCatalog('Introduction to Technical Support', catalog);
  assert.ok(match);
  assert.equal(match!.program.slug, 'it-support-ibm');
  assert.equal(match!.course.name, 'Introduction to Technical Support');
});

test('match is case + whitespace + punctuation insensitive', () => {
  const catalog = [mkProgram('p', 'P', ['Foundations: Data, Data, Everywhere'])];
  const match = matchCourseToCatalog('FOUNDATIONS  DATA   DATA EVERYWHERE', catalog);
  assert.ok(match);
  assert.equal(match!.course.name, 'Foundations: Data, Data, Everywhere');
});

test('returns null when no catalog course matches', () => {
  const catalog = [mkProgram('p', 'P', ['Some Course'])];
  assert.equal(matchCourseToCatalog('Unrelated Course', catalog), null);
});

test('returns null on empty input', () => {
  const catalog = [mkProgram('p', 'P', ['Some Course'])];
  assert.equal(matchCourseToCatalog('', catalog), null);
});

test('matches the first catalog hit when name collides across programs', () => {
  const catalog = [
    mkProgram('a', 'Program A', ['Shared Course']),
    mkProgram('b', 'Program B', ['Shared Course']),
  ];
  const match = matchCourseToCatalog('Shared Course', catalog);
  assert.ok(match);
  assert.equal(match!.program.slug, 'a');
});

// ─── planSeedWrite: the seeder must never flip a stored mapping ───

import { planSeedWrite } from './seedCanonicalMappingsFromB4B';

const MATCH = { programSlug: 'it-support-professional-certificate-ibm', courseSlug: 'introduction-to-technical-support' };

test('creates when nothing is stored for the course', () => {
  assert.deepEqual(planSeedWrite(null, MATCH), { action: 'create' });
});

test('updates when the stored target already agrees with the catalog match', () => {
  const existing = { canonicalProgramSlug: MATCH.programSlug, canonicalCourseSlug: MATCH.courseSlug };
  assert.deepEqual(planSeedWrite(existing, MATCH), { action: 'update' });
});

test('reports a conflict instead of overwriting a differing program', () => {
  // Two crons run this seeder. Overwriting here is how the catalog-vs-B4B
  // disagreements flipped every run without anyone seeing them.
  const existing = { canonicalProgramSlug: 'comptia-network-professional-certificate', canonicalCourseSlug: MATCH.courseSlug };
  assert.deepEqual(planSeedWrite(existing, MATCH), {
    action: 'conflict',
    existingProgramSlug: 'comptia-network-professional-certificate',
    existingCourseSlug: MATCH.courseSlug,
  });
});

test('reports a conflict when only the course differs', () => {
  const existing = { canonicalProgramSlug: MATCH.programSlug, canonicalCourseSlug: 'some-other-course' };
  const plan = planSeedWrite(existing, MATCH);
  assert.equal(plan.action, 'conflict');
});

test('never seeds a registered Learning Path id as a course, whatever B4B labels it', () => {
  const contents = [
    { id: 'rNyuLa-pEeytqw64hz8ZCw', slug: 'introduction-to-technical-support', name: 'Introduction to Technical Support', contentType: 'Course' },
    // The IBM AI + Software Developer path, mislabelled as a Course upstream.
    { id: 'fT-1P-CkT6q_tT_gpM-qJw', slug: null, name: 'AI and Software Developer Professional Certificate (IBM)', contentType: 'Course' },
    // The same path labelled honestly.
    { id: 'Course~o9PJJ-ReQ_KTySfkXuPyHw', slug: null, name: 'IT Support Professional Certificate (IBM)', contentType: 'Specialization' },
    { id: 'wtYRSE1kEeyLIRLL9niz0w', slug: 'introduction-to-hardware-and-operating-systems', name: 'Introduction to Hardware and Operating Systems' },
  ];
  assert.deepEqual(
    selectSeedableB4BContents(contents).map((c) => c.id),
    ['rNyuLa-pEeytqw64hz8ZCw', 'wtYRSE1kEeyLIRLL9niz0w'],
  );
});
