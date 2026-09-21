/**
 * Data retention policy configuration.
 *
 * Defines how long each category of log/telemetry data is kept before
 * automated cleanup hard-deletes it. Member data (users, profiles,
 * enrollments, etc.) is NEVER auto-deleted by the cleanup job — only
 * log-like tables and no-account lead rows (WAP-172) are in scope.
 *
 * GDPR right-to-erasure is handled separately via the admin erase endpoint.
 *
 * AUDIT-2026-05-16 §H-B1 + PLAN-2026-Q3 §P4: WIOA participant records
 * (eligibility, placement, fund changes, exports, retention surveys)
 * require a 3-year retention window under 20 CFR 677 / §116. As of
 * Sprint P4 the audit log default is itself bumped to 3 years so that
 * federal-funding auditors see a consistent trail across every audit row,
 * not just the prefix-matched subset. CRITICAL_AUDIT_ACTION_PREFIXES is
 * preserved for forward-compat — a future bucket needing an even longer
 * hold (e.g. 7-year fraud trail) can opt in via CRITICAL_AUDIT_RETENTION_DAYS
 * without touching the default sweep. Today the two windows are equal.
 */

export type RetentionTableConfig = {
  /** Prisma model name (camelCase) */
  model: string;
  /** Date column to compare against retention period */
  dateColumn: string;
  /** Retention period in days */
  days: number;
  /** Human-readable description */
  description: string;
};

export const RETENTION_BATCH_SIZE = 1000;

/**
 * Audit-log `action` prefixes that must be retained for ≥ 3 years for
 * federal grant compliance (WIOA §116, 20 CFR 677). Match is by
 * `startsWith` so a single prefix covers families (e.g. `wioa.` covers
 * `wioa.review.status_change`, `wioa.export`, etc).
 *
 * The cleanup job uses this list to skip rows whose `action` matches
 * any prefix here. Keep entries short and stable — once a row is
 * retained, do not remove its prefix from this list without a
 * compliance review.
 */
export const CRITICAL_AUDIT_ACTION_PREFIXES: readonly string[] = [
  'wioa.',
  'admin.export.',
  'admin.report.',
  'placement.',
  'funding.',
  'employer.approve',
  'employer.reject',
  'invitation.create',
  'role.change',
  'member.gdpr_erase',
];

/**
 * Default retention period for the audit_logs table.
 *
 * PLAN-2026-Q3 §P4: bumped from 90d → 3y so the entire audit trail meets
 * the WIOA federal-funding standard, not just the prefix-matched subset.
 * 365 * 3 + 1 = include a one-day buffer for leap-year drift.
 */
export const RETENTION_AUDIT_DAYS = 365 * 3 + 1;

/*
 * Critical-prefix audit rows currently share RETENTION_AUDIT_DAYS. When an
 * "extended hold" bucket (fraud trail, litigation hold) is wanted, add a
 * distinct constant here and switch lib/retention/cleanup.ts to it.
 */

/**
 * WAP-172: answers from people who screened without an account (the public
 * WIOA self-screening page and the tokenized questionnaire) live in
 * `public_wioa_screenings`, which has no user foreign key and so no erasure
 * path of its own. They are purged on this TTL. Within the "up to 12 months"
 * band the privacy policy gives application logs (§7).
 */
export const PUBLIC_LEAD_RETENTION_DAYS = 180;

/**
 * WAP-17: `workflow_diagnostics` is the largest table in production (13,558
 * rows on 2026-09-18, oldest 2026-06-11) and it was the only log-like table
 * without a window short enough to matter, while `cron_executions` next to it
 * is trimmed at 30 days. The cron-enable lookup used to scan the whole
 * workflow's rows on every tick (17,844 calls at 152 ms mean), so the table's
 * size was directly competing with request traffic for the pool. The issue
 * asks for a 30-60 day pass.
 *
 * The window is env-driven with a default of 90 (the pre-WAP-17 value) rather
 * than a hard 60, on purpose: the first cleanup run after a hard cut would
 * delete every row in the 60-90 day band in one pass, and those rows are the
 * only record of the 818 lost emails until scripts/snapshot-email-failures.ts
 * has demonstrably run in production. Operator sequence: run the snapshot,
 * confirm the rows landed in `email_failure_snapshots`, then set
 * WORKFLOW_DIAGNOSTIC_RETENTION_DAYS=60 in Vercel. Anything that is not a
 * positive integer falls back to 90 so a typo can never widen the purge.
 */
export const DEFAULT_WORKFLOW_DIAGNOSTIC_RETENTION_DAYS = 90;

export function resolveWorkflowDiagnosticRetentionDays(
  raw: string | undefined = process.env.WORKFLOW_DIAGNOSTIC_RETENTION_DAYS,
): number {
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw.trim())) {
    return DEFAULT_WORKFLOW_DIAGNOSTIC_RETENTION_DAYS;
  }
  return Number(raw.trim());
}

export const WORKFLOW_DIAGNOSTIC_RETENTION_DAYS = resolveWorkflowDiagnosticRetentionDays();

/**
 * `email_failure_snapshots` outlives the diagnostics window it was copied
 * from (WORKFLOW_DIAGNOSTIC_RETENTION_DAYS). Shortening or lengthening that
 * source window is a separate decision from this one.
 */
export const EMAIL_FAILURE_SNAPSHOT_RETENTION_DAYS = 365;

/**
 * WAP-33: `coursera_xapi_events` rows whose actor never resolved to a member
 * (`matched_user_id IS NULL`, `completion_status = 'unmatched'`). On
 * 2026-09-10 they were 4,211 of 6,371 rows (66%), the newest from 2026-09-03
 * and only 2 in the prior 14 days — a historical backlog, not a live leak.
 *
 * These rows are the ONLY replay handle for a late-matching learner: unmatched
 * ingest marks the `xapi_statements` row processed
 * (lib/xapi/inboundStatementPipeline.ts finishUnmatched), and both replay
 * paths that can still credit the member — `reprocessUnmatchedXapiEvents`
 * (admin "map identity" button) and `autoHealUnmatchedXapiEvents` (hourly
 * coursera-auto-heal cron) in lib/xapi/reprocess.ts — select from
 * `coursera_xapi_events` with no age bound. So the window matches the
 * `xapiStatement` window (365 days) rather than 90, and the purge additionally
 * skips any row whose `LOWER(actor_email)` matches a live `users.email`: a
 * member who enrols after doing Coursera work keeps their credit until the
 * next replay picks it up, however old the event.
 *
 * The table has no Prisma model (lib/xapi/mappings.ts creates it at runtime),
 * so `lib/retention/cleanup.ts` purges it with raw SQL rather than through
 * RETENTION_TABLES. Env-overridable like WORKFLOW_DIAGNOSTIC_RETENTION_DAYS;
 * anything that is not a positive integer falls back to the default so a typo
 * can never widen the purge.
 */
export const DEFAULT_UNMATCHED_XAPI_EVENT_RETENTION_DAYS = 365;

export function resolveUnmatchedXapiEventRetentionDays(
  raw: string | undefined = process.env.UNMATCHED_XAPI_EVENT_RETENTION_DAYS,
): number {
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw.trim())) {
    return DEFAULT_UNMATCHED_XAPI_EVENT_RETENTION_DAYS;
  }
  return Number(raw.trim());
}

export const UNMATCHED_XAPI_EVENT_RETENTION_DAYS = resolveUnmatchedXapiEventRetentionDays();

/** Report label for the raw-SQL purge, alongside the RETENTION_TABLES model names. */
export const UNMATCHED_XAPI_EVENT_RETENTION_LABEL = 'coursera_xapi_events (unmatched)';

/**
 * WAP-36 phase 2 prep: `csp_violation_buckets` holds hourly aggregates of the
 * browser CSP violation reports posted to `/api/csp-report` (count per
 * directive + blocked host + redacted document path + disposition). The rows
 * exist to triage the Report-Only soak in `/admin/csp-report` before the
 * enforce flip, so a rolling month is all the viewer needs; the same window
 * as `cron_executions` keeps the table from ever growing unbounded (WAP-17).
 * `hour_bucket` is the purge column so a bucket is dropped once its hour is
 * older than the window, whatever its first/last-seen timestamps say.
 */
export const CSP_VIOLATION_BUCKET_RETENTION_DAYS = 30;

export const RETENTION_TABLES: RetentionTableConfig[] = [
  {
    model: 'auditLog',
    dateColumn: 'createdAt',
    days: RETENTION_AUDIT_DAYS,
    description: 'Admin action audit trail (3y minimum for WIOA / 20 CFR 677 compliance — see RETENTION_AUDIT_DAYS)',
  },
  {
    model: 'xapiStatement',
    dateColumn: 'createdAt',
    days: 365,
    description: 'LRS/xAPI learning statements',
  },
  {
    model: 'cronExecution',
    dateColumn: 'createdAt',
    days: 30,
    description: 'Cron job execution records',
  },
  {
    model: 'webhookEvent',
    dateColumn: 'createdAt',
    days: 90,
    description: 'Webhook delivery events',
  },
  {
    model: 'memberEvent',
    dateColumn: 'createdAt',
    days: 365,
    description: 'Member activity events',
  },
  {
    model: 'workflowDiagnostic',
    dateColumn: 'createdAt',
    days: WORKFLOW_DIAGNOSTIC_RETENTION_DAYS,
    description:
      'Workflow/email/cron diagnostic logs (WORKFLOW_DIAGNOSTIC_RETENTION_DAYS, default 90 — WAP-17 targets 60 once the email-failure snapshot has run)',
  },
  {
    model: 'emailSendLog',
    dateColumn: 'createdAt',
    days: 365,
    description: 'Email send log — one row per provider send with delivery events from the Resend webhook',
  },
  {
    model: 'portalWorkflowEvent',
    dateColumn: 'createdAt',
    days: 90,
    description: 'Portal workflow activity events',
  },
  {
    model: 'publicWioaScreening',
    dateColumn: 'createdAt',
    days: PUBLIC_LEAD_RETENTION_DAYS,
    description: 'No-account eligibility leads (public WIOA screening + tokenized questionnaire answers) — WAP-172 TTL',
  },
  {
    model: 'emailFailureSnapshot',
    dateColumn: 'snapshotAt',
    days: EMAIL_FAILURE_SNAPSHOT_RETENTION_DAYS,
    description: 'Preserved copy of email_send failure diagnostics (evidence for the 2026 delivery failures; scripts/snapshot-email-failures.ts)',
  },
  {
    model: 'cspViolationBucket',
    dateColumn: 'hourBucket',
    days: CSP_VIOLATION_BUCKET_RETENTION_DAYS,
    description: 'Hourly aggregates of CSP violation reports from /api/csp-report (WAP-36 soak triage; redacted paths and hosts only, no URLs, IPs or user agents)',
  },
];


/** Soft-deleted users are hard-deleted after this many days. */
export const DELETED_ACCOUNT_RETENTION_DAYS = 30;

/** Returns the cutoff Date for a given retention period. */
export function getCutoffDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}
