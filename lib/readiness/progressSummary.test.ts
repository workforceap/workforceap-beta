import { describe, expect, test } from 'vitest';
import { SCREENSHOT_86_BREAKDOWN, zeroScoreBreakdown } from './progressView.fixtures';
import { buildReadinessProgressView } from './progressView';
import {
  READINESS_EMPTY_RECAP,
  allowedReadinessNumbers,
  buildFactualReadinessRecap,
  buildReadinessRecapBreakdown,
  buildReadinessSummaryPrompt,
  cleanReadinessSummary,
  readinessSummaryLooksGrounded,
  splitReadinessSummary,
} from './progressSummary';

const view86 = buildReadinessProgressView(SCREENSHOT_86_BREAKDOWN);

describe('buildReadinessRecapBreakdown', () => {
  test('carries the exact totals and per-area points the card prints', () => {
    const breakdown = buildReadinessRecapBreakdown(view86);
    expect(breakdown.overallEarned).toBe(86);
    expect(breakdown.overallMax).toBe(105);
    expect(breakdown.overallScore).toBe(86);
    expect(breakdown.weakestKey).toBe('training');
    expect(breakdown.categories.map((c) => [c.label, c.earned, c.max, c.pct])).toEqual([
      ['Resume & Profile', 25, 25, 100],
      ['Training & Certs', 21, 35, 60],
      ['Interview & Jobs', 25, 30, 83],
      ['Engagement', 15, 15, 100],
    ]);
    // The parts sum to the total — the screenshot's "86 out of 105" with a
    // "15 out of 35" training line could never have added up.
    const sum = breakdown.categories.reduce((acc, c) => acc + c.earned, 0);
    expect(sum).toBe(breakdown.overallEarned);
  });
});

describe('buildFactualReadinessRecap', () => {
  test('explains the weakest area and names the same next step as the CTA, without restating the score', () => {
    const recap = buildFactualReadinessRecap(view86);
    const lines = splitReadinessSummary(recap);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'Training & Certs is your lowest area because Track certificates (0/5) and Complete pathway steps (6/15) are still open.',
    );
    expect(lines[1]).toBe('Interview & Jobs also has Add applications (10/15) open.');
    expect(lines[2]).toBe('Next: Complete more pathway steps in your training program.');
    expect(recap).not.toContain('86');
    expect(recap).not.toContain('105');
    expect(recap).not.toMatch(/start(ing)? (a|the) (training )?pathway/i);
    expect(recap).not.toMatch(/preassessment|AWS/i);
  });

  test('empty score stays an honest zero recap', () => {
    const recap = buildFactualReadinessRecap(buildReadinessProgressView(zeroScoreBreakdown()));
    expect(recap.startsWith(READINESS_EMPTY_RECAP)).toBe(true);
    expect(splitReadinessSummary(recap)[1]).toContain('Build or upload your resume');
  });
});

describe('readinessSummaryLooksGrounded', () => {
  test('accepts a note that explains and points forward without numbers', () => {
    const text =
      'Training is your lowest area because you have not added a certificate yet and only two pathway steps are logged. Next, complete more pathway steps in your training program.';
    expect(readinessSummaryLooksGrounded(text, view86)).toBe(true);
  });

  test('accepts integers the view contains (the 3 in "apply to at least 3 jobs")', () => {
    const text =
      'Your training area is still open on pathway steps and certificates. Keep going on your pathway, then apply to at least 3 jobs.';
    expect(readinessSummaryLooksGrounded(text, view86)).toBe(true);
  });

  test('rejects the production garble: wrong point totals and percent restatements', () => {
    const screenshot =
      'Your overall score is 86 out of 105, which is a great achievement! 1. Resume & Profile: 100% (100% completed) 2. Training & Certs: 60% (15 out of 35 earned) 3. Interview & Jobs: 83% (25 out of 30 earned) 4. Engagement: 100% (15 out of 15 earned) To improve, focus on the Training & Certs category by starting the pathway and earning the remaining points (15 out of 35).';
    expect(readinessSummaryLooksGrounded(screenshot, view86)).toBe(false);
    // even a correct "N of M" is a restatement the card already prints
    expect(
      readinessSummaryLooksGrounded(
        'You have earned 86 of 105 points so far. Training is your lowest area because pathway steps and certificates are still open. Next, complete more pathway steps.',
        view86,
      ),
    ).toBe(false);
    expect(
      readinessSummaryLooksGrounded(
        'Training is at 60% because pathway steps and certificates are still open. Next, complete more pathway steps in your training program.',
        view86,
      ),
    ).toBe(false);
  });

  test('rejects integers the view does not contain', () => {
    expect(
      readinessSummaryLooksGrounded(
        'You have completed 7 pathway steps and 4 certificates, so training is nearly done. Next, complete more pathway steps.',
        view86,
      ),
    ).toBe(false);
  });

  test('rejects list-shaped output', () => {
    const text =
      'Here is what is open:\n1. Track certificates\n2. Complete pathway steps\nNext, complete more pathway steps in your training program.';
    expect(readinessSummaryLooksGrounded(text, view86)).toBe(false);
    const dashes =
      'What is open:\n- Track certificates\n- Complete pathway steps\nNext, complete more pathway steps in your training program.';
    expect(readinessSummaryLooksGrounded(dashes, view86)).toBe(false);
  });

  test('rejects empty or tiny model output', () => {
    expect(readinessSummaryLooksGrounded('Looks good.', view86)).toBe(false);
  });

  test('allowed numbers cover totals, per-area and per-item points, and remaining points', () => {
    const allowed = allowedReadinessNumbers(view86);
    for (const n of [0, 100, 86, 105, 21, 35, 14, 60, 6, 15, 9, 10, 5, 83, 3]) {
      expect(allowed.has(n)).toBe(true);
    }
    expect(allowed.has(7)).toBe(false);
    expect(allowed.has(92)).toBe(false);
  });
});

describe('buildReadinessSummaryPrompt', () => {
  test('feeds exact numbers, names the lowest area, fixes the next step, and forbids restating', () => {
    const { system, user } = buildReadinessSummaryPrompt(view86);
    expect(system).toContain('Do NOT repeat any score, percentage, or point total');
    expect(system).toContain('no numbered lists');
    expect(system).toContain('no exclamation marks');
    expect(system).toContain('Do not propose a different first step');
    const facts = JSON.parse(user) as {
      overallScore: number;
      pointsEarned: number;
      pointsMax: number;
      lowestArea: string;
      nextAction: string;
      areas: { label: string; earned: number; max: number; openItems: { label: string }[]; doneItems: string[] }[];
    };
    expect(facts.overallScore).toBe(86);
    expect(facts.pointsEarned).toBe(86);
    expect(facts.pointsMax).toBe(105);
    expect(facts.lowestArea).toBe('Training & Certs');
    expect(facts.nextAction).toContain('Complete more pathway steps');
    const training = facts.areas.find((a) => a.label === 'Training & Certs');
    expect(training?.earned).toBe(21);
    expect(training?.max).toBe(35);
    expect(training?.openItems.map((i) => i.label)).toEqual(['Track certificates', 'Complete pathway steps']);
    expect(training?.doneItems).toContain('Start pathway');
  });
});

describe('cleanReadinessSummary', () => {
  test('strips markdown wrappers', () => {
    expect(cleanReadinessSummary('**Your score is 86%.**')).toBe('Your score is 86%.');
  });

  test('keeps paragraph breaks and drops blank lines and stray spaces', () => {
    expect(cleanReadinessSummary('First  paragraph. \r\n\n\n  Second   paragraph.\n')).toBe(
      'First paragraph.\nSecond paragraph.',
    );
    expect(splitReadinessSummary('a\n\nb\n')).toEqual(['a', 'b']);
  });
});
