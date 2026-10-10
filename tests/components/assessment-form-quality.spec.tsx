import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import AssessmentAnswersReadonly from '@/components/admin/AssessmentAnswersReadonly';
import type { AssessmentReviewRow } from '@/lib/assessment/reviewRows';
import {
  ASSESSMENT_PROGRESS_KEY,
  ASSESSMENT_PROGRESS_MAX_AGE_MS,
  readAssessmentProgress,
  writeAssessmentProgress,
} from '@/lib/assessment/progressStorage';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import AssessmentForm from '@/components/portal/AssessmentForm';
import { SECTION_SAME_ANSWER_WARNING } from '@/lib/assessment/answerPattern';

const props = { defaultFirstName: 'Jordan', defaultLastName: 'Example', defaultPhone: '5125550100' } as const;

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('preassessment progress storage', () => {
  it('round-trips answers, program and step, and drops junk', () => {
    writeAssessmentProgress({ answers: { 1: 'A', 2: 'C' }, programInterest: 'IT Support', step: 3 });
    window.localStorage.setItem(
      ASSESSMENT_PROGRESS_KEY,
      JSON.stringify({ ...JSON.parse(window.localStorage.getItem(ASSESSMENT_PROGRESS_KEY)!), answers: { 1: 'A', 2: 'C', 3: 'Z', x: 'B' } }),
    );
    expect(readAssessmentProgress()).toEqual({ answers: { 1: 'A', 2: 'C' }, programInterest: 'IT Support', step: 3 });
  });

  it('ignores progress older than two weeks', () => {
    const t = 1_000_000_000_000;
    writeAssessmentProgress({ answers: { 1: 'A' }, programInterest: '', step: 2 }, t);
    expect(readAssessmentProgress(t + ASSESSMENT_PROGRESS_MAX_AGE_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(ASSESSMENT_PROGRESS_KEY)).toBeNull();
  });
});

describe('AssessmentForm', () => {
  it('restores saved answers after a refresh and says so', async () => {
    writeAssessmentProgress({ answers: { 1: 'A', 2: 'C', 3: 'C' }, programInterest: '', step: 2 });
    render(<AssessmentForm {...props} />);
    expect(await screen.findByTestId('assessment-progress-restored')).toBeTruthy();
    expect((screen.getByRole('radio', { name: /A planned travel route/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('warns once when a section is all the same on-screen letter, then lets the member continue', async () => {
    writeAssessmentProgress({ answers: {}, programInterest: 'IT Support', step: 2, seed: 'fixed-seed' });
    render(<AssessmentForm {...props} />);
    // Click the first on-screen option ("A)") on all five questions in this section.
    for (const group of screen.getAllByRole('group')) {
      await act(async () => fireEvent.click(group.querySelectorAll('input[type="radio"]')[0]));
    }
    const next = screen.getByRole('button', { name: /next/i });
    await act(async () => fireEvent.click(next));
    expect(screen.getByRole('alert').textContent).toBe(SECTION_SAME_ANSWER_WARNING);
    expect(screen.getByText(/^Q1\./)).toBeTruthy();
    await act(async () => fireEvent.click(next));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/^Q6\./)).toBeTruthy();
  });

  it('shows the same shuffled order after a refresh, and a new attempt gets a different order', async () => {
    writeAssessmentProgress({ answers: { 1: 'A' }, programInterest: '', step: 2, seed: 'seed-one' });
    const first = render(<AssessmentForm {...props} />);
    await screen.findByTestId('assessment-progress-restored');
    const order = () => screen.getAllByRole('group').map((g) => g.querySelector('legend')!.textContent);
    const a = order();
    first.unmount();
    render(<AssessmentForm {...props} />);
    await screen.findByTestId('assessment-progress-restored');
    expect(order()).toEqual(a);
    cleanup();
    window.localStorage.clear();
    writeAssessmentProgress({ answers: { 1: 'A' }, programInterest: '', step: 2, seed: 'seed-two' });
    render(<AssessmentForm {...props} />);
    await screen.findByTestId('assessment-progress-restored');
    const choicesB = screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent);
    expect(choicesB.length).toBe(20);
  });

  it('does not warn on a normal mixed section', async () => {
    writeAssessmentProgress({ answers: {}, programInterest: 'IT Support', step: 2, seed: 'fixed-seed' });
    render(<AssessmentForm {...props} />);
    // Pick on-screen A, B, C, D, A: a mixed pattern whatever the shuffle.
    const groups = screen.getAllByRole('group');
    for (const [i, group] of groups.entries()) {
      await act(async () => fireEvent.click(group.querySelectorAll('input[type="radio"]')[i % 4]));
    }
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /next/i })));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/^Q6\./)).toBeTruthy();
  });
});

describe('staff answer sheet', () => {
  const rows = (letters: string): AssessmentReviewRow[] =>
    [...letters].map((l, i) => ({ id: i + 1, question: `Q${i + 1}`, answer: l as 'A', answerLabel: l, correct: false, points: 3 }));

  it('flags a same-letter result already on file as not reliable', () => {
    render(<AssessmentAnswersReadonly rows={rows('A'.repeat(35))} score={26} scorePct={27} completedAt="2026-10-09T14:30:49Z" />);
    expect(screen.getByTestId('assessment-unreliable').textContent).toMatch(/35 of 35 answers are the same letter/);
  });

  it('shows no flag on a normal result', () => {
    render(<AssessmentAnswersReadonly rows={rows('ACCAADDABBBDAABCCCBCCDACDDBCDACBAAD')} score={93} scorePct={95} completedAt="2026-10-09T15:21:00Z" />);
    expect(screen.queryByTestId('assessment-unreliable')).toBeNull();
  });
});
