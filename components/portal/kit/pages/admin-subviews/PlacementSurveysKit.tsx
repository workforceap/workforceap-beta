import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';

/**
 * Placement surveys — 30/90/180-day follow-up tracking (dense).
 * Mockup: workforceap-admin-full.html "placement-surveys" view.
 * Target route: /admin/placement-surveys
 *
 * Server-rendered (no interactivity): all aggregation happens in the page
 * loader and lands here as plain data. Uses DataTable mobile="cards" so the
 * survey table stacks on mobile instead of squishing.
 */
export interface PlacementSurveyRow {
  id: string;
  /** Member full name, or "—" when unavailable. */
  student: string;
  /** Survey wave label, e.g. "90-day". */
  stage: string;
  /** Sent date caption, e.g. "Jun 1". */
  sent: string;
  /** Completion status. */
  status: 'Complete' | 'Sent';
  /** Still-employed answer: "Yes" / "No" / "—" (pending or unknown). */
  stillEmployed: 'Yes' | 'No' | '—';
}

export interface PlacementSurveysKitProps {
  rows: PlacementSurveyRow[];
  /** Total surveys sent (KPI + footer). */
  sent: number;
  /** Surveys completed. */
  completed: number;
  /** Response rate caption, e.g. "84%". */
  responseRate: string;
  /** Still-employed caption among completed surveys, e.g. "92%". */
  stillEmployedRate: string;
}

const STATUS_TONE: Record<PlacementSurveyRow['status'], TokenColor> = {
  Complete: 'green',
  Sent: 'blue',
};

export function PlacementSurveysKit({
  rows,
  sent,
  completed,
  responseRate,
  stillEmployedRate,
}: PlacementSurveysKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Sent', value: sent },
    { label: 'Completed', value: completed },
    { label: 'Response Rate', value: responseRate },
    { label: 'Still Employed', value: stillEmployedRate },
  ];

  const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

  const stillEmployedColor = (v: PlacementSurveyRow['stillEmployed']) =>
    v === 'Yes' ? 'var(--wa-success)' : v === 'No' ? 'var(--wa-accent)' : 'var(--wa-muted)';

  const columns: Column<PlacementSurveyRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.student}</span>,
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.stage}</span>,
    },
    {
      key: 'sent',
      header: 'Sent',
      render: (row) => <span style={{ ...numStyle, color: 'var(--wa-muted)' }}>{row.sent}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Token label={row.status} size="sm" color={STATUS_TONE[row.status]} />,
    },
    {
      key: 'stillEmployed',
      header: 'Still employed',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700, color: stillEmployedColor(row.stillEmployed) }}>
          {row.stillEmployed}
        </span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Placement surveys"
        kicker="Outcomes"
        lede="30/90/180-day follow-up tracking"
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<PlacementSurveyRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={560}
        mobile="cards"
        cardRender={(row) => (
          <div className="wa-kit-card wa-kit-card--sm">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.student}
                </div>
                <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{row.stage}</div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.status} size="sm" color={STATUS_TONE[row.status]} />
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13,
                color: 'var(--wa-muted)',
                margin: '12px 0 0',
              }}
            >
              <span style={numStyle}>
                Sent <b style={{ color: 'var(--wa-text)' }}>{row.sent}</b>
              </span>
              <span>
                Still employed{' '}
                <b style={{ color: stillEmployedColor(row.stillEmployed) }}>{row.stillEmployed}</b>
              </span>
            </div>
          </div>
        )}
        emptyTitle="No surveys sent yet"
        emptyDescription="Placement follow-up surveys will appear here once they're sent."
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {rows.length} of {sent}
      </p>
    </DesignSurface>
  );
}
