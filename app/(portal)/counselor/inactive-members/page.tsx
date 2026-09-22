'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { PartyPopper } from 'lucide-react';
import PageHeader from '@/components/portal/PageHeader';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  DesignSurface,
  KitEmptyState,
  SectionHeader,
  DataTable,
  StatusTag,
  type Column,
  type KitTone,
} from '@/components/portal/kit';

interface InactiveMember {
  id: string;
  email: string;
  joinedAt: string;
  lastActiveAt: string | null;
  daysInactive: number;
  phone: string | null;
}

const THRESHOLDS = [7, 14, 30] as const;

function PortalListSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        textAlign: 'center',
        padding: '2.5rem 1rem',
        color: 'var(--wa-muted)',
        fontSize: '0.9rem',
      }}
    >
      {label}
    </div>
  );
}

export default function InactiveMembersPage() {
  const t = useTranslations('counselor');
  const tEmpty = useTranslations('empty');
  const [days, setDays] = useState(7);
  const [members, setMembers] = useState<InactiveMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Per-action error is intentionally separate from the page-load `error`
  // so a single outreach failure doesn't hide the whole member list.
  const [actionError, setActionError] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [reminderSent, setReminderSent] = useState<Set<string>>(new Set());
  const activeLoadId = useRef(0);

  const loadMembers = useCallback(async () => {
    const loadId = activeLoadId.current + 1;
    activeLoadId.current = loadId;
    const isCurrentLoad = () => activeLoadId.current === loadId;

    setLoading(true);
    setError(false);
    try {
      const res = await fetchWithTimeout(`/api/counselor/inactive-members?days=${days}`, {}, 15000);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      if (!isCurrentLoad()) return;
      setMembers(data.members || []);
    } catch {
      if (isCurrentLoad()) {
        setError(true);
      }
    } finally {
      if (isCurrentLoad()) {
        setLoading(false);
      }
    }
  }, [days]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const logOutreach = async (member: InactiveMember) => {
    setSendingReminder(member.id);
    setActionError(null);
    try {
      const res = await fetchWithTimeout('/api/counselor/remind-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id, daysInactive: member.daysInactive }),
      }, 15000);
      if (!res.ok) throw new Error('Failed to log outreach');
      setReminderSent((prev) => new Set(prev).add(member.id));
    } catch {
      setActionError(t('couldNotLogOutreach'));
    } finally {
      setSendingReminder(null);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return t('never');
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Risk tiers match the CRITICAL/HIGH/MEDIUM palette used elsewhere in the
  // portal (>=30 days = critical, >=14 = warning, else the mildest at-risk
  // tier). Mapped onto kit StatusTag tones: 'alert' (brand crimson, "needs a
  // look") for critical, 'warn' (gold) for the mid tier, 'info' (blue) for
  // the mildest tier — 'danger' (true red) is reserved for destructive/failed
  // states, not a stale-member tier.
  const severity = (daysInactive: number): { tone: KitTone; label: string } => {
    if (daysInactive >= 30) return { tone: 'alert', label: t('critical') };
    if (daysInactive >= 14) return { tone: 'warn', label: t('warning') };
    return { tone: 'info', label: t('atRiskShort') };
  };

  const columns: Column<InactiveMember>[] = [
    {
      key: 'member',
      header: t('member'),
      render: (m) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.email}</div>
          {m.phone ? (
            <div style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', marginTop: '0.15rem' }}>{m.phone}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'days',
      header: t('daysInactive'),
      render: (m) => {
        const sev = severity(m.daysInactive);
        return (
          <StatusTag tone={sev.tone}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.daysInactive}</span> {t('days')}
          </StatusTag>
        );
      },
    },
    {
      key: 'last',
      header: t('lastActive'),
      render: (m) => (
        <span style={{ color: 'var(--wa-muted)', fontSize: '0.85rem' }}>{formatDate(m.lastActiveAt)}</span>
      ),
    },
    {
      key: 'joined',
      header: t('joined'),
      render: (m) => (
        <span style={{ color: 'var(--wa-muted)', fontSize: '0.85rem' }}>{formatDate(m.joinedAt)}</span>
      ),
    },
    {
      key: 'action',
      header: t('action'),
      align: 'right',
      render: (m) => {
        const sent = reminderSent.has(m.id);
        const sending = sendingReminder === m.id;
        return (
          <button
            type="button"
            onClick={() => logOutreach(m)}
            disabled={sending || sent}
            title={t('logOutreachTooltip')}
            aria-label={sent ? t('outreachLoggedFor', { email: m.email }) : t('logOutreachFor', { email: m.email })}
            className="wa-kit-focus"
            style={{
              minWidth: '2.75rem',
              minHeight: '2.75rem',
              padding: '0.5rem 1rem',
              borderRadius: 999,
              border: 'none',
              background: sent ? 'var(--wa-success)' : 'var(--wa-accent)',
              color: 'var(--wa-on-accent)',
              fontWeight: 700,
              fontSize: '0.8125rem',
              cursor: sending || sent ? 'not-allowed' : 'pointer',
              opacity: sending ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {sending ? t('saving') : sent ? t('logged') : t('logOutreach')}
          </button>
        );
      },
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageHeader
        title={t('inactiveMembersTitle')}
        subtitle={t('inactiveMembersSubtitle')}
        breadcrumbs={[{ label: t('counselorPortalBreadcrumb'), href: '/counselor' }, { label: t('inactiveMembersTitle') }]}
      />

      <div role="tablist" aria-label={t('minDaysInactive')} className="wa-flex wa-flex-wrap wa-items-center wa-gap-2 wa-mb-5">
        {THRESHOLDS.map((d) => {
          const on = days === d;
          return (
            <button
              type="button"
              key={d}
              role="tab"
              aria-selected={on}
              id={`inactive-tab-${d}`}
              onClick={() => setDays(d)}
              className="wa-kit-focus"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '2.75rem',
                minHeight: '2.75rem',
                padding: '0.5rem 1rem',
                borderRadius: 999,
                border: '1px solid',
                borderColor: on ? 'transparent' : 'var(--wa-border)',
                background: on ? 'var(--wa-accent)' : 'var(--wa-surface)',
                color: on ? 'var(--wa-on-accent)' : 'var(--wa-text)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {t('daysThreshold', { days: d })}
            </button>
          );
        })}
      </div>

      {loading ? <PortalListSkeleton label={t('loadingMemberList')} /> : null}

      {!loading && error ? (
        <KitEmptyState
          framed
          kind="unavailable"
          tone="danger"
          data-testid="inactive-members-load-failed"
          title={tEmpty('counselor.inactiveUnavailable.title')}
          description={tEmpty('counselor.inactiveUnavailable.body')}
          primaryAction={{ label: tEmpty('counselor.inactiveUnavailable.action'), onClick: () => void loadMembers() }}
        />
      ) : null}

      {actionError ? (
        <div
          role="alert"
          style={{
            color: 'var(--wa-danger)',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            background: 'color-mix(in srgb, var(--wa-danger) 8%, transparent)',
            borderRadius: 'var(--wa-radius-sm)',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          {actionError}
        </div>
      ) : null}

      {!loading && !error && members.length === 0 ? (
        // Zero inactive members at this threshold is the goal: `clear` (ok).
        <KitEmptyState
          framed
          kind="clear"
          data-testid="inactive-members-clear"
          title={tEmpty('counselor.inactiveClear.title')}
          description={tEmpty('counselor.inactiveClear.body', { days })}
          icon={<PartyPopper size={13} aria-hidden="true" />}
          primaryAction={{ label: tEmpty('counselor.inactiveClear.action'), href: '/counselor/students' }}
        />
      ) : null}

      {!loading && !error && members.length > 0 ? (
        <>
          <SectionHeader
            title={t('needsAttention')}
            goal={t('membersThreshold', { count: members.length, days })}
            action={
              <span style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>
                Updated {new Date().toLocaleTimeString()}
              </span>
            }
          />
          <DataTable<InactiveMember>
            columns={columns}
            rows={members}
            rowKey={(m) => m.id}
            minWidth={640}
            mobile="cards"
            cardRender={(m) => {
              const sev = severity(m.daysInactive);
              const sent = reminderSent.has(m.id);
              const sending = sendingReminder === m.id;
              return (
                <div className="wa-kit-card wa-kit-card--sm">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.email}</div>
                      {m.phone ? (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', marginTop: '0.15rem' }}>{m.phone}</div>
                      ) : null}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <StatusTag tone={sev.tone}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.daysInactive}</span> {t('days')}
                      </StatusTag>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 13,
                      color: 'var(--wa-muted)',
                      margin: '12px 0',
                    }}
                  >
                    <span>{t('lastActive')}: {formatDate(m.lastActiveAt)}</span>
                    <span>{t('joined')}: {formatDate(m.joinedAt)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => logOutreach(m)}
                    disabled={sending || sent}
                    title={t('logOutreachTooltip')}
                    aria-label={sent ? t('outreachLoggedFor', { email: m.email }) : t('logOutreachFor', { email: m.email })}
                    className="wa-kit-focus"
                    style={{
                      width: '100%',
                      minHeight: '2.75rem',
                      padding: '0.5rem 1rem',
                      borderRadius: 999,
                      border: 'none',
                      background: sent ? 'var(--wa-success)' : 'var(--wa-accent)',
                      color: 'var(--wa-on-accent)',
                      fontWeight: 700,
                      fontSize: '0.8125rem',
                      cursor: sending || sent ? 'not-allowed' : 'pointer',
                      opacity: sending ? 0.7 : 1,
                    }}
                  >
                    {sending ? t('saving') : sent ? t('logged') : t('logOutreach')}
                  </button>
                </div>
              );
            }}
            empty={{ kind: 'clear', title: tEmpty('counselor.inactiveClear.title'), description: tEmpty('counselor.inactiveClear.body', { days }) }}
          />
        </>
      ) : null}
    </DesignSurface>
  );
}
