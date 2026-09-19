import { prisma } from '@/lib/db/prisma';

/**
 * Only the four aggregates used by member detail. Keep the board's historical
 * all-time definitions: active users with a legacy program pointer form the
 * enrollment denominator, while placement totals include historical records.
 */
export async function getMemberOutcomesSummary(organizationId: string, now = new Date()) {
  if (!organizationId?.trim()) throw new Error('Member outcomes require an organization');
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [membersEnrolled, membersPlaced, placedLast90d, weeks] = await Promise.all([
    prisma.user.count({
      where: { organizationId, deletedAt: null, enrolledProgram: { not: null } },
    }),
    prisma.placementRecord.count({ where: { user: { organizationId } } }),
    prisma.placementRecord.count({
      where: { user: { organizationId }, placedAt: { gte: ninetyDaysAgo, lte: now } },
    }),
    prisma.$queryRaw<Array<{ avg_weeks: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM (pr.placed_at - u.enrolled_at)) / (7 * 86400)) AS avg_weeks
      FROM placement_records pr
      INNER JOIN users u ON u.id = pr.user_id
      WHERE u.enrolled_at IS NOT NULL
        AND pr.placed_at > u.enrolled_at
        AND u.organization_id = ${organizationId}
    `,
  ]);
  return {
    membersEnrolled,
    membersPlaced,
    placedLast90d,
    placementRate: membersEnrolled > 0 ? Math.round((membersPlaced / membersEnrolled) * 100) : 0,
    averageWeeksToPlacement: weeks[0]?.avg_weeks == null ? null : Math.round(Number(weeks[0].avg_weeks)),
  };
}
