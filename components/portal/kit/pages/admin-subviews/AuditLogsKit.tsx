'use client';

import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  type KpiItem,
  type Column,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';

/**
 * Member activity logs — recorded MemberEvent rows rendered as a dense table.
 * Mockup: workforceap-admin-full.html "audit" view.
 * Target route: /admin/audit-logs
 *
 * This view is separate from the security audit records; it does not establish
 * the privileged actor or completeness/immutability of a security audit trail.
 * Columns: When · Account · Event · Target · Reported IP.
 *  - When   → relative/short timestamp (e.g. "9:41 AM", "Yesterday").
 *  - Account → related user, which may be the affected member rather than the actor.
 *  - Event  → eventName, shown as an Astryx Token (blue).
 *  - Target → entityType / entityId (or sourcePage fallback).
 *  - Reported IP → optional, unverified event metadata; "—" means unavailable.
 *
 * Wide table collapses to stacked cards on mobile via DataTable mobile="cards".
 */

export interface AuditRow {
  id: string;
  /** Pre-formatted "when" label, e.g. "9:41 AM" or "Yesterday". */
  when: string;
  /** Related account display name; not necessarily the actor. */
  actor: string;
  /** Related account email (mobile card sub-line). */
  actorEmail: string;
  /** Human-readable action / event name. */
  action: string;
  /** What the action touched. */
  target: string;
  /** Event-reported IP (IPv4 masked), or "—" when unavailable. */
  ip: string;
}

export interface AuditLogsKitProps {
  rows?: AuditRow[];
  /** Events recorded today. */
  eventsToday?: number;
  /** Events recorded over the last 7 days. */
  eventsThisWeek?: number;
  /** Distinct related accounts in the active window. */
  distinctActors?: number;
}

const DEFAULT_ROWS: AuditRow[] = [
  {
    id: 'a1',
    when: '9:41 AM',
    actor: 'Dad (Owner)',
    actorEmail: 'owner@workforceap.org',
    action: 'Confirmed placement',
    target: 'Jasmine Davis',
    ip: '73.x.x.12',
  },
  {
    id: 'a2',
    when: '9:38 AM',
    actor: 'S. Chen',
    actorEmail: 'schen@workforceap.org',
    action: 'Approved certification',
    target: 'Mike Brown',
    ip: '73.x.x.44',
  },
  {
    id: 'a3',
    when: '9:30 AM',
    actor: 'System',
    actorEmail: '—',
    action: 'Ran B4B sync',
    target: '812 learners',
    ip: '—',
  },
  {
    id: 'a4',
    when: 'Yesterday',
    actor: 'A. Reyes',
    actorEmail: 'areyes@workforceap.org',
    action: 'Exported WIOA report',
    target: 'Q2 compliance',
    ip: '73.x.x.91',
  },
];

export function AuditLogsKit({
  rows = DEFAULT_ROWS,
  eventsToday = 0,
  eventsThisWeek = 0,
  distinctActors = 0,
}: AuditLogsKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Events today', value: eventsToday.toLocaleString() },
    { label: 'This week', value: eventsThisWeek.toLocaleString() },
    { label: 'Distinct accounts', value: distinctActors.toLocaleString() },
  ];

  const columns: Column<AuditRow>[] = [
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <span style={{ whiteSpace: 'nowrap', color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {row.when}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Account',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.actor}</span>,
    },
    {
      key: 'action',
      header: 'Event',
      render: (row) => <Token label={row.action} size="sm" color="blue" />,
    },
    {
      key: 'target',
      header: 'Target',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.target}</span>,
    },
    {
      key: 'ip',
      header: 'Reported IP',
      align: 'right',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--wa-muted)' }}>{row.ip}</span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Member activity logs"
        kicker="Activity"
        lede="Recorded member events; security audit records are maintained separately."
      />

      <p className="wa-mb-5" style={{ color: 'var(--wa-muted)' }}>
        Reported IP is optional, unverified event data; — means unavailable.
      </p>

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<AuditRow>
        columns={columns}
        rows={rows}
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
                  {row.actor}
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
                  {row.actorEmail}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.action} size="sm" color="blue" />
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
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.target}
              </span>
              <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {row.when} · Reported IP: {row.ip}
              </span>
            </div>
          </Card>
        )}
        emptyTitle="No member activity recorded"
        emptyDescription="No recorded member events are available in this view."
      />
    </DesignSurface>
  );
}
