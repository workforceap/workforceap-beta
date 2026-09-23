import test from 'node:test';
import assert from 'node:assert/strict';
import { planRouteForGoalType } from './generate';

test('a goal type without a dedicated tool opens the goal on the career plan page (WAP-188)', () => {
  assert.deepEqual(planRouteForGoalType('custom'), {
    href: '/dashboard/career-brief#goals',
    cta: 'View goal',
    icon: 'flag',
  });
});

test('goal types with a dedicated tool keep routing to that tool', () => {
  assert.equal(planRouteForGoalType('build_resume').href, '/dashboard/ai-tools/resume-studio?view=rewrite');
  assert.equal(planRouteForGoalType('apply_to_jobs').href, '/dashboard/job-applications');
  assert.equal(planRouteForGoalType('career_pivot').href, '/dashboard/career-brief');
});
