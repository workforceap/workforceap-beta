import { describe, expect, test } from 'vitest';
import { SCREENSHOT_86_BREAKDOWN, zeroScoreBreakdown } from './progressView.fixtures';
import { buildReadinessProgressView } from './progressView';
import type { ScoreBreakdown } from './score';

describe('buildReadinessProgressView', () => {
  test('maps the 86% dashboard screenshot to real weighted sources', () => {
    const view = buildReadinessProgressView(SCREENSHOT_86_BREAKDOWN);

    expect(view.overallScore).toBe(86);
    expect(view.overallEarned).toBe(86);
    expect(view.overallMax).toBe(105);

    expect(view.categories.map((c) => [c.label, c.pct])).toEqual([
      ['Resume & Profile', 100],
      ['Training & Certs', 60],
      ['Interview & Jobs', 83],
      ['Engagement', 100],
    ]);

    // Weakest area (Training & Certs, 60%) drives the CTA, not the hand order
    // that used to put "Apply to jobs" first while the note talked training.
    expect(view.weakestCategory).toBe('training');
    expect(view.priorityAction?.key).toBe('completePathwaySteps');
    expect(view.priorityAction?.href).toBe('/dashboard/program');
    expect(view.priorityAction?.ctaLabel).toBe('Continue training');
    expect(view.readinessNote).toContain('Complete more pathway steps');

    expect(view.milestones.map((m) => [m.label, m.when, m.state])).toEqual([
      ['Resume & Profile', 'Complete', 'done'],
      ['Training & Certs', 'In progress', 'active'],
      ['Interview & Jobs', 'Goal', 'goal'],
      ['Engagement', 'Complete', 'done'],
    ]);
  });

  test('overall is the capped point total, not the mean of area percents', () => {
    const view = buildReadinessProgressView(SCREENSHOT_86_BREAKDOWN);
    const average =
      view.categories.reduce((sum, cat) => sum + cat.pct, 0) / view.categories.length;
    expect(view.overallScore).toBe(86);
    expect(view.overallEarned).toBe(86);
    expect(view.overallMax).toBe(105);
    expect(average).toBe(85.75);
  });

  test('empty member is an honest zero, not a fabricated score', () => {
    const view = buildReadinessProgressView(zeroScoreBreakdown());
    expect(view.overallScore).toBe(0);
    expect(view.categories.every((cat) => cat.pct === 0)).toBe(true);
    expect(view.weakestCategory).toBe('resume');
    expect(view.priorityAction?.key).toBe('buildResume');
    expect(view.milestones[0]?.state).toBe('active');
  });

  test('CTA follows the weakest area, then the most points left inside it', () => {
    const breakdown: ScoreBreakdown = {
      ...SCREENSHOT_86_BREAKDOWN,
      // Training back to 100%; Interview & Jobs (25/30 = 83%) is now the lowest area.
      completePathwaySteps: { earned: 15, max: 15, done: true },
      trackCertifications: { earned: 5, max: 5, done: true },
    };
    const view = buildReadinessProgressView(breakdown);
    expect(view.weakestCategory).toBe('interview');
    expect(view.priorityAction?.key).toBe('addApplications');
    expect(view.priorityAction?.href).toBe('/dashboard/jobs');
    expect(view.priorityAction?.ctaLabel).toBe('Apply to jobs');
  });

  test('an under-100% area with every item already done yields to the next weakest area', () => {
    const breakdown: ScoreBreakdown = {
      ...SCREENSHOT_86_BREAKDOWN,
      // 3 steps = goal met (done) but only 9/15 points; certs done too → training 29/35 = 83%, all items done.
      completePathwaySteps: { earned: 9, max: 15, done: true },
      trackCertifications: { earned: 5, max: 5, done: true },
      // Interview & Jobs 25/30 = 83% with applications still open.
    };
    const view = buildReadinessProgressView(breakdown);
    expect(view.weakestCategory).toBe('training');
    expect(view.priorityAction?.key).toBe('addApplications');
  });

  test('every training item routes to My Program, never back to /dashboard', () => {
    const view = buildReadinessProgressView({
      ...SCREENSHOT_86_BREAKDOWN,
      startPathway: { earned: 0, max: 5, done: false },
      completePathwaySteps: { earned: 0, max: 15, done: false },
    });
    expect(view.priorityAction?.key).toBe('completePathwaySteps');
    expect(view.priorityAction?.href).toBe('/dashboard/program');
  });

  test('all-complete member has no next action', () => {
    const done: ScoreBreakdown = {
      completeProfile: { earned: 5, max: 5, done: true },
      setGoals: { earned: 10, max: 10, done: true },
      buildResume: { earned: 20, max: 20, done: true },
      complete2Resources: { earned: 10, max: 10, done: true },
      practiceInterview: { earned: 15, max: 15, done: true },
      startPathway: { earned: 5, max: 5, done: true },
      completePathwaySteps: { earned: 15, max: 15, done: true },
      addApplications: { earned: 15, max: 15, done: true },
      trackCertifications: { earned: 5, max: 5, done: true },
      weeklyConsistency: { earned: 5, max: 5, done: true },
    };
    const view = buildReadinessProgressView(done);
    expect(view.overallScore).toBe(100);
    expect(view.priorityAction).toBeNull();
    expect(view.weakestCategory).toBeNull();
    expect(view.readinessNote).toBe('Every category is complete.');
    expect(view.milestones.every((m) => m.state === 'done')).toBe(true);
  });
});
