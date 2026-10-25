import { useTranslations } from 'next-intl';
import { DataTable, StatusTag, cx, toneClass, type Column, type KitTone } from '@/components/portal/kit';
import { isExcludedPublicEmployerName } from '@/lib/jobs/publicJobFilters';

/**
 * The application pipeline: one row per job the member is tracking, with the
 * stage tone, a 3-segment stage track and the applied date.
 *
 * It used to sit on the member home. The home is the "This week" page now, so
 * this table lives here for the pages that own applications (Jobs, Progress).
 * `MemberHomeKit` still re-exports the `PipelineRow` type, so existing imports
 * keep working.
 */

/**
 * A pipeline row's stage tone. Declared as a subset of `KitTone` so the stage
 * track can hand it straight to `toneClass()` and paint from
 * `--wa-kit-tone`, instead of mapping it to `var(--wa-gold)` /
 * `var(--wa-info)` by hand (#2434).
 */
export type JobStageTone = Extract<KitTone, 'warn' | 'muted' | 'info'>;

export interface PipelineRow {
  role: string;
  company: string;
  stage: string;
  tone: JobStageTone;
  /** Applied date label, e.g. "Jun 18". Omit to render an em dash. */
  appliedLabel?: string;
  /** 1-based current position in the stage tracker. Falls back to a value derived from `tone` when omitted. */
  stageIndex?: number;
  /** Total segments in the stage tracker. Defaults to 3. */
  stageTotal?: number;
}

function defaultStageIndex(tone: JobStageTone): number {
  if (tone === 'warn') return 3;
  if (tone === 'info') return 2;
  return 1;
}

/**
 * Deterministic brand-safe color for a company-initial avatar (no arbitrary hex).
 *
 * Already on the design tokens: every entry is a `--wa-*` custom property, so
 * light/dark and rebrands follow for free. Deliberately NOT moved onto the
 * `KitTone` palette: the hue here identifies an employer, it does not rate one.
 * A tone would make "Acme" green and "Globex" amber and invite the reader to
 * see a judgement about the company that nothing in the data supports. The
 * list is ordered for adjacent-swatch contrast, not by severity.
 */
const LOGO_COLORS = ['var(--wa-accent)', 'var(--wa-info)', 'var(--wa-gold)', 'var(--wa-success)', 'var(--wa-accent-dark)'];
function logoColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

/**
 * Company line for the pipeline. Reuses the public job-board sandbox /
 * QA / demo employer rule (`isExcludedPublicEmployerName`) so fixture names
 * like "QA Audit Co" stay off member surfaces while real employers (e.g.
 * Dell Technologies) still show.
 */
function pipelineCompanyDisplay(company: string): string | null {
  const trimmed = company.trim();
  if (!trimmed || isExcludedPublicEmployerName(trimmed)) return null;
  return trimmed;
}

function PipelineStageTrack({ row }: { row: PipelineRow }) {
  const total = row.stageTotal ?? 3;
  const filled = Math.max(0, Math.min(total, row.stageIndex ?? defaultStageIndex(row.tone)));
  return (
    <div
      aria-hidden
      className={cx('wa-flex wa-items-center wa-gap-1', toneClass(row.tone))}
      style={{ width: 84 }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{ height: 5, flex: 1, borderRadius: 3, background: i < filled ? 'var(--wa-kit-tone)' : 'var(--wa-track)' }}
        />
      ))}
    </div>
  );
}

function PipelineRoleCell({ row, roleWeight = 700 }: { row: PipelineRow; roleWeight?: number }) {
  const company = pipelineCompanyDisplay(row.company);
  const markSource = company ?? row.role;
  const initial = markSource.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="wa-flex wa-items-center wa-gap-3">
      <div
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 'var(--wa-type-meta)',
          color: 'var(--wa-on-accent)',
          background: logoColorFor(markSource),
        }}
      >
        {initial}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: roleWeight, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>{row.role}</div>
        {company ? (
          <div className="wa-kit-meta" style={{ fontWeight: 600, marginTop: 1 }}>{company}</div>
        ) : null}
      </div>
    </div>
  );
}

const pipelineColumns: Column<PipelineRow>[] = [
  {
    key: 'role',
    header: 'Role',
    render: (row) => <PipelineRoleCell row={row} />,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusTag tone={row.tone}>{row.stage}</StatusTag>,
  },
  {
    key: 'stageTrack',
    header: 'Stage',
    render: (row) => <PipelineStageTrack row={row} />,
  },
  {
    key: 'applied',
    header: 'Applied',
    align: 'right',
    render: (row) => (
      <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {row.appliedLabel ?? '—'}
      </span>
    ),
  },
];

const pipelineCard = (row: PipelineRow) => {
  return (
    <div className="wa-kit-card wa-kit-card--sm">
      {/* Phones: stack the stage tag under the role+company block. Side by
          side, the nowrap tag took up to 116px of the 226px row, leaving the
          role column 98-139px and wrapping titles onto 3 lines. Row layout
          returns at >=768px. */}
      <div className="wa-flex wa-flex-col wa-items-start wa-gap-2 md:wa-flex-row md:wa-justify-between md:wa-gap-3">
        <div style={{ minWidth: 0 }}>
          <PipelineRoleCell row={row} roleWeight={800} />
        </div>
        <StatusTag tone={row.tone}>{row.stage}</StatusTag>
      </div>
      <div className="wa-flex wa-items-center wa-justify-between" style={{ marginTop: 10 }}>
        <PipelineStageTrack row={row} />
        <span className="wa-kit-meta" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {row.appliedLabel ?? '—'}
        </span>
      </div>
    </div>
  );
};

/**
 * The table (cards on phone). Wrap it in your own `.wa-kit-card` with a title;
 * the empty state links to `jobsHref`.
 */
export function MemberPipelineTable({ rows, jobsHref = '/dashboard/jobs' }: { rows: PipelineRow[]; jobsHref?: string }) {
  const te = useTranslations('empty');
  return (
    <DataTable<PipelineRow>
      columns={pipelineColumns}
      rows={rows}
      rowKey={(row) => `${row.role}-${row.company}`}
      mobile="cards"
      cardRender={pipelineCard}
      minWidth={560}
      empty={{
        kind: 'first',
        title: te('activeApplications.title'),
        description: te('activeApplications.body'),
        primaryAction: { label: te('activeApplications.action'), href: jobsHref },
      }}
    />
  );
}
