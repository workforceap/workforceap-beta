// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildAttentionQueue, type MemberAttentionInput } from '@/lib/attention/evaluate';
import { buildCounselorRosterStats } from '@/lib/counselor/rosterStats';

/**
 * Counselor audit §6 item 4: the roster opens with four stat tiles, each
 * captioned with the rule it counts, and the numbers come from the same
 * attention queue Inbox zero, Triage and the Work queue render.
 */

const NOW = new Date('2026-09-20T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function member(overrides: Partial<MemberAttentionInput> & { memberId: string }): MemberAttentionInput {
  return {
    memberName: `Member ${overrides.memberId}`,
    memberEmail: `${overrides.memberId}@example.test`,
    enrolledProgram: 'it-support',
    enrolledAt: new Date(NOW.getTime() - 2 * DAY),
    createdAt: new Date(NOW.getTime() - 60 * DAY),
    assignedAt: new Date(NOW.getTime() - 1 * DAY),
    hasResume: true,
    lastActivityAt: new Date(NOW.getTime() - 1 * DAY),
    unansweredMessage: null,
    lastStaffMessageAt: new Date(NOW.getTime() - 1 * DAY),
    application: null,
    riskAlert: null,
    staleTrainingDetectedAt: null,
    needsComputerSupportFollowUp: false,
    lastComputerFollowUpAt: null,
    milestone: null,
    ...overrides,
  };
}

describe('buildCounselorRosterStats', () => {
  it('returns exactly four tiles, in decision order, each with a caption and a destination', () => {
    const queue = buildAttentionQueue([member({ memberId: 'a' })], NOW);
    const stats = buildCounselorRosterStats({ queue, recentCompletions: 0, recentPlacements: 0 });

    expect(stats.map((s) => s.key)).toEqual(['atRisk', 'replyOwed', 'completions', 'placements']);
    expect(stats.map((s) => s.label)).toEqual(['At risk', 'Reply owed', 'Completions, 30d', 'Placements, 30d']);
    for (const stat of stats) {
      expect(stat.caption.length).toBeGreaterThan(10);
      expect(stat.href.startsWith('/counselor/')).toBe(true);
    }
    // Nothing to act on: every number reads neutral (WAP-99 — only a state paints a value).
    expect(stats.every((s) => s.tone === undefined)).toBe(true);
    expect(stats.every((s) => s.value === 0)).toBe(true);
  });

  it('counts at-risk members from the attention model and says what an at-risk member is', () => {
    const queue = buildAttentionQueue(
      [
        member({ memberId: 'alert', riskAlert: { alertId: 'al-1', score: 82, status: 'open' } }),
        member({ memberId: 'escalated', riskAlert: { alertId: 'al-2', score: 71, status: 'escalated' } }),
        member({ memberId: 'fine' }),
      ],
      NOW,
    );
    const [atRisk] = buildCounselorRosterStats({ queue, recentCompletions: 0, recentPlacements: 0 });

    expect(atRisk.value).toBe(2);
    expect(atRisk.tone).toBe('accent');
    expect(atRisk.caption).toBe('Saved at-risk alert that is open, acknowledged or escalated, on a member in a program');
    expect(atRisk.href).toBe('/counselor/at-risk');
  });

  it('counts replies owed (24h+) and escalates the tone when a 48h SLA is breached', () => {
    const warnOnly = buildAttentionQueue(
      [member({ memberId: 'w', unansweredMessage: { threadId: 't1', at: new Date(NOW.getTime() - 30 * HOUR), preview: 'hi' } })],
      NOW,
    );
    const [, replyWarn] = buildCounselorRosterStats({ queue: warnOnly, recentCompletions: 0, recentPlacements: 0 });
    expect(replyWarn.value).toBe(1);
    expect(replyWarn.tone).toBe('gold');
    expect(replyWarn.caption).toBe('Member message without a staff reply for 24+ hours');
    expect(replyWarn.href).toBe('/counselor/queue');

    const breached = buildAttentionQueue(
      [
        member({ memberId: 'w', unansweredMessage: { threadId: 't1', at: new Date(NOW.getTime() - 30 * HOUR), preview: 'hi' } }),
        member({ memberId: 'b', unansweredMessage: { threadId: 't2', at: new Date(NOW.getTime() - 50 * HOUR), preview: 'hello' } }),
        member({ memberId: 'fresh', unansweredMessage: { threadId: 't3', at: new Date(NOW.getTime() - 2 * HOUR), preview: 'yo' } }),
      ],
      NOW,
    );
    const [, replyBreach] = buildCounselorRosterStats({ queue: breached, recentCompletions: 0, recentPlacements: 0 });
    expect(replyBreach.value).toBe(2);
    expect(replyBreach.tone).toBe('accent');
    expect(replyBreach.caption).toMatch(/^1 waiting 48h\+ · /);
  });

  it('keeps the 30-day completion count and captions it with the members still to congratulate', () => {
    const queue = buildAttentionQueue(
      [
        member({
          memberId: 'grad',
          lastStaffMessageAt: new Date(NOW.getTime() - 5 * DAY),
          milestone: { eventName: 'course_completed', at: new Date(NOW.getTime() - 2 * DAY) },
        }),
      ],
      NOW,
    );
    const [, , completions] = buildCounselorRosterStats({ queue, recentCompletions: 7, recentPlacements: 0 });
    expect(completions.value).toBe(7);
    expect(completions.tone).toBe('info');
    expect(completions.caption).toMatch(/^1 member to congratulate · Course completed or certification earned/);
    expect(completions.href).toBe('/counselor/triage');

    const quiet = buildAttentionQueue([member({ memberId: 'a' })], NOW);
    const [, , plain] = buildCounselorRosterStats({ queue: quiet, recentCompletions: 3, recentPlacements: 0 });
    expect(plain.value).toBe(3);
    expect(plain.tone).toBeUndefined();
    expect(plain.caption).toBe('Courses completed by your members in the last 30 days');
  });

  it('reports 30-day placements as a plain count with its lookback in the caption', () => {
    const queue = buildAttentionQueue([member({ memberId: 'a' })], NOW);
    const [, , , placements] = buildCounselorRosterStats({ queue, recentCompletions: 0, recentPlacements: 4 });
    expect(placements.value).toBe(4);
    expect(placements.caption).toBe('Placements recorded for your members in the last 30 days');
    expect(placements.href).toBe('/counselor/placements');
  });

  // C05: the count is placement records, every one of them (methodology §7);
  // the caption says how many still have an unconfirmed start date instead of
  // silently dropping them or presenting them as verified.
  it('says how many recent placements still have a start date not yet verified', () => {
    const queue = buildAttentionQueue([member({ memberId: 'a' })], NOW);
    const [, , , placements] = buildCounselorRosterStats({
      queue,
      recentCompletions: 0,
      recentPlacements: 3,
      recentPlacementsUnverified: 2,
    });
    expect(placements.value).toBe(3);
    expect(placements.caption).toBe(
      '2 with start date not yet verified · Placements recorded for your members in the last 30 days',
    );
    expect(placements.tone).toBeUndefined();
  });
});
