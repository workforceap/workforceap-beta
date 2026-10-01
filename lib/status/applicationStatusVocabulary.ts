import type { KitTone } from '@/components/portal/kit/tokens';

/**
 * One vocabulary for the two review statuses a member carries:
 *
 *  - `Application.status`   (PENDING / APPROVED / DENIED / NEEDS_INFO, prisma/schema.prisma)
 *  - `users.wioaReviewStatus` (pending / in_review / verified / not_eligible / needs_info,
 *    lib/wioa/wioaReview.ts) — the staff intake check, which is NOT a legal WIOA
 *    eligibility determination, so no word here ever says "Eligible".
 *
 * Every surface that turns one of those values into words goes through this
 * module instead of keeping its own map, so the same value reads the same way
 * on the member home, the counselor roster, the admin record and the WIOA
 * screening queue. Two audiences, one meaning:
 *
 *  - `member`: the words WAP-91 / #2471 / #2488 established for the member's
 *    approval-status card (kept verbatim — the member copy is deliberately
 *    soft: a denied application reads "Application closed").
 *  - `staff` (counselor + admin): the enum truth, short enough for a table
 *    pill — "Awaiting decision", "Waiting on applicant", "Approved", "Denied".
 *    Action buttons keep their verbs (Approve / Deny / Request info, "Not a fit").
 *
 * Words live in messages/{en,es,fr,pt}.json under `status.application.<audience>.*`
 * and `status.intake.<audience>.*`. The English words are also kept here so an
 * English-only staff page can label a status without i18n plumbing
 * (`applicationStatusLabel(key, 'staff')`); a localized surface passes the
 * `status`-scoped translator (`useTranslations('status')` / `getTranslations('status')`)
 * and gets the same key resolved in the viewer's locale. A spec pins en.json to
 * these words so the two cannot drift.
 *
 * Tone follows docs/KIT_GUIDE.md §4: denied / not eligible = `danger` (true
 * red, never the brand `alert`), waiting on the applicant = `alert`, waiting on
 * staff = `warn`, in review = `info`, approved / verified = `ok`.
 */

export type StatusAudience = 'member' | 'staff';

/** Who holds the next move for a status. */
export type StatusOwner = 'member' | 'staff' | 'none';

export const APPLICATION_STATUS_KEYS = ['not_submitted', 'pending', 'needs_info', 'approved', 'denied', 'unknown'] as const;
export type ApplicationStatusKey = (typeof APPLICATION_STATUS_KEYS)[number];

export const INTAKE_STATUS_KEYS = ['not_reviewed', 'pending', 'in_review', 'needs_info', 'verified', 'not_eligible', 'unknown'] as const;
export type IntakeStatusKey = (typeof INTAKE_STATUS_KEYS)[number];

export type StatusMeta = { tone: KitTone; owner: StatusOwner };

export const APPLICATION_STATUS: Record<ApplicationStatusKey, StatusMeta> = {
  not_submitted: { tone: 'muted', owner: 'member' },
  pending: { tone: 'warn', owner: 'staff' },
  needs_info: { tone: 'alert', owner: 'member' },
  approved: { tone: 'ok', owner: 'none' },
  denied: { tone: 'danger', owner: 'none' },
  unknown: { tone: 'muted', owner: 'none' },
};

export const INTAKE_STATUS: Record<IntakeStatusKey, StatusMeta> = {
  not_reviewed: { tone: 'muted', owner: 'staff' },
  pending: { tone: 'warn', owner: 'staff' },
  in_review: { tone: 'info', owner: 'staff' },
  needs_info: { tone: 'alert', owner: 'member' },
  verified: { tone: 'ok', owner: 'none' },
  not_eligible: { tone: 'danger', owner: 'none' },
  unknown: { tone: 'muted', owner: 'none' },
};

/** English words, mirrored by `status.application.*` in messages/en.json. */
export const APPLICATION_STATUS_WORDS: Record<StatusAudience, Record<ApplicationStatusKey, string>> = {
  member: {
    not_submitted: 'No application on file',
    pending: 'Pending review',
    needs_info: 'More information requested',
    approved: 'Application approved',
    denied: 'Application closed',
    unknown: 'Status not recorded',
  },
  staff: {
    not_submitted: 'No application on file',
    pending: 'Awaiting decision',
    needs_info: 'Waiting on applicant',
    approved: 'Approved',
    denied: 'Denied',
    unknown: 'Status not recorded',
  },
};

/** English words, mirrored by `status.intake.*` in messages/en.json. */
export const INTAKE_STATUS_WORDS: Record<StatusAudience, Record<IntakeStatusKey, string>> = {
  member: {
    not_reviewed: 'Status not recorded',
    pending: 'Review pending',
    in_review: 'In review',
    needs_info: 'More information requested',
    verified: 'Intake verified by staff',
    not_eligible: 'Staff recorded not eligible',
    unknown: 'Status not recorded',
  },
  staff: {
    not_reviewed: 'Not reviewed',
    pending: 'Awaiting review',
    in_review: 'In review',
    needs_info: 'Needs more information',
    verified: 'Intake verified',
    not_eligible: 'Not eligible',
    unknown: 'Status not recorded',
  },
};

/** `Application.status` (or nothing on file) → vocabulary key. Unknown strings → `unknown`. */
export function applicationStatusKey(status: string | null | undefined): ApplicationStatusKey {
  if (status == null || status === '') return 'not_submitted';
  switch (status) {
    case 'PENDING':
      return 'pending';
    case 'NEEDS_INFO':
      return 'needs_info';
    case 'APPROVED':
      return 'approved';
    case 'DENIED':
      return 'denied';
    default:
      return 'unknown';
  }
}

const INTAKE_COLUMN_VALUES: ReadonlySet<string> = new Set(['pending', 'in_review', 'needs_info', 'verified', 'not_eligible']);

/** `users.wioaReviewStatus` (or null) → vocabulary key. Unknown strings → `unknown`. */
export function intakeStatusKey(status: string | null | undefined): IntakeStatusKey {
  if (status == null || status === '') return 'not_reviewed';
  return INTAKE_COLUMN_VALUES.has(status) ? (status as IntakeStatusKey) : 'unknown';
}

/** A translator scoped to the `status` namespace (`useTranslations('status')`). */
export type StatusTranslate = (key: string) => string;

/**
 * The word for an application status; English unless a `status`-scoped
 * translator is passed, which resolves `application.<audience>.<key>`.
 */
export function applicationStatusLabel(key: ApplicationStatusKey, audience: StatusAudience, t?: StatusTranslate): string {
  return t ? t(`application.${audience}.${key}`) : APPLICATION_STATUS_WORDS[audience][key];
}

/**
 * The word for an intake (WIOA staff review) status; English unless a
 * translator is passed, which resolves `intake.<audience>.<key>`.
 */
export function intakeStatusLabel(key: IntakeStatusKey, audience: StatusAudience, t?: StatusTranslate): string {
  return t ? t(`intake.${audience}.${key}`) : INTAKE_STATUS_WORDS[audience][key];
}

export function applicationStatusTone(key: ApplicationStatusKey): KitTone {
  return APPLICATION_STATUS[key].tone;
}

export function intakeStatusTone(key: IntakeStatusKey): KitTone {
  return INTAKE_STATUS[key].tone;
}
