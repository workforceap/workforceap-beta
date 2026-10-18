import { describe, expect, it } from 'vitest';
import {
  DEV_MEMBER_ALIASES,
  DEV_MEMBER_AUTH_PATHS,
  DEV_MEMBER_STATES,
  DEV_MEMBER_VIEWS,
  DEV_MEMBER_VIEW_BY_SLUG,
  harnessPath,
  parseDevMemberState,
} from '@/app/dev/member/harness/registry';

const INVENTORY_LIVE_PATHS = [
  '/dashboard',
  '/dashboard/jobs',
  '/dashboard/program',
  '/dashboard/ai-tools/resume-studio',
  '/dashboard/ai-tools',
  '/dashboard/ai-tools/interview-practice',
  '/dashboard/ai-tools/cover-letter',
  '/dashboard/ai-tools/job-match-scorer',
  '/dashboard/ai-tools/interview-coach',
  '/dashboard/ai-tools/elevator-pitch',
  '/dashboard/ai-tools/gap-analyzer',
  '/dashboard/ai-tools/linkedin-headline',
  '/dashboard/ai-tools/linkedin-about',
  '/dashboard/ai-tools/salary-negotiation',
  '/dashboard/ai-tools/interview-prep',
  '/dashboard/ai-tools/career-business-coach',
  '/dashboard/ai-tools/benefits-cliff',
  '/dashboard/ai-tools/voice-interview',
  '/dashboard/jobs/[id]',
  '/dashboard/job-applications',
  '/dashboard/resume',
  '/dashboard/readiness',
  '/dashboard/ai-tools/history',
  '/dashboard/ai-tools/skill-mapper',
  '/coach',
  '/dashboard/messages',
  '/dashboard/counselor',
  '/dashboard/learning',
  '/dashboard/learning/modules/[courseSlug]',
  '/dashboard/certifications',
  '/dashboard/missions',
  '/dashboard/profile',
  '/dashboard/learning/labs/[labId]',
  '/dashboard/learning/find-your-career',
  '/dashboard/learning/interest-profiler',
  '/dashboard/learning/wioa-qualification',
  '/dashboard/program/start',
  '/dashboard/program/coursera-enrollment',
  '/dashboard/program/employer-screening',
  '/dashboard/counselor/[id]',
  '/dashboard/mentors',
  '/dashboard/mentors/[mentorId]',
  '/dashboard/mentor',
  '/dashboard/help',
  '/dashboard/ai-tools/skill-checkpoints',
  '/dashboard/ai-tools/training-bridge',
  '/dashboard/account',
  '/account/privacy',
  '/dashboard/documents',
  '/dashboard/eligibility',
  '/dashboard/assessment',
  '/dashboard/survey',
  '/dashboard/career-brief',
  '/dashboard/career-brief/[slug]',
  '/dashboard/points',
  '/dashboard/referrals',
  '/dashboard/weekly-recap',
  '/dashboard/resources',
  '/dashboard/career-library',
  '/dashboard/career-library/[id]',
  '/dashboard/guide',
] as const;

/** Inventory alias routes the harness registry must keep aligned with live redirects. */
const EXPECTED_ALIAS_TARGETS: Array<{ path: string; target: string }> = [
  { path: '/dashboard/assessments', target: '/dashboard/assessment' },
  { path: '/dashboard/skills-assessment', target: '/dashboard/assessment' },
  { path: '/dashboard/settings', target: '/dashboard/profile#settings' },
  { path: '/dashboard/toolkit', target: '/dashboard/ai-tools?tab=toolkit' },
  { path: '/dashboard/program/change', target: '/dashboard/program' },
  { path: '/dashboard/coursera', target: '/dashboard/program' },
  { path: '/account', target: '/dashboard/account' },
  { path: '/certifications', target: '/dashboard/certifications' },
  { path: '/applications', target: '/dashboard/job-applications' },
];

describe('dev member harness registry', () => {
  it('covers every inventory core view once', () => {
    expect(DEV_MEMBER_VIEWS).toHaveLength(61);
    expect(new Set(DEV_MEMBER_VIEWS.map((view) => view.slug)).size).toBe(61);
    expect(DEV_MEMBER_VIEWS.map((view) => view.livePath).sort()).toEqual([...INVENTORY_LIVE_PATHS].sort());
    expect(DEV_MEMBER_STATES).toEqual(['full', 'empty', 'loading', 'error', 'first-time']);
    expect(DEV_MEMBER_VIEW_BY_SLUG.home?.title).toBe('Home');
    expect(parseDevMemberState('nope')).toBe('full');
    expect(harnessPath('jobs', 'empty')).toBe('/dev/member/v/jobs?state=empty');
    expect(DEV_MEMBER_AUTH_PATHS).toContain('/dashboard/jobs/dev-placeholder');
    expect(DEV_MEMBER_ALIASES.length).toBeGreaterThanOrEqual(17);
  });

  it('locks inventory alias pages to their documented targets via the registry', () => {
    const aliasByPath = new Map(DEV_MEMBER_ALIASES.map((alias) => [alias.path, alias]));
    for (const expected of EXPECTED_ALIAS_TARGETS) {
      const alias = aliasByPath.get(expected.path);
      expect(alias, `missing registry alias for ${expected.path}`).toBeDefined();
      expect(alias?.target).toBe(expected.target);
    }
  });
});
