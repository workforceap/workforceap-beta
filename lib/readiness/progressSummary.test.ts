import { describe, expect, test } from 'vitest';
import { SCREENSHOT_MEMBER_BREAKDOWN, zeroScoreBreakdown } from './progressView.fixtures';
import { buildReadinessProgressView } from './progressView';
import {
  READINESS_EMPTY_RECAP,
  buildFactualReadinessRecap,
  buildReadinessRecapBreakdown,
  buildReadinessSummaryPrompt,
  cleanReadinessSummary,
  readinessSummaryLooksGrounded,
  splitReadinessSummary,
} from './progressSummary';

const view82 = buildReadinessProgressView(SCREENSHOT_MEMBER_BREAKDOWN);

describe('buildReadinessRecapBreakdown', () => {
  test('carries the exact totals and per-area points the card prints', () => {
    const breakdown = buildReadinessRecapBreakdown(view82);
    expect(breakdown.overallScore).toBe(82);
    expect(breakdown.overallMax).toBe(100);
    expect(breakdown.weakestKey).toBe('training');
    expect(breakdown.categories.map((c) => [c.label, c.earned, c.max, c.pct])).toEqual([
      ['Resume & Profile', 24, 24, 100],
      ['Training & Certs', 20, 33, 61],
      ['Interview & Jobs', 24, 29, 83],
      ['Engagement', 14, 14, 100],
    ]);
    // The area points sum to the score and the area maxes to 100 — the
    // screenshot's "86 out of 105" with a "15 out of 35" training line never added up.
    expect(breakdown.categories.reduce((acc, c) => acc + c.earned, 0)).toBe(breakdown.overallScore);
    expect(breakdown.categories.reduce((acc, c) => acc + c.max, 0)).toBe(100);
  });
});

describe('buildFactualReadinessRecap', () => {
  test('explains the weakest area and names the same next step as the CTA, without restating the score', () => {
    const recap = buildFactualReadinessRecap(view82);
    const lines = splitReadinessSummary(recap);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'Training & Certs is your lowest area because Track certificates (0/5) and Complete pathway steps (6/14) are still open.',
    );
    expect(lines[1]).toBe('Interview & Jobs also has Add applications (10/15) open.');
    expect(lines[2]).toBe('Next: Complete more pathway steps in your training program.');
    expect(recap).not.toContain('82');
    expect(recap).not.toMatch(/out of/);
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
    expect(readinessSummaryLooksGrounded(text, view82)).toBe(true);
  });

  test('digits are allowed only when they appear in the fixed next-step sentence', () => {
    const text =
      'Your training area is still open on pathway steps and certificates. Keep going on your pathway, then apply to at least 3 jobs.';
    // view82's next step is "Complete more pathway steps…" — no digits allowed at all
    expect(readinessSummaryLooksGrounded(text, view82)).toBe(false);
    // a member whose next step IS "Apply to at least 3 jobs…" may say "3 jobs"
    const applyView = buildReadinessProgressView({
      ...SCREENSHOT_MEMBER_BREAKDOWN,
      completePathwaySteps: { earned: 14, max: 14, done: true },
      trackCertifications: { earned: 5, max: 5, done: true },
    });
    expect(applyView.priorityAction?.key).toBe('addApplications');
    expect(readinessSummaryLooksGrounded(text, applyView)).toBe(true);
  });

  test('rejects true-but-restated or misattributed numbers, and praise', () => {
    expect(
      readinessSummaryLooksGrounded(
        'Training is your lowest area and you have 14 pathway points left there. Next, complete more pathway steps in your training program.',
        view82,
      ),
    ).toBe(false);
    expect(
      readinessSummaryLooksGrounded(
        'Great job! Training is your lowest area because certificates and pathway steps are still open. Next, complete more pathway steps in your training program.',
        view82,
      ),
    ).toBe(false);
    expect(
      readinessSummaryLooksGrounded(
        'Your score is 82 and your resume area is at 24 while training is at 20. Next, complete more pathway steps in your training program.',
        view82,
      ),
    ).toBe(false);
  });

  test('rejects the production garble: wrong point totals and percent restatements', () => {
    const screenshot =
      'Your overall score is 86 out of 105, which is a great achievement! 1. Resume & Profile: 100% (100% completed) 2. Training & Certs: 60% (15 out of 35 earned) 3. Interview & Jobs: 83% (25 out of 30 earned) 4. Engagement: 100% (15 out of 15 earned) To improve, focus on the Training & Certs category by starting the pathway and earning the remaining points (15 out of 35).';
    expect(readinessSummaryLooksGrounded(screenshot, view82)).toBe(false);
    // even a correct "N of M" is a restatement the card already prints
    expect(
      readinessSummaryLooksGrounded(
        'You have earned 86 of 105 points so far. Training is your lowest area because pathway steps and certificates are still open. Next, complete more pathway steps.',
        view82,
      ),
    ).toBe(false);
    expect(
      readinessSummaryLooksGrounded(
        'Training is at 60% because pathway steps and certificates are still open. Next, complete more pathway steps in your training program.',
        view82,
      ),
    ).toBe(false);
  });

  test('rejects integers the view does not contain', () => {
    expect(
      readinessSummaryLooksGrounded(
        'You have completed 7 pathway steps and 4 certificates, so training is nearly done. Next, complete more pathway steps.',
        view82,
      ),
    ).toBe(false);
  });

  test('rejects list-shaped output', () => {
    const text =
      'Here is what is open:\n1. Track certificates\n2. Complete pathway steps\nNext, complete more pathway steps in your training program.';
    expect(readinessSummaryLooksGrounded(text, view82)).toBe(false);
    const dashes =
      'What is open:\n- Track certificates\n- Complete pathway steps\nNext, complete more pathway steps in your training program.';
    expect(readinessSummaryLooksGrounded(dashes, view82)).toBe(false);
  });

  test('rejects empty or tiny model output', () => {
    expect(readinessSummaryLooksGrounded('Looks good.', view82)).toBe(false);
  });
});

describe('buildReadinessSummaryPrompt', () => {
  test('feeds exact numbers, names the lowest area, fixes the next step, and forbids restating', () => {
    const { system, user } = buildReadinessSummaryPrompt(view82);
    expect(system).toContain('Do NOT repeat any score, percentage, or point total');
    expect(system).toContain('no numbered lists');
    expect(system).toContain('no exclamation marks');
    expect(system).toContain('Do not propose a different first step');
    const facts = JSON.parse(user) as {
      overallScore: number;
      scoreMax: number;
      lowestArea: string;
      nextAction: string;
      areas: { label: string; earned: number; max: number; openItems: { label: string }[]; doneItems: string[] }[];
    };
    expect(facts.overallScore).toBe(82);
    expect(facts.scoreMax).toBe(100);
    expect(facts.lowestArea).toBe('Training & Certs');
    expect(facts.nextAction).toContain('Complete more pathway steps');
    const training = facts.areas.find((a) => a.label === 'Training & Certs');
    expect(training?.earned).toBe(20);
    expect(training?.max).toBe(33);
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
