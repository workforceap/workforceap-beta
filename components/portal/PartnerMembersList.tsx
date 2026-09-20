'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DataTable, StatusTag, StageTrack, type Column, type KitTone } from '@/components/portal/kit';
import { PIPELINE_STAGES_ORDERED, type PipelineStage } from '@/lib/pipeline/stage';

type PartnerMember = {
  id: string;
  fullName: string;
  stage: string;
  stageLabel: string;
  progress: number;
  programTitle: string;
  story: string;
  /** When this member was referred to WorkforceAP (shown instead of generic profile update date). */
  referredAtLabel: string;
  /** Same field the partner payout flow gates on; null when there's no placement yet. */
  placementVerified?: boolean | null;
};

/** Referral milestone order for the StageTrack column — shared with the pipeline stage model. */
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

export default function PartnerMembersList({ members }: { members: PartnerMember[] }) {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((member) => {
      if (stage !== 'all' && member.stage !== stage) return false;
      if (!q) return true;
      return [member.fullName, member.programTitle, member.story, member.stageLabel, member.referredAtLabel]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [members, search, stage]);

  const columns: Column<PartnerMember>[] = [
    {
      key: 'fullName',
      header: 'Member',
      render: (m) => (
        <Link
          href={`/partner/referred-members/${m.id}`}
          style={{ display: 'flex', flexDirection: 'column', gap: 2, textDecoration: 'none' }}
        >
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--wa-text)' }}>{m.fullName}</span>
          <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{m.story}</span>
        </Link>
      ),
    },
    {
      key: 'programTitle',
      header: 'Program',
      render: (m) => <span style={{ color: 'var(--wa-text)' }}>{m.programTitle}</span>,
    },
    {
      key: 'stage',
      header: 'Status',
      render: (m) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <StatusTag tone={STAGE_TONE[m.stage] ?? 'muted'}>{m.stageLabel}</StatusTag>
          {m.stage === 'placed' ? (
            <StatusTag tone={m.placementVerified ? 'ok' : 'warn'}>
              {m.placementVerified ? 'Verified' : 'Pending verification'}
            </StatusTag>
          ) : null}
        </div>
      ),
    },
    {
      key: 'milestone',
      header: 'Milestone',
      render: (m) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <StageTrack
            index={stageTrackIndex(m.stage)}
            total={STAGE_ORDER.length}
            color={m.stage === 'placed' ? 'success' : 'accent'}
            width={100}
          />
          <span style={{ fontSize: 13, color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {m.progress}%
          </span>
        </div>
      ),
    },
    {
      key: 'referredAtLabel',
      header: 'Referred',
      align: 'right',
      render: (m) => (
        <span style={{ fontSize: 13, color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {m.referredAtLabel}
        </span>
      ),
    },
  ];

  return (
    <section className="wa-flex wa-flex-col wa-gap-3">
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members, program, or status"
          aria-label="Search referred members by name, program, or status"
          className="wa-kit-focus"
          style={{
            minWidth: 260,
            flex: '1 1 280px',
            padding: '0.6rem 0.85rem',
            borderRadius: 'var(--wa-radius-sm)',
            border: '1px solid var(--wa-border)',
            background: 'var(--wa-surface)',
            color: 'var(--wa-text)',
            fontSize: 13,
          }}
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          aria-label="Filter by member journey stage"
          className="wa-kit-focus"
          style={{
            padding: '0.6rem 0.85rem',
            borderRadius: 'var(--wa-radius-sm)',
            border: '1px solid var(--wa-border)',
            background: 'var(--wa-surface)',
            color: 'var(--wa-text)',
            fontSize: 13,
          }}
        >
          <option value="all">All stages</option>
          <option value="applied">Applied</option>
          <option value="enrolled">Enrolled</option>
          <option value="in_training">In training</option>
          <option value="certified">Certified</option>
          <option value="placed">Placed</option>
        </select>
      </div>
      <p style={{ fontSize: 13, color: 'var(--wa-muted)' }}>
        {filtered.length} member{filtered.length !== 1 ? 's' : ''} shown
      </p>
      <DataTable<PartnerMember>
        columns={columns}
        rows={filtered}
        rowKey={(m) => m.id}
        mobile="scroll"
        emptyTitle={members.length === 0 ? "You haven't referred any members yet" : 'No members match this filter'}
        emptyDescription={
          members.length === 0
            ? 'Use the Invite Member button to start building your referral pipeline.'
            : 'Try clearing your search or changing the stage filter.'
        }
      />
    </section>
  );
}
