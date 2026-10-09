import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSESSMENT_QUESTIONS } from './answer-key';
import {
  STRAIGHT_LINE_MIN_SAME,
  isStraightLined,
  mostRepeatedAnswerCount,
  sectionAllSame,
} from './answerPattern';

const all = (letter: string) => Object.fromEntries(ASSESSMENT_QUESTIONS.map((q) => [q.id, letter]));

test('all 35 answers the same letter is straight-lined (the 10/9 submission)', () => {
  for (const l of ['A', 'B', 'C', 'D']) assert.equal(isStraightLined(all(l)), true, l);
});

test('a perfect score is never blocked: the real key stays well under the threshold', () => {
  const perfect = Object.fromEntries(ASSESSMENT_QUESTIONS.map((q) => [q.id, q.correct]));
  assert.equal(isStraightLined(perfect), false);
  assert.ok(mostRepeatedAnswerCount(perfect) <= 9);
  assert.ok(STRAIGHT_LINE_MIN_SAME - mostRepeatedAnswerCount(perfect) >= 10, 'wide margin for honest wrong answers');
});

test('real submissions on file (92-100%) pass', () => {
  for (const s of [
    'ACCAADDABBBDAABCCCBCCDACDDBCDACBAAD',
    'ACCAADDABBBDAABCBCBCCDBCDDBBDACBAAD',
    'ACCAADDABBBDAABCCCBCCDBCDDBCABCBAAD',
  ]) {
    const answers = Object.fromEntries([...s].map((l, i) => [i + 1, l]));
    assert.equal(isStraightLined(answers), false, s);
  }
});

test('19 of one letter passes; 20 is refused', () => {
  const mixed = (n: number) => Object.fromEntries(ASSESSMENT_QUESTIONS.map((q, i) => [q.id, i < n ? 'A' : ['B', 'C', 'D'][i % 3]]));
  assert.equal(isStraightLined(mixed(19)), false);
  assert.equal(isStraightLined(mixed(20)), true);
});

test('no section of the real key has five identical correct letters', () => {
  for (let start = 1; start <= 31; start += 5) {
    const letters = ASSESSMENT_QUESTIONS.filter((q) => q.id >= start && q.id < start + 5).map((q) => q.correct);
    assert.equal(sectionAllSame(letters), false, `Q${start}-${start + 4}`);
  }
});

test('section check ignores incomplete sections', () => {
  assert.equal(sectionAllSame(['A', 'A', 'A', 'A', 'A']), true);
  assert.equal(sectionAllSame(['A', 'A', undefined, 'A', 'A']), false);
  assert.equal(sectionAllSame(['A', 'B', 'A', 'A', 'A']), false);
});
