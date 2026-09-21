import type { ReactNode } from 'react';
import { ArrowRight, FileSpreadsheet, FileText, Users, SlidersHorizontal, Download } from 'lucide-react';
import { PageOpener, colorVar } from '@/components/portal/kit';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { EmbeddableFrame } from './EmbeddableFrame';

/**
 * Exports — board / funder / compliance data downloads as a responsive card grid.
 * Mockup: workforceap-admin-full.html "exports" view.
 * Target route: /admin/exports
 *
 * Each card is a file-icon tile + title + description, linking to a REAL export
 * route the page already exposes (CSV download endpoints) or, for the filterable
 * Member Training Report, into the legacy form view. Server-rendered (plain
 * anchors, no interactivity) so it stays a clean RSC.
 *
 * One verb per row type (admin audit §6.6): a file endpoint says "Download"
 * (or the page's translated download label), carries the `download`
 * attribute and a download glyph; an in-portal page says "Open" with an
 * arrow. `exportRowKind` decides from the row itself.
 */

export type ExportTone = 'success' | 'info' | 'accent' | 'gold' | 'muted';

export interface ExportOption {
  id: string;
  /** Card title, e.g. "Funder program summary". */
  title: string;
  /** One-line description / context, e.g. "Grant reporting · per-program". */
  description: string;
  /** Real route the card links to (API download endpoint or legacy view). */
  href: string;
  /** Which file icon to show. */
  iconKey?: 'csv' | 'xlsx' | 'roster' | 'filters' | 'download';
  /** Tile tint. */
  tone?: ExportTone;
  /** Optional short status pill (e.g. "PII gated"). */
  badge?: string;
  badgeTone?: 'ok' | 'warn' | 'alert' | 'info' | 'muted';
  /** Trigger a browser download rather than a navigation. */
  download?: boolean;
  /** Open in a new tab (for export endpoints that stream a file). */
  newTab?: boolean;
  /**
   * Row verb override, e.g. the translated "Download funder summary CSV".
   * Defaults to "Download" for file endpoints and "Open" for portal pages.
   */
  actionLabel?: string;
}

export type ExportRowKind = 'download' | 'open';

/** A row is a file when it says so or points outside the admin portal. */
export function exportRowKind(option: Pick<ExportOption, 'href' | 'download'>): ExportRowKind {
  return option.download || !option.href.startsWith('/admin') ? 'download' : 'open';
}

export interface ExportsKitProps {
  exports?: ExportOption[];
  /** Mount inside a hub tab: no page surface, no opener (the hub owns the h1). */
  embedded?: boolean;
}

const DEFAULT_EXPORTS: ExportOption[] = [
  {
    id: 'placement-outcomes',
    title: 'Placement outcomes (CSV)',
    description: 'Board-ready · YTD',
    href: '/admin/exports?ui=legacy',
    iconKey: 'csv',
    tone: 'success',
  },
  {
    id: 'wioa-compliance',
    title: 'WIOA compliance (XLSX)',
    description: 'Funder report · this quarter',
    href: '/admin/exports?ui=legacy',
    iconKey: 'xlsx',
    tone: 'muted',
  },
  {
    id: 'member-roster',
    title: 'Full member roster',
    description: '847 records · PII gated',
    href: '/admin/exports?ui=legacy',
    iconKey: 'roster',
    tone: 'info',
    badge: 'PII gated',
    badgeTone: 'warn',
  },
];

const TONE_TINT: Record<ExportTone, { bg: string; fg: string }> = {
  success: { bg: 'rgba(74,155,79,0.12)', fg: colorVar('success') },
  info: { bg: 'rgba(43,123,185,0.12)', fg: colorVar('info') },
  accent: { bg: 'rgba(173,44,77,0.10)', fg: colorVar('accent') },
  gold: { bg: 'rgba(164,127,56,0.14)', fg: colorVar('gold') },
  muted: { bg: 'var(--wa-surface-2)', fg: 'var(--wa-text)' },
};

/** Maps the kit's semantic badge-tone vocabulary to a real Token color. */
const BADGE_TOKEN_COLOR: Record<NonNullable<ExportOption['badgeTone']>, TokenColor> = {
  ok: 'green',
  warn: 'orange',
  alert: 'pink',
  info: 'blue',
  muted: 'gray',
};

function exportIcon(kind: ExportOption['iconKey']): ReactNode {
  switch (kind) {
    case 'csv':
      return <FileSpreadsheet className="h-5 w-5" />;
    case 'xlsx':
      return <FileSpreadsheet className="h-5 w-5" />;
    case 'roster':
      return <Users className="h-5 w-5" />;
    case 'filters':
      return <SlidersHorizontal className="h-5 w-5" />;
    default:
      return <FileText className="h-5 w-5" />;
  }
}

function ExportTile({ option }: { option: ExportOption }) {
  const tint = TONE_TINT[option.tone ?? 'muted'];
  const kind = exportRowKind(option);
  return (
    <a
      href={option.href}
      data-export-action={kind}
      {...(kind === 'download' ? { download: true } : {})}
      {...(option.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="wa-kit-card wa-kit-card--hover wa-kit-focus"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
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
          {exportIcon(option.iconKey)}
        </div>
        {option.badge ? (
          <Token label={option.badge} size="sm" color={BADGE_TOKEN_COLOR[option.badgeTone ?? 'muted']} />
        ) : null}
      </div>

      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', margin: 0 }}>{option.title}</h3>
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '2px 0 0' }}>{option.description}</p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 700,
          color: colorVar('accent'),
          paddingTop: 12,
          borderTop: '1px solid var(--wa-border)',
        }}
      >
        {kind === 'download' ? <Download className="h-3.5 w-3.5" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
        {option.actionLabel ?? (kind === 'download' ? 'Download' : 'Open')}
      </div>
    </a>
  );
}

export function ExportsKit({ exports = DEFAULT_EXPORTS, embedded = false }: ExportsKitProps) {
  return (
    <EmbeddableFrame
      embedded={embedded}
      opener={
        <PageOpener
          className="wa-mb-5"
          title="Exports"
          kicker="Reporting"
          lede="Download data for board, funders & compliance"
        />
      }
    >
      {exports.length > 0 ? (
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-4">
          {exports.map((option) => (
            <ExportTile key={option.id} option={option} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Download className="h-6 w-6" aria-hidden />}
          title="No exports available"
          description="Export options will appear here once reporting is configured."
        />
      )}
    </EmbeddableFrame>
  );
}
