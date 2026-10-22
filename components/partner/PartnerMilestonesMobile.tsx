'use client';

import { useCallback, useEffect, useState } from 'react';
import PortalRecordLink from '@/components/portal/PortalRecordLink';
import { ChevronDown } from 'lucide-react';
import { StatusTag, type KitTone } from '@/components/portal/kit';
import PartnerEmptyState from '@/components/partner/PartnerEmptyState';
import styles from './PartnerMilestonesMobile.module.css';

type Milestone = {
  id: string;
  kind: string;
  label: string;
  memberId: string;
  memberName: string;
  at: string;
};

const KIND_TONE: Record<string, KitTone> = {
  certification: 'info',
  placement: 'ok',
  placement_pending: 'warn',
  event: 'muted',
};

const KIND_LABEL: Record<string, string> = {
  certification: 'Certification',
  placement: 'Placement',
  placement_pending: 'Pending verification',
  event: 'Activity',
};

export default function PartnerMilestonesMobile({ initialMilestones }: { initialMilestones?: Milestone[] } = {}) {
  const [milestones, setMilestones] = useState<Milestone[] | null>(initialMilestones ?? null);
  const [error, setError] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/partner/milestones', { credentials: 'include' });
      if (!r.ok) { setError('Could not load milestones'); return; }
      const data = (await r.json()) as { milestones: Milestone[] };
      setMilestones(data.milestones);
    } catch {
      setError('Could not load milestones');
    }
  }, []);

  useEffect(() => {
    if (initialMilestones !== undefined) setMilestones(initialMilestones);
    else void load();
  }, [load, initialMilestones]);

  if (error) return (
    <div style={{ padding: '0 1.5rem' }}>
      <PartnerEmptyState variant="milestonesUnavailable" framed onPrimary={() => void load()} />
    </div>
  );

  if (!milestones) return (
    <div style={{ padding: '1.5rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--wa-muted)', fontSize: '0.875rem' }}>Loading milestones…</p>
    </div>
  );

  // Only self-reported placements await verification. Recorded certifications
  // and verified placements are completed outcomes.
  const pending = milestones.filter((m) => m.kind === 'placement_pending');
  const completed = milestones.filter((m) => !pending.includes(m));

  if (milestones.length === 0) {
    return (
      <div style={{ padding: '0 1.5rem' }}>
        <PartnerEmptyState variant="milestones" framed />
      </div>
    );
  }

  return (
    <div style={{ padding: '0 1.5rem' }}>
      {/* Pending Queue */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}>Pending Review</p>
          {pending.length > 0 && (
            <span
              className="wa-tabular-nums"
              style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)', fontSize: '0.8125rem', fontWeight: 700 }}
            >
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <PartnerEmptyState variant="milestonesPendingClear" framed headingAs="h4" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {pending.map((m) => (
              <div
                key={m.id}
                className="wa-kit-card wa-kit-card--sm"
                style={{ borderLeft: '3px solid var(--wa-accent-dark)' }}
              >
                <div className={styles.pendingContent}>
                  <StatusTag className={styles.status} tone={KIND_TONE[m.kind] ?? 'muted'}>{KIND_LABEL[m.kind] ?? m.kind}</StatusTag>
                  <div className={styles.record}>
                    <PortalRecordLink href={`/partner/referred-members/${m.memberId}`} style={{ textDecoration: 'none' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', margin: '0 0 0.125rem' }}>{m.memberName}</p>
                    </PortalRecordLink>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--wa-accent)', margin: '0 0 0.125rem' }}>{m.label}</p>
                    <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0 }}>
                      {new Date(m.at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Section */}
      {completed.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <button type="button"
            onClick={() => setCompletedOpen((o) => !o)}
            className="active:scale-[0.98] transition-all wa-kit-focus"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 0',
              background: 'none',
              border: 'none',
              borderTop: '1px solid var(--wa-border)',
              cursor: 'pointer',
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}>
              Completed (<span className="wa-tabular-nums">{completed.length}</span>)
            </p>
            <ChevronDown
              aria-hidden
              size={18}
              style={{ color: 'var(--wa-muted)', transition: 'transform 0.2s', transform: completedOpen ? 'rotate(180deg)' : 'none' }}
            />
          </button>

          {completedOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.75rem' }}>
              {completed.map((m) => (
                <div key={m.id} className="wa-kit-card wa-kit-card--sm">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', margin: '0 0 0.125rem' }}>{m.memberName}</p>
                      <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0 }}>{m.label} · {new Date(m.at).toLocaleDateString()}</p>
                    </div>
                    <StatusTag tone="ok">Done</StatusTag>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
