import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  Avatar,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';
import Link from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { FEEDBACK_TYPES, type FeedbackFilters } from '@/lib/admin/feedbackFilters';
import { Token, type TokenColor } from '@astryxdesign/core/Token';

/**
 * Member feedback — submissions rendered as a dense read table.
 * No mockup; consistent dense kit treatment (mirrors CounselorsRosterKit /
 * JobsBoardKit). Target route: /admin/feedback
 *
 * Server-rendered: the page loader does all aggregation and hands plain rows in.
 * Wide table collapses to stacked cards on mobile via DataTable mobile="cards".
 *
 * Feedback has no workflow "status" field — submissions are rated 1–5. We derive
 * a sentiment status from the rating (Positive ≥4 / Neutral =3 / Critical ≤2) so
 * the Status column carries real, meaningful information.
 */

export type FeedbackSentiment = 'Positive' | 'Neutral' | 'Critical';

export interface FeedbackRow {
  id: string;
  memberName: string;
  memberEmail: string;
  initials: string;
  /** Short summary of the comment, or a placeholder when none was left. */
  summary: string;
  /** Feedback category, e.g. "training" / "counselor" / "platform". */
  type: string;
  rating: number;
  sentiment: FeedbackSentiment;
  /** Pre-formatted submitted date, e.g. "Jun 12". */
  submitted: string;
}

export interface FeedbackKitProps {
  feedback: FeedbackRow[];
  /** Total feedback submissions in scope. */
  total: number;
  /** Submissions in the last 7 days (KPI "New"). */
  recent: number;
  /** Submissions rated 1–2 stars (KPI "Critical"). */
  critical: number;
  /** Avg rating caption, e.g. "4.3" or "—". */
  avgRating: string;
  /**
   * Filters + paging for the table (WAP-193 slice 2; they used to exist only
   * at ?ui=legacy). A plain GET form, so it works without client JS. The KPIs
   * above stay whole-scope; the table shows `matching` rows.
   */
  filters?: {
    values: FeedbackFilters;
    /** Rows matching the filters (whole scope when none are set). */
    matching: number;
    pageSize: number;
    prevHref: string | null;
    nextHref: string | null;
  };
}

const fieldLabel = { fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4 } as const;
const fieldControl = { minHeight: 44, width: '100%' } as const;

function FeedbackFilterBar({ filters }: { filters: NonNullable<FeedbackKitProps['filters']> }) {
  const { values, matching, pageSize, prevHref, nextHref } = filters;
  const firstRow = matching === 0 ? 0 : (values.page - 1) * pageSize + 1;
  const lastRow = Math.min(values.page * pageSize, matching);
  return (
    <div className="wa-mb-5" style={{ display: 'grid', gap: 12 }}>
      <form method="get" action="/admin/feedback" aria-label="Filter feedback"
        style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end' }}>
        <label>
          <span style={fieldLabel}>Type</span>
          <select name="type" defaultValue={values.type ?? ''} className="wa-kit-focus" style={fieldControl}>
            <option value="">All types</option>
            {FEEDBACK_TYPES.map((type) => (
              <option key={type} value={type}>{titleCase(type)}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={fieldLabel}>Rating</span>
          <select name="rating" defaultValue={values.rating ? String(values.rating) : ''} className="wa-kit-focus" style={fieldControl}>
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>{rating === 1 ? '1 star' : `${rating} stars`}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={fieldLabel}>From</span>
          <input type="date" name="from" defaultValue={values.from ?? ''} className="wa-kit-focus" style={fieldControl} />
        </label>
        <label>
          <span style={fieldLabel}>To</span>
          <input type="date" name="to" defaultValue={values.to ?? ''} className="wa-kit-focus" style={fieldControl} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="wa-kit-cta wa-kit-focus">Apply</button>
          <Link href="/admin/feedback" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">Clear</Link>
        </div>
      </form>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--wa-muted)' }}>
        <span role="status">
          {matching === 0 ? 'No feedback matches these filters.' : `Showing ${firstRow}–${lastRow} of ${matching}`}
        </span>
        <nav aria-label="Feedback pages" style={{ display: 'flex', gap: 8 }}>
          {prevHref ? <Link href={prevHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">Previous</Link> : null}
          {nextHref ? <Link href={nextHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">Next</Link> : null}
        </nav>
      </div>
    </div>
  );
}

const SENTIMENT_COLOR: Record<FeedbackSentiment, TokenColor> = {
  Positive: 'green',
  Neutral: 'yellow',
  Critical: 'pink',
};

const TYPE_COLOR: Record<string, TokenColor> = {
  training: 'blue',
  counselor: 'blue',
  platform: 'gray',
  program: 'blue',
  general: 'gray',
};

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function FeedbackKit({
  feedback,
  total,
  recent,
  critical,
  avgRating,
  filters,
}: FeedbackKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Total', value: total },
    { label: 'New (7d)', value: recent },
    { label: 'Critical', value: critical, tone: critical > 0 ? 'alert' : undefined },
    { label: 'Avg Rating', value: avgRating },
  ];

  const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

  const MemberCell = ({ row }: { row: FeedbackRow }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Avatar initials={row.initials} size={32} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.memberName}
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
          {row.memberEmail}
        </div>
      </div>
    </div>
  );

  const columns: Column<FeedbackRow>[] = [
    { key: 'member', header: 'From', render: (row) => <MemberCell row={row} /> },
    {
      key: 'summary',
      header: 'Feedback',
      render: (row) => (
        <span
          style={{
            display: 'block',
            maxWidth: 360,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--wa-text)',
          }}
        >
          {row.summary}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Token label={titleCase(row.type)} size="sm" color={TYPE_COLOR[row.type] ?? 'gray'} />
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      render: (row) => (
        <span style={{ ...numStyle, fontWeight: 700 }}>{row.rating}/5</span>
      ),
    },
    {
      key: 'sentiment',
      header: 'Status',
      render: (row) => (
        <Token label={row.sentiment} size="sm" color={SENTIMENT_COLOR[row.sentiment]} />
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      align: 'right',
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-muted)' }}>{row.submitted}</span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Feedback"
        kicker="Members"
        lede="Member ratings & comments on training, counselors, and the platform"
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      {filters ? <FeedbackFilterBar filters={filters} /> : null}

      <DataTable<FeedbackRow>
        columns={columns}
        rows={feedback}
        rowKey={(row) => row.id}
        minWidth={820}
        mobile="cards"
        cardRender={(row) => (
          <Card padding={3}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <MemberCell row={row} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.sentiment} size="sm" color={SENTIMENT_COLOR[row.sentiment]} />
              </div>
            </div>
            <p
              style={{
                fontSize: 13,
                color: 'var(--wa-text)',
                margin: '10px 0 0',
                lineHeight: 1.5,
              }}
            >
              {row.summary}
            </p>
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
              <span>
                <Token label={titleCase(row.type)} size="sm" color={TYPE_COLOR[row.type] ?? 'gray'} />
              </span>
              <span style={numStyle}>
                <b style={{ color: 'var(--wa-text)' }}>{row.rating}/5</b> · {row.submitted}
              </span>
            </div>
          </Card>
        )}
        emptyTitle="No feedback yet"
        emptyDescription="Member feedback on training, counselors, and the platform will appear here."
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {feedback.length} of {total}
      </p>
    </DesignSurface>
  );
}
