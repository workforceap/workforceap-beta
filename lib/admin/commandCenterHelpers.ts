import type { Prisma } from '@prisma/client';
import type { ApplicantTriageBucket } from '@/lib/admin/applicantTriage';

export type AdminCommandCenterBaseRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
};

export type AdminNeedsReplyRow = AdminCommandCenterBaseRow & {
  threadId: string;
  lastMessageBody: string | null;
  lastMessageAt: Date;
  hoursWaiting: number;
};

export type AdminAtRiskRow = AdminCommandCenterBaseRow & {
  daysInactive: number | null;
  riskScore?: number;
  alertStatus?: string;
  alertId?: string;
  reason?: string;
  enrolledProgram: string | null;
};

export type AdminInterviewingRow = AdminCommandCenterBaseRow & {
  company: string;
  role: string;
  statusLabel: string;
  nextInterviewDate: Date | null;
};

export type ApplicationEmailPacket = {
  subject: string;
  body: string;
  mailto: string;
};

export type AdminApplicationPendingRow = AdminCommandCenterBaseRow & {
  applicationId: string;
  phone: string | null;
  programLabel: string;
  status: 'PENDING' | 'NEEDS_INFO';
  statusLabel: string;
  submittedAt: Date | null;
  submittedDaysAgo: number | null;
  recommendedCareerTitle: string | null;
  emailPacket: ApplicationEmailPacket;
  /** Read-only applicant intake triage (bucket + plain-language reasons); null when it could not be loaded. */
  triage?: { bucket: ApplicantTriageBucket; label: string; reasons: string[] } | null;
};

export type AdminCommandCenterTotals = {
  needsReplyCount: number;
  atRiskCount: number;
  interviewingCount: number;
  /** The workbench population: PENDING + NEEDS_INFO, every live account ({@link adminWorkbenchApplicationsWhere}). */
  applicationsPendingCount: number;
  certificationsPendingCount: number;
  oldestPendingApplicationDays: number | null;
  /**
   * The same applications from member accounts only, split by who moves
   * next: `decision` is PENDING, the Applications rail badge and the admin
   * Today "waiting on your decision" number; `applicant` is NEEDS_INFO
   * (lib/admin/adminApprovalQueue.ts where builders). Absent when the loader
   * did not count them.
   */
  applicationsWaitingOn?: { decision: number; applicant: number };
};

/**
 * One program's enrollment count for the "Program Health" breakdown.
 * `label` is the catalog title (falls back to the raw slug), `count` is the
 * number of enrolled members in that program (scoped to the org). `pct` is
 * that program's share of ALL enrolled students in the org (0–100), so the
 * bars of every listed program add up to at most 100 and a lone program
 * reads "8 enrolled · 100% of enrolled students", never as a completion
 * rate. `shareLabel` names that meaning and `caption` is the ready-to-print
 * value (admin audit 2026-09-20, Command Center: "Program health prints
 * 2 · 100%, share-of-top-program that reads as completion").
 */
export type AdminProgramHealthRow = {
  programSlug: string;
  label: string;
  count: number;
  pct: number;
  /** Denominator of `pct`: every enrolled, non-deleted member in the org. */
  enrolledTotal: number;
  /** What `pct` measures, for captions and screen readers. */
  shareLabel: typeof PROGRAM_HEALTH_SHARE_LABEL;
  /** "8 enrolled · 100% of enrolled students". */
  caption: string;
  /**
   * Set on the one {@link PROGRAM_HEALTH_OTHER_SLUG} row only: how many
   * programs past the limit it folds together. Named program rows omit it.
   */
  hiddenPrograms?: number;
};

export const PROGRAM_HEALTH_SHARE_LABEL = 'share of enrolled students' as const;

/**
 * `programSlug` of the fold row {@link buildProgramHealthRows} appends when
 * the org runs more programs than the breakdown lists. Not a catalog slug:
 * `labelFor` is never asked for it, and nothing links to it.
 */
export const PROGRAM_HEALTH_OTHER_SLUG = 'other-programs' as const;

/** "Other (2 programs)": the label of the fold row. */
export function programHealthOtherLabel(hiddenPrograms: number): string {
  return `Other (${hiddenPrograms} ${hiddenPrograms === 1 ? 'program' : 'programs'})`;
}

/**
 * The definition printed under the Command Center's "Enrollment share by
 * program" heading (renamed from "Program health" — the bars are a share, not
 * a score, and the heading now says so).
 * #2425 (S21) cut the misleading "10 · 100%" from each row but left the bare
 * count unlabelled, so "Program health: 312" still read as a score. The
 * population is the member-only one #2425 settled everywhere
 * (`MEMBER_ONLY_WHERE`: role = member, staff / dogfood / seeded-test accounts
 * out), and the bar is `PROGRAM_HEALTH_SHARE_LABEL`, never a completion rate.
 * Captions and colours only — no number here changes.
 */
export const PROGRAM_HEALTH_CAPTION =
  `Enrolled members per program — member accounts only, staff and test accounts excluded. Each bar is that program's ${PROGRAM_HEALTH_SHARE_LABEL}, not a completion or health score.` as const;

/**
 * Pure projection of a per-program groupBy onto `AdminProgramHealthRow`s.
 * Sorted by count desc; the top `limit` programs are named and every program
 * past the limit is folded into one trailing "Other (N programs)" row
 * ({@link PROGRAM_HEALTH_OTHER_SLUG}), so the listed counts always add up to
 * the org's active-student total and the bars agree with the "Active
 * Students" tile above them (scout D2 2026-09-22: 8 active, five bars
 * summing to 6). When exactly one program would be folded it is named
 * instead — an "Other (1 program)" row costs the same space and says less.
 * The share denominator is the total over EVERY group either way; zero
 * totals give 0%.
 */
export function buildProgramHealthRows(
  grouped: ReadonlyArray<{ programSlug: string | null; count: number }>,
  options: { limit: number; labelFor: (slug: string) => string },
): AdminProgramHealthRow[] {
  const rows = grouped
    .flatMap((group) => (group.programSlug ? [{ programSlug: group.programSlug, count: group.count }] : []))
    .sort((a, b) => b.count - a.count || a.programSlug.localeCompare(b.programSlug));
  const enrolledTotal = rows.reduce((sum, row) => sum + row.count, 0);
  const limit = Math.max(0, options.limit);
  const hidden = rows.length > limit + 1 ? rows.slice(limit) : [];
  const named = hidden.length > 0 ? rows.slice(0, limit) : rows;
  const project = (row: { programSlug: string; count: number; label: string }): AdminProgramHealthRow => {
    const pct = enrolledTotal > 0 ? Math.round((row.count / enrolledTotal) * 100) : 0;
    return {
      ...row,
      pct,
      enrolledTotal,
      shareLabel: PROGRAM_HEALTH_SHARE_LABEL,
      caption: `${row.count} enrolled · ${pct}% of enrolled students`,
    };
  };
  const projected = named.map((row) => project({ ...row, label: options.labelFor(row.programSlug) }));
  if (hidden.length === 0) return projected;
  const hiddenCount = hidden.reduce((sum, row) => sum + row.count, 0);
  return [
    ...projected,
    {
      ...project({ programSlug: PROGRAM_HEALTH_OTHER_SLUG, count: hiddenCount, label: programHealthOtherLabel(hidden.length) }),
      hiddenPrograms: hidden.length,
    },
  ];
}

export const ADMIN_QUEUE_KEYS = ['needs-reply', 'at-risk', 'interviewing', 'applications'] as const;
export type AdminQueueKey = typeof ADMIN_QUEUE_KEYS[number];

/** Rows per page on a focused `/admin/command-center?queue=…` workbench. */
export const ADMIN_QUEUE_PAGE_SIZE = 25;

/**
 * The Applications workbench population (`?queue=applications`): every open
 * application (PENDING + NEEDS_INFO) of a live account in the org. Shared by
 * the workbench loader (lib/admin/commandCenter.ts) and the admin Today queue,
 * which uses it only to work out which workbench page an application sits on.
 */
export function adminWorkbenchApplicationsWhere(orgId: string): Prisma.ApplicationWhereInput {
  return {
    status: { in: ['PENDING', 'NEEDS_INFO'] },
    user: { organizationId: orgId, deletedAt: null },
  };
}

/** Workbench order: oldest submission first (undated first), then creation, then id. */
export function adminWorkbenchApplicationsOrderBy(): Prisma.ApplicationOrderByWithRelationInput[] {
  return [{ submittedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { id: 'asc' }];
}

/**
 * The line under the workbench's "Applications Pending" count (WAP-190), so
 * the Applications badge an admin clicked is on the screen it opens:
 * "3 waiting on your decision · 2 waiting on the applicant · 2 from staff or
 * test accounts". The last part is whatever the member-only split leaves of
 * the workbench total and is left out when that is zero.
 */
export function adminWorkbenchApplicationsSplitCopy(
  workbenchTotal: number,
  waitingOn: { decision: number; applicant: number },
): string {
  const parts = [
    `${waitingOn.decision} waiting on your decision`,
    `${waitingOn.applicant} waiting on the applicant`,
  ];
  const otherAccounts = workbenchTotal - waitingOn.decision - waitingOn.applicant;
  if (otherAccounts > 0) parts.push(`${otherAccounts} from staff or test accounts`);
  return parts.join(' · ');
}

/** `id` prefix of each application card on the workbench, so a link can land on one card. */
export const ADMIN_APPLICATION_CARD_ID_PREFIX = 'application-';

export function adminApplicationCardId(applicationId: string): string {
  return `${ADMIN_APPLICATION_CARD_ID_PREFIX}${applicationId}`;
}
export function normalizeAdminQueueRequest(queue: unknown, page: unknown) {
  const parsedQueue = typeof queue === 'string' && ADMIN_QUEUE_KEYS.includes(queue as AdminQueueKey)
    ? queue as AdminQueueKey : undefined;
  const numericPage = typeof page === 'string' && /^\d+$/.test(page) ? Number(page) : page;
  return { queue: parsedQueue, page: parsedQueue && typeof numericPage === 'number' && Number.isSafeInteger(numericPage) && numericPage > 0
    ? Math.min(numericPage, 100000) : 1 };
}
export function adminQueueHref(queue: AdminQueueKey, page = 1) {
  return `/admin/command-center?queue=${queue}&page=${normalizeAdminQueueRequest(queue, page).page}`;
}

export type AdminCommandCenter = {
  pagination?: { queue: AdminQueueKey; page: number; pageSize: number };
  needsReply: AdminNeedsReplyRow[];
  atRisk: AdminAtRiskRow[];
  interviewing: AdminInterviewingRow[];
  applicationsPending: AdminApplicationPendingRow[];
  programHealth: AdminProgramHealthRow[];
  totals: AdminCommandCenterTotals;
};

export function buildApplicationEmailPacket({
  applicantName,
  applicantEmail,
  programLabel,
  submittedDaysAgo,
  recommendedCareerTitle,
}: {
  applicantName: string;
  applicantEmail: string;
  programLabel: string;
  submittedDaysAgo: number | null;
  recommendedCareerTitle: string | null;
}): ApplicationEmailPacket {
  const firstName = applicantName.trim().split(/\s+/)[0] || 'there';
  const submittedPhrase =
    submittedDaysAgo == null
      ? 'recently'
      : submittedDaysAgo === 0
        ? 'today'
        : `${submittedDaysAgo} ${submittedDaysAgo === 1 ? 'day' : 'days'} ago`;
  const careerLine = recommendedCareerTitle
    ? `\nI also saw ${recommendedCareerTitle} in your career match, so I want to make sure the next step fits where you want to go.\n`
    : '\n';
  const subject = 'Next steps for your WorkforceAP application';
  const body = [
    `Hi ${firstName},`,
    '',
    `I reviewed your WorkforceAP application for ${programLabel}. You sent it ${submittedPhrase}.`,
    careerLine.trim(),
    'The next step is a quick review so we can confirm the right training path and any support you need.',
    '',
    'Can you reply with a good time today or tomorrow for a 10-minute check-in?',
    '',
    'Thanks,',
    'WorkforceAP',
  ].filter(Boolean).join('\n');

  return {
    subject,
    body,
    mailto: `mailto:${encodeURIComponent(applicantEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

/**
 * Derives the headline totals from the loaded buckets. `certificationsPendingCount`
 * is sourced from a cheap org-scoped count (not a row array on `center`, which only
 * tracks a capped per-section slice), so it's passed in explicitly and defaults to 0.
 */
export function bucketCommandCenterTotals(
  center: AdminCommandCenter,
  extras?: { certificationsPendingCount?: number },
): AdminCommandCenterTotals {
  return {
    needsReplyCount: center.needsReply.length,
    atRiskCount: center.atRisk.length,
    interviewingCount: center.interviewing.length,
    applicationsPendingCount: center.applicationsPending.length,
    certificationsPendingCount: extras?.certificationsPendingCount ?? 0,
    oldestPendingApplicationDays: center.applicationsPending.reduce<number | null>((oldest, row) => {
      if (row.submittedDaysAgo == null) return oldest;
      return oldest == null ? row.submittedDaysAgo : Math.max(oldest, row.submittedDaysAgo);
    }, null),
  };
}
