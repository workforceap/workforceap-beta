import { Prisma } from '@prisma/client';
import { memberOnlyEmailSql } from '@/lib/admin/memberOnlyWhere';

export const ATTENTION_TIERS = ['all', 'high', 'medium', 'low', 'watch'] as const;
export type AttentionTier = typeof ATTENTION_TIERS[number];
export type AttentionCounts = Record<AttentionTier, number>;
export type AttentionCursor = {
  v: 1; partnerId: string; organizationId: string; tier: AttentionTier;
  asOf: string; updatedAt: string; referralId: string;
};
export class AttentionQueryError extends Error {}
const DAY_MS = 86400000;
const validDate = (value: unknown): value is string => typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function parseAttentionQuery(
  params: URLSearchParams, scope: { partnerId: string; organizationId: string }, now = new Date(),
) {
  const tier = params.get('tier') ?? 'all';
  if (!(ATTENTION_TIERS as readonly string[]).includes(tier)) throw new AttentionQueryError('Invalid attention tier');
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? 50 : /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AttentionQueryError('Invalid page size');
  let cursor: AttentionCursor | undefined;
  const raw = params.get('cursor');
  if (raw !== null) {
    try {
      if (!raw || raw.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
      const decoded = Buffer.from(raw, 'base64url');
      if (decoded.toString('base64url') !== raw) throw new Error();
      const parsed = JSON.parse(decoded.toString('utf8')) as Partial<AttentionCursor>;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.keys(parsed).sort().join(',') !== 'asOf,organizationId,partnerId,referralId,tier,updatedAt,v' ||
        parsed.v !== 1 || parsed.partnerId !== scope.partnerId || parsed.organizationId !== scope.organizationId || parsed.tier !== tier ||
        !validDate(parsed.asOf) || !validDate(parsed.updatedAt) || typeof parsed.referralId !== 'string' ||
        !parsed.referralId.trim() || parsed.referralId.length > 128 || parsed.referralId !== parsed.referralId.trim() ||
        Date.parse(parsed.asOf) > now.getTime() || now.getTime() - Date.parse(parsed.asOf) > DAY_MS) throw new Error();
      cursor = parsed as AttentionCursor;
    } catch { throw new AttentionQueryError('This queue page expired or is invalid. Refresh the queue.'); }
  }
  return { tier: tier as AttentionTier, limit, cursor, asOf: cursor ? new Date(cursor.asOf) : now };
}

export function encodeAttentionCursor(value: AttentionCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export type AttentionPageKey = { referralId: string; memberId: string; updatedAt: string; lastTouchName: string | null };
export type AttentionQueryResult = { counts: AttentionCounts; rows: AttentionPageKey[] };

/** Eligibility mirrors this caller's getPipelineStage inputs: deleted, placed,
 * or any recorded certification is terminal; course completion alone is not.
 * Age tiers are monotonic in updatedAt, so order the full cohort BEFORE paging.
 */
export function buildAttentionPageQuery(
  partnerId: string, organizationId: string,
  options: { tier: AttentionTier; asOf: Date; limit: number; cursor?: AttentionCursor; countsOnly?: boolean },
) {
  if (!partnerId.trim() || !organizationId.trim()) throw new Error('Partner attention scope is required');
  const { tier, asOf, cursor } = options;
  const tierFilter = tier === 'all' ? Prisma.empty : Prisma.sql`WHERE tier = ${tier}`;
  const after = cursor ? Prisma.sql`WHERE (updated_at, referral_id) > (${new Date(cursor.updatedAt)}::timestamptz AT TIME ZONE 'UTC', ${cursor.referralId})` : Prisma.empty;
  const limit = options.countsOnly ? 0 : options.limit + 1;
  return Prisma.sql`
    WITH eligible AS (
      SELECT r.id AS referral_id, r.member_id, u.updated_at,
        FLOOR(EXTRACT(EPOCH FROM (${asOf}::timestamptz - (u.updated_at AT TIME ZONE 'UTC'))) / 86400)::int AS stale_days
      FROM partner_referrals r JOIN partners p ON p.id = r.partner_id
      JOIN users u ON u.id = r.member_id JOIN profiles profile ON profile.user_id = u.id
      WHERE r.partner_id = ${partnerId} AND p.organization_id = ${organizationId} AND p.active = true
        AND u.organization_id = ${organizationId} AND u.deleted_at IS NULL
        AND profile.role = 'member' AND ${memberOnlyEmailSql('u')}
        AND (r.referred_at AT TIME ZONE 'UTC') <= ${asOf}::timestamptz
        AND NOT EXISTS (SELECT 1 FROM placement_records placement WHERE placement.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM user_certifications certification WHERE certification.user_id = u.id)
    ), tagged AS (
      SELECT *, CASE WHEN stale_days >= 14 THEN 'high' WHEN stale_days >= 7 THEN 'medium'
        WHEN stale_days >= 3 THEN 'low' ELSE 'watch' END AS tier FROM eligible
    ), filtered AS (SELECT * FROM tagged ${tierFilter}), page AS (
      SELECT * FROM filtered ${after} ORDER BY updated_at ASC, referral_id ASC LIMIT ${limit}
    )
    SELECT (SELECT jsonb_build_object('all', COUNT(*)::int,
      'high', COUNT(*) FILTER (WHERE tier = 'high')::int,
      'medium', COUNT(*) FILTER (WHERE tier = 'medium')::int,
      'low', COUNT(*) FILTER (WHERE tier = 'low')::int,
      'watch', COUNT(*) FILTER (WHERE tier = 'watch')::int) FROM tagged) AS counts,
      COALESCE((SELECT jsonb_agg(to_jsonb(result) ORDER BY result."updatedAt" ASC, result."referralId" ASC) FROM (
        SELECT page.referral_id AS "referralId", page.member_id AS "memberId",
          page.updated_at AT TIME ZONE 'UTC' AS "updatedAt", touch.name AS "lastTouchName"
        FROM page LEFT JOIN LATERAL (
          SELECT COALESCE(actor.full_name, 'User') AS name FROM partner_outreach_logs log
          LEFT JOIN users actor ON actor.id = log.created_by_user_id
          WHERE log.partner_id = ${partnerId} AND log.member_id = page.member_id
          ORDER BY log.created_at DESC, log.id DESC LIMIT 1
        ) touch ON true
      ) result), '[]'::jsonb) AS rows
  `;
}
