'use client';

import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  DataTable,
  type Column,
} from '@/components/portal/kit';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

/**
 * Assessments — the admin assessment catalog rendered as a dense table.
 * Mockup: workforceap-admin-full.html "assessments" view.
 * Target route: /admin/assessments
 *
 * Columns: Assessment · Type · Completions · Avg Score · Status.
 * Status is an Astryx Token (Live=green). Wide table collapses to stacked
 * cards on mobile via DataTable mobile="cards".
 *
 * NOTE on data: the platform tracks a single combined skills + readiness
 * assessment per member (User.assessmentCompleted / assessmentScorePct), not a
 * multi-assessment catalog. The page therefore feeds REAL completion + average
 * figures for the one assessment that exists; the additional mockup rows are
 * forward-looking and are not fabricated here.
 */

export type AssessmentDisplayStatus = 'Live' | 'Draft' | 'Retired';

export interface AssessmentRow {
  id: string;
  /** Assessment name. */
  assessment: string;
  /** Category, e.g. "Knowledge" / "Soft skills" / "Baseline". */
  type: string;
  /** Number of members who completed it. */
  completions: number;
  /**
   * Pre-formatted average score, e.g. "82%" or "—" when no completions yet.
   */
  avgScore: string;
  status: AssessmentDisplayStatus;
}

export interface AssessmentsKitProps {
  assessments?: AssessmentRow[];
  /** Total completions across assessments (for the subtitle). */
  totalCompletions?: number;
}

const DEFAULT_ASSESSMENTS: AssessmentRow[] = [
  {
    id: 'cloud-fundamentals',
    assessment: 'Cloud Fundamentals Quiz',
    type: 'Knowledge',
    completions: 288,
    avgScore: '82%',
    status: 'Live',
  },
  {
    id: 'workforce-readiness',
    assessment: 'Workforce Readiness',
    type: 'Soft skills',
    completions: 504,
    avgScore: '76%',
    status: 'Live',
  },
  {
    id: 'typing-basics',
    assessment: 'Typing & Computer Basics',
    type: 'Baseline',
    completions: 611,
    avgScore: '—',
    status: 'Live',
  },
];

const STATUS_TOKEN_COLOR: Record<AssessmentDisplayStatus, TokenColor> = {
  Live: 'green',
  Draft: 'gray',
  Retired: 'gray',
};

export function AssessmentsKit({
  assessments = DEFAULT_ASSESSMENTS,
  totalCompletions,
}: AssessmentsKitProps) {
  const completionsSum =
    totalCompletions ?? assessments.reduce((sum, a) => sum + a.completions, 0);
  const subtitle = `Skills + readiness assessments · ${completionsSum.toLocaleString()} ${
    completionsSum === 1 ? 'completion' : 'completions'
  }`;

  const columns: Column<AssessmentRow>[] = [
    {
      key: 'assessment',
      header: 'Assessment',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.assessment}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.type}</span>,
    },
    {
      key: 'completions',
      header: 'Completions',
      align: 'right',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
          {row.completions.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'avgScore',
      header: 'Avg Score',
      align: 'right',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {row.avgScore}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />,
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Assessments"
        kicker="Members"
        lede={subtitle}
        action={
          <KitLinkButton href="/admin/assessments?ui=legacy" label="Results & export" variant="secondary" size="sm" />
        }
      />

      <DataTable<AssessmentRow>
        columns={columns}
        rows={assessments}
        rowKey={(row) => row.id}
        minWidth={720}
        mobile="cards"
        cardRender={(row) => (
          <Card>
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
                  {row.assessment}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.type}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />
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
                marginTop: 12,
              }}
            >
              <span style={{ whiteSpace: 'nowrap' }}>
                <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--wa-text)' }}>
                  {row.completions.toLocaleString()}
                </b>{' '}
                completions
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>
                avg{' '}
                <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--wa-text)' }}>
                  {row.avgScore}
                </b>
              </span>
            </div>
          </Card>
        )}
        emptyTitle="No assessments yet"
        emptyDescription="Assessment completions will appear here once members finish the skills + readiness quiz."
      />
    </DesignSurface>
  );
}
