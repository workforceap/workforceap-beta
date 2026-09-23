import type { Prisma } from '@prisma/client';

/**
 * The one definition of a *verified* placement for public numbers.
 *
 * `PlacementRecord.startDateVerified` is the schema's only verification flag:
 * a counselor or admin confirmed the start date and wage
 * (`app/api/admin/members/[id]/placed-outcome/route.ts` sets it). Employer
 * "hired" clicks and member self-reports create rows with it `false`
 * (`lib/placement/recordPlacementFromApplication.ts`).
 *
 * This is the same rule the funder report (`lib/admin/funderProgramMetrics.ts`,
 * "Only staff-verified placements count toward funder-reported placement
 * totals") and the partner outcomes CSV (`app/api/partner/export/referrals/route.ts`,
 * `pr?.startDateVerified ? pr : null`) already use. Public "placed" counts and
 * the placement-derived figures shown next to them use it too
 * (docs/OUTCOMES-METHODOLOGY.md, "Public placement counts").
 */
export const VERIFIED_PLACEMENT_WHERE = {
  startDateVerified: true,
} as const satisfies Prisma.PlacementRecordWhereInput;
