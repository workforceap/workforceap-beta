'use client';

import type { LucideIcon } from 'lucide-react';
import { Briefcase, Users, CalendarClock, Award, ChevronRight, HeartHandshake, SquarePen } from 'lucide-react';
import NextLink from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DataTable,
  DesignSurface,
  PageOpener,
  StatSparkTile,
  StageTrack,
  StatusTag,
  CardHead,
  QueueRow,
  FeatureTile,
  Avatar,
  type Column,
  type KitColor,
  type KitTone,
  type SparkStat,
} from '@/components/portal/kit';

/**
 * Employer Portal — HOME view ("Command Center" redesign).
 *
 * Mirrors the shape of the member "Command Center" (MemberHomeKit) onto the
 * employer persona: open roles, pipeline volume, and the candidate table are
 * the hero — an employer's first question on landing is "who do I need to
 * look at today," not a KPI wall. Layout, top to bottom:
 *   1. Page opener (PageOpener "Hiring" + employer name eyebrow) with a
 *      "Post a role" CTA.
 *   2. A 4-up KPI row: open roles / in pipeline / interviews / hires, each
 *      with an optional sparkline + delta chip.
 *   3. The candidate pipeline table (hero) — avatar/name/role, AI fit score
 *      (when available), a 4-stage tracker (Applied → Screen → Interview →
 *      Offer), and a status pill — alongside a side column with the open
 *      roles queue and a "Community impact" banner (WorkforceAP's 10%
 *      first-year-salary giveback; illustrative/copy-only, no data model).
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
  /** Rows for the "Open roles" side queue. */
  openRolesList?: EmployerOpenRoleItem[];
  /**
   * Illustrative total giveback figure, pre-formatted (e.g. "$15,000").
   * Derived from `hires` at an illustrative $5k/hire (10% of a $50k
   * first-year salary) when omitted — copy/derived only, no data model.
   */
  givebackFigure?: string;
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
function stageForStatus(status: string): { index: number; total: number; color: KitColor } {
  const s = status.toLowerCase();
  if (s === 'hired' || s === 'offered' || s === 'offer') return { index: 4, total: 4, color: 'success' };
  if (s === 'interview' || s === 'interviewing') return { index: 3, total: 4, color: 'gold' };
  if (s === 'reviewing' || s === 'screening') return { index: 2, total: 4, color: 'info' };
  return { index: 1, total: 4, color: 'muted' }; // saved / applied / default
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

/** Illustrative-only giveback total: hires × $50k avg first-year salary × 10%. Copy, not a real figure. */
function illustrativeGiveback(hires: number): string {
  const AVG_FIRST_YEAR_SALARY = 50_000;
  const GIVEBACK_RATE = 0.1;
  const total = Math.round(hires * AVG_FIRST_YEAR_SALARY * GIVEBACK_RATE);
  return `$${total.toLocaleString('en-US')}`;
}

function fitScoreColor(pct: number): string {
  if (pct >= 80) return 'var(--wa-success)';
  if (pct >= 60) return 'var(--wa-gold)';
  return 'var(--wa-muted)';
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
            <div style={{ fontSize: 11, color: 'var(--wa-muted)', fontWeight: 600, marginTop: 1 }}>{row.role}</div>
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
    render: (row) =>
      typeof row.fitScore === 'number' ? (
        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: fitScoreColor(clampPct(row.fitScore)) }}>
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
      return <StageTrack index={stage.index} total={stage.total} color={stage.color} />;
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
            <div style={{ marginTop: 2, fontSize: 12, color: 'var(--wa-muted)' }}>{row.role}</div>
          </div>
        </div>
        <StatusTag tone={statusTagTone(row.status)}>{row.statusLabel ?? titleCase(row.status)}</StatusTag>
      </div>
      <div className="wa-flex wa-items-center wa-justify-between" style={{ marginTop: 10 }}>
        <StageTrack index={stage.index} total={stage.total} color={stage.color} />
        {typeof row.fitScore === 'number' ? (
          <span style={{ fontSize: 11, fontWeight: 800, color: fitScoreColor(clampPct(row.fitScore)), fontVariantNumeric: 'tabular-nums' }}>
            {clampPct(row.fitScore)}% fit
          </span>
        ) : row.appliedLabel ? (
          <span style={{ fontSize: 11, color: 'var(--wa-muted)', fontWeight: 600 }}>{row.appliedLabel}</span>
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
  givebackFigure,
  givebackHref = '/employer/jobs/new',
  postRoleHref = '/employer/jobs/new',
  jobsHref = '/employer/jobs',
  pipelineHref = '/employer/applications',
}: EmployerHomeKitProps) {
  const giveback = givebackFigure ?? illustrativeGiveback(hires);

  const kpiTiles: Array<{ key: string; icon: LucideIcon; label: string; value: number; color: KitColor; spark?: SparkStat }> = [
    { key: 'openRoles', icon: Briefcase, label: 'Open roles', value: openRoles, color: 'accent', spark: openRolesSpark },
    { key: 'pipeline', icon: Users, label: 'In pipeline', value: inPipeline, color: 'info', spark: pipelineSpark },
    { key: 'interviews', icon: CalendarClock, label: 'Interviews', value: interviews, color: 'gold', spark: interviewsSpark },
    { key: 'hires', icon: Award, label: 'Hires', value: hires, color: 'success', spark: hiresSpark },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <div className="wa-space-y-6">
        {/* 1. Page opener — "Hiring" + employer-name eyebrow, with a Post a role CTA. */}
        <PageOpener
          kicker={companyName}
          title="Hiring"
          lede="Open roles, pipeline, and where every candidate stands right now."
          action={
            <AstryxLink href={postRoleHref} as={NextLink as never} isStandalone>
              <Button
                label="Post a role"
                variant="primary"
                size="sm"
                icon={<SquarePen size={14} aria-hidden />}
              />
            </AstryxLink>
          }
        />

        {/* 2. KPI row — icon chip + optional delta chip + sparkline. */}
        <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3">
          {kpiTiles.map((t) => (
            <StatSparkTile key={t.key} icon={<t.icon size={16} />} label={t.label} value={t.value} color={t.color} spark={t.spark} />
          ))}
        </div>

        {/* 3. Hero candidate pipeline table + side column (open roles, impact banner). */}
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-12 wa-gap-4">
          <div className="wa-kit-card lg:wa-col-span-8">
            <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', textWrap: 'balance' }}>Candidate pipeline</h3>
              <a
                href={pipelineHref}
                className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}
              >
                View all{candidates.length > 0 ? ` ${candidates.length}` : ''} &rarr;
              </a>
            </div>
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
          </div>

          <div className="lg:wa-col-span-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <CardHead title="Open roles" linkLabel="Manage" linkHref={jobsHref} />
              {openRolesList.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--wa-muted)', margin: 0 }}>
                  Post a role to start building your pipeline.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {openRolesList.map((item) => (
                    <a key={item.id} href={item.href ?? jobsHref} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <QueueRow
                        tone="blue"
                        icon={<Briefcase size={16} aria-hidden />}
                        title={item.title}
                        meta={
                          item.location
                            ? `${item.applicants} applicant${item.applicants === 1 ? '' : 's'} · ${item.location}`
                            : `${item.applicants} applicant${item.applicants === 1 ? '' : 's'}`
                        }
                        action={<ChevronRight size={16} aria-hidden style={{ color: 'var(--wa-muted)' }} />}
                      />
                    </a>
                  ))}
                </div>
              )}
            </Card>

            <FeatureTile
              icon={<HeartHandshake size={22} aria-hidden />}
              title="Community impact"
              body={
                hires > 0
                  ? `WorkforceAP reinvests 10% of every first-year salary from your hires into scholarships and training for the next cohort — an estimated ${giveback} from your hires so far.`
                  : 'WorkforceAP reinvests 10% of every first-year salary from your hires into scholarships and training for the next cohort.'
              }
              badge="10% GIVEBACK"
              tone="gold"
              href={givebackHref}
            />
          </div>
        </div>
      </div>
    </DesignSurface>
  );
}
