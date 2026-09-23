import { SMALL_SAMPLE_THRESHOLD } from '@/lib/admin/boardOutcomes';
import type { PartnerQuarterlyOutcomesReport } from '@/lib/analytics/partnerQuarterlyOutcomes';
import type { RetentionSummary } from '@/lib/analytics/retentionOutcome';

/**
 * What the unauthenticated /api/org/[slug]/outcomes may show about a partner
 * quarter (docs/OUTCOMES-METHODOLOGY.md, section 7 "Partner quarterly
 * outcomes page").
 *
 * This is an allowlist: every field is copied by name, so a field added to the
 * admin quarterly report does not reach the public page until it is added here
 * and to the methodology.
 *  - Counts are always shown (rule 1: small numbers are not the problem).
 *  - The drop-off rate is null with `dropOffRateSuppressed: true` when fewer
 *    than SMALL_SAMPLE_THRESHOLD members were referred.
 *  - No salary values and no days-to-place: with one placement either one is a
 *    single member's record. Member rows never leave the admin report.
 */
export interface PublicPartnerOutcomes {
  quarter: string;
  year: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  partnerName: string;
  partnerSlug: string;
  smallSampleThreshold: number;
  metrics: {
    totalReferred: number;
    totalEnrolled: number;
    completions: number;
    placements: number;
    activeMembers: number;
    dropOffs: number;
    /** Percent of referred members; null when suppressed. */
    dropOffRate: number | null;
    dropOffRateSuppressed: boolean;
  };
  retention: {
    ninetyDay: RetentionSummary;
    hundredEightyDay: RetentionSummary;
  };
  programBreakdown: Array<{
    programSlug: string;
    enrolled: number;
    completions: number;
    placements: number;
  }>;
}

function retentionCounts(summary: RetentionSummary): RetentionSummary {
  return {
    retained: summary.retained,
    notRetainedOrSeparated: summary.notRetainedOrSeparated,
    pendingDecision: summary.pendingDecision,
    total: summary.total,
  };
}

export function toPublicPartnerOutcomes(body: PartnerQuarterlyOutcomesReport): PublicPartnerOutcomes {
  const m = body.metrics;
  const dropOffRateSuppressed = m.totalReferred < SMALL_SAMPLE_THRESHOLD;
  return {
    quarter: body.quarter,
    year: body.year,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    generatedAt: body.generatedAt,
    partnerName: body.partnerName,
    partnerSlug: body.partnerSlug,
    smallSampleThreshold: SMALL_SAMPLE_THRESHOLD,
    metrics: {
      totalReferred: m.totalReferred,
      totalEnrolled: m.totalEnrolled,
      completions: m.completions,
      placements: m.placements,
      activeMembers: m.activeMembers,
      dropOffs: m.dropOffs,
      dropOffRate: dropOffRateSuppressed ? null : m.dropOffRate,
      dropOffRateSuppressed,
    },
    retention: {
      ninetyDay: retentionCounts(body.retention.ninetyDay),
      hundredEightyDay: retentionCounts(body.retention.hundredEightyDay),
    },
    programBreakdown: body.programBreakdown.map((p) => ({
      programSlug: p.programSlug,
      enrolled: p.enrolled,
      completions: p.completions,
      placements: p.placements,
    })),
  };
}
