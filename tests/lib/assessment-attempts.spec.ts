// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  canSubmitAssessment,
  MAX_ASSESSMENT_ATTEMPTS,
  previousAssessmentResults,
} from '@/lib/assessment/attempts';

const state = (
  assessmentAttemptCount: number,
  assessmentCompleted: boolean,
  assessmentRetakeRequestedAt: Date | string | null,
) => ({ assessmentAttemptCount, assessmentCompleted, assessmentRetakeRequestedAt });

describe('preassessment two-attempt policy', () => {
  it.each([
    { label: 'first unused attempt', input: state(0, false, null), allowed: true },
    { label: 'staff-authorized final attempt', input: state(1, true, new Date('2026-10-15T12:00:00Z')), allowed: true },
    { label: 'completed first attempt without authorization', input: state(1, true, null), allowed: false },
    { label: 'exhausted both attempts even with a new staff request', input: state(2, true, new Date('2026-10-16T12:00:00Z')), allowed: false },
    { label: 'completed count 0 without authorization', input: state(0, true, null), allowed: false },
    { label: 'first attempt blocked while a retake timestamp is already set', input: state(0, false, new Date('2026-10-15T12:00:00Z')), allowed: false },
    { label: 'third-attempt count', input: state(3, true, null), allowed: false },
  ])('allows $label only when policy says so', ({ input, allowed }) => {
    expect(MAX_ASSESSMENT_ATTEMPTS).toBe(2);
    expect(canSubmitAssessment(input)).toBe(allowed);
  });

  it('sanitizes stored history into client-safe previous results', () => {
    expect(previousAssessmentResults(undefined)).toEqual([]);
    expect(previousAssessmentResults('not-an-array')).toEqual([]);
    expect(previousAssessmentResults([
      null,
      42,
      { scorePct: 81, completedAt: '2026-10-15T12:00:00.000Z' },
      { scorePct: '81', completedAt: new Date('2026-10-15') },
      { extra: 'ignored' },
    ])).toEqual([
      { scorePct: 81, completedAt: '2026-10-15T12:00:00.000Z' },
      { scorePct: null, completedAt: null },
      { scorePct: null, completedAt: null },
    ]);
  });
});
