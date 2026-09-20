import Link from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { KitEmptyState, KpiStrip, RankBars } from '@/components/portal/kit';
import type { EnrollmentOutcomesPanelData } from '@/lib/admin/analyticsTabs';

/**
 * "Enrollment and outcomes" tab of /admin/analytics: the numbers the
 * `/admin/metrics` page prints (members, weekly active, placements,
 * certificates, AI tool runs, enrollment by program, Career OS loop) on kit
 * tiles and bars. Pure read view, server-rendered inside the analytics Tabs.
 */
export function EnrollmentOutcomesPanel({ data, chartsHref = '/admin/metrics?ui=legacy' }: { data: EnrollmentOutcomesPanelData; chartsHref?: string }) {
  return (
    <>
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

      <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 20 }}>
        Daily activity and placement charts: <PanelLink href={chartsHref}>Open full charts</PanelLink>
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
