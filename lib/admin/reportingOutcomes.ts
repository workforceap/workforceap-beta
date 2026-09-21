/**
 * Outcomes tab of the reporting hub: the projection of `getBoardSnapshot()`
 * onto the Board Outcomes kit.
 *
 * `/admin/board` and `/admin/outcomes` used to map the SAME snapshot two
 * different ways (admin audit 2026-09-19, §6.1): the board tile said
 * "Avg Wage" over a median, the outcomes page printed raw program slugs, and
 * the two "Placements by month" charts came from different series. One
 * projection now, so every reader sees one set of definitions:
 *
 *   Placement rate   placed / members served (enrolled in the period), from
 *                    the snapshot totals — the outcomes-methodology definition.
 *   Median wage      median `salary_offered` of placements in the period;
 *                    labelled as a median, never "average".
 *   Credentials      certifications earned (snapshot `certifications.totalEarned`).
 *   90-day retention retained / decided placements; "—" until a placement has
 *                    a decided retention outcome.
 *   By month         `placement_recorded` member events (what staff actually
 *                    log), falling back to the enrollment-cohort series when
 *                    no activity has been recorded yet.
 *   By program       friendly program titles, ranked by placements.
 *
 * Pure so the mapping is testable without Prisma.
 */

import type { BoardSnapshot } from '@/lib/admin/boardOutcomes';
import { programDisplayTitle } from '@/lib/content/programTitle';
import type { ChartDatum, RankDatum } from '@/components/portal/kit/Charts';
import type { KpiItem } from '@/components/portal/kit/KpiStrip';

export type OutcomesKitData = {
  kpis: KpiItem[];
  placementsByMonth: ChartDatum[] | undefined;
  placementsTotal: number;
  periodLabel: string;
  byProgram: RankDatum[] | undefined;
};

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export function buildOutcomesKitData(snapshot: BoardSnapshot): OutcomesKitData {
  const totals = snapshot.outcomes.totals;
  const retentionRate = snapshot.kpis.retentionRate;

  const kpis: KpiItem[] = [
    {
      label: 'Placement rate',
      value: `${totals.placementRate}%`,
      delta: 'placed of members served this period',
      deltaTone: 'muted',
    },
    {
      label: 'Median wage',
      value: totals.medianAnnualSalary != null ? money(totals.medianAnnualSalary) : '—',
      delta: 'annual, placements with a salary',
      deltaTone: 'muted',
    },
    { label: 'Credentials earned', value: snapshot.certifications.totalEarned },
    {
      label: '90-day retention',
      value: retentionRate != null ? `${retentionRate}%` : '—',
      delta: retentionRate != null ? 'retained of decided placements' : 'no decided retention outcome yet',
      deltaTone: 'muted',
    },
  ];

  const monthly = snapshot.placementActivity.length > 0
    ? snapshot.placementActivity.map((c) => ({ label: c.monthLabel, value: c.placementsRecorded }))
    : snapshot.cohorts.map((c) => ({ label: c.monthLabel, value: c.placed }));
  const placementsTotal = monthly.reduce((sum, c) => sum + c.value, 0);

  const programMaxPlaced = Math.max(1, ...snapshot.outcomes.programs.map((p) => p.placed));
  const byProgram: RankDatum[] = snapshot.outcomes.programs
    .filter((p) => p.placed > 0)
    .sort((a, b) => b.placed - a.placed || a.programSlug.localeCompare(b.programSlug))
    .map((p) => ({
      label: programDisplayTitle(p.programSlug),
      value: p.placed,
      pct: Math.round((p.placed / programMaxPlaced) * 100),
      tone: 'info',
    }));

  return {
    kpis,
    placementsByMonth: monthly.length > 0 ? monthly : undefined,
    placementsTotal,
    periodLabel: snapshot.outcomes.period.label,
    byProgram: byProgram.length > 0 ? byProgram : undefined,
  };
}
