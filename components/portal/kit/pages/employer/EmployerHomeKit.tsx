import type { LucideIcon } from 'lucide-react';
import { Briefcase, Users, CalendarClock, Award, SquarePen } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import {
  DataTable,
  DesignSurface,
  PageOpener,
  StatSparkTile,
  StageTrack,
  StatusTag,
  Avatar,
  type Column,
  type KitColor,
  type KitTone,
  type SparkStat,
} from '@/components/portal/kit';
import {
  StaffCard,
  StaffDisclosure,
  StaffEmpty,
  StaffKpiGroup,
  StaffLead,
  StaffSplit,
  StaffTaskList,
  StaffTaskRow,
  staffLinkClass,
  staffWelcomeTitle,
} from '../StaffKit';

/**
 * Employer Portal — HOME view ("Command Center" redesign).
 *
 * Mirrors the shape of the member "Command Center" (MemberHomeKit) onto the
 * employer persona: open roles, pipeline volume, and the candidate table are
 * the hero — an employer's first question on landing is "who do I need to
 * look at today," not a KPI wall. Layout, top to bottom:
 *   1. Page opener: "Welcome back, {first name}." (or "Hiring" when the page
 *      has no first name) + one sentence from the counts, with a
 *      "Post a role" CTA.
 *   2. A 4-up KPI strip: open roles / in pipeline / interviews / hires, flat
 *      hairline tiles with an optional 1.5px accent sparkline + delta chip.
 *   3. The candidate pipeline table (hero) — avatar/name/role, AI fit score
 *      (when available), a 4-stage tracker (Applied → Screen → Interview →
 *      Offer), and a status pill — alongside a side column with the open
 *      roles queue and a "Community impact" card (WorkforceAP's 10%
 *      first-year-salary giveback). The card states the policy in one line and
 *      keeps where it goes in a disclosure; it names a dollar figure only when
 *      the caller passes a real one (WAP-210).
 *
 * All data is optional/degrading: every prop has a safe default so the page
 * renders sensibly with zero live data (new employer, empty pipeline) and
 * gracefully upgrades as fit scores / sparklines become available upstream.
 *
 * Target route: app/(portal)/employer (default `ui !== 'legacy'` path).
 * Surface: dense (staff/employer-facing, matches the shipped v2 kit path).
 */

/** One row of the candidate pipeline table/cards. */
export interface EmployerCandidateRow {
  id: string;
  name: string;
  role: string;
  /** 0–100 AI fit score, already normalized (e.g. via matchScoreAsPercent upstream). Omit to render "—". */
  fitScore?: number;
  /**
   * Raw pipeline status driving the stage tracker + pill, e.g. 'saved',
   * 'applied', 'reviewing', 'screening', 'interview', 'offered', 'hired',
   * 'rejected'. Unrecognized values fall back to the "Applied" stage.
   */
  status: string;
  /** Human label override for the status pill; derived (title-cased) from `status` when omitted. */
  statusLabel?: string;
  /** Short applied-date label, e.g. "Jul 1". */
  appliedLabel?: string;
  href?: string;
}

/** One row of the "Open roles" side queue. */
export interface EmployerOpenRoleItem {
  id: string;
  title: string;
  applicants: number;
  location?: string;
  href?: string;
}

export interface EmployerHomeKitProps {
  /** Person-facing greeting: "Welcome back, {firstName}." Omit it and the heading stays "Hiring". */
  firstName?: string;
  /** Already-translated "Welcome back, {firstName}." for pages that localize; English fallback when omitted. */
  welcomeTitle?: string;
  companyName?: string;
  /** Count of currently-live job postings. */
  openRoles?: number;
  /** Sparkline + delta chip for the open-roles tile. Omit to hide both. */
  openRolesSpark?: SparkStat;
  /** Total candidates across every stage. */
  inPipeline?: number;
  pipelineSpark?: SparkStat;
  /** Candidates currently at (or past) the interview stage. */
  interviews?: number;
  interviewsSpark?: SparkStat;
  /** Total hires. */
  hires?: number;
  hiresSpark?: SparkStat;
  /** Rows for the hero candidate pipeline table. */
  candidates?: EmployerCandidateRow[];
  /**
   * How many candidates "View all" opens (the full applications list). The
   * table shows only the newest few, so its row count is never used as this
   * number (WAP-210); omit it and the link carries no count.
   */
  candidatesTotal?: number;
  /** Rows for the "Open roles" side queue. */
  openRolesList?: EmployerOpenRoleItem[];
  /**
   * A real giveback total from this employer's hires, pre-formatted (e.g.
   * "$15,000"). There is no data model for it yet, so production passes
   * nothing and the banner states the 10% policy without a number. It used to
   * fall back to hires × $50k × 10%, an invented figure shown as the
   * employer's own (WAP-210).
   */
  givebackFigure?: string;
  /** Localized disclosure summary supplied by the route; direct kit consumers use English. */
  whereItGoesLabel?: string;
  /**
   * Accepted for callers that still pass it. The Community impact card no
   * longer links anywhere (it was a whole-tile link to the post-a-role form,
   * which the header action already is).
   */
  givebackHref?: string;
  postRoleHref?: string;
  jobsHref?: string;
  /** "View all" href for the candidate pipeline table (defaults to the applications list). */
  pipelineHref?: string;
}

/* ---------------------------------------------------------------------- */
/* Small pure helpers                                                      */
/* ---------------------------------------------------------------------- */

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Two-letter initials from a full name for the candidate avatar. */
function kitInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Applied → Screen → Interview → Offer (4-stage tracker). Unknown statuses land on "Applied". */
function stageForStatus(status: string): { index: number; total: number; tone: KitTone } {
  const s = status.toLowerCase();
  if (s === 'hired' || s === 'offered' || s === 'offer') return { index: 4, total: 4, tone: 'ok' };
  if (s === 'interview' || s === 'interviewing') return { index: 3, total: 4, tone: 'warn' };
  if (s === 'reviewing' || s === 'screening') return { index: 2, total: 4, tone: 'info' };
  return { index: 1, total: 4, tone: 'muted' }; // saved / applied / default
}

/** Status pill tone — mirrors the tone convention used across the rest of the employer portal. */
function statusTagTone(status: string): KitTone {
  const s = status.toLowerCase();
  if (s === 'hired') return 'ok';
  if (s === 'rejected' || s === 'declined' || s === 'withdrawn') return 'alert';
  if (s === 'offered' || s === 'interview' || s === 'interviewing') return 'info';
  if (s === 'reviewing' || s === 'screening') return 'warn';
  return 'muted';
}

/* ---------------------------------------------------------------------- */
/* Candidate table                                                         */
/* ---------------------------------------------------------------------- */

const candidateColumns: Column<EmployerCandidateRow>[] = [
  {
    key: 'candidate',
    header: 'Candidate',
    render: (row) => {
      const inner = (
        <div className="wa-flex wa-items-center wa-gap-3">
          <Avatar initials={kitInitials(row.name)} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--wa-text)' }}>{row.name}</div>
            <div style={{ fontSize: 13, color: 'var(--wa-muted)', fontWeight: 600, marginTop: 1 }}>{row.role}</div>
          </div>
        </div>
      );
      return row.href ? (
        <a href={row.href} style={{ textDecoration: 'none', color: 'inherit' }}>
          {inner}
        </a>
      ) : (
        inner
      );
    },
  },
  {
    key: 'fit',
    header: 'Fit',
    align: 'right',
    numeric: true,
    render: (row) =>
      typeof row.fitScore === 'number' ? (
        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--wa-text)' }}>
          {clampPct(row.fitScore)}%
        </span>
      ) : (
        <span style={{ color: 'var(--wa-muted)' }}>—</span>
      ),
  },
  {
    key: 'stageTrack',
    header: 'Stage',
    render: (row) => {
      const stage = stageForStatus(row.status);
      return <StageTrack index={stage.index} total={stage.total} tone={stage.tone} />;
    },
  },
  {
    key: 'status',
    header: 'Status',
    align: 'right',
    render: (row) => <StatusTag tone={statusTagTone(row.status)}>{row.statusLabel ?? titleCase(row.status)}</StatusTag>,
  },
];

function candidateCard(row: EmployerCandidateRow) {
  const stage = stageForStatus(row.status);
  const content = (
    <Card padding={3}>
      <div className="wa-flex wa-items-start wa-justify-between wa-gap-3">
        <div className="wa-flex wa-items-center wa-gap-3" style={{ minWidth: 0 }}>
          <Avatar initials={kitInitials(row.name)} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--wa-text)' }}>{row.name}</div>
            <div style={{ marginTop: 2, fontSize: 13, color: 'var(--wa-muted)' }}>{row.role}</div>
          </div>
        </div>
        <StatusTag tone={statusTagTone(row.status)}>{row.statusLabel ?? titleCase(row.status)}</StatusTag>
      </div>
      <div className="wa-flex wa-items-center wa-justify-between" style={{ marginTop: 10 }}>
        <StageTrack index={stage.index} total={stage.total} tone={stage.tone} />
        {typeof row.fitScore === 'number' ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--wa-text)', fontVariantNumeric: 'tabular-nums' }}>
            {clampPct(row.fitScore)}% fit
          </span>
        ) : row.appliedLabel ? (
          <span style={{ fontSize: 13, color: 'var(--wa-muted)', fontWeight: 600 }}>{row.appliedLabel}</span>
        ) : null}
      </div>
    </Card>
  );
  return row.href ? (
    <a href={row.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {content}
    </a>
  ) : (
    content
  );
}

/* ---------------------------------------------------------------------- */
/* Main component                                                          */
/* ---------------------------------------------------------------------- */

export function EmployerHomeKit({
  firstName,
  welcomeTitle,
  companyName = 'Your company',
  openRoles = 0,
  openRolesSpark,
  inPipeline = 0,
  pipelineSpark,
  interviews = 0,
  interviewsSpark,
  hires = 0,
  hiresSpark,
  candidates = [],
  openRolesList = [],
  candidatesTotal,
  givebackFigure,
  whereItGoesLabel = 'Where it goes',
  postRoleHref = '/employer/jobs/new',
  jobsHref = '/employer/jobs',
  pipelineHref = '/employer/applications',
}: EmployerHomeKitProps) {

  const kpiTiles: Array<{ key: string; icon: LucideIcon; label: string; value: number; spark?: SparkStat }> = [
    { key: 'openRoles', icon: Briefcase, label: 'Open roles', value: openRoles, spark: openRolesSpark },
    { key: 'pipeline', icon: Users, label: 'In pipeline', value: inPipeline, spark: pipelineSpark },
    { key: 'interviews', icon: CalendarClock, label: 'Interviews', value: interviews, spark: interviewsSpark },
    { key: 'hires', icon: Award, label: 'Hires', value: hires, spark: hiresSpark },
  ];

  // One sentence from the counts the page already holds; an empty account gets the existing empty-state line.
  const headerSentence =
    openRoles === 0 && inPipeline === 0
      ? `${companyName}. Post a role to start building your pipeline.`
      : `${companyName}: ${plural(openRoles, 'open role')} and ${plural(inPipeline, 'candidate')} in your pipeline.`;

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <div className="wa-space-y-6">
        {/* 1. Header: greeting (or title) + one contextual sentence + right-aligned primary action. */}
        <PageOpener
          title={firstName ? (welcomeTitle ?? staffWelcomeTitle(firstName)) : 'Hiring'}
          meta={headerSentence}
          action={
            /* `tour-post-job`: step 2 of the employer guided tour (lib/tours/registry.ts). */
            <span data-tour="tour-post-job" style={{ display: 'inline-flex' }}>
              <KitLinkButton
                href={postRoleHref}
                label="Post a role"
                variant="primary"
                size="sm"
                icon={<SquarePen size={14} aria-hidden />}
              />
            </span>
          }
        />

        {/* 2. KPI strip: muted inline icon, optional delta chip and 1.5px accent sparkline. */}
        <StaffKpiGroup cols={4}>
          {kpiTiles.map((t) => (
            <StatSparkTile key={t.key} icon={<t.icon size={16} />} label={t.label} value={t.value} spark={t.spark} />
          ))}
        </StaffKpiGroup>

        {/* 3. Candidate pipeline (main) + open roles and impact (right rail). */}
        <StaffSplit
          main={
            <StaffCard
              id="employer-candidate-pipeline"
              title="Candidate pipeline"
              action={
                <a href={pipelineHref} className={staffLinkClass}>
                  View all{typeof candidatesTotal === 'number' && candidatesTotal > 0 ? ` ${candidatesTotal}` : ''} &rarr;
                </a>
              }
            >
              <DataTable<EmployerCandidateRow>
                columns={candidateColumns}
                rows={candidates}
                rowKey={(row) => row.id}
                mobile="cards"
                cardRender={candidateCard}
                minWidth={560}
                emptyTitle="No candidates yet"
                emptyDescription="New job applications will appear here as candidates enter the pipeline."
              />
            </StaffCard>
          }
          rail={
            <>
              <StaffCard
                id="employer-open-roles"
                title="Open roles"
                flush
                action={<a href={jobsHref} className={staffLinkClass}>Manage</a>}
              >
                {openRolesList.length === 0 ? (
                  <StaffEmpty>Post a role to start building your pipeline.</StaffEmpty>
                ) : (
                  <StaffTaskList label="Open roles">
                    {openRolesList.map((item) => (
                      <StaffTaskRow
                        key={item.id}
                        tone="blue"
                        title={<a href={item.href ?? jobsHref} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>{item.title}</a>}
                        subline={
                          item.location
                            ? `${item.applicants} applicant${item.applicants === 1 ? '' : 's'} · ${item.location}`
                            : `${item.applicants} applicant${item.applicants === 1 ? '' : 's'}`
                        }
                      />
                    ))}
                  </StaffTaskList>
                )}
              </StaffCard>

              <StaffCard id="employer-community-impact" title="Community impact">
                <StaffLead>WorkforceAP reinvests 10% of every first-year salary from your hires.</StaffLead>
                <StaffDisclosure label={whereItGoesLabel}>
                  <p>
                    {hires > 0 && givebackFigure
                      ? `It funds scholarships and training for the next cohort, an estimated ${givebackFigure} from your hires so far.`
                      : 'It funds scholarships and training for the next cohort.'}
                  </p>
                </StaffDisclosure>
              </StaffCard>
            </>
          }
        />
      </div>
    </DesignSurface>
  );
}
