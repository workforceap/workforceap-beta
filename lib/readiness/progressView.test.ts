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

    expect(view.priorityAction?.key).toBe('addApplications');
    expect(view.priorityAction?.href).toBe('/dashboard/jobs');
    expect(view.readinessNote).toContain('Apply to at least 3 jobs');

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
    expect(view.priorityAction?.key).toBe('buildResume');
    expect(view.milestones[0]?.state).toBe('active');
  });

  test('pathway and goal actions open the surfaces that render them', () => {
    const only = (key: keyof ScoreBreakdown): ScoreBreakdown => {
      const breakdown = zeroScoreBreakdown();
      for (const k of Object.keys(breakdown) as (keyof ScoreBreakdown)[]) {
        breakdown[k] = { ...breakdown[k], earned: breakdown[k].max, done: k !== key };
      }
      return breakdown;
    };

    // Pathway steps are completed on the Learning Hub's learning-path cards.
    for (const key of ['completePathwaySteps', 'startPathway'] as const) {
      const action = buildReadinessProgressView(only(key)).priorityAction;
      expect(action?.key).toBe(key);
      expect(action?.href).toBe('/dashboard/learning');
      expect(action?.ctaLabel).toBe('Open Learning Hub');
    }

    // Goals are set in GoalsModule on the career brief (MemberHomeKit's
    // goalsHref points at the same anchor), never through ?ui=legacy.
    const goals = buildReadinessProgressView(only('setGoals')).priorityAction;
    expect(goals?.href).toBe('/dashboard/career-brief#goals');
    expect(goals?.ctaLabel).toBe('Set goals');
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
    expect(view.readinessNote).toBe('Every category is complete.');
    expect(view.milestones.every((m) => m.state === 'done')).toBe(true);
  });
});
