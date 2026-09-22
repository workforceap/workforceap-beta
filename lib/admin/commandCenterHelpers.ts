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
  applicationsPendingCount: number;
  certificationsPendingCount: number;
  oldestPendingApplicationDays: number | null;
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
};

export const PROGRAM_HEALTH_SHARE_LABEL = 'share of enrolled students' as const;

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
 * Sorted by count desc, cut to `limit`; the share denominator is the total
 * over EVERY group (not only the listed ones), so a long tail of small
 * programs still counts against the leaders. Zero totals give 0%.
 */
export function buildProgramHealthRows(
  grouped: ReadonlyArray<{ programSlug: string | null; count: number }>,
  options: { limit: number; labelFor: (slug: string) => string },
): AdminProgramHealthRow[] {
  const rows = grouped
    .flatMap((group) => (group.programSlug ? [{ programSlug: group.programSlug, count: group.count }] : []))
    .sort((a, b) => b.count - a.count || a.programSlug.localeCompare(b.programSlug));
  const enrolledTotal = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.slice(0, Math.max(0, options.limit)).map((row) => {
    const pct = enrolledTotal > 0 ? Math.round((row.count / enrolledTotal) * 100) : 0;
    return {
      ...row,
      label: options.labelFor(row.programSlug),
      pct,
      enrolledTotal,
      shareLabel: PROGRAM_HEALTH_SHARE_LABEL,
      caption: `${row.count} enrolled · ${pct}% of enrolled students`,
    };
  });
}

export const ADMIN_QUEUE_KEYS = ['needs-reply', 'at-risk', 'interviewing', 'applications'] as const;
export type AdminQueueKey = typeof ADMIN_QUEUE_KEYS[number];
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
