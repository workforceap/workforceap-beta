import type { ReactNode } from 'react';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';

/**
 * Invites — bulk member & partner invitations (dense).
 * Mockup: workforceap-admin-full.html "invites" view.
 * Target route: /admin/invites
 *
 * Server-rendered (no interactivity): all counts + rows are aggregated in the
 * page loader and land here as plain data. Uses DataTable mobile="cards" so the
 * wide table stacks on mobile instead of squishing.
 */
export interface InviteRow {
  id: string;
  email: string;
  /** Display label for the invite role (Member, Partner, …). */
  type: string;
  /** Relative-time "sent" caption, e.g. "2d ago". */
  sent: string;
  /** Effective status (pending invites past expiry surface as expired). */
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

export interface InvitesKitProps {
  invites: InviteRow[];
  /** Total invites sent (KPI). */
  sent: number;
  /** Accepted invites (KPI, success). */
  accepted: number;
  /** Pending (not-yet-expired) invites (KPI, gold). */
  pending: number;
  /** Acceptance rate 0–100, integer (KPI, info). */
  rate: number;
  /** Right-aligned header action (e.g. "Send Invites"). */
  action?: ReactNode;
}

const STATUS_COLOR: Record<InviteRow['status'], TokenColor> = {
  pending: 'yellow',
  accepted: 'green',
  expired: 'gray',
  revoked: 'pink',
};

const STATUS_LABEL: Record<InviteRow['status'], string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  expired: 'Expired',
  revoked: 'Revoked',
};

export function InvitesKit({
  invites,
  sent,
  accepted,
  pending,
  rate,
  action,
}: InvitesKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Sent', value: sent },
    { label: 'Accepted', value: accepted, color: 'success' },
    { label: 'Pending', value: pending, color: 'gold' },
    { label: 'Rate', value: `${rate}%`, color: 'info' },
  ];

  const columns: Column<InviteRow>[] = [
    {
      key: 'email',
      header: 'Email',
      render: (row) => (
        <span
          style={{
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
            maxWidth: '100%',
          }}
        >
          {row.email}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)' }}>{row.type}</span>
      ),
    },
    {
      key: 'sent',
      header: 'Sent',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)' }}>{row.sent}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Token label={STATUS_LABEL[row.status]} size="sm" color={STATUS_COLOR[row.status]} />
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Invites"
        kicker="People"
        lede="Bulk member & partner invitations"
        action={action}
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<InviteRow>
        columns={columns}
        rows={invites}
        rowKey={(row) => row.id}
        minWidth={520}
        mobile="cards"
        cardRender={(row) => (
          <Card className="wa-kit-card--sm">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  flex: 1,
                }}
              >
                {row.email}
              </span>
              <span style={{ flexShrink: 0 }}>
                <Token label={STATUS_LABEL[row.status]} size="sm" color={STATUS_COLOR[row.status]} />
              </span>
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
              <span>
                Type <b style={{ color: 'var(--wa-text)' }}>{row.type}</b>
              </span>
              <span>Sent {row.sent}</span>
            </div>
          </Card>
        )}
        emptyTitle="No invitations yet"
        emptyDescription="Send invites to add members, partners, or counselors to the platform."
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {invites.length} of {sent}
      </p>
    </DesignSurface>
  );
}
