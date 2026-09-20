'use client';

import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  KitEmptyState,
  colorVar,
  type KpiItem,
} from '@/components/portal/kit';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { EMPLOYERS_DIRECTORY_EMPTY } from '@/lib/admin/directoryEmptyState';

/**
 * Employers directory — partner card grid (dense).
 * Mockup: workforceap-admin-full.html "Employers" view.
 * Target route: /admin/employers
 *
 * Each card: a tinted building-icon tile, the employer name, an industry/
 * category line, and a footer row with "{N} open roles" (muted) + "{N} hires"
 * (success/green). The header subtitle ("48 partners · 127 open roles") is a
 * real aggregate computed server-side and passed in.
 *
 * Interactive (cards link to the legacy management view) → 'use client' so the
 * grid is hydration-safe alongside the kit primitives.
 */

export interface EmployerCard {
  id: string;
  name: string;
  /** Industry / category line (e.g. "Tech & Consulting"). */
  industry: string;
  /** Count of live/open roles for this employer. */
  openRoles: number;
  /** Count of hires (job-posting applications marked hired). */
  hires: number;
  /** Account status — drives a subtle status tag. */
  status: 'active' | 'inactive' | 'pending_approval';
  /** Employer user's User.lastLoginAt, ISO string, or null if they've never logged in. */
  lastLoginAt: string | null;
}

/** Whole days since an ISO timestamp, or null if the timestamp is missing (never logged in). */
function daysSinceLogin(lastLoginAt: string | null): number | null {
  if (!lastLoginAt) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(lastLoginAt).getTime()) / (24 * 60 * 60 * 1000)));
}

/** Dormant-employer visibility: green < 30d, amber 30-90d, red 90d+ or never logged in. */
function lastActiveBadge(lastLoginAt: string | null): { label: string; tone: 'ok' | 'warn' | 'alert' } {
  const days = daysSinceLogin(lastLoginAt);
  if (days === null) return { label: 'Never logged in', tone: 'alert' };
  if (days < 30) return { label: `Active ${days}d ago`, tone: 'ok' };
  if (days <= 90) return { label: `Active ${days}d ago`, tone: 'warn' };
  return { label: `Inactive ${days}d`, tone: 'alert' };
}

/** Maps the kit's semantic tone vocabulary to a real Token color. */
const TONE_TOKEN_COLOR: Record<'ok' | 'warn' | 'alert' | 'muted', TokenColor> = {
  ok: 'green',
  warn: 'orange',
  alert: 'pink',
  muted: 'gray',
};

export interface EmployersDirectoryKitProps {
  employers?: EmployerCard[];
  /** Total partner count (full directory, not just the loaded page). */
  totalPartners?: number;
  /** Total open roles across all partners (real aggregate). */
  totalOpenRoles?: number;
  /** Total hires across all partners (real aggregate). */
  totalHires?: number;
  /** Active partner count for the KPI strip. */
  activePartners?: number;
}

const DEFAULT_EMPLOYERS: EmployerCard[] = [
  { id: 'deloitte', name: 'Deloitte', industry: 'Tech & Consulting', openRoles: 9, hires: 18, status: 'active', lastLoginAt: new Date().toISOString() },
  { id: 'dell', name: 'Dell Technologies', industry: 'Hardware & IT', openRoles: 12, hires: 24, status: 'active', lastLoginAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'stdavids', name: "St. David's HealthCare", industry: 'Healthcare', openRoles: 15, hires: 31, status: 'active', lastLoginAt: null },
];

/** Rotate the icon-tile tint across cards so the grid reads like the mockup. */
const TILE_TINTS: Array<{ bg: string; fg: string }> = [
  { bg: 'var(--wa-surface-2)', fg: 'var(--wa-text)' },
  { bg: 'rgba(43,123,185,0.12)', fg: colorVar('info') },
  { bg: 'rgba(164,127,56,0.14)', fg: colorVar('gold') },
];

const STATUS_TAG: Record<EmployerCard['status'], { tone: 'ok' | 'muted' | 'warn'; label: string }> = {
  active: { tone: 'ok', label: 'Active' },
  inactive: { tone: 'muted', label: 'Inactive' },
  pending_approval: { tone: 'warn', label: 'Pending' },
};

function EmployerTile({ card, index }: { card: EmployerCard; index: number }) {
  const tint = TILE_TINTS[index % TILE_TINTS.length];
  const tag = STATUS_TAG[card.status];
  const lastActive = lastActiveBadge(card.lastLoginAt);
  return (
    <ClickableCard label={card.name} href={`/admin/employers/${card.id}`}>
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
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <Token label={tag.label} size="sm" color={TONE_TOKEN_COLOR[tag.tone]} />
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
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '2px 0 0' }}>{card.industry}</p>
          <div style={{ marginTop: 6 }}>
            <Token label={lastActive.label} size="sm" color={TONE_TOKEN_COLOR[lastActive.tone]} />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: 13,
            paddingTop: 12,
            borderTop: '1px solid var(--wa-border)',
          }}
        >
          <span style={{ color: 'var(--wa-muted)' }}>
            {card.openRoles} open {card.openRoles === 1 ? 'role' : 'roles'}
          </span>
          <span style={{ fontWeight: 700, color: colorVar('success') }}>
            {card.hires} {card.hires === 1 ? 'hire' : 'hires'}
          </span>
        </div>
      </div>
    </ClickableCard>
  );
}

export function EmployersDirectoryKit({
  employers = DEFAULT_EMPLOYERS,
  totalPartners,
  totalOpenRoles,
  totalHires,
  activePartners,
}: EmployersDirectoryKitProps) {
  const partners = totalPartners ?? employers.length;
  const openRoles = totalOpenRoles ?? employers.reduce((sum, e) => sum + e.openRoles, 0);
  const hires = totalHires ?? employers.reduce((sum, e) => sum + e.hires, 0);
  const active = activePartners ?? employers.filter((e) => e.status === 'active').length;

  const subtitle = `${partners} partner${partners === 1 ? '' : 's'} · ${openRoles} open role${openRoles === 1 ? '' : 's'}`;

  const kpis: KpiItem[] = [
    { label: 'Employers', value: partners },
    { label: 'Open Roles', value: openRoles },
    { label: 'Hires YTD', value: hires },
    { label: 'Active', value: active },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener
        title="Employers"
        kicker="Partners"
        lede={subtitle}
        action={
          <AstryxLink href="/admin/employers?ui=legacy#create" as={Link as never} isStandalone>
            <Button label="Add Employer" variant="primary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} />
          </AstryxLink>
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} cols={4} />
      </div>

      {employers.length > 0 ? (
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-4">
          {employers.map((card, index) => (
            <EmployerTile key={card.id} card={card} index={index} />
          ))}
        </div>
      ) : (
        <div className="wa-kit-card">
          <KitEmptyState
            title={EMPLOYERS_DIRECTORY_EMPTY.title}
            description={EMPLOYERS_DIRECTORY_EMPTY.description}
            action={
              <Link
                href={EMPLOYERS_DIRECTORY_EMPTY.primaryCta.href}
                className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
              >
                {EMPLOYERS_DIRECTORY_EMPTY.primaryCta.label}
              </Link>
            }
          />
        </div>
      )}
    </DesignSurface>
  );
}
