import type { CascadeMetrics } from '@/lib/milestoneCascade/metrics';

/**
 * Server component — small stats card row above the inbox list. Numbers
 * come straight from the metrics aggregator; no client interactivity here
 * (refresh by reloading the page).
 *
 * The point of this block is operational visibility, not analytics: a
 * counselor opening the page should see "drafts taking 5min · review
 * median 12h · approval rate 80%" at a glance and know whether the
 * pipeline is healthy.
 */

function formatMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < 1) return '<1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const hrs = min / 60;
  if (hrs < 24) return `${hrs.toFixed(1)} h`;
  const days = hrs / 24;
  return `${days.toFixed(1)} d`;
}

function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        flex: '1 1 9rem',
        minWidth: '9rem',
        padding: '0.75rem 0.9rem',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-container-lowest)',
      }}
    >
      <div
        style={{
          fontSize: '0.8125rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '0.15rem' }}>{value}</div>
      {hint && (
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-on-surface-variant)',
            marginTop: '0.15rem',
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export function InboxStatsBlock({ metrics }: { metrics: CascadeMetrics }) {
  return (
    <section
      aria-label="Inbox statistics"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.6rem',
        marginBottom: '1.25rem',
      }}
    >
      <Stat label="Pending draft" value={String(metrics.totals.pendingDraft)} hint="awaiting LLM" />
      <Stat label="Awaiting review" value={String(metrics.totals.awaitingApproval)} />
      <Stat
        label="Median draft time"
        value={formatMinutes(metrics.medianMinutesToDraft)}
        hint={`last ${metrics.windowDays}d`}
      />
      <Stat
        label="Median review time"
        value={formatMinutes(metrics.medianMinutesToReview)}
        hint={`last ${metrics.windowDays}d`}
      />
      <Stat
        label="Approval rate"
        value={formatRate(metrics.approvalRate)}
        hint={`last ${metrics.windowDays}d`}
      />
      <Stat label="Sent" value={String(metrics.totals.sent)} hint="all-time" />
      <Stat
        label="Dismissed / expired"
        value={String(metrics.totals.dismissed + metrics.totals.expired)}
        hint="all-time"
      />
    </section>
  );
}
