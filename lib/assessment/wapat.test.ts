// WAPAT (Workforce Advancement Project Assessment Score) section scoring.
// Source: Dad's Nov 11 2026 email. Sections are by ORIGINAL question id, so
// the per-attempt shuffle (layout.ts) cannot move a question between sections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSESSMENT_QUESTIONS, scoreAssessment, type QuestionChoice } from '@/lib/assessment/answer-key';
import { ASSESSMENT_QUESTIONS_PUBLIC } from '@/lib/assessment/questions';
import { layoutAssessment } from '@/lib/assessment/layout';
import { buildAssessmentReviewRows, wapatForHistory, wapatFromAnswers } from '@/lib/assessment/reviewRows';
import { WAPAT_SECTIONS, WAPAT_TOTAL_QUESTIONS, computeWapat, formatWapatText, wapatSectionForQuestion } from '@/lib/assessment/wapat';

const WRONG: Record<QuestionChoice, QuestionChoice> = { A: 'B', B: 'C', C: 'D', D: 'A' };
const allCorrect = () => Object.fromEntries(ASSESSMENT_QUESTIONS.map((q) => [q.id, q.correct])) as Record<number, QuestionChoice>;
const allWrong = () => Object.fromEntries(ASSESSMENT_QUESTIONS.map((q) => [q.id, WRONG[q.correct]])) as Record<number, QuestionChoice>;
const sectionOf = (w: ReturnType<typeof wapatFromAnswers>, key: string) => w.sections.find((s) => s.key === key)!;

test('the 35 questions are unchanged and the section sizes are 10 / 14 / 11 = 35', () => {
  assert.deepEqual(ASSESSMENT_QUESTIONS.map((q) => q.id), Array.from({ length: 35 }, (_, i) => i + 1));
  assert.deepEqual(WAPAT_SECTIONS.map((s) => s.size), [10, 14, 11]);
  assert.equal(WAPAT_TOTAL_QUESTIONS, 35);
});

test('boundaries: Q10 vocabulary, Q11 reading, Q24 reading only, Q25 math, Q35 math', () => {
  const at = (id: number) => wapatSectionForQuestion(id)?.key;
  assert.equal(at(1), 'vocabulary');
  assert.equal(at(10), 'vocabulary');
  assert.equal(at(11), 'reading');
  assert.equal(at(24), 'reading');
  assert.equal(at(25), 'math');
  assert.equal(at(35), 'math');
  assert.equal(at(0), undefined);
  assert.equal(at(36), undefined);
});

test('Q24 is counted once: right on Q24 only moves Reading, never Math or a double count in Total', () => {
  const answers = allWrong();
  answers[24] = ASSESSMENT_QUESTIONS.find((q) => q.id === 24)!.correct;
  const w = wapatFromAnswers(answers);
  assert.equal(sectionOf(w, 'reading').correct, 1);
  assert.equal(sectionOf(w, 'math').correct, 0);
  assert.equal(sectionOf(w, 'vocabulary').correct, 0);
  assert.equal(w.total.correct, 1);
  assert.equal(sectionOf(w, 'reading').pct, 7.1);
  assert.equal(w.total.pct, 2.9);
});

test('right on Q25 only moves Math', () => {
  const answers = allWrong();
  answers[25] = 'D';
  const w = wapatFromAnswers(answers);
  assert.equal(sectionOf(w, 'math').correct, 1);
  assert.equal(sectionOf(w, 'reading').correct, 0);
  assert.equal(sectionOf(w, 'math').pct, 9.1);
});

test('all correct is 100% everywhere; all wrong is 0% everywhere (a real score, not unavailable)', () => {
  const good = wapatFromAnswers(allCorrect());
  for (const s of [...good.sections, good.total]) assert.equal(s.pct, 100);
  const bad = wapatFromAnswers(allWrong());
  for (const s of [...bad.sections, bad.total]) { assert.equal(s.available, true); assert.equal(s.pct, 0); }
});

test('formulas: correct/10, correct/14, correct/11, correct/35, each x 100', () => {
  const key = allCorrect();
  const answers = allWrong();
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) answers[id] = key[id];                           // 8/10
  for (const id of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) answers[id] = key[id];           // 10/14
  for (const id of [25, 26, 27, 28, 29, 30]) answers[id] = key[id];                           // 6/11
  const w = wapatFromAnswers(answers);
  const pick = (k: string) => { const s = sectionOf(w, k); return [s.correct, s.total, s.pct]; };
  assert.deepEqual(pick('vocabulary'), [8, 10, 80]);
  assert.deepEqual(pick('reading'), [10, 14, 71.4]);
  assert.deepEqual(pick('math'), [6, 11, 54.5]);
  assert.deepEqual([w.total.correct, w.total.total, w.total.pct], [24, 35, 68.6]);
});

test('Total is correct/35, NOT the mean of the three section percentages', () => {
  const key = allCorrect();
  const answers = allWrong();
  for (let id = 1; id <= 10; id += 1) answers[id] = key[id]; // vocabulary 100%, others 0%
  const w = wapatFromAnswers(answers);
  assert.equal(w.total.pct, 28.6); // 10/35; a mean of sections would be 33.3
});

test('WAPAT counts questions; the legacy points score is untouched and differs', () => {
  const key = allCorrect();
  const answers = allWrong();
  for (const id of [29, 33, 34, 35]) answers[id] = key[id]; // four 4-point math questions
  assert.deepEqual(scoreAssessment(answers), { raw: 16, pct: 16 }); // 16/98 points
  assert.equal(wapatFromAnswers(answers).total.pct, 11.4);          // 4/35 questions
});

test('shuffled display: scoring by original id gives the same sections for any seed', () => {
  const key = allCorrect();
  for (const seed of ['a', 'b', 'c', 'wapat-1', 'wapat-2']) {
    const answers: Record<number, QuestionChoice> = {};
    for (const q of layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, seed)) {
      const rightOnScreen = q.id <= 10 || q.id >= 25; // vocabulary + math right, reading wrong
      answers[q.id] = rightOnScreen ? key[q.id] : WRONG[key[q.id]];
    }
    const w = wapatFromAnswers(answers);
    assert.deepEqual(w.sections.map((s) => s.pct), [100, 0, 100], `seed ${seed}`);
    assert.equal(w.total.correct, 21);
  }
});

test('incomplete records: a section with any unanswered question is unavailable, never a fabricated 0', () => {
  const partial = allCorrect();
  delete partial[12];
  delete partial[30];
  const w = wapatFromAnswers(partial);
  assert.equal(sectionOf(w, 'vocabulary').pct, 100);
  for (const k of ['reading', 'math']) {
    assert.equal(sectionOf(w, k).available, false);
    assert.equal(sectionOf(w, k).pct, null);
    assert.equal(sectionOf(w, k).correct, null);
  }
  assert.equal(w.total.available, false);
  assert.equal(w.total.pct, null);
  assert.match(formatWapatText(w).join('\n'), /Reading Comprehension \(Q11–24\): unavailable/);
});

test('legacy records with no answers, null, junk or invalid letters are all unavailable', () => {
  for (const raw of [null, undefined, {}, [], 'x', 7, { 1: 'Z', 2: 5, abc: 'A' }]) {
    const w = wapatFromAnswers(raw);
    for (const s of [...w.sections, w.total]) { assert.equal(s.available, false); assert.equal(s.pct, null); }
  }
});

test('stored JSON with string keys (as read back from the database) scores the same', () => {
  const stored = JSON.parse(JSON.stringify(allCorrect()));
  assert.equal(wapatFromAnswers(stored).total.pct, 100);
});

test('computeWapat works from review rows (what the staff panel has)', () => {
  const rows = buildAssessmentReviewRows(allCorrect());
  assert.equal(computeWapat(rows).total.pct, 100);
  assert.equal(computeWapat(rows.slice(0, 20)).total.available, false);
});

test('history: each retained attempt gets its own WAPAT; entries without answers are unavailable', () => {
  const out = wapatForHistory([{ scorePct: 80, answers: allCorrect() }, { scorePct: 55 }, null, 'x']);
  assert.equal(out.length, 2);
  assert.equal(out[0].total.pct, 100);
  assert.equal(out[1].total.available, false);
  assert.deepEqual(wapatForHistory('nope'), []);
});

test('Q1-26 correct: legacy points score is 69% while WAPAT total is 74.3% (different metrics)', () => {
  const key = allCorrect();
  const answers = allWrong();
  for (let id = 1; id <= 26; id++) answers[id] = key[id];
  assert.equal(scoreAssessment(answers).pct, 69);
  assert.equal(wapatFromAnswers(answers).total.pct, 74.3);
});
