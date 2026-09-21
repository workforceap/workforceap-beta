'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Activity, Award, Briefcase } from 'lucide-react';
import {
  CardHead,
  KitEmptyState,
  SegmentedProgress,
  StageTrack,
  StatusTag,
  colorVar,
  type KitColor,
  type KitTone,
} from '@/components/portal/kit';
import { PIPELINE_STAGES_ORDERED, type PipelineStage } from '@/lib/pipeline/stage';
import { useTranslations } from 'next-intl';

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
  event: 'muted',
};

const KIND_LABEL: Record<string, string> = {
  certification: 'Certification',
  placement: 'Placement',
  event: 'Activity',
};

const KIND_ICON: Record<string, LucideIcon> = {
  certification: Award,
  placement: Briefcase,
  event: Activity,
};

const KIND_COLOR: Record<string, KitColor> = {
  certification: 'info',
  placement: 'success',
  event: 'muted',
};

/** Maps a milestone kind onto the referral journey so a track sliver can show
 *  how far along that milestone sits — certifications and placements only;
 *  generic "event" rows have no fixed stage. */
const KIND_STAGE: Partial<Record<string, PipelineStage>> = {
  certification: 'certified',
  placement: 'placed',
};

function stageTrackFor(kind: string): { index: number; total: number } | null {
  const stage = KIND_STAGE[kind];
  if (!stage) return null;
  const idx = PIPELINE_STAGES_ORDERED.indexOf(stage);
  if (idx === -1) return null;
  return { index: idx + 1, total: PIPELINE_STAGES_ORDERED.length };
}

export default function PartnerMilestonesView() {
  const t = useTranslations('partner');
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/partner/milestones', { credentials: 'include' });
      if (!r.ok) {
        setError('Could not load milestones');
        return;
      }
      const data = (await r.json()) as { milestones: Milestone[] };
      setMilestones(data.milestones);
    } catch {
      setError('Could not load milestones');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    if (!milestones) return null;
    const certifications = milestones.filter((m) => m.kind === 'certification').length;
    const placements = milestones.filter((m) => m.kind === 'placement').length;
    const events = milestones.filter((m) => m.kind === 'event').length;
    const wins = certifications + placements;
    const pct = milestones.length > 0 ? Math.round((wins / milestones.length) * 100) : 0;
    return { certifications, placements, events, wins, pct };
  }, [milestones]);

  if (error) {
    return (
      <div role="alert" className="wa-kit-card">
        <p style={{ color: 'var(--wa-muted)', marginBottom: '0.75rem' }}>{error}</p>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }
  if (!milestones) {
    return <p style={{ color: 'var(--wa-muted)' }}>Loading milestones…</p>;
  }
  if (milestones.length === 0) {
    return (
      <div className="wa-kit-card">
        <KitEmptyState title={t('noMilestonesYet')} description={t('noMilestonesYetDescription')} />
      </div>
    );
  }

  return (
    <div className="wa-flex wa-flex-col wa-gap-4">
      <div className="wa-kit-card">
        <CardHead title="Milestone mix" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <StatusTag tone="info">{counts?.certifications ?? 0} certifications</StatusTag>
          <StatusTag tone="ok">{counts?.placements ?? 0} placements</StatusTag>
          <StatusTag tone="muted">{counts?.events ?? 0} activity events</StatusTag>
        </div>
        <SegmentedProgress
          pct={counts?.pct ?? 0}
          segments={10}
          color="success"
          label="Share of recent milestones that are certifications or placements"
        />
        <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 8 }}>
          {counts?.pct ?? 0}% of recent activity is a certification or placement win.
        </div>
      </div>

      <div className="wa-kit-card">
        <CardHead title={`Milestone feed (${milestones.length})`} />
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {milestones.map((m) => {
            const Icon = KIND_ICON[m.kind] ?? Activity;
            const track = stageTrackFor(m.kind);
            const iconColor = colorVar(KIND_COLOR[m.kind] ?? 'muted');
            return (
              <li
                key={m.id}
                className="wa-kit-card wa-kit-card--sm"
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 'var(--wa-radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: `color-mix(in srgb, ${iconColor} 12%, transparent)`,
                    color: iconColor,
                  }}
                >
                  <Icon size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StatusTag tone={KIND_TONE[m.kind] ?? 'muted'}>{KIND_LABEL[m.kind] ?? m.kind}</StatusTag>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--wa-text)' }}>{m.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 3 }}>
                    <Link
                      href={`/partner/referred-members/${m.memberId}`}
                      style={{ color: 'var(--wa-accent)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {m.memberName}
                    </Link>
                    {' · '}
                    {new Date(m.at).toLocaleString()}
                  </div>
                </div>
                {track ? (
                  <StageTrack
                    index={track.index}
                    total={track.total}
                    tone={m.kind === 'placement' ? 'ok' : 'info'}
                    width={72}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
