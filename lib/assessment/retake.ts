/** Staff authorization is checked by both callers before entering this helper. */
import { prisma } from '@/lib/db/prisma';
import { getSubjectOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';

export type RetakeResult =
  | { ok: true; previousScorePct: number | null; alreadyPending: boolean }
  | { ok: false; reason: 'not_found' | 'not_completed' | 'limit_reached' | 'changed' };

export async function allowAssessmentRetake(input: {
  memberId: string; staffUserId: string; staffRole: 'admin' | 'counselor'; reason?: string | null;
}): Promise<RetakeResult> {
  if (input.memberId === input.staffUserId) return { ok: false, reason: 'not_found' };
  const orgId = await getSubjectOrganizationId(input.memberId).catch(() => null);
  if (!orgId) return { ok: false, reason: 'not_found' };

  // One SQL statement is atomic even where preview flattens $transaction.
  // The UPDATE repeats eligibility after any row-lock wait. It never clears
  // the official result or training gates; the member gets a pending prompt.
  // Legacy staff resets can already have cleared the result: their durable
  // imported history is kept and authorization is restored without rearchive.
  const rows = await prisma.$transaction((tx) => tx.$queryRaw<{ previousScorePct: number | null }[]>`
    WITH candidate AS MATERIALIZED (
      SELECT * FROM users WHERE id = ${input.memberId} AND organization_id = ${orgId}
        AND deleted_at IS NULL AND assessment_attempt_count = 1
        AND assessment_retake_requested_at IS NULL
      FOR UPDATE
    )
    UPDATE users u SET
      assessment_retake_requested_at = CURRENT_TIMESTAMP,
      assessment_history = CASE WHEN u.assessment_completed AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(u.assessment_history) h
        WHERE h->>'completedAt' IN (
          to_char(c.assessment_completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          to_jsonb(c.assessment_completed_at) #>> '{}'
        ) AND NULLIF(h->'scorePct', 'null'::jsonb) IS NOT DISTINCT FROM to_jsonb(c.assessment_score_pct)
          AND NULLIF(h->'answers', 'null'::jsonb) IS NOT DISTINCT FROM NULLIF(c.assessment_answers, 'null'::jsonb)
      ) THEN
        u.assessment_history || jsonb_build_array(jsonb_build_object(
          'score', c.assessment_score, 'scorePct', c.assessment_score_pct,
          'answers', c.assessment_answers, 'programInterest', c.program_interest,
          'completedAt', c.assessment_completed_at, 'requestedAt', CURRENT_TIMESTAMP,
          'allowedBy', ${input.staffUserId}::text, 'allowedByRole', ${input.staffRole}::text,
          'reason', ${input.reason?.trim().slice(0, 500) || null}::text
        )) ELSE u.assessment_history END,
      updated_at = CURRENT_TIMESTAMP
    FROM candidate c WHERE u.id = c.id AND u.organization_id = ${orgId}
      AND u.assessment_attempt_count = 1 AND u.assessment_retake_requested_at IS NULL
    RETURNING c.assessment_score_pct AS "previousScorePct"
  `);
  if (rows.length) return { ok: true, previousScorePct: rows[0].previousScorePct, alreadyPending: false };

  return withTenantScope(orgId, async (db) => {
    const member = await db.user.findFirst({ where: { id: input.memberId, deletedAt: null }, select: {
      assessmentAttemptCount: true, assessmentRetakeRequestedAt: true, assessmentScorePct: true,
    } });
    if (!member) return { ok: false, reason: 'not_found' };
    if (member.assessmentAttemptCount >= 2) return { ok: false, reason: 'limit_reached' };
    if (member.assessmentRetakeRequestedAt) return { ok: true, previousScorePct: member.assessmentScorePct, alreadyPending: true };
    return { ok: false, reason: member.assessmentAttemptCount === 0 ? 'not_completed' : 'changed' };
  });
}
