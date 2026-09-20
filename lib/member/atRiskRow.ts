import { riskLevelFromScore, type RiskLevel } from '@/lib/attention/evaluate';

/**
 * The row shape the counselor At-risk page renders. Built once on the server
 * from a saved case (lib/member/persistedAtRisk) and again by the client
 * refresh from /api/admin/members/at-risk, which serialises the same rows.
 *
 * Pure: no Prisma, no `server-only`, so the client bundle, the dev showcase
 * and `node --test` can all load it.
 */

export interface AtRiskFactor {
  name: string;
  weight: number;
  description: string;
}

/** Same bands as the attention model (lib/attention/evaluate) and THRESHOLDS in atRiskScoring. */
export type AtRiskLevel = RiskLevel;
export type AtRiskAlertStatus = 'open' | 'acknowledged' | 'resolved' | 'escalated';

export interface AtRiskMember {
  userId: string;
  alertId: string;
  name: string;
  email: string;
  phone: string | null;
  score: number;
  riskLevel: AtRiskLevel;
  status: AtRiskAlertStatus;
  factors: AtRiskFactor[];
  enrolledProgram: string | null;
  enrolledAt: string | null;
  memberSince: string;
  profile: {
    employmentStatus: string | null;
    educationLevel: string | null;
  } | null;
  alertCreatedAt: string;
  alertUpdatedAt: string;
  /** ISO timestamp of the latest recorded member event; null when none is recorded. */
  lastActivityAt?: string | null;
}

/** What a saved case looks like before the page shapes it (mirrors PersistedAtRiskMember). */
export type SavedAtRiskCase = {
  alertId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  score: number;
  status: string;
  factors: unknown;
  enrolledProgram: string | null;
  enrolledAt: string | Date | null;
  memberSince: string | Date;
  profile: { employmentStatus: string | null; educationLevel: string | null } | null;
  alertCreatedAt: string | Date;
  alertUpdatedAt: string | Date;
  lastActivityAt: string | Date | null;
};

const ALERT_STATUSES: readonly AtRiskAlertStatus[] = ['open', 'acknowledged', 'resolved', 'escalated'];

/**
 * The saved `factors` column is free JSON written by the nightly scan. Keep
 * only entries that carry a name and a description, so a malformed row never
 * breaks the whole page.
 */
export function normalizeAtRiskFactors(value: unknown): AtRiskFactor[] {
  if (!Array.isArray(value)) return [];
  const out: AtRiskFactor[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { name, weight, description } = entry as Record<string, unknown>;
    if (typeof name !== 'string' || typeof description !== 'string') continue;
    out.push({ name, description, weight: typeof weight === 'number' && Number.isFinite(weight) ? weight : 0 });
  }
  return out;
}

function isoOrNull(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return value;
}

/** Shape one saved case into the row the dashboard renders; unknown statuses read as open. */
export function toAtRiskMemberRow(row: SavedAtRiskCase): AtRiskMember {
  const status = (ALERT_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as AtRiskAlertStatus)
    : 'open';
  return {
    userId: row.userId,
    alertId: row.alertId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    score: row.score,
    riskLevel: riskLevelFromScore(row.score),
    status,
    factors: normalizeAtRiskFactors(row.factors),
    enrolledProgram: row.enrolledProgram,
    enrolledAt: isoOrNull(row.enrolledAt),
    memberSince: isoOrNull(row.memberSince) ?? '',
    profile: row.profile,
    alertCreatedAt: isoOrNull(row.alertCreatedAt) ?? '',
    alertUpdatedAt: isoOrNull(row.alertUpdatedAt) ?? '',
    lastActivityAt: isoOrNull(row.lastActivityAt),
  };
}
