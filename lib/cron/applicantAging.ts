/**
 * Pending-application aging summary for the weekly staff digest (WAP-167).
 * Pure: takes already-loaded applications, returns bucket counts, the oldest
 * rows and the count whose member is already enrolled (so a queue keyed on
 * `applications.status` can be made honest).
 */

export interface ApplicantAgeBucketDef {
  key: string;
  label: string;
  minDays: number;
  /** Inclusive; `Infinity` for the open-ended top bucket. */
  maxDays: number;
}

export const APPLICANT_AGE_BUCKETS: readonly ApplicantAgeBucketDef[] = [
  { key: 'under_7', label: 'Under 7 days', minDays: 0, maxDays: 6 },
  { key: 'days_7_29', label: '7 to 29 days', minDays: 7, maxDays: 29 },
  { key: 'days_30_89', label: '30 to 89 days', minDays: 30, maxDays: 89 },
  { key: 'days_90_plus', label: '90 days or more', minDays: 90, maxDays: Number.POSITIVE_INFINITY },
];

/** Upper bound on rows scanned per run; the digest is a summary, not an export. */
export const APPLICANT_AGING_SCAN_CAP = 1000;

export interface AgingApplicationInput {
  id: string;
  status: string;
  submittedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    fullName: string | null;
    email: string | null;
    courseEnrollments: ReadonlyArray<{ id: string }>;
  };
}

export interface ApplicantAgingSummary {
  total: number;
  buckets: Array<{ key: string; label: string; count: number }>;
  oldest: Array<{
    memberId: string;
    fullName: string | null;
    email: string | null;
    daysWaiting: number;
    status: string;
    alreadyEnrolled: boolean;
  }>;
  enrolledButPending: number;
  oldestDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysWaiting(app: Pick<AgingApplicationInput, 'submittedAt' | 'createdAt'>, now: Date): number {
  const since = app.submittedAt ?? app.createdAt;
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

export function summarizeApplicationAging(
  apps: ReadonlyArray<AgingApplicationInput>,
  now: Date,
  options: { maxNamed?: number } = {},
): ApplicantAgingSummary {
  const maxNamed = options.maxNamed ?? 10;
  const rows = apps
    .map((app) => ({
      memberId: app.user.id,
      fullName: app.user.fullName,
      email: app.user.email,
      daysWaiting: daysWaiting(app, now),
      status: app.status,
      alreadyEnrolled: app.user.courseEnrollments.length > 0,
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);

  const buckets = APPLICANT_AGE_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: rows.filter((row) => row.daysWaiting >= bucket.minDays && row.daysWaiting <= bucket.maxDays).length,
  }));

  return {
    total: rows.length,
    buckets,
    oldest: rows.slice(0, maxNamed),
    enrolledButPending: rows.filter((row) => row.alreadyEnrolled).length,
    oldestDays: rows[0]?.daysWaiting ?? 0,
  };
}
