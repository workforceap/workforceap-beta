import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveMemberLastActivity } from '@/lib/counselor/lastActivity';
import { memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';
import { ACTIVE_AT_RISK_STATUSES } from '@/lib/member/atRiskStatuses';

export { ACTIVE_AT_RISK_STATUSES };

export type PersistedRiskScope =
  | { organizationId: string; counselorUserId?: string; platform?: false }
  | { platform: true; organizationId?: never; counselorUserId?: never };

export type PersistedAtRiskMember = {
  alertId: string; userId: string; name: string; email: string; phone: string | null;
  score: number; status: string; factors: Prisma.JsonValue;
  enrolledProgram: string | null; enrolledAt: string | null; memberSince: string;
  profile: { employmentStatus: string | null; educationLevel: string | null } | null;
  alertCreatedAt: string; alertUpdatedAt: string; lastActivityAt: string | null;
};

/** Saved cases only: activity recency never opens, hides, or resolves an alert.
 * Count and page are distinct members in one snapshot. When several active cases
 * exist, show the highest score, then most recently updated case, then its ID.
 * No age cutoff is applied to an unresolved saved case.
 *
 * Population: member-role accounts only (`memberOnlySqlJoin`). Alerts saved
 * against staff, admin, counselor, partner or fixture accounts are never
 * "members at risk", so the Command Center KPI agrees with the /admin
 * attention tile that already reads the member-only roster (number audit
 * 2026-09-20, S2: 131 here vs 125 there).
 */
export async function loadPersistedAtRiskMembers(
  scope: PersistedRiskScope,
  options: { limit: number; offset?: number; threshold?: number; status?: string },
): Promise<{ total: number; rows: PersistedAtRiskMember[] }> {
  if (!scope.platform && !scope.organizationId?.trim()) throw new Error('At-risk organization is required');
  if (scope.counselorUserId !== undefined && !scope.counselorUserId.trim()) throw new Error('At-risk counselor is required');
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit) || 20));
  const offset = Math.max(0, Math.floor(options.offset ?? 0) || 0);
  const threshold = options.threshold ?? 0;
  const statuses = options.status ? [options.status] : [...ACTIVE_AT_RISK_STATUSES];
  const organization = scope.platform ? Prisma.empty : Prisma.sql`AND u.organization_id = ${scope.organizationId}`;
  const assignment = scope.counselorUserId ? Prisma.sql`AND EXISTS (
    SELECT 1 FROM counselor_assignments ca
    JOIN counselors c ON c.id = ca.counselor_id AND c.active = true
    JOIN users actor ON actor.id = c.user_id AND actor.deleted_at IS NULL
    WHERE ca.member_id = u.id AND ca.active = true AND c.user_id = ${scope.counselorUserId}
      AND actor.organization_id = u.organization_id
  )` : Prisma.empty;
  const [result] = await prisma.$queryRaw<Array<{ total: number; rows: PersistedAtRiskMember[] }>>(Prisma.sql`
    WITH ranked_alerts AS (
      SELECT a.*, ROW_NUMBER() OVER (
        PARTITION BY a.user_id ORDER BY a.score DESC, a.updated_at DESC, a.id ASC
      ) AS member_rank
      FROM at_risk_alerts a JOIN users u ON u.id = a.user_id
      ${memberOnlySqlJoin('u')}
      WHERE a.status IN (${Prisma.join(statuses)}) AND a.score >= ${threshold}
        AND u.deleted_at IS NULL ${organization} ${assignment}
    ), members AS (
      SELECT * FROM ranked_alerts WHERE member_rank = 1
    ), page AS (
      SELECT * FROM members ORDER BY score DESC, updated_at DESC, id ASC LIMIT ${limit} OFFSET ${offset}
    )
    SELECT (SELECT COUNT(*)::int FROM members) AS total,
      COALESCE((SELECT jsonb_agg(to_jsonb(result) ORDER BY result.score DESC, result."alertUpdatedAt" DESC, result."alertId" ASC) FROM (
        SELECT a.id AS "alertId", u.id AS "userId", COALESCE(u.full_name, u.email) AS name, u.email, u.phone,
          a.score, a.status, a.factors, u.enrolled_program AS "enrolledProgram",
          u.enrolled_at AT TIME ZONE 'UTC' AS "enrolledAt", u.created_at AT TIME ZONE 'UTC' AS "memberSince",
          CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
            'employmentStatus', p.employment_status, 'educationLevel', p.education_level
          ) END AS profile,
          a.created_at AT TIME ZONE 'UTC' AS "alertCreatedAt", a.updated_at AT TIME ZONE 'UTC' AS "alertUpdatedAt",
          last_event.last_at AT TIME ZONE 'UTC' AS "lastActivityAt"
        FROM page a JOIN users u ON u.id = a.user_id LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN LATERAL (SELECT MAX(e.created_at) AS last_at FROM member_events e WHERE e.user_id = u.id) last_event ON true
      ) result), '[]'::jsonb) AS rows
  `);
  return result ?? { total: 0, rows: [] };
}

export function persistedRiskCommandRow(row: PersistedAtRiskMember, now: Date) {
  const { daysInactive } = resolveMemberLastActivity(row.lastActivityAt ? new Date(row.lastActivityAt) : null, now);
  return {
    memberId: row.userId, memberName: row.name, memberEmail: row.email,
    enrolledProgram: row.enrolledProgram, daysInactive,
    riskScore: row.score, alertStatus: row.status, alertId: row.alertId,
    reason: `Saved risk score ${row.score} · ${row.status}`,
  };
}
