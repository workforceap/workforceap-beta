/**
 * Applications funnel (`/admin/pipeline`), pure projection.
 *
 * The funnel bars walk stages an applicant passes IN ORDER, so every bar is
 * a subset of the one above it: started → completed intake → enrolled →
 * active. WIOA eligibility screening is a parallel step (`wioaReviewStatus`
 * set), not a gate before enrollment, so it is NOT a funnel bar: it printed
 * "Eligibility cleared 0" above "Enrolled 8" with no explanation (admin
 * audit 2026-09-20, Pipeline). It is a labelled KPI tile instead.
 */

import type { KpiItem } from '@/components/portal/kit/KpiStrip';
import type { RankDatum } from '@/components/portal/kit/Charts';

export type PipelineFunnelCounts = {
  started: number;
  intake: number;
  /** Members whose WIOA review status is 'verified' (eligibility confirmed). */
  eligibility: number;
  enrolled: number;
  active: number;
};

/**
 * Funnel stages in the order an applicant passes them. A stage is a position
 * in the walk, not a state, so the bars carry no tone and paint the kit's
 * neutral accent (the blue/green pre- vs post-enrollment split they used to
 * carry was a category, which the kit no longer paints — WAP-99).
 */
export const PIPELINE_FUNNEL_STAGES = [
  { key: 'started', label: 'Started application' },
  { key: 'intake', label: 'Completed intake' },
  { key: 'enrolled', label: 'Enrolled' },
  { key: 'active', label: 'Active' },
] as const satisfies ReadonlyArray<{ key: keyof PipelineFunnelCounts; label: string }>;

export const WIOA_SCREENED_LABEL = 'WIOA verified';
export const WIOA_SCREENED_CAPTION = 'eligibility confirmed (review status verified); runs alongside enrollment, not a gate';

export function pipelineFunnelSubtitle(windowDays: number): string {
  return `last ${windowDays} days · members who started an application in this window; each stage counts the ones who reached it`;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function buildPipelineFunnel(counts: PipelineFunnelCounts): { bars: RankDatum[]; kpis: KpiItem[]; hasAny: boolean } {
  const total = counts.started;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const bars: RankDatum[] = PIPELINE_FUNNEL_STAGES.map((stage) => ({
    label: stage.label,
    value: fmt(counts[stage.key]),
    pct: pct(counts[stage.key]),
  }));

  const kpis: KpiItem[] = [
    { label: 'Started', value: fmt(counts.started) },
    { label: 'Enrolled', value: fmt(counts.enrolled) },
    { label: 'Active', value: fmt(counts.active) },
    { label: 'Started → Active', value: `${pct(counts.active)}%` },
    { label: WIOA_SCREENED_LABEL, value: fmt(counts.eligibility), delta: WIOA_SCREENED_CAPTION, deltaTone: 'muted' },
  ];

  return { bars, kpis, hasAny: total > 0 };
}
