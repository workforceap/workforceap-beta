'use client';

import type { ReactNode } from 'react';
import {
  Plus,
  ChevronRight,
  TriangleAlert,
  Award,
  UserPlus,
  Briefcase,
} from 'lucide-react';
import NextLink from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  StatusTag,
  RankBars,
  AreaChartMini,
  KpiStrip,
  DataTable,
  type KpiItem,
  type RankDatum,
  type ChartDatum,
  type QueueTone,
  type Column,
  type KitTone,
  type SparkStat,
} from '@/components/portal/kit';
import styles from './CommandCenterKit.module.css';

/**
 * Dense admin overview: a compact metric strip, flat actionable queue rows,
 * and secondary program/system context. Counts and destinations are supplied
 * unchanged by the caller; bulk selection lives in the separate queue client.
 * Measured all-zero placement series get a concise summary, while nonzero
 * series retain their chart. Unverified system checks remain explicitly unknown.
 * Demo defaults below are used only when a caller omits its data props.
 */

/** A single "What needs you today" work-queue row. */
export interface CommandCenterQueueItem {
  id: string;
  /** Legacy presentation input retained for callers; the dense rows omit decorative icon tiles. */
  icon: ReactNode;
  /** Legacy color input; flat rows use neutral surfaces and explicit attention state. */
  iconColor: string;
  title: string;
  detail: string;
  /** Action button label, e.g. "Assign outreach". */
  actionLabel: string;
  /** Explicit attention marker; suppressed for an empty queue. */
  urgent?: boolean;
  /**
   * Optional navigation target for the row's action button. When present the
   * button renders as a link (server-page-friendly); otherwise it falls back
   * to the `onQueueAction` callback. Backward compatible — omit to keep the
   * callback behavior.
   */
  href?: string;
  /** Legacy presentation input retained for caller compatibility. */
  tone?: QueueTone;
  /** Full count; shown before the title when the title does not already include it. */
  count?: number;
}

/**
 * A program health row in the right-hand breakdown.
 *
 * `pct` is the row's share of enrolled students (`PROGRAM_HEALTH_SHARE_LABEL`),
 * never a completion or health score — so leave `tone` unset and let the bar
 * paint the kit's neutral accent. Deriving ok/warn/alert from a share would
 * invent a health threshold this number does not carry, and would contradict
 * `programHealthCaption`, which is printed directly above the bars and says in
 * words that they are not a health score. `tone` stays available for a future
 * caller whose rows really do have a state.
 */
export type ProgramHealthDatum = RankDatum;

/** A KPI value and optional real trend caption. */
export interface CommandCenterKpiItem extends KpiItem {
  /** Legacy icon key retained for callers; compact metrics omit icon tiles. */
  iconKey?: string;
  /** Real delta text is preserved; the separate placements chart owns the trend visualization. */
  spark?: SparkStat;
}

/** One "System health" row (cron/system status). */
export interface CommandCenterSystemHealthRow {
  name: string;
  status: 'ok' | 'warn' | 'unknown';
  /** Small caption, e.g. "2 errors this week" or "Nightly at 2:00 AM". */
  meta?: string;
  /**
   * Chip text override. Default follows `status` (OK / Warn / Not verified);
   * a check this page does not run says so honestly ("Not checked here").
   */
  statusLabel?: string;
  /** Chip tone override; default follows `status`. */
  tone?: KitTone;
  /** Where the row is actually checked, rendered after `meta`. */
  href?: string;
  hrefLabel?: string;
}

/** One row in the optional "Members" roster table. */
export interface CommandCenterMemberRow {
  id: string;
  name: string;
  program: string;
  /** 0–100 course/module completion. */
  progress: number;
  /** Status chip text, e.g. "On track", "At risk". */
  status: string;
  /** Status chip tone. Defaults to 'muted'. */
  statusTone?: KitTone;
  lastActive: string;
}

export interface CommandCenterKitProps {
  /** Date/time shown in the header, e.g. "Tue, Jun 21 · 9:42 AM". */
  dateLabel?: string;
  /** KPI cards across the top. */
  kpis?: CommandCenterKpiItem[];
  /** Prioritized work-queue rows ("What needs you today"). */
  queueItems?: CommandCenterQueueItem[];
  /** Program Health breakdown rows. */
  programHealth?: ProgramHealthDatum[];
  /**
   * One muted line under the "Program health" heading saying what the figure
   * counts and what the bar measures. #2425 (S21) stopped the rows printing
   * "10 · 100%", which read as a completion or health score, but left the
   * remaining count unlabelled; this is the definition that goes with it.
   * Omit to print nothing.
   */
  programHealthCaption?: string;
  /**
   * "Placements trend" area chart. Each datum is one month, e.g.
   * `{ label: 'Jun', value: 90 }`.
   */
  placementsByMonth?: ChartDatum[];
  /** Sub-caption under the "Placements trend" title, e.g. "2026 YTD · 213 total". */
  placementsSubtitle?: string;
  /** Fired when the header "Add Student" button is pressed. */
  onAddStudent?: () => void;
  /**
   * Navigation target for the header "Add Student" button. When present the
   * button renders as a link (server-page-friendly) and takes precedence over
   * `onAddStudent`. Backward compatible — omit to keep the callback behavior.
   */
  addStudentHref?: string;
  /** Fired when a work-queue row's action button is pressed (passes the row id). */
  onQueueAction?: (id: string) => void;
  /** "System health" panel rows (cron/system status). Omit to hide the panel entirely. */
  systemHealth?: CommandCenterSystemHealthRow[];
  /** "Members" roster table rows. Omit/empty to hide the panel entirely. */
  members?: CommandCenterMemberRow[];
  /** Nav target for the Members panel's "View all" link. Defaults to /admin/members. */
  membersHref?: string;
}

/* ---- Defaults pulled straight from the mockup ---------------------------- */

const DEFAULT_KPIS: CommandCenterKpiItem[] = [
  { label: 'Active Students', value: '847', delta: '↑ 32 this month', deltaTone: 'ok' },
  { label: 'Placements YTD', value: '213', delta: '↑ 18 this month', deltaTone: 'ok' },
  { label: 'Completion Rate', value: '71%', delta: 'cohort avg', deltaTone: 'muted' },
  { label: 'Job-Ready Now', value: '64', delta: 'ready to place', deltaTone: 'muted' },
  { label: 'At Risk', value: '19', tone: 'alert', delta: 'need outreach', deltaTone: 'alert' },
];

const DEFAULT_QUEUE: CommandCenterQueueItem[] = [
  {
    id: 'inactive',
    icon: <TriangleAlert size={14} aria-hidden />,
    iconColor: 'var(--wa-accent)',
    title: '5 students inactive 14+ days',
    detail: 'Cloud & IT cohort · likely to drop',
    actionLabel: 'Assign outreach',
    urgent: true,
    count: 5,
  },
  {
    id: 'certifications',
    icon: <Award size={14} aria-hidden />,
    iconColor: 'var(--wa-gold)',
    title: '12 certifications awaiting approval',
    detail: 'Verify proof to count toward outcomes',
    actionLabel: 'Review',
    count: 12,
  },
  {
    id: 'applicants',
    icon: <UserPlus size={14} aria-hidden />,
    iconColor: 'var(--wa-info)',
    title: '8 new applicants need eligibility review',
    detail: 'WIOA screening pending',
    actionLabel: 'Open queue',
    count: 8,
  },
  {
    id: 'placements',
    icon: <Briefcase size={14} aria-hidden />,
    iconColor: 'var(--wa-success)',
    title: '3 placements to confirm',
    detail: 'Employers reported hires',
    actionLabel: 'Confirm',
    count: 3,
  },
];

// "Placements trend" — 2026 YTD area chart (board outcomes panel).
const DEFAULT_PLACEMENTS_BY_MONTH: ChartDatum[] = [
  { label: 'Jan', value: 38 },
  { label: 'Feb', value: 46 },
  { label: 'Mar', value: 55 },
  { label: 'Apr', value: 62 },
  { label: 'May', value: 78 },
  { label: 'Jun', value: 90 },
];

/**
 * Demo-only fallback. Shaped like what the live pages pass: the enrolled
 * count alone, with `pct` the share of enrolled students sizing the bar. No
 * tone — a share is not a state (see `ProgramHealthDatum`).
 */
const DEFAULT_PROGRAM_HEALTH: ProgramHealthDatum[] = [
  { label: 'Cloud & IT', value: '312 enrolled', pct: 37 },
  { label: 'Data & AI', value: '198 enrolled', pct: 23 },
  { label: 'Healthcare', value: '156 enrolled', pct: 18 },
  { label: 'Manufacturing', value: '100 enrolled', pct: 12 },
  { label: 'Skilled Trades', value: '81 enrolled', pct: 10 },
];

/* ---- Small pure helpers ---------------------------------------------------- */

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* ---- Header and work queue ------------------------------------------------ */

interface HeaderProps {
  dateLabel: string;
  onAddStudent?: () => void;
  addStudentHref?: string;
}

function CommandCenterHeader({ dateLabel, onAddStudent, addStudentHref }: HeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className="h-font">Command Center</h1>
      <span className={styles.date}>{dateLabel}</span>
      {addStudentHref ? (
        <AstryxLink href={addStudentHref} as={NextLink as never} color="inherit" isStandalone className={styles.addStudent}>
          <Plus size={16} aria-hidden /> Add student
        </AstryxLink>
      ) : onAddStudent ? (
        <Button label="Add student" variant="primary" size="md" icon={<Plus size={16} aria-hidden />} onClick={onAddStudent} />
      ) : null}
    </header>
  );
}

function WorkQueueRow({ item, onAction }: { item: CommandCenterQueueItem; onAction?: () => void }) {
  const titleCount = item.title.match(/^([\d,]+)\s/)?.[1];
  const titleIncludesCount = titleCount != null && Number(titleCount.replaceAll(',', '')) === item.count;
  return (
    <li className={styles.queueRow}>
      <span className={styles.queueCopy}>
        <span className={styles.queueTitle}>
          {item.urgent && item.count !== 0 ? <StatusDot variant="accent" label="Needs attention" /> : null}
          {item.count != null && !titleIncludesCount ? `${item.count} ` : null}
          {item.title}
        </span>
        <span className={styles.meta}>{item.detail}</span>
      </span>
      {item.href ? (
        <AstryxLink href={item.href} as={NextLink as never} color="inherit" isStandalone className={styles.queueAction}>
          {item.actionLabel}<ChevronRight size={16} aria-hidden />
        </AstryxLink>
      ) : (
        <Button label={item.actionLabel} variant="ghost" size="md" onClick={onAction} />
      )}
    </li>
  );
}

/* ---- Members table columns ------------------------------------------------ */

const memberColumns: Column<CommandCenterMemberRow>[] = [
  {
    key: 'name',
    header: 'Member',
    render: (row) => <span style={{ fontWeight: 700, fontSize: 13 }}>{row.name}</span>,
  },
  {
    key: 'program',
    header: 'Program',
    render: (row) => <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{row.program}</span>,
  },
  {
    key: 'progress',
    header: 'Progress',
    render: (row) => {
      const pct = clampPct(row.progress);
      return (
        <div className="wa-flex wa-items-center wa-gap-2">
          <div className="wa-kit-bar-track" style={{ width: 80 }}>
            <div className="wa-kit-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <span style={{ fontSize: 13, color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        </div>
      );
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusTag tone={row.statusTone ?? 'muted'}>{row.status}</StatusTag>,
  },
  {
    key: 'lastActive',
    header: 'Last active',
    align: 'right',
    render: (row) => (
      <span style={{ fontSize: 13, color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {row.lastActive}
      </span>
    ),
  },
];

/* ---- Main ----------------------------------------------------------------- */

export function CommandCenterKit({
  dateLabel = 'Tue, Jun 21 · 9:42 AM',
  kpis = DEFAULT_KPIS,
  queueItems = DEFAULT_QUEUE,
  programHealth = DEFAULT_PROGRAM_HEALTH,
  programHealthCaption,
  placementsByMonth = DEFAULT_PLACEMENTS_BY_MONTH,
  placementsSubtitle = '2026 YTD',
  onAddStudent,
  addStudentHref,
  onQueueAction,
  systemHealth,
  members,
  membersHref = '/admin/members',
}: CommandCenterKitProps) {
  const hasPlacements = placementsByMonth.some((month) => month.value > 0);
  const metricItems = kpis.map((item) => ({
    label: item.label,
    value: item.value,
    tone: item.tone,
    delta: item.spark?.delta ?? item.delta,
    deltaTone: item.deltaTone,
  }));

  return (
    <DesignSurface surface="dense" className={styles.commandCenter}>
      <CommandCenterHeader dateLabel={dateLabel} onAddStudent={onAddStudent} addStudentHref={addStudentHref} />
      {kpis.length > 0 ? (
        <KpiStrip items={metricItems} cols={kpis.length === 5 ? 5 : kpis.length === 6 ? 6 : 4} className={styles.metrics} />
      ) : null}

      <div className={styles.workspace}>
        <div className={styles.primary}>
          <section aria-labelledby="admin-work-queue-title" className={styles.section}>
            <header className={styles.sectionHeading}>
              <h2 id="admin-work-queue-title">What needs you today</h2>
              <span className={styles.meta}>{queueItems.length} queues</span>
            </header>
            {queueItems.length > 0 ? (
              <ul className={styles.queueList}>
                {queueItems.map((item) => (
                  <WorkQueueRow key={item.id} item={item} onAction={onQueueAction ? () => onQueueAction(item.id) : undefined} />
                ))}
              </ul>
            ) : <p className={styles.meta}>No work queues to display.</p>}
          </section>

          {placementsByMonth.length > 0 ? (
            <section aria-labelledby="admin-placements-title" className={styles.section}>
              <header className={styles.sectionHeading}>
                <h2 id="admin-placements-title">Placements trend</h2>
                <span className={styles.meta}>{placementsSubtitle}</span>
              </header>
              {hasPlacements && placementsByMonth.length > 1 ? (
                <AreaChartMini data={placementsByMonth} id="admin-cc-placements" color="accent" height={132} ariaLabel={`Placements trend, ${placementsSubtitle}`} />
              ) : (
                <p className={styles.meta}>{hasPlacements ? 'More than one month is needed to show a trend.' : 'No placements recorded for this period.'}</p>
              )}
            </section>
          ) : null}
        </div>

        <aside className={styles.context} aria-label="Program and system context">
          <section aria-labelledby="admin-program-health-title" className={styles.section}>
            <header className={styles.sectionHeading}><h2 id="admin-program-health-title">Program health</h2></header>
            {programHealthCaption ? (
              <p className={styles.meta} data-program-health-caption="1" style={{ marginBottom: 10 }}>{programHealthCaption}</p>
            ) : null}
            {programHealth.length > 0 ? <RankBars data={programHealth} /> : <p className={styles.meta}>No program health data available.</p>}
          </section>

          {systemHealth && systemHealth.length > 0 ? (
            <section aria-labelledby="admin-system-health-title" className={styles.section}>
              <header className={styles.sectionHeading}><h2 id="admin-system-health-title">System health</h2></header>
              <ul className={styles.healthList}>
                {systemHealth.map((row) => {
                  const chipLabel = row.statusLabel ?? (row.status === 'ok' ? 'OK' : row.status === 'warn' ? 'Warn' : 'Not verified');
                  const chipTone: KitTone = row.tone ?? (row.status === 'ok' ? 'ok' : row.status === 'warn' ? 'warn' : 'muted');
                  const dotLabel = row.statusLabel
                    ? `${row.name}: ${row.statusLabel}`
                    : row.status === 'ok' ? `${row.name}: no issues detected by this check` : row.status === 'warn' ? `${row.name} needs attention` : `${row.name} not verified`;
                  return (
                    <li key={row.name} className={styles.healthRow}>
                      <span className={styles.healthName}>
                        <StatusDot variant={row.status === 'ok' ? 'success' : row.status === 'warn' ? 'warning' : 'neutral'} label={dotLabel} />
                        {row.name}
                      </span>
                      <StatusTag tone={chipTone}>{chipLabel}</StatusTag>
                      {row.meta || row.href ? (
                        <span className={styles.healthMeta}>
                          {row.meta}
                          {row.href ? (
                            <>
                              {row.meta ? ' · ' : ''}
                              <NextLink href={row.href} className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
                                {row.hrefLabel ?? 'Where it is checked'}
                              </NextLink>
                            </>
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      {members && members.length > 0 ? (
        <section aria-labelledby="admin-members-title" className={styles.section}>
          <header className={styles.sectionHeading}>
            <h2 id="admin-members-title">Members</h2>
            <AstryxLink href={membersHref} as={NextLink as never} isStandalone>View all</AstryxLink>
          </header>
          <DataTable<CommandCenterMemberRow> columns={memberColumns} rows={members} rowKey={(row) => row.id} minWidth={560} emptyTitle="No members yet" />
        </section>
      ) : null}
    </DesignSurface>
  );
}

