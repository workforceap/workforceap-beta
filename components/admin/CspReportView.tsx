import {
  DataTable,
  DesignSurface,
  KpiStrip,
  PageOpener,
  StatusTag,
  type Column,
  type KitTone,
  type KpiItem,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';

/**
 * CSP violation reports — read-only super-admin viewer (WAP-36 phase 2 prep).
 * Dense kit treatment like `/admin/data-retention`; server-rendered, no
 * interactivity. All aggregation happens in `lib/security/cspViolationStore.ts`
 * and lands here as plain, serialisable data (ISO strings, not Dates) so the
 * page can be tested and snapshotted deterministically.
 */
export interface CspReportGroupRow {
  directive: string;
  blockedHost: string;
  count: number;
  documentPaths: string[];
  documentPathCount: number;
  dispositions: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CspReportViewProps {
  total24h: number;
  total7d: number;
  enforced7d: number;
  bucketCount: number;
  groups: CspReportGroupRow[];
  /** ISO timestamp the overview was generated at (UTC). */
  generatedAt: string;
  retentionDays: number;
}

/** Disposition → semantic tone: `enforce` while the header is Report-Only means something is misconfigured. */
const DISPOSITION_TONE: Record<string, KitTone> = {
  report: 'info',
  enforce: 'alert',
};

const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

/** Deterministic UTC rendering (`2026-09-21 14:00 UTC`) — no locale, no hydration drift. */
export function formatUtcMinute(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function Dispositions({ values }: { values: string[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {values.map((value) => (
        <StatusTag key={value} tone={DISPOSITION_TONE[value] ?? 'muted'}>
          {value}
        </StatusTag>
      ))}
    </span>
  );
}

function PathSample({ row }: { row: CspReportGroupRow }) {
  const more = row.documentPathCount - row.documentPaths.length;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
      {row.documentPaths.map((path) => (
        <code key={path} style={{ fontSize: 13 }}>
          {path}
        </code>
      ))}
      {more > 0 ? <span style={{ color: 'var(--wa-muted)' }}>+{more} more</span> : null}
    </span>
  );
}

export function CspReportView({ total24h, total7d, enforced7d, bucketCount, groups, generatedAt, retentionDays }: CspReportViewProps) {
  const kpis: KpiItem[] = [
    { label: 'Reports (24h)', value: total24h.toLocaleString('en-US') },
    { label: 'Reports (7d)', value: total7d.toLocaleString('en-US') },
    { label: 'Sources (7d)', value: groups.length.toLocaleString('en-US'), delta: 'directive + blocked host' },
    {
      label: 'Enforced blocks (7d)',
      value: enforced7d.toLocaleString('en-US'),
      tone: enforced7d > 0 ? 'alert' : undefined,
      delta: enforced7d > 0 ? 'unexpected while Report-Only' : 'expected 0 while Report-Only',
    },
  ];

  const columns: Column<CspReportGroupRow>[] = [
    {
      key: 'directive',
      header: 'Directive',
      stickyLeft: true,
      render: (row) => <code style={{ fontWeight: 700, fontSize: 13 }}>{row.directive}</code>,
    },
    {
      key: 'blockedHost',
      header: 'Blocked host',
      render: (row) => <code style={{ fontSize: 13 }}>{row.blockedHost}</code>,
    },
    {
      key: 'count',
      header: 'Reports',
      align: 'right',
      render: (row) => <span style={{ ...numStyle, fontWeight: 700 }}>{row.count.toLocaleString('en-US')}</span>,
    },
    {
      key: 'paths',
      header: 'Pages (sample)',
      render: (row) => <PathSample row={row} />,
    },
    {
      key: 'disposition',
      header: 'Disposition',
      render: (row) => <Dispositions values={row.dispositions} />,
    },
    {
      key: 'firstSeen',
      header: 'First seen',
      render: (row) => <span style={{ ...numStyle, color: 'var(--wa-muted)', fontSize: 13 }}>{formatUtcMinute(row.firstSeenAt)}</span>,
    },
    {
      key: 'lastSeen',
      header: 'Last seen',
      render: (row) => <span style={{ ...numStyle, color: 'var(--wa-muted)', fontSize: 13 }}>{formatUtcMinute(row.lastSeenAt)}</span>,
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener
        className="wa-mb-5"
        kicker="Security"
        title="CSP violation reports"
        lede="What browsers would have blocked under the nonce policy, aggregated per hour from /api/csp-report"
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <section aria-labelledby="csp-report-status-title" className="wa-mb-5">
        <Card>
          <h2 id="csp-report-status-title" className="wa-text-sm wa-font-bold" style={{ color: 'var(--wa-text)', margin: 0 }}>
            The policy is Report-Only
          </h2>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '6px 0 0' }}>
            Nothing on this page was blocked for a user. <code>middleware.ts</code> sends{' '}
            <code>Content-Security-Policy-Report-Only</code> with the nonce policy; the enforced header is still the
            static one in <code>next.config.ts</code>. The enforce flip and its checklist live in{' '}
            <code>docs/SECURITY-HARDENING.md</code> §13 (&ldquo;Phase 2 — the enforce flip&rdquo;). A source not in the
            enforced allow-list and not <code>inline</code>/<code>eval</code> from our own bundles is a real finding;
            anything else needs a nonce before the flip.
          </p>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '6px 0 0' }}>
            Only the directive, the blocked resource&rsquo;s host (or CSP keyword), the redacted page path and the
            disposition are stored — no query strings, script samples, IPs, user agents or user ids. Buckets older than{' '}
            {retentionDays} days are purged by the daily data-cleanup cron (see Data retention). Generated{' '}
            {formatUtcMinute(generatedAt)} from {bucketCount.toLocaleString('en-US')} hourly bucket
            {bucketCount === 1 ? '' : 's'}.
          </p>
        </Card>
      </section>

      <div>
        <h3 className="wa-text-sm wa-font-bold wa-mb-3" style={{ color: 'var(--wa-text)' }}>
          Sources, last 7 days
        </h3>
        <DataTable<CspReportGroupRow>
          columns={columns}
          rows={groups}
          rowKey={(row) => `${row.directive}|${row.blockedHost}`}
          rowLabel={(row) => `${row.directive} ${row.blockedHost}`}
          minWidth={960}
          mobile="cards"
          cardRender={(row) => (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <code style={{ fontWeight: 700, fontSize: 13 }}>{row.directive}</code>
                <span style={{ ...numStyle, fontWeight: 700 }}>{row.count.toLocaleString('en-US')}</span>
              </div>
              <div style={{ margin: '6px 0 8px' }}>
                <code style={{ fontSize: 13 }}>{row.blockedHost}</code>
              </div>
              <PathSample row={row} />
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 13, color: 'var(--wa-muted)' }}>
                <Dispositions values={row.dispositions} />
                <span style={numStyle}>last {formatUtcMinute(row.lastSeenAt)}</span>
              </div>
            </Card>
          )}
          emptyTitle="No violation reports in the last 7 days"
          emptyDescription="Browsers post to /api/csp-report when a page loads something the Report-Only nonce policy would block. Nothing has been reported yet, or the buckets have aged out."
        />
      </div>
    </DesignSurface>
  );
}
