import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSESSMENT_QUESTIONS, scoreAssessment, TOTAL_POINTS } from './answer-key';
import { ASSESSMENT_QUESTIONS_PUBLIC } from './questions';
import { layoutAssessment, newAttemptSeed } from './layout';
import { isStraightLined } from './answerPattern';

const key = new Map(ASSESSMENT_QUESTIONS.map((q) => [q.id, q.correct]));

test('same seed gives the same layout (survives a refresh)', () => {
  assert.deepEqual(layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, 'abc'), layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, 'abc'));
});

test('different attempts get different question and answer orders', () => {
  const a = layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, 'seed-1');
  const b = layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, 'seed-2');
  assert.notDeepEqual(a.map((q) => q.id), b.map((q) => q.id));
  assert.notDeepEqual(a.map((q) => q.choices.map((c) => c.value).join('')), b.map((q) => q.choices.map((c) => c.value).join('')));
});

test('every question appears once, in its own five-question section, with all four choices and labels intact', () => {
  for (const seed of ['x', 'y', 'z', newAttemptSeed()]) {
    const laid = layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, seed);
    assert.deepEqual([...laid.map((q) => q.id)].sort((m, n) => m - n), ASSESSMENT_QUESTIONS_PUBLIC.map((q) => q.id));
    laid.forEach((q, i) => {
      assert.equal(q.displayNumber, i + 1);
      assert.equal(Math.floor((q.id - 1) / 5), Math.floor(i / 5), `Q${q.id} stays in its section`);
      assert.deepEqual(q.choices.map((c) => c.displayLetter), ['A', 'B', 'C', 'D']);
      const original = ASSESSMENT_QUESTIONS_PUBLIC.find((p) => p.id === q.id)!;
      for (const c of q.choices) assert.equal(c.label, original.choices.find((o) => o.value === c.value)!.label);
    });
  }
});

test('picking the right answer on a shuffled screen scores 100% (scores still work)', () => {
  for (const seed of ['s1', 's2', newAttemptSeed()]) {
    const answers: Record<number, 'A' | 'B' | 'C' | 'D'> = {};
    for (const q of layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, seed)) {
      const shown = q.choices.find((c) => c.value === key.get(q.id))!;
      answers[q.id] = shown.value; // the form submits the original letter
    }
    assert.deepEqual(scoreAssessment(answers), { raw: TOTAL_POINTS, pct: 100 });
  }
});

test('clicking display "A" everywhere becomes a random mix, not a pattern', () => {
  let lowest = 100;
  for (let i = 0; i < 40; i += 1) {
    const answers: Record<number, string> = {};
    for (const q of layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, `click-${i}`)) answers[q.id] = q.choices[0].value;
    const counts = ['A', 'B', 'C', 'D'].map((l) => Object.values(answers).filter((v) => v === l).length);
    lowest = Math.min(lowest, 35 - Math.max(...counts));
    const pct = scoreAssessment(answers as Record<number, 'A'>).pct;
    assert.ok(pct < 60, `random clicking should not pass (seed ${i}: ${pct}%)`);
  }
  assert.ok(lowest > 0);
});

test('the server guard still catches same-letter submissions regardless of layout', () => {
  const allA = Object.fromEntries(ASSESSMENT_QUESTIONS_PUBLIC.map((q) => [q.id, 'A']));
  assert.equal(isStraightLined(allA), true);
});
