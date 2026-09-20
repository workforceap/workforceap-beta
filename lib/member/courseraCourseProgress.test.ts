import assert from 'node:assert/strict';
import type { Program } from '@/lib/content/programs';
import { countCompletedInProgram, getFirstIncompleteCourseIndex } from '@/lib/member/courseraCourseProgress';

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
    { slug: 'a', name: 'A', estimatedHours: 1 },
    { slug: 'b', name: 'B', estimatedHours: 1 },
    { slug: 'c', name: 'C', estimatedHours: 1 },
  ],
  partner: 'Coursera',
} satisfies Program;

assert.equal(countCompletedInProgram(program, []), 0);
assert.equal(countCompletedInProgram(program, ['b']), 1);
assert.equal(countCompletedInProgram(program, ['a', 'c']), 2);

assert.equal(getFirstIncompleteCourseIndex(program, []), 0);
assert.equal(getFirstIncompleteCourseIndex(program, ['b']), 0, 'out-of-order: still start at first gap');
assert.equal(getFirstIncompleteCourseIndex(program, ['a']), 1);
assert.equal(getFirstIncompleteCourseIndex(program, ['a', 'b', 'c']), undefined);

console.log('courseraCourseProgress tests passed');
