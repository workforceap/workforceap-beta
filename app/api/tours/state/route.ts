import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { GUIDED_TOURS_V2_FLAG, isFlagEnabledForUser } from '@/lib/feature-flags/isFlagEnabledForUser';
import {
  LEGACY_PORTAL_TOUR_KEY,
  LEGACY_TOUR_VERSION,
  isTourStatus,
  type TourStatus,
} from '@/lib/tours/registry';

export interface TourStateRow {
  tourKey: string;
  version: number;
  status: TourStatus;
  lastStep: number;
  updatedAt: string;
  /** True when synthesised from a legacy `tourCompletedAt` timestamp rather than a `user_tour_states` row. */
  legacy: boolean;
}

/**
 * GET /api/tours/state — every tour-state row for the caller, plus the
 * legacy per-portal `tourCompletedAt` timestamps read as COMPLETED v1 so
 * nobody who finished the old tour is re-toured (design §4). A real row for
 * a key always wins over the legacy synthesis.
 */
export const GET = withApiGuc(async () => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [rows, legacyUser] = await prisma.$transaction((tx) =>
      Promise.all([
        tx.userTourState.findMany({ where: { userId: user.id }, orderBy: { tourKey: 'asc' } }),
        tx.user.findUnique({ where: { id: user.id }, select: { tourCompletedAt: true } }),
      ]),
    );

    const states: TourStateRow[] = rows
      .filter((row) => isTourStatus(row.status))
      .map((row) => ({
        tourKey: row.tourKey,
        version: row.version,
        status: row.status as TourStatus,
        lastStep: row.lastStep,
        updatedAt: row.updatedAt.toISOString(),
        legacy: false,
      }));
    const seen = new Set(states.map((s) => s.tourKey));

    const pushLegacy = (tourKey: string, completedAt: Date | null | undefined) => {
      if (!completedAt || seen.has(tourKey)) return;
      seen.add(tourKey);
      states.push({
        tourKey,
        version: LEGACY_TOUR_VERSION,
        status: 'COMPLETED',
        lastStep: 0,
        updatedAt: completedAt.toISOString(),
        legacy: true,
      });
    };

    pushLegacy(LEGACY_PORTAL_TOUR_KEY.member, legacyUser?.tourCompletedAt);

    if (!seen.has(LEGACY_PORTAL_TOUR_KEY.employer)) {
      const ctx = await getEmployerForUser(user.id);
      if (ctx) {
        const employer = await prisma.$transaction((tx) =>
          tx.employer.findUnique({ where: { id: ctx.employerId }, select: { tourCompletedAt: true } }),
        );
        pushLegacy(LEGACY_PORTAL_TOUR_KEY.employer, employer?.tourCompletedAt);
      }
    }

    if (!seen.has(LEGACY_PORTAL_TOUR_KEY.partner)) {
      const ctx = await getPartnerForUser(user.id);
      if (ctx) {
        const partner = await prisma.$transaction((tx) =>
          tx.partner.findUnique({ where: { id: ctx.partnerId }, select: { tourCompletedAt: true } }),
        );
        pushLegacy(LEGACY_PORTAL_TOUR_KEY.partner, partner?.tourCompletedAt);
      }
    }

    const guidedToursV2 = await isFlagEnabledForUser(GUIDED_TOURS_V2_FLAG, user.id);

    return NextResponse.json({ states, flags: { guidedToursV2 } });
  } catch (error) {
    console.error('/api/tours/state error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
