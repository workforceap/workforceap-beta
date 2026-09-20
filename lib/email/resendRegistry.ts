/**
 * Templates the admin resend route may replay from a stored failure row
 * (WAP-163). A template is replayable only when its wrapper passes
 * `template: { name, params }` to `sendBrandedEmail`, so the stored params are
 * exactly what the wrapper received. Security-sensitive mail (password resets,
 * login codes, one-time links) is deliberately absent: replaying a stored
 * token is worse than the missed email.
 */
import {
  sendAdminPendingApplicantsEmail,
  sendApplicantAgingDigestEmail,
  sendApplicantChaseEmail,
  sendApplicantFollowupEmail,
  sendApplicationAcceptedEmail,
  sendApplicationRejectedEmail,
  sendCourseEnrolledEmail,
  sendCourseKickoffEmail,
  sendEnrollmentConfirmationEmail,
} from '@/lib/email';

export type ResendResult = { ok: boolean; skipped?: boolean; error?: string };

type ParamCheck = { key: string; type: 'string' | 'number' | 'string[]' | 'object[]' };

export interface ResendableTemplate {
  /** Human label for the admin list. */
  label: string;
  /** Params that must be present with the right shape before we replay. */
  required: ParamCheck[];
  send: (params: Record<string, unknown>) => Promise<ResendResult>;
}

const str = (key: string): ParamCheck => ({ key, type: 'string' });

const REGISTRY: Record<string, ResendableTemplate> = {
  applicant_followup: {
    label: 'Applicant Day-3 follow-up',
    required: [str('to'), str('fullName')],
    send: (p) => sendApplicantFollowupEmail(p as Parameters<typeof sendApplicantFollowupEmail>[0]),
  },
  applicant_chase: {
    label: 'Applicant Day-10/20 chase',
    required: [str('to'), str('fullName'), str('stage')],
    send: (p) => sendApplicantChaseEmail(p as Parameters<typeof sendApplicantChaseEmail>[0]),
  },
  admin_pending_applicants: {
    label: 'Staff pending-applications alert',
    required: [{ key: 'pendingCount', type: 'number' }],
    send: (p) => sendAdminPendingApplicantsEmail(p as Parameters<typeof sendAdminPendingApplicantsEmail>[0]),
  },
  applicant_aging_digest: {
    label: 'Staff aging-applications digest',
    required: [{ key: 'to', type: 'string[]' }, { key: 'total', type: 'number' }, { key: 'buckets', type: 'object[]' }, { key: 'oldest', type: 'object[]' }, str('queueLink'), str('memberAdminBaseUrl')],
    send: (p) => sendApplicantAgingDigestEmail(p as unknown as Parameters<typeof sendApplicantAgingDigestEmail>[0]),
  },
  application_accepted: {
    label: 'Application accepted',
    required: [str('to'), str('fullName')],
    send: (p) => sendApplicationAcceptedEmail(p as Parameters<typeof sendApplicationAcceptedEmail>[0]),
  },
  application_rejected: {
    label: 'Application update (denied)',
    required: [str('to'), str('fullName')],
    send: (p) => sendApplicationRejectedEmail(p as Parameters<typeof sendApplicationRejectedEmail>[0]),
  },
  course_kickoff: {
    label: 'Program next steps',
    required: [str('to'), str('fullName'), str('programName')],
    send: (p) => sendCourseKickoffEmail(p as Parameters<typeof sendCourseKickoffEmail>[0]),
  },
  course_enrolled: {
    label: 'Program selection saved',
    required: [str('to'), str('fullName'), str('programName')],
    send: (p) => sendCourseEnrolledEmail(p as Parameters<typeof sendCourseEnrolledEmail>[0]),
  },
  enrollment_confirmation: {
    label: 'Enrollment confirmation',
    required: [str('to'), str('fullName'), str('programName')],
    send: (p) => sendEnrollmentConfirmationEmail(p as Parameters<typeof sendEnrollmentConfirmationEmail>[0]),
  },
};

export const RESENDABLE_TEMPLATE_NAMES: readonly string[] = Object.keys(REGISTRY);

export function getResendableTemplate(name: string | null | undefined): ResendableTemplate | null {
  if (!name) return null;
  return REGISTRY[name] ?? null;
}

function matches(value: unknown, type: ParamCheck['type']): boolean {
  switch (type) {
    case 'string': return typeof value === 'string' && value.trim().length > 0;
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'string[]': return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');
    case 'object[]': return Array.isArray(value) && value.every((v) => v !== null && typeof v === 'object');
    default: return false;
  }
}

/** Returns the first missing/mistyped param key, or null when the payload is replayable. */
export function validateResendParams(template: ResendableTemplate, params: Record<string, unknown>): string | null {
  for (const check of template.required) {
    if (!matches(params[check.key], check.type)) return check.key;
  }
  return null;
}
