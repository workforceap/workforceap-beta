import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCareerBriefContext, type MemberCareerBriefUser } from './careerBriefPersonalization';
import { buildScoreBreakdownFromRelations, type ScoreBreakdown } from '../readiness/score';

/** A fresh-member breakdown with the named milestones marked done. */
function breakdownWithDone(done: ReadonlyArray<keyof ScoreBreakdown>): ScoreBreakdown {
  const breakdown = buildScoreBreakdownFromRelations(null, [], [], [], [], [], [], [], false, null);
  for (const key of done) breakdown[key] = { ...breakdown[key], done: true };
  return breakdown;
}

/** A member who has already sent one application, so "Log your first application" drops out. */
const memberWithApplication = {
  profile: null,
  applications: [],
  jobApplications: [{ status: 'APPLIED' }],
  aiToolResults: [],
} as unknown as MemberCareerBriefUser;

test('"Set your goals" opens the goals section of the career plan page (WAP-188)', () => {
  const context = assembleCareerBriefContext(
    memberWithApplication,
    breakdownWithDone(['buildResume', 'practiceInterview', 'complete2Resources']),
  );
  const setGoals = context.recommendedActions.find((a) => a.label === 'Set your goals');
  assert.deepEqual(setGoals, { label: 'Set your goals', href: '/dashboard/career-brief#goals' });
  // The home dashboard has no goals UI on its default path; nothing here may send members there for goals.
  assert.ok(!context.recommendedActions.some((a) => a.href === '/dashboard'));
});

test('members who already set goals are not asked to again', () => {
  const context = assembleCareerBriefContext(
    memberWithApplication,
    breakdownWithDone(['buildResume', 'practiceInterview', 'complete2Resources', 'setGoals']),
  );
  assert.ok(!context.recommendedActions.some((a) => a.label === 'Set your goals'));
});
