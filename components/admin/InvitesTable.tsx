'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import DataTable from '@/components/portal/ui/DataTable';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { loginCodeFromToken } from '@/lib/invitations/loginCode';

type Invite = {
  id: string;
  email: string;
  role: string;
  status: string;
  personalMessage: string | null;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  invitedBy: { id: string; fullName: string; email: string };
  subgroup: { id: string; name: string } | null;
  partner: { id: string; name: string } | null;
  /** Present for admins; the login code shown below is derived from it. */
  token?: string;
  counselorAffiliation?: string | null;
};

type Props = {
  invites: Invite[];
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  partner: 'Partner',
  member: 'Member',
  counselor: 'Counselor',
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  pending: { bg: 'var(--surface-container)', color: 'var(--color-on-surface)' },
  accepted: { bg: 'var(--surface-container)', color: 'var(--color-green)' },
  expired: { bg: 'var(--surface-container)', color: 'var(--color-on-surface-variant)' },
  revoked: { bg: 'var(--surface-container)', color: 'var(--color-on-surface-variant)' },
};

// Pending invites past their expiresAt date are effectively expired even if the
// row still has status='pending' in the DB. Stat cards already use this rule, so
// the table displays/filters/badges must agree to keep the counts consistent.
function effectiveStatus(inv: { status: string; expiresAt: string }): string {
  if (inv.status === 'pending' && new Date(inv.expiresAt) <= new Date()) return 'expired';
  return inv.status;
}

type SortKey = 'email' | 'role' | 'status' | 'invitedBy' | 'date';
type SortDir = 'asc' | 'desc';

function toTime(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  const d = typeof value === 'string' ? new Date(value) : value;
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

// The Date column shows acceptedAt for accepted invites and createdAt otherwise,
// so sorting must use the same value the user sees.
function displayDate(inv: Invite): string | null {
  return inv.status === 'accepted' && inv.acceptedAt ? inv.acceptedAt : inv.createdAt;
}

// Mirrors the filter-button order so an ascending status sort reads pending → revoked.
const STATUS_RANK: Record<string, number> = { pending: 0, accepted: 1, expired: 2, revoked: 3 };

function compareInvites(a: Invite, b: Invite, key: SortKey): number {
  switch (key) {
    case 'email':
      return a.email.localeCompare(b.email);
    case 'role':
      return (ROLE_LABELS[a.role] ?? a.role).localeCompare(ROLE_LABELS[b.role] ?? b.role);
    case 'status':
      return (STATUS_RANK[effectiveStatus(a)] ?? 99) - (STATUS_RANK[effectiveStatus(b)] ?? 99);
    case 'invitedBy':
      return a.invitedBy.fullName.localeCompare(b.invitedBy.fullName);
    case 'date':
      return toTime(displayDate(a)) - toTime(displayDate(b));
    default:
      return 0;
  }
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        fontWeight: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
      }}
      aria-label={`Sort by ${label}${active ? (dir === 'asc' ? ', ascending' : ', descending') : ''}`}
    >
      {label}
      <span style={{ fontSize: '0.7em', opacity: active ? 1 : 0.3 }}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </button>
  );
}

export default function InvitesTable({ invites }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>('all');
  const [resending, setResending] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string } | null>(null);
  // null = keep the server's order until a column is clicked.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const closeRevokeTarget = () => {
    if (!revoking) setRevokeTarget(null);
  };
  const revokeTrapRef = useFocusTrap(!!revokeTarget, closeRevokeTarget);

  const filtered = invites.filter((i) => filter === 'all' || effectiveStatus(i) === filter);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    // Stable sort with an index tiebreaker so equal keys keep the server order.
    return filtered
      .map((inv, i) => [inv, i] as const)
      .sort(([a, ia], [b, ib]) => {
        const primary = compareInvites(a, b, sortKey) * dir;
        return primary !== 0 ? primary : ia - ib;
      })
      .map(([inv]) => inv);
  }, [filtered, sortKey, sortDir]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Text columns default ascending (A→Z); the Date column defaults to newest first.
      setSortDir(key === 'date' ? 'desc' : 'asc');
    }
  }

  const header = (label: string, key: SortKey) => (
    <SortHeader label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={onSort} />
  );

  const handleResend = async (id: string) => {
    setResending(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/invites/${id}/resend`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to resend');
      router.refresh();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Failed to resend');
    } finally {
      setResending(null);
    }
  };

  const runRevoke = async () => {
    if (!revokeTarget) return;
    const { id } = revokeTarget;
    setRevoking(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/invites/${id}/revoke`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to revoke');
      setRevokeTarget(null);
      router.refresh();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Failed to revoke');
    } finally {
      setRevoking(null);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="admin-responsive-data">
      {feedback && (
        <div className="admin-inline-feedback admin-inline-feedback--error" role="alert">
          <p>{feedback}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFeedback(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['all', 'pending', 'accepted', 'expired', 'revoked'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--outline-variant)',
              background: filter === s ? 'var(--color-accent)' : 'white',
              color: filter === s ? 'white' : 'inherit',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="admin-empty-state">
          <h3>No invitations</h3>
          <p>
            {filter === 'all'
              ? 'Send invites to add admins, partners, students, or counselors to the platform.'
              : `No ${filter} invitations.`}
          </p>
        </div>
      ) : (
        <div className="admin-table-scroll admin-invites-desktop">
          <DataTable
            variant="admin"
            tableClassName="admin-table"
            scrollX={false}
            rows={sorted}
            rowKey={(inv) => inv.id}
            columns={[
              {
                key: 'email',
                header: header('Email', 'email'),
                cell: (inv) => (
                  <>
                    <div style={{ fontWeight: 500 }}>{inv.email}</div>
                    {inv.subgroup && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        Subgroup: {inv.subgroup.name}
                      </div>
                    )}
                    {inv.role === 'counselor' && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        {inv.counselorAffiliation === 'community_ambassador'
                          ? 'Community Ambassador'
                          : inv.counselorAffiliation === 'independent'
                            ? 'Independent advisor'
                            : inv.partner
                              ? `Partner: ${inv.partner.name}`
                              : 'WorkforceAP counselor'}
                      </div>
                    )}
                    {inv.token && effectiveStatus(inv) === 'pending' && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        Login code:{' '}
                        <code style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.08em' }}>
                          {loginCodeFromToken(inv.token)}
                        </code>
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: 'role',
                header: header('Role', 'role'),
                cell: (inv) => ROLE_LABELS[inv.role] ?? inv.role,
              },
              {
                key: 'status',
                header: header('Status', 'status'),
                cell: (inv) => {
                  const displayStatus = effectiveStatus(inv);
                  const statusStyle = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.pending;
                  return (
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8125rem',
                        textTransform: 'capitalize',
                        background: statusStyle.bg,
                        color: statusStyle.color,
                      }}
                    >
                      {displayStatus}
                    </span>
                  );
                },
              },
              {
                key: 'invitedBy',
                header: header('Invited By', 'invitedBy'),
                cell: (inv) => <span style={{ fontSize: '0.9rem' }}>{inv.invitedBy.fullName}</span>,
              },
              {
                key: 'date',
                header: header('Date', 'date'),
                cell: (inv) => (
                  <span style={{ fontSize: '0.9rem' }}>
                    {inv.status === 'accepted' && inv.acceptedAt ? formatDate(inv.acceptedAt) : formatDate(inv.createdAt)}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                cell: (inv) => {
                  const displayStatus = effectiveStatus(inv);
                  return displayStatus === 'pending' ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleResend(inv.id)}
                        disabled={!!resending}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.85rem',
                          color: 'var(--color-accent)',
                          background: 'none',
                          border: 'none',
                          cursor: resending ? 'wait' : 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {resending === inv.id ? 'Resending...' : 'Resend'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevokeTarget({ id: inv.id, email: inv.email })}
                        disabled={!!revoking}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.85rem',
                          color: 'var(--color-on-surface-variant)',
                          background: 'none',
                          border: 'none',
                          cursor: revoking ? 'wait' : 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {revoking === inv.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    </div>
                  ) : null;
                },
              },
            ]}
          />
        </div>
      )}
      <ul className="admin-portal-card-list admin-invites-cards" aria-label="Invitations (mobile layout)">
        {sorted.map((inv) => {
          const displayStatus = effectiveStatus(inv);
          const statusStyle = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.pending;
          return (
            <li key={`card-${inv.id}`} className="admin-portal-card">
              <div className="admin-portal-card__header">
                <strong>{inv.email}</strong>
                <span
                  className="admin-portal-card__badge"
                  style={{ background: statusStyle.bg, color: statusStyle.color, textTransform: 'capitalize' }}
                >
                  {displayStatus}
                </span>
              </div>
              {inv.subgroup && <p className="admin-portal-card__meta">Subgroup: {inv.subgroup.name}</p>}
              {inv.role === 'counselor' && (
                <p className="admin-portal-card__meta">
                  {inv.partner ? `Partner: ${inv.partner.name}` : 'WorkforceAP counselor'}
                </p>
              )}
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Role</span> {ROLE_LABELS[inv.role] ?? inv.role}
              </p>
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Invited by</span> {inv.invitedBy.fullName}
              </p>
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Date</span>{' '}
                {inv.status === 'accepted' && inv.acceptedAt
                  ? formatDate(inv.acceptedAt)
                  : formatDate(inv.createdAt)}
              </p>
              {displayStatus === 'pending' && (
                <div className="admin-portal-card__actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => handleResend(inv.id)} disabled={!!resending}>
                    {resending === inv.id ? 'Resending...' : 'Resend'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRevokeTarget({ id: inv.id, email: inv.email })}
                    disabled={!!revoking}
                  >
                    Revoke
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {revokeTarget && (
        <div className="admin-confirm-modal-overlay" role="presentation" onClick={closeRevokeTarget} tabIndex={-1}>
          <div
            ref={revokeTrapRef as React.RefObject<HTMLDivElement>}
            className="admin-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-invite-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="revoke-invite-title">Revoke invitation?</h3>
            <p>This will invalidate the invite sent to {revokeTarget.email}.</p>
            <div className="admin-confirm-modal__actions">
              <button type="button" className="btn btn-outline" disabled={!!revoking} onClick={closeRevokeTarget}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={!!revoking} onClick={() => void runRevoke()}>
                {revoking ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
