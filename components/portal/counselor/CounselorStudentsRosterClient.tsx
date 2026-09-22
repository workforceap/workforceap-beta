'use client';

import Link from 'next/link';
import { NO_ACTIVITY_RECORDED_LABEL } from '@/lib/counselor/lastActivity';
import { useMemo, useState, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageSquare } from 'lucide-react';
import type { BadgeVariant } from '@/components/portal/StatusBadge';
import { counselorStudentStatusBadge, counselorStudentStatusBadgeVariant } from '@/lib/counselor/memberStatus';
import { intakeStatusKey, intakeStatusLabel, intakeStatusTone, type IntakeStatusKey } from '@/lib/status/applicationStatusVocabulary';
import { computeTrainingProgress, type LiveTrainingProgressSummary } from '@/lib/member/trainingProgress';
import { programDisplayTitle } from '@/lib/content/programTitle';
import {
  DesignSurface,
  SectionHeader,
  DataTable,
  Avatar,
  StatusTag,
  ProgressBar,
  Toggle,
  KitEmptyState,
  type Column,
  type KitTone,
} from '@/components/portal/kit';

/**
 * Counselor "My students" roster — Command Center redesign.
 *
 * Reskins the roster onto the shared portal kit (DataTable + StatusTag +
 * ProgressBar, --wa-* tokens), modeled on
 * components/portal/kit/pages/admin-subviews/StudentsRosterKit.tsx. All data
 * (rows/filterMeta), URL-driven filter state, and the at-risk-only client
 * toggle are unchanged from the legacy version — only the desktop-table +
 * mobile-card duplication was collapsed into a single responsive DataTable.
 */

/** Must match `THRESHOLDS.MEDIUM` in `lib/member/atRiskScoring.ts` (avoid importing prisma in client). */
const RISK_MEDIUM_OR_ABOVE = 30;

type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type CounselorRosterClientRow = {
  assignmentId: string;
  memberId: string;
  fullName: string | null;
  email: string;
  enrolledProgram: string | null;
  curriculumVersion: string | null;
  programInterest: string | null;
  assessmentScorePct: number | null;
  wioaReviewStatus: string | null;
  memberProgramProgress: LiveTrainingProgressSummary[];
  riskScore: number | null;
  riskLevel: RiskLevel;
  /** ISO timestamp of the last MemberEvent; `null` when none was recorded. */
  lastActivityAt: string | null;
};

export type CounselorRosterFilterMeta = {
  memberId: string;
  atRisk: boolean;
  upcomingSession: boolean;
  pendingApplication: boolean;
};

type FilterKey = 'at-risk' | 'upcoming-session' | 'pending-application' | null;

const FILTER_CHIPS: { key: Exclude<FilterKey, null>; label: string }[] = [
  { key: 'at-risk', label: 'At Risk' },
  { key: 'upcoming-session', label: 'Upcoming Session' },
  { key: 'pending-application', label: 'Pending Application' },
];

/** Same tone-per-severity mapping as RISK_CONFIG in AtRiskDashboard.tsx (accent/gold/info). */
const RISK_TAG: Record<'CRITICAL' | 'HIGH' | 'MEDIUM', { label: string; tone: KitTone }> = {
  CRITICAL: { label: 'Critical', tone: 'alert' },
  HIGH: { label: 'High', tone: 'warn' },
  MEDIUM: { label: 'Medium', tone: 'info' },
};

/** BadgeVariant → KitTone, so shared status helpers (memberStatus.ts) render via StatusTag. */
function variantToTone(variant: BadgeVariant): KitTone {
  switch (variant) {
    case 'success':
      return 'ok';
    case 'warning':
      return 'warn';
    case 'error':
    case 'accent':
      return 'alert';
    case 'info':
      return 'info';
    default:
      return 'muted';
  }
}

function formatLastActivity(iso: string | null): string {
  if (!iso) return NO_ACTIVITY_RECORDED_LABEL;
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'Just now';
  const diffM = Math.floor(diffMs / (60 * 1000));
  if (diffM < 60) return diffM <= 1 ? 'Just now' : `${diffM}m ago`;
  const diffH = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffH < 48) return `${diffH}h ago`;
  const diffD = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return `${diffD}d ago`;
}

/**
 * Why each intake state matters to a counselor. The pill's word and tone come
 * from the shared staff vocabulary (lib/status/applicationStatusVocabulary.ts),
 * so `needs_info` reads "Needs more information" (alert), never "Not eligible".
 */
const WIOA_TOOLTIP: Record<IntakeStatusKey, string> = {
  not_reviewed: "Member hasn't submitted WIOA screening",
  pending: 'Member submitted WIOA screening — awaiting staff review',
  in_review: 'Staff are reviewing the WIOA screening',
  needs_info: 'Staff asked the member for more information before intake can be verified',
  verified: 'Intake verified by staff — the member can enroll in training',
  not_eligible: 'Staff recorded this member as not eligible; training enrollment stays gated',
  unknown: 'WIOA review status is not recognised — check the member record',
};

function wioaBadgeProps(status: string | null | undefined): { label: string; tone: KitTone; tooltip: string } {
  const key = intakeStatusKey(status);
  return { label: intakeStatusLabel(key, 'staff'), tone: intakeStatusTone(key), tooltip: WIOA_TOOLTIP[key] };
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getProgramLabel(enrolledProgram: string | null, programInterest: string | null): string {
  const value = enrolledProgram ?? programInterest;
  if (!value) return '—';
  return programDisplayTitle(value);
}

type Props = {
  rows: CounselorRosterClientRow[];
  filterMeta: CounselorRosterFilterMeta[];
  initialFilter?: string;
};

export default function CounselorStudentsRosterClient({ rows, filterMeta, initialFilter }: Props) {
  const tEmpty = useTranslations('empty');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [atRiskOnly, setAtRiskOnly] = useState(false);

  const activeFilter: FilterKey = useMemo(() => {
    const param = searchParams?.get('filter') ?? initialFilter ?? '';
    if (param === 'at-risk') return 'at-risk';
    if (param === 'upcoming-session') return 'upcoming-session';
    if (param === 'pending-application') return 'pending-application';
    return null;
  }, [searchParams, initialFilter]);

  const updateFilter = useCallback(
    (next: FilterKey) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (next) {
        params.set('filter', next);
      } else {
        params.delete('filter');
      }
      const qs = params.toString();
      if (pathname) router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const metaByMember = useMemo(() => {
    const map = new Map<string, CounselorRosterFilterMeta>();
    for (const m of filterMeta) map.set(m.memberId, m);
    return map;
  }, [filterMeta]);

  const visible = useMemo(() => {
    if (activeFilter === 'at-risk') {
      return rows.filter((r) => r.riskScore != null && r.riskScore >= RISK_MEDIUM_OR_ABOVE);
    }
    if (activeFilter === 'upcoming-session') {
      return rows.filter((r) => metaByMember.get(r.memberId)?.upcomingSession);
    }
    if (activeFilter === 'pending-application') {
      return rows.filter((r) => metaByMember.get(r.memberId)?.pendingApplication);
    }
    if (atRiskOnly) {
      return rows.filter((r) => r.riskScore != null && r.riskScore >= RISK_MEDIUM_OR_ABOVE);
    }
    return rows;
  }, [rows, activeFilter, atRiskOnly, metaByMember]);

  if (rows.length === 0) return null;

  // Rows exist (the page renders its own state for an empty roster) and the
  // chip / toggle matched none of them: `filtered`, with the sentence for the
  // rule that filtered them (KIT_GUIDE §6). The at-risk toggle without a chip
  // reads as the at-risk chip.
  const emptyFiltered = visible.length === 0 && (activeFilter != null || atRiskOnly);
  const emptyGroup =
    activeFilter === 'upcoming-session'
      ? 'rosterUpcomingSession'
      : activeFilter === 'pending-application'
        ? 'rosterPendingApplication'
        : 'rosterAtRisk';
  const clearFilters = () => {
    setAtRiskOnly(false);
    if (activeFilter) updateFilter(null);
  };

  type Row = CounselorRosterClientRow;

  function rowProgress(row: Row): number | null {
    const enrolledSlug = row.enrolledProgram ?? null;
    const progress = computeTrainingProgress({
      enrolledProgram: enrolledSlug,
      curriculumVersion: row.curriculumVersion,
      coursesCompleted: null,
      liveProgress: row.memberProgramProgress,
    });
    return progress.totalCourses > 0 ? progress.pct : null;
  }

  const StudentCell = ({ row }: { row: Row }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Avatar initials={getInitials(row.fullName ?? 'U')} size={32} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.fullName}
        </div>
        <div style={{ fontSize: 13, color: 'var(--wa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.email}
        </div>
      </div>
    </div>
  );

  const ProgressCell = ({ row }: { row: Row }) => {
    const pct = rowProgress(row);
    const enrolledSlug = row.enrolledProgram ?? null;
    if (pct === null) {
      return (
        <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>
          {enrolledSlug ? 'Progress unavailable' : 'Not enrolled'}
        </span>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 72 }}>
          <ProgressBar pct={pct} tone={row.riskLevel === 'LOW' ? 'ok' : 'alert'} aria-label={`${row.fullName} progress ${pct}%`} />
        </div>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--wa-muted)' }}>{pct}%</span>
      </div>
    );
  };

  const RiskCell = ({ row }: { row: Row }) => {
    if (row.riskLevel === 'LOW') return <span style={{ color: 'var(--wa-muted)' }}>—</span>;
    const cfg = RISK_TAG[row.riskLevel];
    return <StatusTag tone={cfg.tone}>{cfg.label}</StatusTag>;
  };

  const ActionsCell = ({ row }: { row: Row }) => {
    const showMessage = row.riskScore != null && row.riskScore >= RISK_MEDIUM_OR_ABOVE;
    if (!showMessage) return <span style={{ color: 'var(--wa-muted)' }}>—</span>;
    return (
      <Link
        href={`/counselor/students/${row.memberId}#counselor-member-messages`}
        className="btn btn-primary btn-sm"
        style={{ whiteSpace: 'nowrap', fontSize: 13 }}
        onClick={(e) => e.stopPropagation()}
      >
        <MessageSquare size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
        Message
      </Link>
    );
  };

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Student', render: (row) => <StudentCell row={row} /> },
    {
      key: 'program',
      header: 'Program',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{getProgramLabel(row.enrolledProgram, row.programInterest)}</span>,
    },
    { key: 'progress', header: 'Progress', render: (row) => <ProgressCell row={row} /> },
    { key: 'risk', header: 'Risk', render: (row) => <RiskCell row={row} /> },
    {
      key: 'wioa',
      header: 'WIOA',
      render: (row) => {
        const wioa = wioaBadgeProps(row.wioaReviewStatus);
        return (
          <span title={wioa.tooltip}>
            <StatusTag tone={wioa.tone}>{wioa.label}</StatusTag>
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const badge = counselorStudentStatusBadge({ enrolledProgram: row.enrolledProgram, assessmentScorePct: row.assessmentScorePct });
        const variant = counselorStudentStatusBadgeVariant({ enrolledProgram: row.enrolledProgram, assessmentScorePct: row.assessmentScorePct });
        return <StatusTag tone={variantToTone(variant)}>{badge.label}</StatusTag>;
      },
    },
    {
      key: 'lastActive',
      header: 'Last active',
      align: 'right',
      render: (row) => (
        <span style={{ color: row.riskLevel !== 'LOW' && row.riskScore != null && row.riskScore >= RISK_MEDIUM_OR_ABOVE ? 'var(--wa-accent)' : 'var(--wa-muted)', fontWeight: row.riskScore != null && row.riskScore >= RISK_MEDIUM_OR_ABOVE ? 700 : 400 }}>
          {formatLastActivity(row.lastActivityAt)}
        </span>
      ),
    },
    { key: 'actions', header: 'Message', align: 'right', render: (row) => <ActionsCell row={row} /> },
  ];

  return (
    <DesignSurface surface="dense">
      <SectionHeader
        title="Active roster"
        kicker="People"
        goal="Sorted by oldest activity first — the members most likely to have gone quiet."
      />

      {/* Filter chips + at-risk-only toggle */}
      <div className="wa-flex wa-flex-col md:wa-flex-row wa-gap-3 md:wa-items-center md:wa-justify-between wa-mb-4">
        <div className="wa-flex wa-flex-wrap wa-items-center wa-gap-2" role="group" aria-label="Roster filters">
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => updateFilter(isActive ? null : chip.key)}
                aria-pressed={isActive}
                className="wa-kit-focus"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 40,
                  padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: isActive ? 'transparent' : 'var(--wa-border)',
                  background: isActive ? 'var(--wa-accent)' : 'var(--wa-surface)',
                  color: isActive ? 'var(--wa-on-accent)' : 'var(--wa-text)',
                }}
              >
                {chip.label}
                {isActive ? <span aria-hidden style={{ opacity: 0.85 }}>×</span> : null}
              </button>
            );
          })}
          {activeFilter && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateFilter(null)} style={{ fontSize: 13 }}>
              Clear
            </button>
          )}
        </div>
        <Toggle checked={atRiskOnly} onChange={setAtRiskOnly} label="At-risk only" />
      </div>

      {emptyFiltered ? (
        <KitEmptyState
          framed
          kind="filtered"
          data-testid="counselor-roster-filtered-empty"
          title={tEmpty(`counselor.${emptyGroup}.title`)}
          description={tEmpty(`counselor.${emptyGroup}.body`)}
          primaryAction={{ label: tEmpty('counselor.rosterFiltered.action'), onClick: clearFilters }}
        />
      ) : (
        <DataTable<Row>
          columns={columns}
          rows={visible}
          rowKey={(row) => row.assignmentId}
          onRowClick={(row) => router.push(`/counselor/students/${row.memberId}`)}
          minWidth={860}
          mobile="cards"
          cardRender={(row) => {
            const pct = rowProgress(row);
            const badge = counselorStudentStatusBadge({ enrolledProgram: row.enrolledProgram, assessmentScorePct: row.assessmentScorePct });
            const badgeVariant = counselorStudentStatusBadgeVariant({ enrolledProgram: row.enrolledProgram, assessmentScorePct: row.assessmentScorePct });
            const wioa = wioaBadgeProps(row.wioaReviewStatus);
            return (
              <div className="wa-kit-card wa-kit-card--sm">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <StudentCell row={row} />
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <StatusTag tone={variantToTone(badgeVariant)}>{badge.label}</StatusTag>
                    <RiskCell row={row} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 13, color: 'var(--wa-muted)', margin: '12px 0 4px' }}>
                  <span style={{ minWidth: 0 }}>{getProgramLabel(row.enrolledProgram, row.programInterest)}</span>
                  <span style={{ whiteSpace: 'nowrap' }} title={wioa.tooltip}>
                    WIOA · <StatusTag tone={wioa.tone}>{wioa.label}</StatusTag>
                  </span>
                </div>
                {pct !== null ? (
                  <ProgressBar pct={pct} tone={row.riskLevel === 'LOW' ? 'ok' : 'alert'} aria-label={`${row.fullName} progress ${pct}%`} />
                ) : null}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>
                    {pct !== null ? `${pct}% complete · ` : ''}
                    {row.lastActivityAt ? `last active ${formatLastActivity(row.lastActivityAt)}` : NO_ACTIVITY_RECORDED_LABEL}
                  </div>
                  <ActionsCell row={row} />
                </div>
              </div>
            );
          }}
          empty={{
            kind: 'filtered',
            title: tEmpty('counselor.rosterFiltered.title'),
            description: tEmpty('counselor.rosterFiltered.body'),
          }}
        />
      )}
    </DesignSurface>
  );
}
