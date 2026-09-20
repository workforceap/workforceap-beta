'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Avatar, KitEmptyState, StatusTag, StageTrack, type KitTone } from '@/components/portal/kit';
import { PIPELINE_STAGES_ORDERED, type PipelineStage } from '@/lib/pipeline/stage';
import { useTranslations } from 'next-intl';

export type PartnerMemberRow = {
  id: string;
  fullName: string | null;
  stage: string;
  stageLabel: string;
  progress: number;
  programTitle: string;
  story: string;
  referredAtLabel: string;
  /** Same field the partner payout flow gates on; null when there's no placement yet. */
  placementVerified?: boolean | null;
};

type Filter = 'all' | 'active' | 'placed' | 'atRisk';

const STAGE_ORDER = PIPELINE_STAGES_ORDERED;

const STAGE_TONE: Record<string, KitTone> = {
  applied: 'muted',
  enrolled: 'info',
  in_training: 'warn',
  certified: 'info',
  job_searching: 'warn',
  placed: 'ok',
  closed: 'danger',
};

function stageTrackIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as PipelineStage);
  return idx === -1 ? 0 : idx + 1;
}

export default function PartnerReferredMembersMobile({ rows }: { rows: PartnerMemberRow[] }) {
  const t = useTranslations('partner');
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.stage !== 'placed' && r.stage !== 'closed').length,
      placed: rows.filter((r) => r.stage === 'placed').length,
      atRisk: rows.filter((r) => r.progress < 30 && r.stage === 'in_training').length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'active') return rows.filter((r) => r.stage !== 'placed' && r.stage !== 'closed');
    if (filter === 'placed') return rows.filter((r) => r.stage === 'placed');
    if (filter === 'atRisk') return rows.filter((r) => r.progress < 30 && r.stage === 'in_training');
    return rows;
  }, [rows, filter]);

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'placed', label: 'Placed', count: counts.placed },
    { key: 'atRisk', label: 'At Risk', count: counts.atRisk },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0 1.5rem 1rem', overflowX: 'auto' }}>
        {chips.map((chip) => {
          const active = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              aria-pressed={active}
              className="wa-kit-focus"
              style={{
                flexShrink: 0,
                padding: '0.375rem 0.875rem',
                borderRadius: '9999px',
                fontSize: '0.8125rem',
                fontWeight: 700,
                background: active ? 'var(--wa-accent)' : 'var(--wa-surface)',
                color: active ? 'var(--wa-on-accent)' : 'var(--wa-muted)',
                border: `1px solid ${active ? 'var(--wa-accent)' : 'var(--wa-border)'}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {chip.label}
              {chip.count > 0 ? (
                <span className="wa-tabular-nums" style={{ marginLeft: '0.375rem', fontSize: '0.8125rem', opacity: 0.85 }}>{chip.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {rows.length === 0 ? (
          <div className="wa-kit-card">
            <KitEmptyState title={t('noMembersYet')} description={t('noMembersYetDescription')} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="wa-kit-card">
            <KitEmptyState title={t('noMembersYet')} description={t('noMembersMatchFilter')} />
          </div>
        ) : (
          filtered.map((row) => {
            const initials = (row.fullName ?? '?')
              .split(' ')
              .map((name: string) => name[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();
            const isPlaced = row.stage === 'placed';

            return (
              <Link key={row.id} href={`/partner/referred-members/${row.id}`} style={{ textDecoration: 'none' }}>
                <div
                  className="wa-kit-card wa-kit-card--sm wa-kit-card--hover wa-kit-focus"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}
                >
                  <Avatar initials={initials} size={38} gradient={isPlaced} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: 'var(--wa-text)',
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.fullName ?? undefined}
                    >
                      {row.fullName}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '2px 0 6px' }}>
                      {row.programTitle} &middot; Referred {row.referredAtLabel}
                    </p>
                    <StageTrack
                      index={stageTrackIndex(row.stage)}
                      total={STAGE_ORDER.length}
                      color={isPlaced ? 'success' : 'accent'}
                      width={90}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', flexShrink: 0 }}>
                    <StatusTag tone={STAGE_TONE[row.stage] ?? 'muted'}>{row.stageLabel}</StatusTag>
                    {isPlaced ? (
                      <StatusTag tone={row.placementVerified ? 'ok' : 'warn'}>
                        {row.placementVerified ? 'Verified' : 'Pending'}
                      </StatusTag>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
