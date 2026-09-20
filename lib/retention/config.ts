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
    days: 90,
    description: 'Workflow/email/cron diagnostic logs',
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
