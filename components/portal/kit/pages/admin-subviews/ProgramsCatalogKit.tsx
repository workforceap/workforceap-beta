'use client';

import {
  Cloud,
  HeartPulse,
  HardHat,
  Bot,
  Factory,
  Briefcase,
  BarChart3,
  Laptop,
  BookOpen,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import {
  DesignSurface,
  SectionHeader,
  KpiStrip,
  colorVar,
  type KpiItem,
} from '@/components/portal/kit';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Button } from '@astryxdesign/core/Button';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import NextLink from 'next/link';

/**
 * Programs catalog — program card grid (dense).
 * Mockup: workforceap-admin-full.html "Programs" view.
 * Target route: /admin/programs
 *
 * Each card: a tinted category-icon tile, the program name, a credential/skills
 * description line, a status Token (Healthy=green / Attention=pink based on the
 * program's completion %), and a footer row "{N} enrolled" (muted) + "{X}%"
 * completion (green when healthy, crimson when low). The header subtitle
 * ("{N} active · {N} enrolled") is a real aggregate computed server-side.
 *
 * Interactive (cards link to the catalog editor) → 'use client' so the grid is
 * hydration-safe alongside the kit primitives.
 */

export interface ProgramCard {
  /** Program slug (stable id + deep link anchor). */
  slug: string;
  /** Display title (e.g. "Cloud & IT"). */
  title: string;
  /** Description line — credential / skills summary. */
  description: string;
  /** Category key — drives icon + tint. */
  category: string;
  /** Members enrolled in this program (real count). */
  enrolled: number;
  /**
   * Completion percentage (0–100), or null when not derivable. Null → the
   * footer shows the enrolled count only and the status tag is omitted.
   */
  completion: number | null;
}

export interface ProgramsCatalogKitProps {
  programs?: ProgramCard[];
  /** Number of programs with at least one enrollment (real). */
  activePrograms?: number;
  /** Total distinct enrolled learners across all programs (real). */
  totalEnrolled?: number;
}

/** Completion at/above this reads "Healthy"; below it reads "Attention". */
const HEALTHY_THRESHOLD = 60;

const DEFAULT_PROGRAMS: ProgramCard[] = [
  { slug: 'cloud-it', title: 'Cloud & IT', description: 'AWS, CompTIA, Salesforce', category: 'cloud-data', enrolled: 312, completion: 74 },
  { slug: 'healthcare', title: 'Healthcare', description: 'CNA, Medical Assistant', category: 'healthcare', enrolled: 156, completion: 81 },
  { slug: 'skilled-trades', title: 'Skilled Trades', description: 'HVAC, Electrical, Welding', category: 'manufacturing', enrolled: 81, completion: 52 },
  { slug: 'data-ai', title: 'Data & AI', description: 'Analytics, ML, Prompting', category: 'ai-software', enrolled: 198, completion: 68 },
  { slug: 'manufacturing', title: 'Manufacturing', description: 'CNC, Quality, Logistics', category: 'manufacturing', enrolled: 100, completion: 70 },
];

/** Category → lucide icon + tinted tile (bg/fg). Falls back to a neutral book. */
const CATEGORY_ICON: Record<string, { Icon: LucideIcon; bg: string; fg: string }> = {
  'cloud-data': { Icon: Cloud, bg: 'rgba(43,123,185,0.12)', fg: colorVar('info') },
  'it-cyber': { Icon: Laptop, bg: 'rgba(173,44,77,0.10)', fg: colorVar('accent') },
  'it-cyber-entry': { Icon: Laptop, bg: 'rgba(173,44,77,0.10)', fg: colorVar('accent') },
  'ai-software': { Icon: Bot, bg: 'rgba(124,58,237,0.12)', fg: 'var(--wa-violet)' },
  healthcare: { Icon: HeartPulse, bg: 'rgba(74,155,79,0.14)', fg: colorVar('success') },
  manufacturing: { Icon: Factory, bg: 'rgba(43,123,185,0.12)', fg: colorVar('info') },
  business: { Icon: Briefcase, bg: 'rgba(164,127,56,0.14)', fg: colorVar('gold') },
  'digital-literacy': { Icon: BookOpen, bg: 'var(--wa-surface-2)', fg: 'var(--wa-text)' },
  trades: { Icon: HardHat, bg: 'rgba(164,127,56,0.14)', fg: colorVar('gold') },
  data: { Icon: BarChart3, bg: 'rgba(43,123,185,0.12)', fg: colorVar('info') },
};

const FALLBACK_ICON = { Icon: BookOpen, bg: 'var(--wa-surface-2)', fg: 'var(--wa-text)' };

/** Maps the kit's semantic tone vocabulary to a real Token color. */
const TONE_TOKEN_COLOR: Record<'ok' | 'alert', TokenColor> = {
  ok: 'green',
  alert: 'pink',
};

function ProgramTile({ card }: { card: ProgramCard }) {
  const { Icon, bg, fg } = CATEGORY_ICON[card.category] ?? FALLBACK_ICON;
  const healthy = card.completion != null && card.completion >= HEALTHY_THRESHOLD;

  return (
    <ClickableCard label={card.title} href={`/admin/programs?ui=legacy#${card.slug}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: bg,
              color: fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          {card.completion != null ? (
            <Token
              label={healthy ? 'Healthy' : 'Attention'}
              size="sm"
              color={TONE_TOKEN_COLOR[healthy ? 'ok' : 'alert']}
            />
          ) : null}
        </div>

        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {card.title}
          </h3>
          <p
            style={{
              fontSize: 13,
              color: 'var(--wa-muted)',
              margin: '2px 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {card.description}
          </p>
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
          <span style={{ color: 'var(--wa-muted)' }}>{card.enrolled} enrolled</span>
          {card.completion != null ? (
            <span style={{ fontWeight: 700, color: colorVar(healthy ? 'success' : 'accent') }}>
              {card.completion}%
            </span>
          ) : null}
        </div>
      </div>
    </ClickableCard>
  );
}

export function ProgramsCatalogKit({
  programs = DEFAULT_PROGRAMS,
  activePrograms,
  totalEnrolled,
}: ProgramsCatalogKitProps) {
  const active = activePrograms ?? programs.filter((p) => p.enrolled > 0).length;
  const enrolled = totalEnrolled ?? programs.reduce((sum, p) => sum + p.enrolled, 0);

  const subtitle = `${active} active · ${enrolled} enrolled`;

  const withCompletion = programs.filter((p) => p.completion != null) as Array<
    ProgramCard & { completion: number }
  >;
  const avgCompletion =
    withCompletion.length > 0
      ? Math.round(withCompletion.reduce((sum, p) => sum + p.completion, 0) / withCompletion.length)
      : null;
  const attention = withCompletion.filter((p) => p.completion < HEALTHY_THRESHOLD).length;

  const kpis: KpiItem[] = [
    { label: 'Programs', value: programs.length, color: 'text' },
    { label: 'Active', value: active, color: 'info' },
    { label: 'Enrolled', value: enrolled, color: 'accent' },
    {
      label: 'Need Attention',
      value: attention,
      color: attention > 0 ? 'accent' : 'success',
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader
        title="Programs"
        kicker="Catalog"
        goal={subtitle}
        action={
          <AstryxLink href="/admin/programs?ui=legacy" as={NextLink as never} isStandalone>
            <Button
              label="Manage catalog"
              variant="primary"
              size="sm"
              icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
            />
          </AstryxLink>
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} cols={4} />
      </div>

      {programs.length > 0 ? (
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-4">
          {programs.map((card) => (
            <ProgramTile key={card.slug} card={card} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" aria-hidden />}
          title="No programs yet"
          description="Add your first program to start tracking enrollment and completion."
        />
      )}

      {avgCompletion != null ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wa-muted)', marginTop: 16 }}>
          {programs.length} program{programs.length === 1 ? '' : 's'} · {avgCompletion}% avg completion
        </p>
      ) : null}
    </DesignSurface>
  );
}
