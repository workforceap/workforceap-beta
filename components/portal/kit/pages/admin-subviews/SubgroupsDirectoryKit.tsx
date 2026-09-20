'use client';

import Link from 'next/link';
import { Users, Plus } from 'lucide-react';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Button } from '@astryxdesign/core/Button';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  KitEmptyState,
  colorVar,
  type KpiItem,
} from '@/components/portal/kit';
import { SUBGROUPS_DIRECTORY_EMPTY } from '@/lib/admin/directoryEmptyState';

/**
 * Subgroups directory — cohort / chapter / special-program card grid (dense).
 * Mockup: workforceap-admin-full.html "Subgroups" view.
 * Target route: /admin/subgroups
 *
 * Each card: a tinted people-icon tile, the subgroup name, and a description
 * line "{N} members · {focus}" (mockup examples: "48 members · Cloud & IT
 * focus"). A subtle status token carries the subgroup type (Partner / Manager /
 * Church). The header subtitle stays "Cohorts, chapters & special programs"
 * per the mockup; real counts live in the KPI strip below it.
 *
 * Interactive (cards link to the legacy management view) → 'use client' so the
 * grid is hydration-safe alongside the kit primitives.
 *
 * Uses shared primitives from @astryxdesign/core (ClickableCard, Button,
 * Token, Link) for the card-as-link grid, header CTA, and type chip.
 * Directory empty uses kit KitEmptyState (same contract as MentorsDirectoryKit).
 */

export type SubgroupKind = 'partner' | 'manager' | 'church';

export interface SubgroupCard {
  id: string;
  name: string;
  /** Real member count for this subgroup (from MemberSubgroup groupBy). */
  members: number;
  /** Focus line — e.g. "Cloud & IT focus", a partner name, or the type. */
  focus: string;
  /** Subgroup type — drives a subtle status token. */
  kind: SubgroupKind;
}

export interface SubgroupsDirectoryKitProps {
  subgroups?: SubgroupCard[];
  /** Total subgroup count (full directory, not just the loaded page). */
  totalSubgroups?: number;
  /** Total distinct member assignments across all subgroups (real aggregate). */
  totalMembers?: number;
}

const DEFAULT_SUBGROUPS: SubgroupCard[] = [
  { id: 'veterans', name: 'Veterans Cohort', members: 48, focus: 'Cloud & IT focus', kind: 'manager' },
  { id: 'healthcare-s26', name: 'Spring 2026 Healthcare', members: 62, focus: 'CNA track', kind: 'manager' },
  { id: 'youth-build', name: 'Youth Build (16–24)', members: 34, focus: 'trades', kind: 'church' },
];

/** Rotate the icon-tile tint across cards so the grid reads like the mockup. */
const TILE_TINTS: Array<{ bg: string; fg: string }> = [
  { bg: 'var(--wa-surface-2)', fg: colorVar('accent') },
  { bg: 'rgba(43,123,185,0.12)', fg: colorVar('info') },
  { bg: 'rgba(46,125,50,0.12)', fg: colorVar('success') },
  { bg: 'rgba(164,127,56,0.14)', fg: colorVar('gold') },
];

const KIND_TAG: Record<SubgroupKind, { color: TokenColor; label: string }> = {
  partner: { color: 'blue', label: 'Partner' },
  manager: { color: 'green', label: 'Manager' },
  church: { color: 'yellow', label: 'Church' },
};

function SubgroupTile({ card, index }: { card: SubgroupCard; index: number }) {
  const tint = TILE_TINTS[index % TILE_TINTS.length];
  const tag = KIND_TAG[card.kind];
  return (
    <ClickableCard href={`/admin/subgroups/${card.id}`} label={card.name}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: tint.bg,
              color: tint.fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Users className="h-5 w-5" aria-hidden />
          </div>
          <Token label={tag.label} size="sm" color={tag.color} />
        </div>

        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: '-0.02em',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {card.name}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '2px 0 0' }}>
            {card.members} {card.members === 1 ? 'member' : 'members'} · {card.focus}
          </p>
        </div>
      </div>
    </ClickableCard>
  );
}

export function SubgroupsDirectoryKit({
  subgroups = DEFAULT_SUBGROUPS,
  totalSubgroups,
  totalMembers,
}: SubgroupsDirectoryKitProps) {
  const groups = totalSubgroups ?? subgroups.length;
  const members = totalMembers ?? subgroups.reduce((sum, s) => sum + s.members, 0);
  const avgSize = groups > 0 ? Math.round(members / groups) : 0;
  const largest = subgroups.reduce((max, s) => Math.max(max, s.members), 0);

  const kpis: KpiItem[] = [
    { label: 'Subgroups', value: groups, color: 'text' },
    { label: 'Total Members', value: members, color: 'info' },
    { label: 'Avg Size', value: avgSize, color: 'success' },
    { label: 'Largest', value: largest, color: 'accent' },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener
        title="Subgroups"
        kicker="People"
        lede="Cohorts, chapters & special programs"
        action={
          <AstryxLink href="/admin/subgroups/new" as={Link as never} isStandalone>
            <Button
              label="New Subgroup"
              variant="primary"
              size="sm"
              icon={<Plus className="h-4 w-4" aria-hidden />}
            />
          </AstryxLink>
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} cols={4} />
      </div>

      {subgroups.length > 0 ? (
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-4">
          {subgroups.map((card, index) => (
            <SubgroupTile key={card.id} card={card} index={index} />
          ))}
        </div>
      ) : (
        <div className="wa-kit-card">
          <KitEmptyState
            title={SUBGROUPS_DIRECTORY_EMPTY.title}
            description={SUBGROUPS_DIRECTORY_EMPTY.description}
            action={
              <Link
                href={SUBGROUPS_DIRECTORY_EMPTY.primaryCta.href}
                className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
              >
                {SUBGROUPS_DIRECTORY_EMPTY.primaryCta.label}
              </Link>
            }
          />
        </div>
      )}
    </DesignSurface>
  );
}
