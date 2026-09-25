/**
 * The placement stage of the counselor member timeline (C05).
 *
 * The source of truth is the staff placement record (`PlacementRecord`, one row
 * per member). The `placement_recorded` member event is not used: some writers
 * never emit it (`/api/admin/placements`, the employer-hire and member
 * self-report path in `lib/placement/recordPlacementFromApplication.ts`), and
 * the admin placed-outcome route emits another one on every edit. Without a
 * record, the member is not shown as placed.
 *
 * `startDateVerified` is the schema's only verification flag. A false flag is
 * labelled on the stage, never hidden and never presented as confirmed.
 *
 * Pure: no Prisma, no React.
 */

export type TimelinePlacementRecord = {
  placedAt: Date;
  startDate: Date | null;
  startDateVerified: boolean;
};

export type PlacementStageStatus = 'completed' | 'in_progress' | 'pending';

export type PlacementStageView = {
  date: string | null;
  status: PlacementStageStatus;
  note: string | null;
};

export const START_DATE_NOT_VERIFIED = 'Start date not yet verified';

/** `startDate` is a `@db.Date` column (midnight UTC). Format it as a calendar date, not an instant. */
function formatCalendarDate(value: Date): string {
  return value.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildPlacementStage(
  placement: TimelinePlacementRecord | null,
  applicationCount: number,
): PlacementStageView {
  if (!placement) {
    return { date: null, status: applicationCount > 0 ? 'in_progress' : 'pending', note: null };
  }
  let note: string | null = START_DATE_NOT_VERIFIED;
  if (placement.startDateVerified) {
    note = placement.startDate
      ? `Start date ${formatCalendarDate(placement.startDate)} (verified)`
      : 'Start date verified';
  }
  return { date: placement.placedAt.toISOString(), status: 'completed', note };
}
