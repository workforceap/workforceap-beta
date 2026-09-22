import Link from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { KitEmptyState, KpiStrip, RankBars } from '@/components/portal/kit';
import type { EnrollmentOutcomesPanelData } from '@/lib/admin/analyticsTabs';

/**
 * "Enrollment and outcomes" — part of the Overview section of
 * `/admin/reporting` (`app/admin/reporting/sections/OverviewSection.tsx`).
 *
 * The numbers `/admin/metrics` used to print (members, weekly active,
 * placements, certificates, AI tool runs, enrollment by program, Career OS
 * loop) on kit tiles and bars. Both `/admin/analytics` and `/admin/metrics`
 * now redirect to the reporting hub unless `?ui=legacy` is set, which is why
 * `chartsHref` still points at the legacy charts view. Pure read view,
 * server-rendered inside the hub's sections.
 */
export function EnrollmentOutcomesPanel({ data, chartsHref = '/admin/metrics?ui=legacy' }: { data: EnrollmentOutcomesPanelData; chartsHref?: string }) {
  return (
    <>
      {data.degradedNote ? (
        <p
          role="status"
          data-metrics-degraded="1"
          className="wa-kit-tone--warn"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--wa-kit-tone)',
            background: 'var(--wa-kit-tone-soft)',
            border: '1px solid var(--wa-kit-tone)',
            borderRadius: 'var(--wa-radius-sm)',
            padding: '8px 12px',
            margin: '0 0 14px',
          }}
        >
          {data.degradedNote}
        </p>
      ) : null}

      <KpiStrip cols={6} items={data.kpis} />

      <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-2 wa-gap-5 wa-mt-6">
        <Card style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 2 }}>Enrollment by program</h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 0, marginBottom: 16 }}>
            {data.enrolledTotal > 0
              ? `${data.enrolledTotal.toLocaleString('en-US')} enrolled · each bar is that program's share of enrolled members`
              : 'share of enrolled members'}
          </p>
          {data.enrollmentByProgram.length > 0 ? (
            <RankBars data={data.enrollmentByProgram} />
          ) : (
            <KitEmptyState
              title="No members are enrolled in a program yet"
              description="Programs appear here once a member is enrolled. New applicants show up under Students until then."
              action={<PanelLink href="/admin/students">Open students</PanelLink>}
            />
          )}
        </Card>

        <Card style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 2 }}>Career OS completion loop</h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 0, marginBottom: 16 }}>
            learning completions → follow-up actions → actions members finished
          </p>
          <KpiStrip cols={5} items={data.careerOs} />
        </Card>
      </div>

      <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 20, marginBottom: 2 }}>
        Daily activity and placement charts: <PanelLink href={chartsHref}>Open full charts</PanelLink>
      </p>
      <p data-charts-note="1" style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0 }}>
        {data.chartsNote}
      </p>
    </>
  );
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="wa-kit-focus" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}>
      {children} →
    </Link>
  );
}
