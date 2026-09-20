import { describe, expect, it } from 'vitest';

import {
  MEMBER_ACTIVITY_EVENT_WHERE,
  SYSTEM_GENERATED_MEMBER_EVENTS,
  calculateHealthStatus,
  getHealthLabel,
} from '@/lib/admin/healthScore';
import { buildStatusWhere } from '@/lib/admin/studentStatus';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** Walk a nested where-clause and collect every key name that appears. */
function keysIn(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) keysIn(entry, out);
    return out;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.add(key);
      keysIn(child, out);
    }
  }
  return out;
}

describe('member activity event set (audit S1)', () => {
  it('excludes the rows the platform writes to the member, not rows the member produced', () => {
    const excluded = new Set<string>(MEMBER_ACTIVITY_EVENT_WHERE.eventName.notIn);
    // Outbound mail + staff flags: contacting a member is not the member acting.
    for (const name of [
      'inactive_nudge_sent',
      'weekly_recap_generated',
      'course_accountability_sent',
      'certification_celebration_sent',
      'counselor_followup_needed',
    ]) {
      expect(excluded.has(name)).toBe(true);
    }
    // Both spellings: historic rows used the upper-case constant name.
    expect(excluded.has('application_reminder_sent')).toBe(true);
    expect(excluded.has('APPLICATION_REMINDER_SENT')).toBe(true);
    // Learner-produced events must survive.
    for (const name of [
      'member_logged_in',
      'member_dashboard_viewed',
      'course_completed',
      'ai_tool_run_completed',
      'apply_signup_completed',
    ]) {
      expect(excluded.has(name)).toBe(false);
    }
    expect(MEMBER_ACTIVITY_EVENT_WHERE.eventName.notIn).toEqual([...SYSTEM_GENERATED_MEMBER_EVENTS]);
  });

  it('a member whose only 30-day rows were nudges scores red, not green', () => {
    // With the nudges excluded the aggregates arrive empty, which is the
    // input Health must see for a member who has not signed in for 30+ days.
    expect(
      calculateHealthStatus({ lastEventAt: null, recentEventCount: 0, enrolledAt: daysAgo(200) }),
    ).toBe('red');
    // Same member before the fix: the nudge row made it look like activity.
    expect(
      calculateHealthStatus({ lastEventAt: daysAgo(1), recentEventCount: 4, enrolledAt: daysAgo(200) }),
    ).toBe('green');
  });
});

describe('what counts as member activity (Mike, 2026-09-20)', () => {
  const idle = { lastEventAt: null, recentEventCount: 0, enrolledAt: daysAgo(200) };

  it('a login is activity, even with no member_events row', () => {
    // One signal in 30 days while enrolled is still "low activity" (yellow),
    // but it is not the "nothing on file for 14+ days" red the member used to get.
    expect(calculateHealthStatus({ ...idle, lastLoginAt: daysAgo(1) })).toBe('yellow');
    expect(calculateHealthStatus({ ...idle, lastLoginAt: null })).toBe('red');
  });

  it('Coursera / course work is activity — it writes no member_events row', () => {
    // A learner who only studies on Coursera used to score red: course
    // progress never lands in member_events.
    expect(calculateHealthStatus({ ...idle, lastCourseActivityAt: daysAgo(2) })).toBe('yellow');
    expect(
      calculateHealthStatus({ ...idle, lastLoginAt: daysAgo(2), lastCourseActivityAt: daysAgo(2) }),
    ).toBe('green');
  });

  it('AI tool / skills runs are activity, and arrive as member_events', () => {
    expect(calculateHealthStatus({ lastEventAt: daysAgo(1), recentEventCount: 5, enrolledAt: daysAgo(200) })).toBe('green');
  });

  it('takes the most recent of the three signals, in either order', () => {
    // Course work yesterday outranks a 40-day-old login and vice versa: the
    // member is not "quiet 7+ days" either way.
    expect(
      calculateHealthStatus({ ...idle, recentEventCount: 2, lastLoginAt: daysAgo(40), lastCourseActivityAt: daysAgo(1) }),
    ).toBe('green');
    expect(
      calculateHealthStatus({ ...idle, recentEventCount: 2, lastLoginAt: daysAgo(1), lastCourseActivityAt: daysAgo(40) }),
    ).toBe('green');
  });

  it('a system-sent email is not activity, whatever else is on file', () => {
    // Nudge rows never reach `lastEventAt` — they are filtered in the query —
    // so a member last seen 90 days ago stays red however many we sent.
    expect(
      calculateHealthStatus({ ...idle, lastLoginAt: daysAgo(90), lastCourseActivityAt: daysAgo(90) }),
    ).toBe('red');
  });
});

describe('health labels (audit S25)', () => {
  it('does not call the yellow dot "At Risk" — that name belongs to the alert queue', () => {
    expect(getHealthLabel('yellow')).not.toBe('At Risk');
    expect(getHealthLabel('yellow')).toBe('Low activity');
    expect(getHealthLabel('green')).toBe('Active');
    expect(getHealthLabel('red')).toBe('Inactive');
  });
});

describe('buildStatusWhere (audit S18, S19)', () => {
  it('"active" filters course progress on lastUpdatedAt, the column that exists', () => {
    const where = buildStatusWhere('active');
    const keys = keysIn(where);
    // `updatedAt` does not exist on CourseProgress; referencing it threw
    // PrismaClientValidationError and rendered AdminDataLoadError / a 500 CSV.
    expect(keys.has('lastUpdatedAt')).toBe(true);
    const courseProgress = (where.OR ?? []).find(
      (branch) => branch && typeof branch === 'object' && 'courseProgress' in branch,
    ) as { courseProgress: { some: Record<string, unknown> } } | undefined;
    expect(courseProgress).toBeDefined();
    expect(Object.keys(courseProgress!.courseProgress.some)).toContain('lastUpdatedAt');
    expect(Object.keys(courseProgress!.courseProgress.some)).not.toContain('updatedAt');
  });

  it('"active" does not treat a nudge email as recent activity', () => {
    const where = buildStatusWhere('active');
    const events = (where.OR ?? []).find(
      (branch) => branch && typeof branch === 'object' && 'memberEvents' in branch,
    ) as { memberEvents: { some: { eventName?: { notIn: string[] } } } } | undefined;
    expect(events?.memberEvents.some.eventName?.notIn).toContain('inactive_nudge_sent');
  });

  it('"completed" matches any completed course, which is why the filter is not labelled "certified"', () => {
    const where = buildStatusWhere('completed');
    const branches = (where.OR ?? []) as Array<Record<string, unknown>>;
    expect(branches.some((branch) => 'userCertifications' in branch)).toBe(true);
    expect(branches.some((branch) => 'courseProgress' in branch)).toBe(true);
  });
});
