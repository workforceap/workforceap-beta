import { Prisma } from '@prisma/client';
import { memberOnlyRoleSql } from '@/lib/admin/memberOnlyWhere';

export function buildInactiveMembersQuery(orgId: string | null, counselorId: string | null, cutoffDate: Date) {
  const assignmentScope = counselorId
    ? Prisma.sql`
      AND EXISTS (
        SELECT 1
        FROM counselor_assignments ca
        WHERE ca.member_id = u.id
          AND ca.active = true
          AND ca.counselor_id = ${counselorId}
      )
    `
    : Prisma.empty;

  return Prisma.sql`
    SELECT
      u.id,
      u.email,
      u.created_at as joined_at,
      p.role,
      p.profile_phone,
      MAX(me.created_at) as last_active_at
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN member_events me ON me.user_id = u.id
    WHERE ${memberOnlyRoleSql('u')}
    AND u.organization_id = ${orgId}
    ${assignmentScope}
    GROUP BY u.id, u.email, u.created_at, p.role, p.profile_phone
    HAVING (
      (MAX(me.created_at) IS NULL AND u.created_at < ${cutoffDate})
      OR MAX(me.created_at) < ${cutoffDate}
    )
    ORDER BY MAX(me.created_at) ASC NULLS FIRST
  `;
}
