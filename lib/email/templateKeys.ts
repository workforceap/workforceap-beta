/**
 * Stable template keys for the email send log (`EmailSendLog.templateKey`).
 *
 * The 2026-09-20 delivery audit had to classify 818 failed sends by regex on
 * the subject line because nothing recorded which template produced a row.
 * A wrapper in lib/email.ts names its template once here; the key lands on
 * every send-log row and in the default dedupe key, so the same message to
 * the same recipient on the same day is one row, not N.
 *
 * Keys that are also in lib/email/resendRegistry.ts reuse that registry's
 * name verbatim (`template.name`), so a failed row and its send-log row agree.
 * Pure constants — no I/O.
 */
export const EMAIL_TEMPLATE_KEYS = {
  // Applicant lifecycle
  application_received: 'application_received',
  applicant_followup: 'applicant_followup',
  applicant_chase: 'applicant_chase',
  application_accepted: 'application_accepted',
  application_rejected: 'application_rejected',
  pre_screening_ready: 'pre_screening_ready',
  // Enrollment + courses
  enrollment_confirmation: 'enrollment_confirmation',
  course_enrolled: 'course_enrolled',
  course_kickoff: 'course_kickoff',
  course_accountability: 'course_accountability',
  course_completed: 'course_completed',
  cert_celebration: 'cert_celebration',
  milestone_cascade: 'milestone_cascade',
  // Re-engagement + digests to members
  member_weekly_recap: 'member_weekly_recap',
  inactive_nudge: 'inactive_nudge',
  job_alert_digest: 'job_alert_digest',
  placement_survey: 'placement_survey',
  // AI artifacts a member asked for
  ai_elevator_speech: 'ai_elevator_speech',
  voice_coach_transcript: 'voice_coach_transcript',
  voice_coach_artifact: 'voice_coach_artifact',
  voice_interview_transcript: 'voice_interview_transcript',
  // Staff / partner / employer
  admin_new_application: 'admin_new_application',
  admin_pending_applicants: 'admin_pending_applicants',
  applicant_aging_digest: 'applicant_aging_digest',
  onboarding_stalls_digest: 'onboarding_stalls_digest',
  counselor_assigned: 'counselor_assigned',
  invitation: 'invitation',
  invitation_accepted: 'invitation_accepted',
  partner_referral_invite: 'partner_referral_invite',
  // Account security
  password_reset: 'password_reset',
} as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[keyof typeof EMAIL_TEMPLATE_KEYS];

/** Value recorded when a wrapper names no template. Kept short and greppable. */
export const UNTYPED_EMAIL_TEMPLATE_KEY = 'untyped';

/**
 * The key a send should be logged under: an explicit `templateKey` wins,
 * then the resend registry's `template.name`, else null. Whitespace-only
 * values are treated as unset so a blank never becomes a distinct bucket.
 */
export function resolveEmailTemplateKey(args: {
  templateKey?: string | null;
  template?: { name?: string | null } | null;
}): string | null {
  const explicit = args.templateKey?.trim();
  if (explicit) return explicit;
  const fromRef = args.template?.name?.trim();
  return fromRef || null;
}
