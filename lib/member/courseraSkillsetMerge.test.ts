import assert from 'node:assert/strict';
import type { Program } from '@/lib/content/programs';
import {
  mapCompletedSkillsetsToCourseSlugs,
  normalizeTitleForMatch,
  resolveCompletedCourseSlugsFromEnterpriseSkillsets,
} from '@/lib/member/courseraSkillsetMerge';

const program = {
  slug: 'test-program',
  title: 'Test',
  category: 'x',
  categoryLabel: 'x',
  categoryColor: 'x',
  borderColor: 'x',
  icon: 'book',
  duration: '1mo',
  skills: [],
  courses: [
    { slug: 'a', name: 'Alpha Course', estimatedHours: 1 },
    { slug: 'b', name: 'Beta Course', estimatedHours: 1 },
  ],
  partner: 'Coursera',
} satisfies Program;

const ids = ['s1', 's2'];

const positional = mapCompletedSkillsetsToCourseSlugs({
  program,
  orderedSkillsetIds: ids,
  elements: [
    { skillsetId: 's1', skillsetName: 'x', progressPercent: 100 },
    { skillsetId: 's2', skillsetName: 'y', progressPercent: 50 },
  ],
});
assert.deepEqual(positional.sort(), ['a']);

const fallback = mapCompletedSkillsetsToCourseSlugs({
  program,
  orderedSkillsetIds: ['only-one'],
  elements: [{ skillsetId: 'z', skillsetName: '  beta  course  ', progressPercent: 100 }],
});
assert.deepEqual(fallback.sort(), ['b']);

// Partial positional: fewer ids than courses — first index still maps when complete.
const partialPos = resolveCompletedCourseSlugsFromEnterpriseSkillsets({
  program,
  orderedSkillsetIds: ['s1'],
  elements: [{ skillsetId: 's1', skillsetName: 'irrelevant', progressPercent: 100 }],
});
assert.deepEqual(partialPos.courseSlugs.sort(), ['a']);
assert.equal(partialPos.unmatchedCompletedSkillsets.length, 0);

// Explicit override wins and marks skillset consumed before positional runs.
const threeCourseProgram = {
  ...program,
  courses: [
    { slug: 'x', name: 'First', estimatedHours: 1 },
    { slug: 'y', name: 'Second', estimatedHours: 1 },
    { slug: 'z', name: 'Third', estimatedHours: 1 },
  ],
} satisfies Program;

const overrideRun = resolveCompletedCourseSlugsFromEnterpriseSkillsets({
  program: threeCourseProgram,
  orderedSkillsetIds: ['id-a', 'id-b', 'id-c'],
  elements: [
    { skillsetId: 'id-a', skillsetName: 'First', progressPercent: 100 },
    { skillsetId: 'id-b', skillsetName: 'Second', progressPercent: 100 },
  ],
  skillsetSlugOverrides: { 'id-a': 'z' },
});
assert.ok(overrideRun.courseSlugs.includes('z'));
assert.ok(overrideRun.courseSlugs.includes('y'));
assert.equal(overrideRun.courseSlugs.includes('x'), false);

// Loose title containment (length guards avoid trivial matches).
const looseProgram = {
  ...program,
  courses: [
    { slug: 'long-alpha-slug', name: 'Advanced Networking Security Topics', estimatedHours: 1 },
    { slug: 'other', name: 'Other Course Title Here', estimatedHours: 1 },
  ],
} satisfies Program;

const loose = resolveCompletedCourseSlugsFromEnterpriseSkillsets({
  program: looseProgram,
  orderedSkillsetIds: ['x'],
  elements: [
    {
      skillsetId: 'sk1',
      skillsetName: 'Something Advanced Networking Security Topics extended',
      progressPercent: 100,
    },
  ],
});
assert.ok(loose.courseSlugs.includes('long-alpha-slug'));

// Unmatched completed skillsets surface for ops.
const unmatched = resolveCompletedCourseSlugsFromEnterpriseSkillsets({
  program,
  orderedSkillsetIds: [],
  elements: [{ skillsetId: 'ghost', skillsetName: 'Totally Unknown Module XYZ', progressPercent: 100 }],
});
assert.equal(unmatched.courseSlugs.length, 0);
assert.equal(unmatched.unmatchedCompletedSkillsets.length, 1);
assert.equal(unmatched.unmatchedCompletedSkillsets[0]?.skillsetId, 'ghost');

assert.equal(normalizeTitleForMatch('  Beta—Course  '), normalizeTitleForMatch('beta course'));

console.log('courseraSkillsetMerge tests passed');
