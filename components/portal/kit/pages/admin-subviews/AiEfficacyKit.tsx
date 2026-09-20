import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  type KpiItem,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';

/**
 * AI Efficacy — does AI tool use correlate with placement outcomes? (dense)
 * Mockup: workforceap-admin-full.html "ai-efficacy" view.
 * Target route: /admin/analytics/ai-efficacy
 *
 * Server-rendered: all cohort analysis happens in the page loader (reusing
 * lib/analytics/aiToolEfficacy.analyzeAIEfficacy) and lands here as plain
 * numbers. KPI strip mirrors the mockup: AI Users Placed (success),
 * Non-Users Placed (muted), Lift (accent), Confidence (success/qualitative).
 */
export interface AiEfficacyKitProps {
  /** Placement rate (0-100) for members who used any AI tool. */
  placementRateWith: number;
  /** Placement rate (0-100) for members who used no AI tool. */
  placementRateWithout: number;
  /** Members who used any AI tool (cohort size). */
  usersWithTool: number;
  /** Members who used no AI tool (cohort size). */
  usersWithoutTool: number;
  /**
   * Qualitative confidence label derived from sample size + lift
   * (e.g. "High", "Moderate", "Low", "Insufficient data") or "—".
   */
  confidence: string;
  /** Date range covered, for the explainer note. */
  rangeStart: string;
  rangeEnd: string;
  /** Total enrolled members analyzed in range. */
  totalAnalyzed: number;
  /** Top tool by lift (label + pp), or null when none qualifies. */
  topTool: { label: string; lift: number } | null;
}

function liftLabel(lift: number): string {
  const sign = lift > 0 ? '+' : '';
  return `${sign}${lift}pp`;
}

export function AiEfficacyKit({
  placementRateWith,
  placementRateWithout,
  usersWithTool,
  usersWithoutTool,
  confidence,
  rangeStart,
  rangeEnd,
  totalAnalyzed,
  topTool,
}: AiEfficacyKitProps) {
  const lift = placementRateWith - placementRateWithout;

  const kpis: KpiItem[] = [
    { label: 'AI Users Placed', value: `${placementRateWith}%` },
    { label: 'Non-Users Placed', value: `${placementRateWithout}%` },
    { label: 'Lift', value: liftLabel(lift) },
    { label: 'Confidence', value: confidence },
  ];

  // Explainer: real cohort sentence, no fabrication. Falls back gracefully
  // when no tool usage was recorded in range.
  const noteText =
    usersWithTool > 0
      ? `Across ${totalAnalyzed.toLocaleString()} enrolled members (${rangeStart} → ${rangeEnd}), ` +
        `${usersWithTool.toLocaleString()} used AI tools and placed at ${placementRateWith}%, versus ` +
        `${placementRateWithout}% for the ${usersWithoutTool.toLocaleString()} who did not — a ${liftLabel(lift)} lift. ` +
        (topTool
          ? `Top tool by lift: ${topTool.label} (${liftLabel(topTool.lift)}). `
          : '') +
        `Surfacing this lift helps justify the toolkit investment to funders and the board. ` +
        `Confidence is a qualitative read of cohort size and effect, not a statistical test.`
      : `No AI tool usage was recorded for enrolled members between ${rangeStart} and ${rangeEnd}. ` +
        `Once members begin using the toolkit, this view compares their placement rate against non-users ` +
        `to quantify the lift for funders and the board.`;

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="AI Efficacy"
        kicker="Analytics"
        lede="Does AI tool use correlate with outcomes?"
        action={
          <Button
            label="Filter & export"
            variant="secondary"
            size="sm"
            href="/admin/analytics/ai-efficacy?ui=legacy"
          />
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <Card>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--wa-muted)',
          }}
        >
          {noteText}
        </p>
      </Card>
    </DesignSurface>
  );
}
