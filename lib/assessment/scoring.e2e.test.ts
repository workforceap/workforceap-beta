// Ops (10/9/26): scores must be exact under the per-attempt shuffle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSESSMENT_QUESTIONS, scoreAssessment, TOTAL_POINTS } from '@/lib/assessment/answer-key';
import { ASSESSMENT_QUESTIONS_PUBLIC } from '@/lib/assessment/questions';
import { layoutAssessment } from '@/lib/assessment/layout';
import { buildAssessmentReviewRows } from '@/lib/assessment/reviewRows';

test('public questions match the scored key exactly (text, labels, points)', () => {
  assert.equal(ASSESSMENT_QUESTIONS_PUBLIC.length, ASSESSMENT_QUESTIONS.length);
  for (const q of ASSESSMENT_QUESTIONS) {
    const p = ASSESSMENT_QUESTIONS_PUBLIC.find((x) => x.id === q.id)!;
    assert.equal(p.question, q.question); assert.equal(p.points, q.points);
    assert.deepEqual(p.choices, q.choices);
  }
  assert.equal(TOTAL_POINTS, 98);
});

test('1000 random shuffled attempts: what the member picks on screen is exactly what is scored and shown to staff', () => {
  for (let n = 0; n < 1000; n += 1) {
    const laid = layoutAssessment(ASSESSMENT_QUESTIONS_PUBLIC, `e2e-${n}`);
    const answers: Record<number, 'A' | 'B' | 'C' | 'D'> = {};
    let expected = 0;
    for (const q of laid) {
      const pick = q.choices[(n * 7 + q.id) % 4];          // a pseudo-random on-screen pick
      answers[q.id] = pick.value;                           // what the form submits
      const key = ASSESSMENT_QUESTIONS.find((k) => k.id === q.id)!;
      if (pick.value === key.correct) expected += key.points;
      const rowLabel = buildAssessmentReviewRows({ [q.id]: pick.value }).find((r) => r.id === q.id)!.answerLabel;
      assert.equal(rowLabel, pick.label, 'staff sheet shows the label the member clicked');
    }
    const { raw, pct } = scoreAssessment(answers);
    assert.equal(raw, expected);
    assert.equal(pct, Math.round((expected / TOTAL_POINTS) * 100));
  }
});
