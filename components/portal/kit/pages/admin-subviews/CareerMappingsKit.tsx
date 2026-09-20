import {
  Cloud,
  HeartPulse,
  Bot,
  Factory,
  Briefcase,
  HardHat,
  BarChart3,
  Laptop,
  BookOpen,
  Target,
  type LucideIcon,
} from 'lucide-react';
import {
  DesignSurface,
  SectionHeader,
  KpiStrip,
  colorVar,
  type KpiItem,
} from '@/components/portal/kit';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';

/**
 * Career paths — program → role mappings that power matching, as a responsive
 * 1/2/3-col card grid. Mockup: workforceap-admin-full.html "career-mappings" view.
 * Target route: /admin/career-mappings
 *
 * Each card: a tinted category-icon tile, a "{Program} → {Role}" title, and a
 * "{N} mapped roles · {N} employer partners" description. Counts are real,
 * computed server-side from CareerProgramMapping (distinct O*NET roles per
 * program) and EmployerHiringIntent (distinct employer partners per program).
 *
 * Server-rendered (cards deep-link to the legacy mapping editor) so it stays a
 * plain RSC alongside the kit primitives.
 */

export interface CareerPathCard {
  /** Program slug — stable id + deep-link anchor. */
  slug: string;
  /** Program display title, e.g. "Cloud & IT". */
  program: string;
  /** Primary mapped role/occupation title, e.g. "Cloud Support". */
  role: string;
  /** Distinct O*NET occupations mapped to this program (active only). */
  mappedRoles: number;
  /** Distinct employer partners with hiring intent for this program. */
  employerPartners: number;
  /** Category key — drives icon + tint. */
  category: string;
  /** Optional category accent color (from the program catalog). */
  categoryColor?: string | null;
}

export interface CareerMappingsKitProps {
  paths?: CareerPathCard[];
  /** Total distinct programs with at least one active mapping (real). */
  totalPrograms?: number;
  /** Total distinct mapped roles across all programs (real). */
  totalRoles?: number;
  /** Total distinct employer partners across all programs (real). */
  totalPartners?: number;
}

const DEFAULT_PATHS: CareerPathCard[] = [
  { slug: 'cloud-it', program: 'Cloud & IT', role: 'Cloud Support', mappedRoles: 12, employerPartners: 8, category: 'cloud-data', categoryColor: null },
  { slug: 'healthcare', program: 'Healthcare', role: 'Medical Assistant', mappedRoles: 9, employerPartners: 6, category: 'healthcare', categoryColor: null },
  { slug: 'data-ai', program: 'Data & AI', role: 'Data Analyst', mappedRoles: 7, employerPartners: 5, category: 'ai-software', categoryColor: null },
];

/** Category → lucide icon + tinted tile (bg/fg). Falls back to a neutral target. */
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

const FALLBACK_ICON = { Icon: Target, bg: 'rgba(173,44,77,0.10)', fg: colorVar('accent') };

function PathTile({ card }: { card: CareerPathCard }) {
  const base = CATEGORY_ICON[card.category] ?? FALLBACK_ICON;
  // Prefer the catalog's category color for the tile when supplied.
  const fg = card.categoryColor ?? base.fg;
  const bg = card.categoryColor ? `${card.categoryColor}22` : base.bg;
  const Icon = base.Icon;

  const rolesLabel = `${card.mappedRoles} mapped ${card.mappedRoles === 1 ? 'role' : 'roles'}`;
  const partnersLabel = `${card.employerPartners} employer ${card.employerPartners === 1 ? 'partner' : 'partners'}`;

  return (
    <ClickableCard
      label={`${card.program} → ${card.role}`}
      href={`/admin/career-mappings?ui=legacy#${card.slug}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          <Icon className="h-5 w-5" />
        </div>

        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', margin: 0 }}>
            {card.program} <span style={{ color: 'var(--wa-muted)' }}>→</span> {card.role}
          </h3>
          <p
            style={{
              fontSize: 13,
              color: 'var(--wa-muted)',
              margin: '4px 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {rolesLabel} · {partnersLabel}
          </p>
        </div>
      </div>
    </ClickableCard>
  );
}

export function CareerMappingsKit({
  paths = DEFAULT_PATHS,
  totalPrograms,
  totalRoles,
  totalPartners,
}: CareerMappingsKitProps) {
  const programs = totalPrograms ?? paths.length;
  const roles = totalRoles ?? paths.reduce((sum, p) => sum + p.mappedRoles, 0);
  const partners = totalPartners ?? paths.reduce((sum, p) => sum + p.employerPartners, 0);

  const kpis: KpiItem[] = [
    { label: 'Career paths', value: programs, color: 'accent' },
    { label: 'Mapped roles', value: roles, color: 'info' },
    { label: 'Employer partners', value: partners, color: 'gold' },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader
        title="Career paths"
        kicker="Matching"
        goal="Program → role mappings that power matching"
        action={
          <Button
            label="Edit mappings"
            href="/admin/career-mappings?ui=legacy"
            variant="secondary"
            size="sm"
          />
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      {paths.length === 0 ? (
        <EmptyState
          icon={<Target className="h-6 w-6" />}
          title="No career paths yet"
          description="Map an O*NET occupation to a program to start powering member matching."
        />
      ) : (
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-4">
          {paths.map((card) => (
            <PathTile key={card.slug} card={card} />
          ))}
        </div>
      )}
    </DesignSurface>
  );
}
