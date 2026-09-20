/**
 * Shared fixture roster for the attention-model specs. Ten members, each
 * exercising one rule, so agreement tests can assert exact member sets.
 */

import type { MemberAttentionInput } from '@/lib/attention/evaluate';

export const FIXTURE_NOW = new Date('2026-09-20T12:00:00Z');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(FIXTURE_NOW.getTime() - ms);

export function member(overrides: Partial<MemberAttentionInput> & { memberId: string }): MemberAttentionInput {
  return {
    memberName: overrides.memberId,
    memberEmail: `${overrides.memberId}@example.test`,
    enrolledProgram: 'it-support',
    enrolledAt: ago(60 * DAY),
    createdAt: ago(90 * DAY),
    assignedAt: ago(30 * DAY),
    hasResume: true,
    lastActivityAt: ago(1 * DAY),
    unansweredMessage: null,
    lastStaffMessageAt: ago(1 * DAY),
    application: null,
    riskAlert: null,
    staleTrainingDetectedAt: null,
    needsComputerSupportFollowUp: false,
    lastComputerFollowUpAt: null,
    milestone: null,
    ...overrides,
  };
}

/** Expected reasons per fixture member, primary first. */
export const FIXTURE_EXPECTED = {
  'm-risk': ['risk_alert'],
  'm-quiet30': ['no_activity_30d'],
  'm-sla': ['sla_breach_48h'],
  'm-warn': ['no_activity_10d', 'no_counselor_contact_7d', 'resume_missing_3d'],
  'm-reply24': ['sla_warning_24h'],
  'm-app': ['resume_missing_3d', 'application_stalled_5d', 'pending_application'],
  'm-new': ['new_no_counselor'],
  'm-celebrate': ['milestone_reached'],
  'm-ok': [],
  'm-ok2': [],
} as const;

export const FIXTURE_FLAGGED_IDS = ['m-risk', 'm-quiet30', 'm-sla', 'm-warn', 'm-reply24', 'm-app', 'm-new'];
export const FIXTURE_AWAITING_REPLY_IDS = ['m-sla', 'm-reply24'];

export function fixtureRoster(): MemberAttentionInput[] {
  return [
    member({ memberId: 'm-risk', riskAlert: { alertId: 'alert-1', score: 72, status: 'open' } }),
    member({ memberId: 'm-quiet30', lastActivityAt: ago(45 * DAY) }),
    member({
      memberId: 'm-sla',
      unansweredMessage: { threadId: 'thread-sla', at: ago(50 * HOUR), preview: 'Can someone help?' },
      lastStaffMessageAt: ago(3 * DAY),
    }),
    member({
      memberId: 'm-warn',
      lastActivityAt: ago(12 * DAY),
      assignedAt: ago(20 * DAY),
      lastStaffMessageAt: ago(10 * DAY),
      hasResume: false,
    }),
    member({
      memberId: 'm-reply24',
      unansweredMessage: { threadId: 'thread-24', at: ago(30 * HOUR), preview: 'Quick question' },
    }),
    member({
      memberId: 'm-app',
      enrolledProgram: null,
      enrolledAt: null,
      createdAt: ago(10 * DAY),
      assignedAt: null,
      hasResume: false,
      lastActivityAt: null,
      lastStaffMessageAt: null,
      application: { status: 'PENDING', anchorAt: ago(8 * DAY) },
    }),
    member({
      memberId: 'm-new',
      enrolledProgram: null,
      enrolledAt: null,
      createdAt: ago(2 * DAY),
      assignedAt: null,
      lastActivityAt: null,
      lastStaffMessageAt: null,
    }),
    member({
      memberId: 'm-celebrate',
      lastStaffMessageAt: ago(3 * DAY),
      milestone: { eventName: 'course_completed', at: ago(2 * DAY) },
    }),
    member({ memberId: 'm-ok' }),
    member({ memberId: 'm-ok2', lastActivityAt: ago(5 * DAY), lastStaffMessageAt: ago(6 * DAY) }),
  ];
}
