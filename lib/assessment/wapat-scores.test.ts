import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSESSMENT_QUESTIONS, type QuestionChoice } from './answer-key';
import {
  scoreWapat,
  scoreWapatFromStoredAnswers,
  WAPAT_SECTION_RANGES,
} from './wapat-scores';

const perfectAnswers = Object.fromEntries(
  ASSESSMENT_QUESTIONS.map((q) => [q.id, q.correct]),
) as Record<number, QuestionChoice>;

test('WAPAT section counts match Dad request (10 + 14 + 11 = 35)', () => {
  assert.equal(WAPAT_SECTION_RANGES.vocabulary.count, 10);
  assert.equal(WAPAT_SECTION_RANGES.reading.count, 14);
  assert.equal(WAPAT_SECTION_RANGES.math.count, 11);
  assert.equal(WAPAT_SECTION_RANGES.total.count, 35);
  assert.equal(WAPAT_SECTION_RANGES.math.start, 25);
});

test('perfect sheet scores 100% on every WAPAT section', () => {
  const s = scoreWapat(perfectAnswers);
  assert.equal(s.vocabulary.correct, 10);
  assert.equal(s.vocabulary.pct, 100);
  assert.equal(s.reading.correct, 14);
  assert.equal(s.reading.pct, 100);
  assert.equal(s.math.correct, 11);
  assert.equal(s.math.pct, 100);
  assert.equal(s.total.correct, 35);
  assert.equal(s.total.pct, 100);
});

test('Q24 counts toward reading only (not math)', () => {
  const answers = { ...perfectAnswers, 24: 'A' as QuestionChoice };
  const s = scoreWapat(answers);
  assert.equal(s.reading.correct, 13);
  assert.equal(s.math.correct, 11);
  assert.equal(s.total.correct, 34);
});

test('scoreWapatFromStoredAnswers parses string keys', () => {
  const stored = Object.fromEntries(
    Object.entries(perfectAnswers).map(([id, v]) => [String(id), v]),
  );
  const s = scoreWapatFromStoredAnswers(stored);
  assert.ok(s);
  assert.equal(s!.total.pct, 100);
});
