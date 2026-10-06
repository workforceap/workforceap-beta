import { describe, expect, it } from 'vitest';

import {
  START_DATE_NOT_VERIFIED,
  buildPlacementStage,
} from '@/lib/counselor/placementTimelineStage';

const placedAt = new Date('2026-09-15T18:30:00.000Z');

describe('buildPlacementStage', () => {
  it('is pending with no placement and no applications', () => {
    expect(buildPlacementStage(null, 0)).toEqual({ date: null, status: 'pending', note: null });
  });

  it('is in progress when applications exist but no PlacementRecord', () => {
    expect(buildPlacementStage(null, 2)).toEqual({ date: null, status: 'in_progress', note: null });
  });

  it('never presents an unverified start date as confirmed', () => {
    const view = buildPlacementStage(
      { placedAt, startDate: new Date('2026-10-01T00:00:00.000Z'), startDateVerified: false },
      1,
    );
    expect(view).toEqual({
      date: placedAt.toISOString(),
      status: 'completed',
      note: START_DATE_NOT_VERIFIED,
    });
    expect(view.note).not.toContain('(verified)');
  });

  it('labels a verified start date as a UTC calendar day, not an instant', () => {
    expect(
      buildPlacementStage(
        { placedAt, startDate: new Date('2026-10-01T00:00:00.000Z'), startDateVerified: true },
        0,
      ),
    ).toEqual({
      date: placedAt.toISOString(),
      status: 'completed',
      note: 'Start date Oct 1, 2026 (verified)',
    });
  });

  it('still shows completed when staff verified the start with no date on file', () => {
    expect(
      buildPlacementStage({ placedAt, startDate: null, startDateVerified: true }, 0),
    ).toEqual({
      date: placedAt.toISOString(),
      status: 'completed',
      note: 'Start date verified',
    });
  });
});
