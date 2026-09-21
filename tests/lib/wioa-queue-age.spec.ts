/**
 * WAP-166 item 2: the WIOA review queue must show how long each member has
 * waited and put the longest wait first, so a screening cannot sit unseen
 * for four months again.
 */
import { describe, expect, it } from 'vitest';
import {
  WIOA_QUEUE_AGE_ALERT_DAYS,
  isWioaAwaitingReview,
  oldestWioaWaitDays,
  sortWioaQueueOldestFirst,
  wioaDaysWaiting,
  wioaSubmittedAt,
} from '@/lib/wioa/wioaQueueAge';

const NOW = new Date('2026-09-21T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** A stored `wioa_qualification_json` snapshot submitted `ageDays` ago. */
function snapshot(ageDays: number) {
  return {
    version: 2,
    submittedAt: new Date(NOW.getTime() - ageDays * DAY).toISOString(),
    signal: 'review',
    reasons: [],
    answers: {
      ageBracket: '25_54',
      countyOrZip: '78701',
      primaryBarrier: 'none',
      dislocatedWorker: false,
      lowIncomeSelfReport: true,
      trainingInterest: true,
      completedIntakeSelfReport: false,
    },
  };
}

describe('wioaDaysWaiting', () => {
  it('measures whole days from the snapshot submittedAt', () => {
    expect(wioaDaysWaiting({ wioaQualificationJson: snapshot(117), updatedAt: new Date(NOW) }, NOW)).toBe(117);
    expect(wioaDaysWaiting({ wioaQualificationJson: snapshot(0.4), updatedAt: null }, NOW)).toBe(0);
  });

  it('floors a future timestamp at zero rather than going negative', () => {
    expect(wioaDaysWaiting({ wioaQualificationJson: snapshot(-3), updatedAt: null }, NOW)).toBe(0);
  });

  it('falls back to updatedAt only when the snapshot has no usable submittedAt', () => {
    const updatedAt = new Date(NOW.getTime() - 9 * DAY);
    expect(wioaDaysWaiting({ wioaQualificationJson: null, updatedAt }, NOW)).toBe(9);
    expect(wioaDaysWaiting({ wioaQualificationJson: { submittedAt: 'not a date' }, updatedAt }, NOW)).toBe(9);
    expect(wioaDaysWaiting({ wioaQualificationJson: null, updatedAt: null }, NOW)).toBeNull();
    expect(wioaSubmittedAt({ ...snapshot(3), submittedAt: 'garbage' })).toBeNull();
  });
});

describe('oldestWioaWaitDays', () => {
  it('returns the longest wait across the queue and null for an empty queue', () => {
    const rows = [
      { wioaQualificationJson: snapshot(12), updatedAt: null },
      { wioaQualificationJson: snapshot(125), updatedAt: null },
      { wioaQualificationJson: null, updatedAt: new Date(NOW.getTime() - 40 * DAY) },
      { wioaQualificationJson: null, updatedAt: null },
    ];
    expect(oldestWioaWaitDays(rows, NOW)).toBe(125);
    expect(oldestWioaWaitDays([], NOW)).toBeNull();
    expect(oldestWioaWaitDays([{ wioaQualificationJson: null, updatedAt: null }], NOW)).toBeNull();
  });
});

describe('sortWioaQueueOldestFirst', () => {
  it('puts screenings awaiting review first, longest wait first, then reviewed rows newest decision first', () => {
    const rows = [
      { id: 'verified-old', awaitingReview: false, daysWaiting: null, reviewedAt: new Date('2026-06-01T00:00:00Z') },
      { id: 'pending-12', awaitingReview: true, daysWaiting: 12, reviewedAt: null },
      { id: 'pending-unknown', awaitingReview: true, daysWaiting: null, reviewedAt: null },
      { id: 'verified-new', awaitingReview: false, daysWaiting: null, reviewedAt: new Date('2026-09-01T00:00:00Z') },
      { id: 'pending-125', awaitingReview: true, daysWaiting: 125, reviewedAt: null },
      { id: 'pending-117', awaitingReview: true, daysWaiting: 117, reviewedAt: null },
    ];
    expect(sortWioaQueueOldestFirst(rows).map((r) => r.id)).toEqual([
      'pending-125',
      'pending-117',
      'pending-12',
      'pending-unknown',
      'verified-new',
      'verified-old',
    ]);
  });

  it('is stable for equal waits and does not mutate its input', () => {
    const rows = [
      { id: 'a', awaitingReview: true, daysWaiting: 30 },
      { id: 'b', awaitingReview: true, daysWaiting: 30 },
      { id: 'c', awaitingReview: true, daysWaiting: 31 },
    ];
    const sorted = sortWioaQueueOldestFirst(rows);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('isWioaAwaitingReview', () => {
  it('treats pending and in_review as waiting on staff, nothing else', () => {
    expect(isWioaAwaitingReview('pending')).toBe(true);
    expect(isWioaAwaitingReview('in_review')).toBe(true);
    for (const done of ['verified', 'not_eligible', 'needs_info', null, undefined, '']) {
      expect(isWioaAwaitingReview(done)).toBe(false);
    }
  });

  it('alerts at two weeks — the longest a "few business days" promise can be stretched', () => {
    expect(WIOA_QUEUE_AGE_ALERT_DAYS).toBe(14);
  });
});
