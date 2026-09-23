import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { prisma } from '@/lib/db/prisma';
import { shouldSkipOptionalDbQueriesAtBuild } from '@/lib/db/optionalBuildDb';
import { VERIFIED_PLACEMENT_WHERE } from '@/lib/placement/verifiedPlacement';
import { getDefaultOrganizationId } from '@/lib/tenant/organization';

export type TrustStripMetrics = {
  membersPlaced: number;
  partnerCompanies: number;
  avgStartingWage: number | null;
  hasLiveData: boolean;
};

export const TRUST_STRIP_PLACEHOLDER_LINE =
  'Training-aligned candidates · counselor-supported readiness · no-cost to members';

function formatStartingWage(amount: number): string {
  if (amount >= 1000) {
    const k = amount / 1000;
    return k % 1 === 0 ? `$${k}K` : `$${k.toFixed(1)}K`;
  }
  return `$${amount.toLocaleString('en-US')}`;
}

export function formatTrustStripLine(metrics: TrustStripMetrics): string {
  if (!metrics.hasLiveData) {
    return TRUST_STRIP_PLACEHOLDER_LINE;
  }

  const placed =
    metrics.membersPlaced > 0
      ? `${metrics.membersPlaced.toLocaleString('en-US')} members placed`
      : null;
  const wage =
    metrics.avgStartingWage != null && metrics.avgStartingWage > 0
      ? `${formatStartingWage(metrics.avgStartingWage)} avg starting wage`
      : null;

  const segments = [placed, wage].filter(Boolean);
  return segments.length > 0 ? segments.join(' · ') : TRUST_STRIP_PLACEHOLDER_LINE;
}

export async function getTrustStripMetrics(
  orgId: string,
  db: PrismaClient = prisma,
): Promise<TrustStripMetrics> {
  if (shouldSkipOptionalDbQueriesAtBuild()) {
    return {
      membersPlaced: 0,
      partnerCompanies: 0,
      avgStartingWage: null,
      hasLiveData: false,
    };
  }

  try {
    const memberWhere = {
      organizationId: orgId,
      deletedAt: null,
      ...MEMBER_ONLY_WHERE,
    };

    // Public "members placed" and the wage beside it count staff-verified
    // placements only: an employer "hired" click or a member self-report is
    // not a public outcome until a counselor confirms it
    // (docs/OUTCOMES-METHODOLOGY.md, "Public placement counts").
    const [membersPlaced, partnerCompanies, avgStarting] = await Promise.all([
      db.placementRecord.count({ where: { ...VERIFIED_PLACEMENT_WHERE, user: memberWhere } }),
      db.employer.count({ where: { organizationId: orgId, status: 'active' } }),
      db.placementRecord.aggregate({
        where: { ...VERIFIED_PLACEMENT_WHERE, salaryOffered: { not: null }, user: memberWhere },
        _avg: { salaryOffered: true },
      }),
    ]);

    const avgStartingWage =
      avgStarting._avg.salaryOffered != null ? Math.round(avgStarting._avg.salaryOffered) : null;

    const hasLiveData = membersPlaced > 0 || (avgStartingWage != null && avgStartingWage > 0);

    return {
      membersPlaced,
      partnerCompanies,
      avgStartingWage,
      hasLiveData,
    };
  } catch {
    return {
      membersPlaced: 0,
      partnerCompanies: 0,
      avgStartingWage: null,
      hasLiveData: false,
    };
  }
}

export async function loadTrustStripMetrics(): Promise<TrustStripMetrics> {
  if (shouldSkipOptionalDbQueriesAtBuild()) {
    return getTrustStripMetrics('build');
  }

  try {
    const orgId = await getDefaultOrganizationId();
    return getTrustStripMetrics(orgId);
  } catch {
    return {
      membersPlaced: 0,
      partnerCompanies: 0,
      avgStartingWage: null,
      hasLiveData: false,
    };
  }
}
