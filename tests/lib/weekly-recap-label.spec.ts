import { afterEach, describe, expect, it } from 'vitest';
import { formatRecapWeekLabel, recapCalendarDateKey } from '@/lib/recap/weekLabel';

const originalTimezone = process.env.TZ;
afterEach(() => { if (originalTimezone == null) delete process.env.TZ; else process.env.TZ = originalTimezone; });

describe('recap calendar period labels', () => {
  it.each(['UTC', 'America/Chicago', 'Pacific/Auckland'])('keeps the same calendar range in %s', (timezone) => {
    process.env.TZ = timezone;
    expect(formatRecapWeekLabel('2026-09-14')).toBe('Sep 14 – Sep 20, 2026');
    expect(formatRecapWeekLabel('2026-03-02')).toBe('Mar 2 – Mar 8, 2026');
    expect(formatRecapWeekLabel('2026-10-26')).toBe('Oct 26 – Nov 1, 2026');
    expect(formatRecapWeekLabel('2025-12-29')).toBe('Dec 29 – Jan 4, 2026');
  });

  it('serializes the server reporting calendar before the browser changes timezone', () => {
    process.env.TZ = 'Pacific/Auckland';
    const key = recapCalendarDateKey(new Date(2026, 8, 14));
    process.env.TZ = 'America/Chicago';
    expect(key).toBe('2026-09-14');
    expect(formatRecapWeekLabel(key)).toBe('Sep 14 – Sep 20, 2026');
  });

  it('does not silently reinterpret an instant as a calendar period', () => {
    expect(formatRecapWeekLabel('2026-09-14T00:00:00Z')).toBe('');
    expect(formatRecapWeekLabel('invalid')).toBe('');
  });
});
