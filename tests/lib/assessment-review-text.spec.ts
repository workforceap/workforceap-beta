import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ASSESSMENT_QUESTIONS, TOTAL_POINTS } from '@/lib/assessment/answer-key';
import { STRAIGHT_LINE_MIN_SAME } from '@/lib/assessment/answerPattern';
import { buildAssessmentReviewRows, formatAssessmentReviewText } from '@/lib/assessment/reviewRows';

const allSame = (letter: 'A' | 'B' | 'C' | 'D') =>
  Object.fromEntries(ASSESSMENT_QUESTIONS.map((q) => [q.id, letter]));

const realMix = Object.fromEntries(
  [...'ACCAADDABBBDAABCCCBCCDACDDBCDACBAAD'].map((letter, i) => [i + 1, letter]),
);

describe('formatAssessmentReviewText', () => {
  it('flags a same-letter result already on file so staff do not treat it as a WIOA score', () => {
    const lines = formatAssessmentReviewText(buildAssessmentReviewRows(allSame('A')));
    expect(lines[0]).toMatch(
      new RegExp(`WARNING: score not reliable\\. ${ASSESSMENT_QUESTIONS.length} of ${ASSESSMENT_QUESTIONS.length} answers are the same letter`),
    );
    expect(lines[0]).toMatch(/ask the member to retake/);
    expect(lines.some((line) => line.startsWith('Answer sheet'))).toBe(true);
  });

  it('does not flag a normal mixed result', () => {
    const lines = formatAssessmentReviewText(buildAssessmentReviewRows(realMix));
    expect(lines[0]).toMatch(/^Answer sheet \(/);
    expect(lines.some((line) => /not reliable/.test(line))).toBe(false);
  });

  it('counts unanswered questions as missing, not as the repeated letter', () => {
    const nineteenA = Object.fromEntries(
      ASSESSMENT_QUESTIONS.map((q, i) => [q.id, i < STRAIGHT_LINE_MIN_SAME - 1 ? 'A' : undefined]).filter(
        (entry): entry is [number, 'A'] => entry[1] === 'A',
      ),
    );
    const rows = buildAssessmentReviewRows(nineteenA);
    expect(rows.filter((row) => row.answer === null).length).toBeGreaterThan(0);
    const lines = formatAssessmentReviewText(rows);
    expect(lines.some((line) => /not reliable/.test(line))).toBe(false);
    expect(lines.some((line) => line.includes('not answered'))).toBe(true);
  });

  it('totals earned points against the published key', () => {
    const perfect = Object.fromEntries(ASSESSMENT_QUESTIONS.map((q) => [q.id, q.correct]));
    const lines = formatAssessmentReviewText(buildAssessmentReviewRows(perfect));
    expect(lines[0]).toBe(`Answer sheet (${TOTAL_POINTS}/${TOTAL_POINTS} points):`);
    expect(lines.filter((line) => /correct, \d+ pts?\]/.test(line))).toHaveLength(ASSESSMENT_QUESTIONS.length);
  });
});
