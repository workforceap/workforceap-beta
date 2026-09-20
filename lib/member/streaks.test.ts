import { describe, it, expect } from 'vitest';
import { computeNextStreak } from './streaks';
import { daysSinceLastActive, effectiveStreak } from './streakDisplay';

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('computeNextStreak', () => {
  it('starts a streak on first-ever activity', () => {
    const next = computeNextStreak(
      { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
      day('2026-06-02'),
    );
    expect(next.currentStreak).toBe(1);
    expect(next.longestStreak).toBe(1);
    expect(next.lastActiveDate).toEqual(day('2026-06-02'));
  });

  it('is idempotent within the same UTC day', () => {
    const prev = { currentStreak: 4, longestStreak: 9, lastActiveDate: day('2026-06-02') };
    const next = computeNextStreak(prev, new Date('2026-06-02T23:30:00.000Z'));
    expect(next.currentStreak).toBe(4);
    expect(next.longestStreak).toBe(9);
  });

  it('extends the streak on a consecutive day', () => {
    const prev = { currentStreak: 4, longestStreak: 4, lastActiveDate: day('2026-06-02') };
    const next = computeNextStreak(prev, day('2026-06-03'));
    expect(next.currentStreak).toBe(5);
    expect(next.longestStreak).toBe(5);
  });

  it('keeps longest when extending past a smaller current', () => {
    const prev = { currentStreak: 2, longestStreak: 10, lastActiveDate: day('2026-06-02') };
    const next = computeNextStreak(prev, day('2026-06-03'));
    expect(next.currentStreak).toBe(3);
    expect(next.longestStreak).toBe(10);
  });

  it('resets to 1 after a gap of 2+ days, preserving longest', () => {
    const prev = { currentStreak: 7, longestStreak: 7, lastActiveDate: day('2026-06-02') };
    const next = computeNextStreak(prev, day('2026-06-05'));
    expect(next.currentStreak).toBe(1);
    expect(next.longestStreak).toBe(7);
  });
});

describe('effectiveStreak (read side)', () => {
  const now = new Date('2026-09-20T15:00:00.000Z');

  it('keeps the stored counter when the last activity was today or yesterday (UTC)', () => {
    expect(effectiveStreak({ currentStreak: 7, lastActiveDate: new Date('2026-09-20T01:00:00.000Z') }, now)).toBe(7);
    expect(effectiveStreak({ currentStreak: 7, lastActiveDate: new Date('2026-09-19T23:59:00.000Z') }, now)).toBe(7);
  });

  it('reads a lapsed streak as 0 however large the stored counter is', () => {
    expect(effectiveStreak({ currentStreak: 12, lastActiveDate: new Date('2026-09-18T12:00:00.000Z') }, now)).toBe(0);
    expect(effectiveStreak({ currentStreak: 40, lastActiveDate: new Date('2026-06-09T12:00:00.000Z') }, now)).toBe(0);
    expect(daysSinceLastActive(new Date('2026-06-09T12:00:00.000Z'), now)).toBe(103);
  });

  it('treats a missing or unparseable last activity as no live streak', () => {
    expect(effectiveStreak({ currentStreak: 3, lastActiveDate: null }, now)).toBe(0);
    expect(effectiveStreak({ currentStreak: 3, lastActiveDate: undefined }, now)).toBe(0);
    expect(effectiveStreak({ currentStreak: 3, lastActiveDate: 'not a date' }, now)).toBe(0);
    expect(effectiveStreak({ currentStreak: 0, lastActiveDate: new Date('2026-09-20T01:00:00.000Z') }, now)).toBe(0);
    expect(effectiveStreak({ currentStreak: null, lastActiveDate: new Date('2026-09-20T01:00:00.000Z') }, now)).toBe(0);
  });

  it('accepts ISO strings (serialized rows) and a slightly future-dated last activity', () => {
    expect(effectiveStreak({ currentStreak: 2, lastActiveDate: '2026-09-20T10:00:00.000Z' }, now)).toBe(2);
    expect(effectiveStreak({ currentStreak: 2, lastActiveDate: new Date('2026-09-21T00:30:00.000Z') }, now)).toBe(2);
  });

  it('agrees with the write side: the day after a 2-day gap the counter would restart at 1', () => {
    const prev = { currentStreak: 5, longestStreak: 5, lastActiveDate: new Date('2026-09-17T12:00:00.000Z') };
    expect(effectiveStreak(prev, now)).toBe(0);
    expect(computeNextStreak(prev, now).currentStreak).toBe(1);
  });
});
