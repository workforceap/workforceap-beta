import Link from 'next/link';
import { FileDown } from 'lucide-react';
import { getBoardSnapshot, type BoardOutcomesPeriod } from '@/lib/admin/boardOutcomes';
import { buildOutcomesKitData } from '@/lib/admin/reportingOutcomes';
import {
  REPORTING_PERIODS,
  REPORTING_PERIOD_LABELS,
  REPORTING_PERIOD_PARAM,
  parseReportingPeriod,
  reportingTabHref,
} from '@/lib/admin/reportingHub';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScope';
import { BoardOutcomesKit } from '@/components/portal/kit/pages/admin-subviews/BoardOutcomesKit';

/**
 * Outcomes tab: ONE projection of `getBoardSnapshot()` for both the former
 * `/admin/outcomes` (placement outcomes) and `/admin/board` (board outcomes)
 * readers. The period switcher, the print-ready board report and the
 * methodology page ride along as the header action.
 *
 * Tenant scope follows `/admin/board`, `/admin/analytics` and the weekly
 * recap: org admins see their org, super-admins the platform roll-up.
 */
export async function ReportingOutcomesSection({
  scope,
  params,
}: {
  scope: AdminPageTenantOk;
  params: Record<string, string | string[] | undefined>;
}) {
  const period = parseReportingPeriod(params[REPORTING_PERIOD_PARAM]);
  const snapshot = await getBoardSnapshot(period, scope.superAdmin ? undefined : scope.orgId);
  const data = buildOutcomesKitData(snapshot);

  return (
    <BoardOutcomesKit
      embedded
      kpis={data.kpis}
      placementsByMonth={data.placementsByMonth}
      placementsTotal={data.placementsTotal}
      periodLabel={data.periodLabel}
      byProgram={data.byProgram}
      exportsHref={reportingTabHref('exports')}
      headerAction={
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }} data-testid="reporting-outcomes-actions">
          <nav aria-label="Outcomes period" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {REPORTING_PERIODS.map((value) => (
              <PeriodLink key={value} period={value} current={period} />
            ))}
          </nav>
          <Link href={`/admin/board/print?period=${period}`} className="btn btn-outline btn-small">
            <FileDown size={14} aria-hidden style={{ marginRight: 6 }} />
            Board report (print)
          </Link>
          <Link
            href="/admin/outcomes/methodology"
            className="wa-kit-focus"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}
          >
            Methodology →
          </Link>
        </div>
      }
    />
  );
}

function PeriodLink({ period, current }: { period: BoardOutcomesPeriod; current: BoardOutcomesPeriod }) {
  const active = period === current;
  return (
    <Link
      href={reportingTabHref('outcomes', { [REPORTING_PERIOD_PARAM]: period })}
      className={active ? 'btn btn-primary btn-small' : 'btn btn-muted btn-small'}
      aria-current={active ? 'page' : undefined}
    >
      {REPORTING_PERIOD_LABELS[period]}
    </Link>
  );
}
