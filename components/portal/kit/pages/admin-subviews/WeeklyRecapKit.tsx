import { DesignSurface, PageOpener, KpiStrip, type KpiItem } from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';

/**
 * Weekly recap — auto-generated weekly summary (dense).
 * Mockup: workforceap-admin-full.html "weekly-recap" view.
 * Target route: /admin/weekly-recap
 *
 * Server-rendered: the page loader computes real last-7-days-vs-prior-7-days
 * deltas and hands them here as plain numbers. We render the KPI strip + a
 * note card describing the recap cadence. No interactivity.
 */
export interface WeeklyRecapKitProps {
  /** Net new enrolled students this week, and the prior-week count for the delta. */
  newStudents: number;
  newStudentsPrev: number;
  /** Placements recorded this week, and the prior-week count. */
  placements: number;
  placementsPrev: number;
  /** Certifications earned this week, and the prior-week count. */
  certsEarned: number;
  certsEarnedPrev: number;
  /**
   * Net change in the at-risk pool this week: newly-stale members minus members
   * who re-engaged. Negative is good (the pool shrank).
   */
  atRiskDelta: number;
  /** ISO-week range caption, e.g. "Jun 16 – Jun 22". */
  weekLabel: string;
}

/** "+12" / "-3" / "0" — signed delta caption. */
function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function WeeklyRecapKit({
  newStudents,
  newStudentsPrev,
  placements,
  placementsPrev,
  certsEarned,
  certsEarnedPrev,
  atRiskDelta,
  weekLabel,
}: WeeklyRecapKitProps) {
  const studentsDelta = newStudents - newStudentsPrev;
  const placementsDelta = placements - placementsPrev;
  const certsDelta = certsEarned - certsEarnedPrev;

  const kpis: KpiItem[] = [
    {
      label: 'New Students',
      value: newStudents,
      delta: `${signed(studentsDelta)} vs last week`,
      deltaTone: studentsDelta >= 0 ? 'ok' : 'alert',
    },
    {
      label: 'Placements',
      value: placements,
      delta: `${signed(placementsDelta)} vs last week`,
      deltaTone: placementsDelta >= 0 ? 'ok' : 'alert',
    },
    {
      label: 'Certs Earned',
      value: certsEarned,
      delta: `${signed(certsDelta)} vs last week`,
      deltaTone: certsDelta >= 0 ? 'ok' : 'alert',
    },
    {
      label: 'At-Risk Δ',
      value: signed(atRiskDelta),
      // Negative is good (at-risk pool shrank): ok when ≤ 0, alert when it grew.
      tone: atRiskDelta <= 0 ? 'ok' : 'alert',
      delta: atRiskDelta <= 0 ? 'pool shrank or held' : 'pool grew',
      deltaTone: atRiskDelta <= 0 ? 'ok' : 'alert',
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Weekly recap"
        kicker="Reporting"
        lede="Auto-generated weekly summary"
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <Card>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--wa-muted)',
            margin: 0,
          }}
        >
          This recap covers the ISO week of <b style={{ color: 'var(--wa-text)' }}>{weekLabel}</b>{' '}
          and is emailed to staff every Monday at 8 AM, then posted here. The numbers above are
          week-over-week deltas computed from enrollments, placement records, certifications earned,
          and the at-risk member pool. Each card compares this week against the prior seven days so
          the recap stays scannable instead of a wall of text.
        </p>
      </Card>
    </DesignSurface>
  );
}
