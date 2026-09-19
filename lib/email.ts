/**
 * WorkforceAP transactional email send functions.
 * Uses Resend and branded layout from lib/email/template.ts.
 */

import { Resend } from 'resend';
import {
  FixtureRecipientSkippedError,
  buildDeliverabilityHeaders,
  htmlToPlainText,
  isEmailProviderRateLimitError,
  sanitizeHeaders,
  sendBrandedEmailOrThrowOnSkip as sendBrandedEmail,
} from '@/lib/email/send';
import { buildUnsubscribeUrl } from '@/lib/email/unsubscribeToken';
import type { PlacementSurveyDeliveryPayload } from '@/lib/placement-survey/deliveryPayload';
import { brandedEmailLayout } from '@/lib/email/template';
import { escapeHtml, sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { getOrganizationBranding } from '@/lib/tenant/organizationBranding';
import type { EligibilityScreeningFields } from '@/lib/apply/eligibilityScreeningFields';
import {
  applicationAcceptedHtml,
  applicationRejectedHtml,
  newApplicationAlertHtml,
  courseEnrolledHtml,
  courseKickoffHtml,
  courseAccountabilityHtml,
  courseCompletedHtml,
  certCelebrationV2Html,
  weeklyRecapHtml,
  inactiveNudgeHtml,
  invitationHtml,
  invitationAcceptedHtml,
  jobSubmittedHtml,
  jobApprovedHtml,
  jobRejectedHtml,
  newJobApplicationHtml,
  aiMatchSuggestionHtml,
  applicationConfirmationHtml,
  eligibilityScreeningConfirmationHtml,
  eligibilityScreeningAdminAlertHtml,
  schoolEnrollmentParentAckHtml,
  schoolEnrollmentPartnerAckHtml,
  applicantFollowupHtml,
  adminPendingApplicantsHtml,
  adminWeeklyRecapHtml,
  enrollmentConfirmationHtml,
  partnerWeeklyDigestHtml,
  counselorAssignedHtml,
  partnerReferralInviteHtml,
  atRiskDigestHtml,
  onboardingStallsDigestHtml,
  counselorAtRiskBatchHtml,
  placementSurveyHtml,
  placementSurveyEscalationHtml,
  employerWelcomeHtml,
  employerVerifyEmailHtml,
  employerSignupAdminAlertHtml,
  employerApprovedHtml,
  employerRejectedHtml,
  wioaReportHtml,
  memberCheckInHtml,
  memberCheckInSubject,
  memberComeBackHtml,
  memberComeBackSubject,
  memberStuckHtml,
  memberStuckSubject,
  jobAlertDigestHtml,
  employerPendingApplicantsHtml,
  adminStaleApplicantsDigestHtml,
  employerJobExpiryHtml,
} from '@/emails';
import { LOGIN_CODE_LENGTH, loginCodeFromToken } from '@/lib/invitations/loginCode';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
/** Legacy single-inbox constant — prefer {@link getAdminAlertRecipients} for sends. */
const ADMIN_EMAIL = 'info@workforceap.org';
/** Inboxes that receive new-application and other staff alerts when EMAIL_TO_ADMIN is unset. */
const DEFAULT_ADMIN_ALERT_RECIPIENTS = [
  'info@workforceap.org',
  'michael.brown@workforceap.org',
  'michael.brown2@workforceap.org',
] as const;
const DEFAULT_VOICE_COACH_TRANSCRIPT_RECIPIENTS = [
  'michael.brown@workforceap.org',
  'michael.brown2@workforceap.org',
];

/**
 * Staff inboxes for admin alerts (new applications, pre-screening ready, etc.).
 * Set `EMAIL_TO_ADMIN` to a comma-separated list in production; when unset, routes
 * to the shared inbox plus Mike's WorkforceAP addresses so application reports
 * are not silently dropped on info@ alone.
 */
export function getAdminAlertRecipients(): string[] {
  const configured = (process.env.EMAIL_TO_ADMIN ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }
  return [...DEFAULT_ADMIN_ALERT_RECIPIENTS];
}

/**
 * Inboxes that receive a member's completed training preassessment (the full
 * answer sheet). Ops (9/2/26) asked for these to land with Michael Brown; set
 * `ASSESSMENT_RESULT_RECIPIENTS` (comma-separated) to change the list. The
 * admin-alert inboxes are always included so nothing is silently dropped.
 */
export function getAssessmentResultRecipients(): string[] {
  const configured = (process.env.ASSESSMENT_RESULT_RECIPIENTS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(
    new Set([...configured, ...getAdminAlertRecipients(), 'michael.brown@workforceap.org']),
  );
}

export function getResend(): Resend | null {
  // Trim: the key becomes the Authorization header, and a pasted trailing
  // newline makes every send throw before it reaches the network.
  const key = process.env.RESEND_API_KEY?.replace(/[\r\n\0]/g, '').trim();
  if (!key) return null;
  return new Resend(key);
}

function getFrom(): string {
  // Default avoids "noreply@" — cohort members see their first email from a
  // human-shaped sender. Override via EMAIL_FROM (e.g.
  // 'WorkforceAP <hello@workforceap.org>') for full personalization.
  return process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
}

/**
 * Recipients for the monthly WIOA report email (see sendWioaReportEmail).
 * Defaults to {@link getAdminAlertRecipients} when WIOA_REPORT_RECIPIENTS is unset — set the env
 * var to a comma-separated list to route the report to grant/compliance
 * staff instead of (or in addition to) the shared admin inbox.
 */
function getWioaReportRecipients(): string[] {
  const configured = (process.env.WIOA_REPORT_RECIPIENTS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : getAdminAlertRecipients();
}

export function getVoiceCoachTranscriptRecipients(extra: string[] = []): string[] {
  const configured = [
    process.env.VOICE_COACH_TRANSCRIPT_EMAILS ?? '',
    process.env.VOICE_INTERVIEW_TRANSCRIPT_EMAILS ?? '',
  ]
    .flatMap((value) => value.split(','))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(
    new Set(
      [...DEFAULT_VOICE_COACH_TRANSCRIPT_RECIPIENTS, ...configured, ...extra]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export async function sendVoiceCoachTranscriptEmail(params: {
  to: string[];
  memberName: string;
  memberEmail?: string | null;
  coachLabel: string;
  transcriptTurns: { role: 'agent' | 'user'; text: string }[];
  highlights?: string[];
  sessionId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendVoiceCoachTranscriptEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }

  const recipients = Array.from(
    new Set(
      params.to
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients configured' };
  }

  const transcriptHtml = params.transcriptTurns.length
    ? params.transcriptTurns
        .map((turn) => {
          const speaker = turn.role === 'agent' ? 'Coach' : 'Member';
          return `<p style="margin:0 0 0.75rem;"><strong>${speaker}:</strong> ${escapeHtml(turn.text)}</p>`;
        })
        .join('')
    : '<p style="margin:0;">No transcript turns were captured.</p>';

  const highlightsHtml = params.highlights?.length
    ? `<p><strong>Highlights</strong></p><ul>${params.highlights
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>`
    : '';

  const bodyHtml = `
    <p>A voice coach transcript was saved and emailed automatically.</p>
    <ul>
      <li><strong>Coach:</strong> ${escapeHtml(params.coachLabel)}</li>
      <li><strong>Member:</strong> ${escapeHtml(params.memberName)}</li>
      ${params.memberEmail ? `<li><strong>Member email:</strong> ${escapeHtml(params.memberEmail)}</li>` : ''}
      ${params.sessionId ? `<li><strong>Session ID:</strong> ${escapeHtml(params.sessionId)}</li>` : ''}
    </ul>
    ${highlightsHtml}
    <p><strong>Transcript</strong></p>
    <div style="padding:16px;border-radius:12px;background:#f8f5f3;border:1px solid #eadfdb;">${transcriptHtml}</div>
  `;

  const html = brandedEmailLayout({
    title: `${params.coachLabel} transcript`,
    bodyHtml,
    ctaText: 'Open admin',
    ctaUrl: `${SITE_URL}/admin`,
  });

  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: recipients,
      subject: sanitizeEmailSubjectLine(`${params.coachLabel} transcript — ${params.memberName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendVoiceCoachTranscriptEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

export async function sendVoiceCoachArtifactEmail(params: {
  to: string[];
  memberName: string;
  memberEmail?: string | null;
  coachLabel: string;
  artifactTitle: string;
  artifactBody: string;
  highlights?: string[];
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendVoiceCoachArtifactEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }

  const recipients = Array.from(
    new Set(
      params.to
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients configured' };
  }

  const highlightsHtml = params.highlights?.length
    ? `<p><strong>Highlights</strong></p><ul>${params.highlights
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>`
    : '';

  const bodyHtml = `
    <p>A voice coach artifact was saved and emailed automatically.</p>
    <ul>
      <li><strong>Coach:</strong> ${escapeHtml(params.coachLabel)}</li>
      <li><strong>Member:</strong> ${escapeHtml(params.memberName)}</li>
      ${params.memberEmail ? `<li><strong>Member email:</strong> ${escapeHtml(params.memberEmail)}</li>` : ''}
    </ul>
    ${highlightsHtml}
    <p><strong>${escapeHtml(params.artifactTitle)}</strong></p>
    <div style="padding:16px;border-radius:12px;background:#f8f5f3;border:1px solid #eadfdb;white-space:pre-wrap;">${escapeHtml(params.artifactBody)}</div>
  `;

  const html = brandedEmailLayout({
    title: `${params.coachLabel} artifact`,
    bodyHtml,
    ctaText: 'Open admin',
    ctaUrl: `${SITE_URL}/admin`,
  });

  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: recipients,
      subject: sanitizeEmailSubjectLine(`${params.coachLabel} artifact — ${params.memberName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendVoiceCoachArtifactEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

export async function sendVoiceInterviewTranscriptEmail(params: {
  to: string[];
  memberName: string;
  memberEmail?: string | null;
  role: string;
  interviewType: string;
  transcriptTurns: { role: 'agent' | 'user'; text: string }[];
  feedback?: string;
  sessionId: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendVoiceInterviewTranscriptEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }

  const recipients = Array.from(
    new Set(
      params.to
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients configured' };
  }

  const transcriptHtml = params.transcriptTurns.length
    ? params.transcriptTurns
        .map((turn) => {
          const speaker = turn.role === 'agent' ? 'Interviewer' : 'Candidate';
          return `<p style="margin:0 0 0.75rem;"><strong>${speaker}:</strong> ${escapeHtml(turn.text)}</p>`;
        })
        .join('')
    : '<p style="margin:0;">No transcript turns were captured.</p>';

  const bodyHtml = `
    <p>A voice interview transcript was saved and emailed automatically.</p>
    <ul>
      <li><strong>Member:</strong> ${escapeHtml(params.memberName)}</li>
      ${params.memberEmail ? `<li><strong>Member email:</strong> ${escapeHtml(params.memberEmail)}</li>` : ''}
      <li><strong>Target role:</strong> ${escapeHtml(params.role)}</li>
      <li><strong>Interview type:</strong> ${escapeHtml(params.interviewType)}</li>
      <li><strong>Session ID:</strong> ${escapeHtml(params.sessionId)}</li>
    </ul>
    ${params.feedback ? `<p><strong>Coaching feedback</strong></p><p style="white-space:pre-wrap;">${escapeHtml(params.feedback)}</p>` : ''}
    <p><strong>Transcript</strong></p>
    <div style="padding:16px;border-radius:12px;background:#f8f5f3;border:1px solid #eadfdb;">${transcriptHtml}</div>
  `;

  const html = brandedEmailLayout({
    title: 'Voice interview transcript',
    bodyHtml,
    ctaText: 'Open admin',
    ctaUrl: `${SITE_URL}/admin`,
  });

  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: recipients,
      subject: sanitizeEmailSubjectLine(`Voice interview transcript — ${params.memberName} — ${params.role}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendVoiceInterviewTranscriptEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

export async function sendElevatorSpeechEmail(params: {
  to: string;
  memberName: string;
  targetRole: string;
  strengths?: string | null;
  certifications?: string | null;
  industry?: string | null;
  pitch: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendElevatorSpeechEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }

  const to = params.to.trim().toLowerCase();
  if (!to) return { ok: false, error: 'No recipient configured' };

  const bodyHtml = `
    <p>Your AI elevator speech is ready.</p>
    <ul>
      <li><strong>Member:</strong> ${escapeHtml(params.memberName)}</li>
      <li><strong>Target role:</strong> ${escapeHtml(params.targetRole)}</li>
      ${params.industry?.trim() ? `<li><strong>Industry:</strong> ${escapeHtml(params.industry.trim())}</li>` : ''}
      ${params.certifications?.trim() ? `<li><strong>Certifications:</strong> ${escapeHtml(params.certifications.trim())}</li>` : ''}
      ${params.strengths?.trim() ? `<li><strong>Strengths:</strong> ${escapeHtml(params.strengths.trim())}</li>` : ''}
    </ul>
    <p><strong>Your elevator speech</strong></p>
    <div style="padding:16px;border-radius:12px;background:#f8f5f3;border:1px solid #eadfdb;">
      <p style="margin:0;font-size:1rem;line-height:1.7;color:#231f20;">${escapeHtml(params.pitch)}</p>
    </div>
    <p style="margin-top:1rem;">Open the AI Toolkit to rehearse it, copy it, or record yourself delivering it.</p>
  `;

  const html = brandedEmailLayout({
    title: 'Your AI elevator speech is ready',
    bodyHtml,
    ctaText: 'Open AI Toolkit',
    ctaUrl: `${SITE_URL}/dashboard/ai-tools/elevator-pitch`,
  });

  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to,
      subject: sanitizeEmailSubjectLine(`Your AI elevator speech — ${params.targetRole}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendElevatorSpeechEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Notify member when a counselor is assigned (member portal Messages).
 *
 * Track E (Sprint E.1 PR 2) — accepts optional `orgId`. When supplied, the
 * subject line, header logo, accent color, and CTA origin all reflect the
 * member's organization. Omitting `orgId` falls back to WorkforceAP defaults
 * for legacy callers.
 */
export async function sendCounselorAssignedEmail(params: {
  to: string;
  memberFullName: string;
  counselorFullName: string;
  orgId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendCounselorAssignedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const branding = await getOrganizationBranding(params.orgId);
  const first = params.memberFullName.trim().split(/\s+/)[0] || 'there';
  const messagesUrl = `${branding.domain}/dashboard/messages`;
  const html = brandedEmailLayout({
    title: `Your ${branding.name} counselor is assigned`,
    bodyHtml: counselorAssignedHtml({
      firstName: first,
      counselorName: params.counselorFullName,
      messagesUrl,
      branding,
    }),
    ctaText: 'Message your counselor',
    ctaUrl: messagesUrl,
    branding,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`${branding.name} — ${params.counselorFullName} is your counselor`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendCounselorAssignedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send enrollment confirmation when admin approves an application */
export async function sendEnrollmentConfirmationEmail(params: {
  to: string;
  fullName: string;
  programName: string;
  counselorContact?: string;
  counselorName?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEnrollmentConfirmationEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const counselorContact = params.counselorContact?.trim() || 'info@workforceap.org';
  // Subject names the program per /plan-design-review day-1 storyboard:
  // "Specific subject" so the cohort member's first inbox impression is
  // about *their* program, not generic platform onboarding.
  const subject = sanitizeEmailSubjectLine(
    `Welcome to ${params.programName} — your WorkforceAP enrollment is confirmed`,
  );
  const html = brandedEmailLayout({
    title: subject,
    bodyHtml: enrollmentConfirmationHtml({
      firstName: first,
      programName: params.programName,
      counselorContact,
      counselorName: params.counselorName,
    }),
    ctaText: 'Open member portal',
    ctaUrl: `${SITE_URL}/dashboard`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject,
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEnrollmentConfirmationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Comma-separated `AT_RISK_DIGEST_EMAILS` or fallback to admin inbox */
export function getAtRiskDigestRecipients(): string[] {
  const parsed = (process.env.AT_RISK_DIGEST_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (parsed.length > 0) {
    return Array.from(new Set(parsed));
  }
  return getAdminAlertRecipients();
}

/**
 * Comma-separated `COURSERA_UNMATCHED_ACTOR_ALERT_EMAILS`, else the same list as at-risk digests
 * (ops already watching that inbox), else the default admin inbox.
 */
export function getCourseraUnmatchedActorAlertRecipients(): string[] {
  const parsed = (process.env.COURSERA_UNMATCHED_ACTOR_ALERT_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (parsed.length > 0) {
    return Array.from(new Set(parsed));
  }
  return getAtRiskDigestRecipients();
}

/** One-shot alert when Coursera xAPI records a first-seen unmatched actor email (see coursera_unmatched_actor_alerts). */
export async function sendCourseraUnmatchedActorAlertEmail(params: {
  actorEmail: string;
  statementId: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  const recipients = getCourseraUnmatchedActorAlertRecipients();
  if (!resend) {
    console.warn('sendCourseraUnmatchedActorAlertEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients' };
  }

  const adminCourseraUrl = `${SITE_URL}/admin/coursera`;
  const escapedEmail = escapeHtml(params.actorEmail);
  const sid = params.statementId ? escapeHtml(params.statementId) : '—';
  const bodyHtml = `
    <p>A new Coursera xAPI / webhook learner identity arrived with <strong>no matching portal member</strong> (manual Coursera identity mapping is missing).</p>
    <ul style="margin:1rem 0;padding-left:1.25rem;">
      <li><strong>Actor email:</strong> ${escapedEmail}</li>
      <li><strong>Statement / dedupe id:</strong> ${sid}</li>
    </ul>
    <p>Add a mapping under <strong>Admin → Coursera</strong>, or enroll the learner with the same inbox email so auto-match can apply.</p>
  `;
  const html = brandedEmailLayout({
    title: 'Coursera: unmatched actor email',
    bodyHtml,
    ctaText: 'Open Admin → Coursera',
    ctaUrl: adminCourseraUrl,
  });

  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: recipients,
      subject: sanitizeEmailSubjectLine(`Coursera unmatched actor: ${params.actorEmail}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendCourseraUnmatchedActorAlertEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send at-risk member daily digest to admin/counselor emails */
export async function sendAtRiskAlertDigestEmail(params: {
  to: string[];
  dateLabel: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  members: {
    fullName: string | null;
    email: string;
    score: number;
    level: string;
    factors: string[];
    recommendedAction: string;
    adminUrl: string;
  }[];
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendAtRiskAlertDigestEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `At-Risk Member Digest — ${params.dateLabel}`,
    bodyHtml: atRiskDigestHtml(params),
    ctaText: 'View At-Risk Dashboard',
    ctaUrl: `${SITE_URL}/counselor/at-risk`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`At-Risk Digest — ${params.criticalCount} critical, ${params.highCount} high (${params.dateLabel})`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendAtRiskAlertDigestEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

type OnboardingStallNamedMember = { id: string; fullName: string | null; email: string | null };

/** Send weekly onboarding-stall digest to staff (see cron/onboarding-stalls) */
export async function sendOnboardingStallsDigestEmail(params: {
  to: string[];
  interviewCount: number;
  wioaCount: number;
  noProgramCount: number;
  interviewMembers: OnboardingStallNamedMember[];
  wioaMembers: OnboardingStallNamedMember[];
  noProgramMembers: OnboardingStallNamedMember[];
  interviewQueueLink: string;
  wioaQueueLink: string;
  membersQueueLink: string;
  memberAdminBaseUrl: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendOnboardingStallsDigestEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const recipients = Array.from(
    new Set(params.to.map((email) => email.trim().toLowerCase()).filter(Boolean))
  );
  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients configured' };
  }
  const totalStalled = params.interviewCount + params.wioaCount + params.noProgramCount;
  const html = brandedEmailLayout({
    title: `${totalStalled} Onboarding Stall${totalStalled === 1 ? '' : 's'} Need Attention`,
    bodyHtml: onboardingStallsDigestHtml(params),
    ctaText: 'Open Members',
    ctaUrl: params.membersQueueLink,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: recipients,
      subject: sanitizeEmailSubjectLine(
        `Onboarding Stalls: ${params.interviewCount} interview, ${params.wioaCount} WIOA, ${params.noProgramCount} unassigned`
      ),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendOnboardingStallsDigestEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Send application accepted email to applicant.
 *
 * Track E (Sprint E.1 PR 2) — accepts optional `orgId`. Subject and copy
 * reflect the org name when supplied.
 */
export async function sendApplicationAcceptedEmail(params: {
  to: string;
  fullName: string;
  orgId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendApplicationAcceptedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const branding = await getOrganizationBranding(params.orgId);
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  // Codex P2 catch on PR #1052: branding.name is constrained only by
  // min/max length in the Organization schema, so a stray newline could
  // produce a malformed Subject: header (header-injection-style line
  // break). Sanitize like the other branded subjects in this file.
  const subject = sanitizeEmailSubjectLine(
    `Welcome to ${branding.name} - Your Application Was Accepted`,
  );
  const html = brandedEmailLayout({
    title: subject,
    bodyHtml: applicationAcceptedHtml({ firstName: first, branding }),
    ctaText: 'Go to Dashboard',
    ctaUrl: `${branding.domain}/dashboard`,
    branding,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject,
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendApplicationAcceptedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send application rejected email to applicant */
export async function sendApplicationRejectedEmail(params: {
  to: string;
  fullName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendApplicationRejectedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: 'WorkforceAP Application Update',
    bodyHtml: applicationRejectedHtml({ firstName: first }),
    ctaText: 'Contact Us',
    ctaUrl: `${SITE_URL}/contact`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: 'WorkforceAP Application Update',
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendApplicationRejectedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send new application admin alert */
export async function sendPreScreeningReadyEmail(params: {
  memberName?: string;
  memberEmail: string;
  goal: string;
  weeklyHours: string;
  barrierSummary: string;
  memberId: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendPreScreeningReadyEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const name = params.memberName?.trim() || 'Member';
  const bodyHtml = `
    <p><strong>${escapeHtml(name)}</strong> completed pre-screening and is <strong>interview eligible</strong>.</p>
    <ul>
      <li><strong>Email:</strong> ${escapeHtml(params.memberEmail)}</li>
      <li><strong>Primary goal:</strong> ${escapeHtml(params.goal)}</li>
      <li><strong>Weekly time:</strong> ${escapeHtml(params.weeklyHours)}</li>
      <li><strong>Barrier (preview):</strong> ${escapeHtml(params.barrierSummary)}</li>
    </ul>
  `;
  const html = brandedEmailLayout({
    title: 'Member ready for interview (pre-screening)',
    bodyHtml,
    ctaText: 'Open member in admin',
    ctaUrl: `${SITE_URL}/admin/members/${encodeURIComponent(params.memberId)}`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(`Interview ready: ${name}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendPreScreeningReadyEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

export async function sendNewApplicationAdminEmail(params: {
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  programInterest: string;
  applicationId: string;
  applicationNotes?: string;
  eligibility?: EligibilityScreeningFields | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendNewApplicationAdminEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `New Application: ${params.applicantName}`,
    bodyHtml: newApplicationAlertHtml(params),
    ctaText: 'Review Application',
    ctaUrl: `${SITE_URL}/admin/members?highlight=${encodeURIComponent(params.applicationId)}`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(`New Application: ${params.applicantName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendNewApplicationAdminEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Confirm a saved program selection without claiming funded enrollment. */
export async function sendCourseEnrolledEmail(params: {
  to: string;
  fullName: string;
  programName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendCourseEnrolledEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: `Your ${params.programName} program selection`,
    bodyHtml: courseEnrolledHtml({ firstName: first, programName: params.programName }),
    ctaText: 'View my program',
    ctaUrl: `${SITE_URL}/dashboard/program`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Your ${params.programName} program selection is saved`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendCourseEnrolledEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Program next steps after a CourseEnrollment assignment row commits.
 * A saved assignment is not evidence of funded access. The caller handles
 * idempotency (logs a `course_kickoff_email_sent`
 * MemberEvent or relies on the unique-per-enrollment send path).
 */
export async function sendCourseKickoffEmail(params: {
  to: string;
  fullName: string;
  programName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendCourseKickoffEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const subject = `Your ${params.programName} program next steps`;
  const html = brandedEmailLayout({
    title: 'Review your program next steps',
    bodyHtml: courseKickoffHtml({ firstName: first, programName: params.programName }),
    ctaText: 'View my program',
    ctaUrl: `${SITE_URL}/dashboard/program`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(subject),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendCourseKickoffEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Reserved-seat funding update for the pending-approval cohort selected by
 * the cron. The cron path is idempotent against `course_accountability_sent`
 * MemberEvent rows scoped to the enrollment id.
 */
export async function sendCourseAccountabilityEmail(params: {
  to: string;
  fullName: string;
  programName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendCourseAccountabilityEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const subject = `Your ${params.programName} training reservation — funding update`;
  const html = brandedEmailLayout({
    title: 'Your training reservation',
    bodyHtml: courseAccountabilityHtml({ firstName: first, programName: params.programName }),
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(subject),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendCourseAccountabilityEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Sprint R3 redesigned certification celebration. Subject leads with the cert
 * name + date (per PLAN-2026-Q3.md open-rate hypothesis), body points members
 * at interview-practice, includes a peer testimonial when available, and
 * surfaces the +25 point bump the caller awards.
 */
export async function sendCertCelebrationEmail(params: {
  to: string;
  fullName: string;
  certName: string;
  earnedAt: Date;
  pointsAwarded: number;
  testimonial?: { quote: string; name: string; role?: string } | null;
  interviewPracticeUrl?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendCertCelebrationEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const earnedDateLabel = params.earnedAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const subject = `${params.certName} earned ${earnedDateLabel} — what's next`;
  const html = brandedEmailLayout({
    title: `Congrats on earning ${params.certName}`,
    bodyHtml: certCelebrationV2Html({
      firstName: first,
      certName: params.certName,
      earnedDateLabel,
      pointsAwarded: params.pointsAwarded,
      testimonial: params.testimonial ?? null,
    }),
    ctaText: 'Run a 15-minute mock interview',
    ctaUrl: params.interviewPracticeUrl ?? `${SITE_URL}/dashboard/ai-tools/interview-practice`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(subject),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendCertCelebrationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Freeze the complete Resend request before a placement delivery attempt. */
export function preparePlacementSurveyEmail(params: {
  to: string;
  fullName: string;
  programName: string | null;
  surveyUrl: string;
  wave?: 'thirty_day' | 'sixty_day' | 'ninety_day' | 'hundred_eighty_day';
  idempotencyKey: string;
}): PlacementSurveyDeliveryPayload {
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const wave = params.wave ?? 'thirty_day';
  const subject = sanitizeEmailSubjectLine(
    wave === 'sixty_day'
      ? '60-day check-in — are you still employed?'
      : wave === 'ninety_day'
        ? '90-day check-in — salary confirmation'
        : wave === 'hundred_eighty_day'
          ? 'Final 180-day check-in — salary confirmation'
          : "How's the new job going? — quick 3-minute survey",
  );
  const html = brandedEmailLayout({
    title: subject,
    bodyHtml: placementSurveyHtml({ firstName: first, programName: params.programName, wave }),
    ctaText: 'Open the survey',
    ctaUrl: params.surveyUrl,
  });
  return {
    from: getFrom(),
    to: params.to,
    subject,
    html,
    text: htmlToPlainText(html),
    headers: sanitizeHeaders(buildDeliverabilityHeaders(buildUnsubscribeUrl(params.to))),
    idempotencyKey: params.idempotencyKey,
  };
}

/** Send one previously frozen placement-survey provider request. */
export async function sendPreparedPlacementSurveyEmail(
  payload: PlacementSurveyDeliveryPayload,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendPlacementSurveyEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  try {
    await sendBrandedEmail(resend, payload);
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendPlacementSurveyEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send the post-placement survey invite to a member at 30/60/90/180 days. */
export function sendPlacementSurveyEmail(
  params: Parameters<typeof preparePlacementSurveyEmail>[0],
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  return sendPreparedPlacementSurveyEmail(preparePlacementSurveyEmail(params));
}

/** Send escalation alert to counselor when member hasn't responded to a placement survey (any wave) after 7 days */
export async function sendPlacementSurveyEscalationEmail(params: {
  to: string;
  counselorName: string;
  memberName: string;
  memberEmail: string;
  employerName: string;
  jobTitle: string;
  daysSincePlacement: number | null;
  surveyUrl: string;
  wave?: 'thirty_day' | 'sixty_day' | 'ninety_day' | 'hundred_eighty_day';
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendPlacementSurveyEscalationEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'Placement survey non-responder — follow-up needed',
    bodyHtml: placementSurveyEscalationHtml(params),
    ctaText: 'View survey link',
    ctaUrl: params.surveyUrl,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Follow-up needed: ${params.memberName} — placement survey not completed`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendPlacementSurveyEscalationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send course completion congratulations to member */
export async function sendCourseCompletedEmail(params: {
  to: string;
  fullName: string;
  courseName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendCourseCompletedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: `Congratulations! You Completed ${params.courseName}`,
    bodyHtml: courseCompletedHtml({ firstName: first, courseName: params.courseName }),
    ctaText: 'View Progress',
    ctaUrl: `${SITE_URL}/dashboard/program`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Congratulations! You Completed ${params.courseName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendCourseCompletedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Send a counselor-approved milestone-cascade email to a learner.
 *
 * The subject + body are LLM-drafted and counselor-reviewed (possibly edited).
 * We HTML-escape and lightly format the plain text so newlines and paragraph
 * breaks render correctly — the brandedEmailLayout handles the surrounding
 * shell, footer, and CTA button.
 */
export async function sendMilestoneCascadeEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
  idempotencyKey?: string;
  /** Optional CTA. Defaults to a training-dashboard link. */
  ctaText?: string;
  ctaUrl?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; messageId?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendMilestoneCascadeEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  // Convert plain text → safe HTML: escape, then paragraphs on \n\n,
  // <br> on single \n inside a paragraph.
  const paragraphs = params.bodyText
    .split(/\n\n+/)
    .map((para) =>
      `<p>${escapeHtml(para.trim()).replace(/\n/g, '<br />')}</p>`,
    )
    .join('\n');
  const html = brandedEmailLayout({
    title: params.subject,
    bodyHtml: paragraphs,
    ctaText: params.ctaText ?? 'Open Workforce Portal',
    ctaUrl: params.ctaUrl ?? `${SITE_URL}/dashboard`,
  });
  try {
    const result = await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(params.subject),
      html,
      idempotencyKey: params.idempotencyKey,
    });
    if (params.idempotencyKey && !result.data?.id) return { ok: false, error: 'The email provider did not return an acceptance receipt.' };
    return { ok: true, messageId: result.data?.id };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendMilestoneCascadeEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send weekly recap to member */
export async function sendWeeklyRecapEmail(params: {
  to: string;
  fullName: string;
  recapSummary: string;
  idempotencyKey?: string;
  /** Shared cron deadline; provider retry waits must remain inside it. */
  deadlineAtMs?: number;
}): Promise<{ ok: boolean; skipped?: boolean; rateLimited?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendWeeklyRecapEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: 'Your WorkforceAP Weekly Recap',
    bodyHtml: weeklyRecapHtml({ firstName: first, recapSummary: params.recapSummary }),
    ctaText: 'View Full Recap',
    ctaUrl: `${SITE_URL}/dashboard/weekly-recap`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: 'Your WorkforceAP Weekly Recap',
      html,
      idempotencyKey: params.idempotencyKey,
    }, {
      deadlineAtMs: params.deadlineAtMs,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendWeeklyRecapEmail failed:', err);
    const message = err instanceof Error ? err.message : 'Send failed';
    return {
      ok: false,
      error: message,
      ...(isEmailProviderRateLimitError(err) ? { rateLimited: true } : {}),
    };
  }
}

/**
 * Send invitation email to invitee.
 *
 * Track E (Sprint E.1 PR 2) — accepts optional `orgId`. Subject + body
 * say "join {org name}" when supplied. Note: `inviteUrl` is preserved
 * verbatim — its origin is decided by the caller (token URL builder),
 * not by the branding bundle, so we do not rewrite it.
 */
export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string;
  role: string;
  personalMessage?: string | null;
  inviteUrl: string;
  orgId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendInvitationEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const branding = await getOrganizationBranding(params.orgId);
  // The login code is the token prefix (lib/invitations/loginCode.ts), so it
  // can be derived from the link and every sender (create, resend) shows it.
  let loginCode: string | null = null;
  try {
    const token = new URL(params.inviteUrl).searchParams.get('token');
    if (token && token.length >= LOGIN_CODE_LENGTH) loginCode = loginCodeFromToken(token);
  } catch {
    loginCode = null;
  }
  const html = brandedEmailLayout({
    title: `${params.inviterName} invited you to join ${branding.name}`,
    bodyHtml: invitationHtml({
      inviterName: params.inviterName,
      role: params.role,
      personalMessage: params.personalMessage,
      branding,
      loginCode,
    }),
    ctaText: 'Accept Invitation',
    ctaUrl: params.inviteUrl,
    branding,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`${params.inviterName} invited you to join ${branding.name}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendInvitationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

export async function sendPartnerReferralInviteEmail(params: {
  to: string;
  inviterName: string;
  partnerName: string;
  personalMessage?: string | null;
  inviteUrl: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendPartnerReferralInviteEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }

  const html = brandedEmailLayout({
    title: `${params.inviterName} invited you to connect with WorkforceAP`,
    bodyHtml: partnerReferralInviteHtml({
      inviterName: params.inviterName,
      partnerName: params.partnerName,
      personalMessage: params.personalMessage,
    }),
    ctaText: 'Start Application',
    ctaUrl: params.inviteUrl,
  });

  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`${params.inviterName} invited you to WorkforceAP`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendPartnerReferralInviteEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send invitation accepted notification to inviter */
export async function sendInvitationAcceptedEmail(params: {
  to: string;
  accepterName: string;
  accepterEmail: string;
  role: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendInvitationAcceptedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `${params.accepterName} accepted your WorkforceAP invitation`,
    bodyHtml: invitationAcceptedHtml({
      accepterName: params.accepterName,
      accepterEmail: params.accepterEmail,
      role: params.role,
    }),
    ctaText: 'View in Admin',
    ctaUrl: `${SITE_URL}/admin/invites`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`${params.accepterName} accepted your WorkforceAP invitation`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendInvitationAcceptedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send inactive member nudge */
export async function sendInactiveNudgeEmail(params: {
  to: string;
  fullName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendInactiveNudgeEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: 'We Miss You at WorkforceAP',
    bodyHtml: inactiveNudgeHtml({ firstName: first }),
    ctaText: 'Resume Learning',
    ctaUrl: `${SITE_URL}/dashboard`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: 'We Miss You at WorkforceAP',
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendInactiveNudgeEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Weekly job alert digest — sent to actively-job-searching members
 * (saved job / application / AI match on file) when new live postings
 * match their enrolled program. See app/api/cron/job-alerts/route.ts.
 */
export async function sendJobAlertDigestEmail(params: {
  to: string;
  firstName: string;
  jobs: { title: string; company: string; location: string | null }[];
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendJobAlertDigestEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'New jobs match your program',
    bodyHtml: jobAlertDigestHtml({ firstName: params.firstName, jobs: params.jobs }),
    ctaText: 'View Jobs',
    ctaUrl: `${SITE_URL}/dashboard/jobs`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`${params.jobs.length} new job${params.jobs.length === 1 ? '' : 's'} match your program`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendJobAlertDigestEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send job submitted admin alert */
export async function sendJobSubmittedEmail(params: {
  jobTitle: string;
  companyName: string;
  employerEmail: string;
  jobId: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendJobSubmittedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `New Job Submitted: ${params.jobTitle}`,
    bodyHtml: jobSubmittedHtml(params),
    ctaText: 'Review Job',
    ctaUrl: `${SITE_URL}/admin/jobs/${params.jobId}`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(`New Job Submitted: ${params.jobTitle} - ${params.companyName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendJobSubmittedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Send job approved to employer.
 *
 * Track E (Sprint E.1 PR 2) — accepts optional `orgId` from the admin
 * route's `getActorOrganizationId` so the employer sees the approving
 * org's brand and domain.
 */
export async function sendJobApprovedEmail(params: {
  to: string;
  jobTitle: string;
  companyName: string;
  orgId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendJobApprovedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const branding = await getOrganizationBranding(params.orgId);
  const html = brandedEmailLayout({
    title: 'Your Job Posting is Live',
    bodyHtml: jobApprovedHtml({
      jobTitle: params.jobTitle,
      companyName: params.companyName,
      branding,
    }),
    ctaText: 'View Employer Portal',
    ctaUrl: `${branding.domain}/employer/jobs`,
    branding,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Your job "${params.jobTitle}" is now live on ${branding.name}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendJobApprovedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Send job rejected to employer.
 *
 * Track E (Sprint E.1 PR 2) — accepts optional `orgId`. Subject + edit
 * link follow the org domain when supplied.
 */
export async function sendJobRejectedEmail(params: {
  to: string;
  jobTitle: string;
  companyName: string;
  reason: string;
  orgId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendJobRejectedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const branding = await getOrganizationBranding(params.orgId);
  const html = brandedEmailLayout({
    title: 'Job Posting Update',
    bodyHtml: jobRejectedHtml({
      jobTitle: params.jobTitle,
      companyName: params.companyName,
      reason: params.reason,
      branding,
    }),
    ctaText: 'Edit Job',
    ctaUrl: `${branding.domain}/employer/jobs`,
    branding,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Job posting "${params.jobTitle}" - Update`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendJobRejectedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send new job application to employer */
export async function sendNewJobApplicationEmail(params: {
  to: string;
  jobTitle: string;
  applicantName: string;
  applicantEmail: string;
  applicationId: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendNewJobApplicationEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `New Applicant: ${params.applicantName}`,
    bodyHtml: newJobApplicationHtml(params),
    ctaText: 'View Applications',
    ctaUrl: `${SITE_URL}/employer/applications`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`New applicant for "${params.jobTitle}"`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendNewJobApplicationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send AI match suggestion to employer */
export async function sendAIMatchSuggestionEmail(params: {
  to: string;
  jobTitle: string;
  companyName: string;
  matches: { name: string; program: string; score: number }[];
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendAIMatchSuggestionEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `Top Matches for "${params.jobTitle}"`,
    bodyHtml: aiMatchSuggestionHtml(params),
    ctaText: 'View Matches',
    ctaUrl: `${SITE_URL}/employer/jobs`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Top candidate matches for "${params.jobTitle}"`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendAIMatchSuggestionEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Same as {@link sendAIMatchSuggestionEmail} — employer AI match notification with HTML-escaped fields.
 */
export async function sendMatchActionEmail(
  params: Parameters<typeof sendAIMatchSuggestionEmail>[0]
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  return sendAIMatchSuggestionEmail(params);
}

/** Send application confirmation / first membership welcome after form submit */
export async function sendApplicationConfirmationEmail(params: {
  to: string;
  fullName: string;
  eligibility?: EligibilityScreeningFields | null;
  applicationId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendApplicationConfirmationEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: 'Welcome to Workforce Advancement Project — Your Next Steps',
    bodyHtml: applicationConfirmationHtml({
      firstName: first,
      eligibility: params.eligibility,
      applicationId: params.applicationId,
    }),
    ctaText: 'Open your member portal',
    ctaUrl: `${SITE_URL}/login`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(
        'Welcome to Workforce Advancement Project — Your Next Steps',
      ),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendApplicationConfirmationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Parent/guardian acknowledgment when an under-18 school student completes apply signup. */
export async function sendSchoolEnrollmentParentAckEmail(params: {
  to: string;
  parentGuardianName?: string | null;
  studentName: string;
  schoolName: string;
  programInterest: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendSchoolEnrollmentParentAckEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'Application received — WorkforceAP',
    bodyHtml: schoolEnrollmentParentAckHtml({
      parentName: params.parentGuardianName,
      studentName: params.studentName,
      schoolName: params.schoolName,
      programInterest: params.programInterest,
    }),
    ctaText: 'Learn about WorkforceAP',
    ctaUrl: `${SITE_URL}/programs`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(
        `${params.studentName} applied for career training — WorkforceAP`,
      ),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendSchoolEnrollmentParentAckEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** School partner alert when a referred student completes apply signup. */
export async function sendSchoolEnrollmentPartnerAckEmail(params: {
  to: string;
  partnerName: string;
  studentName: string;
  studentEmail: string;
  programInterest: string;
  gradeLevel?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendSchoolEnrollmentPartnerAckEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `New ${params.partnerName} application`,
    bodyHtml: schoolEnrollmentPartnerAckHtml({
      partnerName: params.partnerName,
      studentName: params.studentName,
      studentEmail: params.studentEmail,
      programInterest: params.programInterest,
      gradeLevel: params.gradeLevel,
      partnerPortalUrl: `${SITE_URL}/partner`,
    }),
    ctaText: 'Open partner portal',
    ctaUrl: `${SITE_URL}/partner`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(
        `[WorkforceAP] New student application — ${params.studentName}`,
      ),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendSchoolEnrollmentPartnerAckEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Applicant confirmation after dashboard / token eligibility questionnaire submit. */
export async function sendEligibilityScreeningConfirmationEmail(params: {
  to: string;
  fullName: string;
  eligibility?: EligibilityScreeningFields | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEligibilityScreeningConfirmationEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: 'Eligibility questionnaire received',
    bodyHtml: eligibilityScreeningConfirmationHtml({
      firstName: first,
      eligibility: params.eligibility,
    }),
    ctaText: 'Open member portal',
    ctaUrl: `${SITE_URL}/login`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine('Eligibility questionnaire received — WorkforceAP'),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEligibilityScreeningConfirmationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Mike/admin alert when eligibility screening is submitted outside apply signup. */
export async function sendEligibilityScreeningAdminEmail(params: {
  memberName: string;
  memberEmail: string;
  memberId?: string | null;
  source: 'dashboard' | 'token' | 'apply';
  eligibility?: EligibilityScreeningFields | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEligibilityScreeningAdminEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `Eligibility screening: ${params.memberName}`,
    bodyHtml: eligibilityScreeningAdminAlertHtml(params),
    ctaText: params.memberId ? 'Open member' : 'Open members',
    ctaUrl: params.memberId
      ? `${SITE_URL}/admin/members/${encodeURIComponent(params.memberId)}`
      : `${SITE_URL}/admin/members`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(`Eligibility screening: ${params.memberName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEligibilityScreeningAdminEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send Day 3 follow-up email to applicant */
export async function sendApplicantFollowupEmail(params: {
  to: string;
  fullName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendApplicantFollowupEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const first = params.fullName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: 'Your Application is Being Reviewed',
    bodyHtml: applicantFollowupHtml({ firstName: first }),
    ctaText: 'Explore Our Programs',
    ctaUrl: `${SITE_URL}/programs`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: 'Your WorkforceAP Application is Being Reviewed',
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendApplicantFollowupEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send admin alert about pending applications */
export async function sendAdminPendingApplicantsEmail(params: {
  pendingCount: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendAdminPendingApplicantsEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `${params.pendingCount} Pending Applications Need Review`,
    bodyHtml: adminPendingApplicantsHtml({ pendingCount: params.pendingCount }),
    ctaText: 'Review Applications',
    ctaUrl: `${SITE_URL}/admin/members`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(`Action Needed: ${params.pendingCount} pending applications over 3 days old`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendAdminPendingApplicantsEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Weekly nudge to an employer: candidates waiting 5+ days on their job posts. */
export async function sendEmployerPendingApplicantsEmail(params: {
  to: string;
  candidateCount: number;
  jobsAffected: number;
  oldestWaitingDays: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEmployerPendingApplicantsEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `${params.candidateCount} candidate${params.candidateCount === 1 ? '' : 's'} waiting on your job posts`,
    bodyHtml: employerPendingApplicantsHtml(params),
    ctaText: 'Review Applicants',
    ctaUrl: `${SITE_URL}/employer/applications`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`${params.candidateCount} candidate${params.candidateCount === 1 ? '' : 's'} waiting on ${params.jobsAffected} of your job posts`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEmployerPendingApplicantsEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Admin digest of employers with 10+ unreviewed applicants 5+ days old. */
export async function sendAdminStaleApplicantsDigestEmail(params: {
  employers: { companyName: string; candidateCount: number }[];
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendAdminStaleApplicantsDigestEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `${params.employers.length} employers with a stale-applicant backlog`,
    bodyHtml: adminStaleApplicantsDigestHtml(params),
    ctaText: 'Review Employers',
    ctaUrl: `${SITE_URL}/admin/employers`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(`${params.employers.length} employer${params.employers.length === 1 ? '' : 's'} with 10+ stale applicants`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendAdminStaleApplicantsDigestEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Notify an employer that N of their live jobs auto-expired and were closed. */
export async function sendEmployerJobExpiryEmail(params: {
  to: string;
  expiredCount: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEmployerJobExpiryEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `${params.expiredCount} of your job posts expired`,
    bodyHtml: employerJobExpiryHtml(params),
    ctaText: 'Manage Job Posts',
    ctaUrl: `${SITE_URL}/employer/jobs`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`${params.expiredCount} of your job post${params.expiredCount === 1 ? '' : 's'} expired`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEmployerJobExpiryEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send weekly admin recap summary */
export async function sendAdminWeeklyRecapEmail(params: {
  newApplicants: number;
  placements: number;
  atRiskStudents: number;
  pendingApplications: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendAdminWeeklyRecapEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'Weekly Admin Recap — WorkforceAP',
    bodyHtml: adminWeeklyRecapHtml(params),
    ctaText: 'View Admin Dashboard',
    ctaUrl: `${SITE_URL}/admin`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(
        `Weekly Recap: ${params.newApplicants} new applicants, ${params.placements} placements`
      ),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendAdminWeeklyRecapEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send WIOA monthly report to admin with JSON attachment */
export async function sendWioaReportEmail(params: {
  periodLabel: string;
  totalActiveMembers: number;
  totalCompleters: number;
  totalPlacements: number;
  overallAvgWage: number | null;
  programs: Array<{
    programSlug: string;
    activeMembers: number;
    completers: number;
    placements: number;
    avgWage: number | null;
  }>;
  reportJson: Record<string, unknown>;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendWioaReportEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `WIOA Monthly Report — ${params.periodLabel}`,
    bodyHtml: wioaReportHtml(params),
    ctaText: 'View Admin Dashboard',
    ctaUrl: `${SITE_URL}/admin`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getWioaReportRecipients(),
      subject: sanitizeEmailSubjectLine(`WIOA Monthly Report — ${params.periodLabel}`),
      html,
      attachments: [
        {
          filename: `wioa-report-${params.periodLabel.toLowerCase().replace(/\s+/g, '-')}.json`,
          content: Buffer.from(JSON.stringify(params.reportJson, null, 2)).toString('base64'),
        },
      ],
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendWioaReportEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Weekly referral outcomes digest for a partner org */
export async function sendPartnerWeeklyDigestEmail(params: {
  to: string;
  partnerName: string;
  weekLabel: string;
  stageLines: string[];
  successLines: string[];
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendPartnerWeeklyDigestEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `Weekly referral snapshot — ${params.partnerName}`,
    bodyHtml: partnerWeeklyDigestHtml({
      partnerName: params.partnerName,
      weekLabel: params.weekLabel,
      stageLines: params.stageLines,
      successLines: params.successLines,
    }),
    ctaText: 'Open partner portal',
    ctaUrl: `${SITE_URL}/partner`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`WorkforceAP weekly referral update — ${params.partnerName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendPartnerWeeklyDigestEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send welcome email to newly self-registered employer */
export async function sendEmployerWelcomeEmail(params: {
  to: string;
  companyName: string;
  contactName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEmployerWelcomeEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'Welcome to WorkforceAP — Your Employer Portal',
    bodyHtml: employerWelcomeHtml({
      companyName: params.companyName,
      contactName: params.contactName,
      loginUrl: `${SITE_URL}/login`,
    }),
    ctaText: 'Log in to Employer Portal',
    ctaUrl: `${SITE_URL}/login`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Welcome to WorkforceAP — ${params.companyName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEmployerWelcomeEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send email-verification link to a newly self-registered employer */
export async function sendEmployerVerificationEmail(params: {
  to: string;
  contactName: string;
  verifyUrl: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEmployerVerificationEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'Verify your email — WorkforceAP Employer Portal',
    bodyHtml: employerVerifyEmailHtml({
      contactName: params.contactName,
      verifyUrl: params.verifyUrl,
    }),
    ctaText: 'Verify Email Address',
    ctaUrl: params.verifyUrl,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine('Verify your email — WorkforceAP'),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEmployerVerificationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send admin alert when a new employer signs up */
export async function sendEmployerSignupAdminAlertEmail(params: {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEmployerSignupAdminAlertEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: `New Employer Signup: ${params.companyName}`,
    bodyHtml: employerSignupAdminAlertHtml(params),
    ctaText: 'Review Employers',
    ctaUrl: `${SITE_URL}/admin/employers`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(`New employer signup: ${params.companyName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEmployerSignupAdminAlertEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send approval email to employer */
export async function sendEmployerApprovedEmail(params: {
  to: string;
  companyName: string;
  contactName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEmployerApprovedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'Your WorkforceAP Employer Account is Approved',
    bodyHtml: employerApprovedHtml(params),
    ctaText: 'Go to Employer Portal',
    ctaUrl: `${SITE_URL}/employer`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Your employer account is approved — ${params.companyName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEmployerApprovedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send rejection email to employer */
export async function sendEmployerRejectedEmail(params: {
  to: string;
  companyName: string;
  contactName: string;
  reason?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEmployerRejectedEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'WorkforceAP Employer Account Update',
    bodyHtml: employerRejectedHtml(params),
    ctaText: 'Contact Us',
    ctaUrl: `${SITE_URL}/contact`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Your employer account — ${params.companyName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEmployerRejectedEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Notify staff when a member resets their skills assessment to retake */
export async function sendAssessmentResetNotificationEmail(params: {
  memberName: string;
  memberEmail: string;
  previousScore: number;
  programInterest: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured' };
  const html = brandedEmailLayout({
    title: 'Skills Assessment Reset',
    bodyHtml: `
      <p>A member has requested to retake their skills assessment.</p>
      <table style="font-size:0.9rem;border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#584144">Member</td><td>${escapeHtml(params.memberName)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#584144">Email</td><td>${escapeHtml(params.memberEmail)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#584144">Previous Score</td><td>${params.previousScore}%</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#584144">Program</td><td>${escapeHtml(params.programInterest)}</td></tr>
      </table>
      <p style="margin-top:1rem">The previous score has been archived in the system. The member can now retake from their dashboard.</p>
    `,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: getAdminAlertRecipients(),
      subject: sanitizeEmailSubjectLine(`Assessment Reset — ${params.memberName}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendAssessmentResetNotificationEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Send a pre-interview prep bundle containing latest AI tool results */
export async function sendInterviewPrepBundleEmail(params: {
  to: string;
  memberName: string;
  bundle: {
    items: { toolType: string; title: string; content: string; createdAt: Date }[];
    generatedAt: Date;
  };
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendInterviewPrepBundleEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }

  const to = params.to.trim().toLowerCase();
  if (!to) return { ok: false, error: 'No recipient configured' };

  const sectionsHtml = params.bundle.items
    .map(
      (item) => `
      <div style="margin-bottom:24px;border:1px solid #eadfdb;border-radius:12px;overflow:hidden;">
        <div style="padding:10px 14px;background:#f8f5f3;border-bottom:1px solid #eadfdb;font-size:0.85rem;font-weight:700;color:#584144;">
          ${escapeHtml(item.title)}
        </div>
        <div style="padding:14px;font-size:0.85rem;line-height:1.65;color:#231f20;white-space:pre-wrap;">
          ${escapeHtml(item.content)}
        </div>
      </div>
    `,
    )
    .join('');

  const bodyHtml = `
    <p>Hi ${escapeHtml(params.memberName)},</p>
    <p>Here is your pre-interview prep bundle — everything you have generated with our AI tools, pulled together so you can review before your next interview.</p>
    ${sectionsHtml}
    <p style="margin-top:1rem;">Good luck. You have done the work — now go show them what you can do.</p>
  `;

  const html = brandedEmailLayout({
    title: 'Your Pre-Interview Prep Bundle',
    bodyHtml,
    ctaText: 'Open AI Toolkit',
    ctaUrl: `${SITE_URL}/dashboard/ai-tools/interview-prep`,
  });

  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to,
      subject: sanitizeEmailSubjectLine('Your Pre-Interview Prep Bundle — WorkforceAP'),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendInterviewPrepBundleEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** ~24h before a logged interview — nudge member to review STAR answers in Interview Practice. */
export async function sendInterviewPrepReminderEmail(params: {
  to: string;
  firstName: string;
  company: string;
  role: string;
  interviewWhenLabel: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured' };
  const first = params.firstName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: 'Interview coming up',
    bodyHtml: `
      <p>Hi ${escapeHtml(first)},</p>
      <p>You have <strong>${escapeHtml(params.role)}</strong> at <strong>${escapeHtml(params.company)}</strong> on your tracker, with an interview noted for <strong>${escapeHtml(params.interviewWhenLabel)}</strong>.</p>
      <p>Open <strong>Interview Practice</strong> in your WorkforceAP portal to rehearse STAR answers and tighten your talking points before you go in.</p>
    `,
    ctaText: 'Open Interview Practice',
    ctaUrl: `${SITE_URL}/dashboard/ai-tools/interview-practice`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Reminder: interview prep for ${params.company}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendInterviewPrepReminderEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Day after interview — lightweight self-report prompt (accountability loop). */
export async function sendInterviewDebriefPromptEmail(params: {
  to: string;
  firstName: string;
  company: string;
  role: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured' };
  const first = params.firstName.trim().split(/\s+/)[0] || 'there';
  const html = brandedEmailLayout({
    title: 'How did your interview go?',
    bodyHtml: `
      <p>Hi ${escapeHtml(first)},</p>
      <p>Yesterday you had <strong>${escapeHtml(params.role)}</strong> at <strong>${escapeHtml(params.company)}</strong> on your calendar.</p>
      <p>Reply to your counselor in <strong>Counselor Chat</strong> with a quick note (went well / waiting on next steps / need help). Updating your application tracker helps your team support you.</p>
    `,
    ctaText: 'Open Counselor Chat',
    ctaUrl: `${SITE_URL}/dashboard/messages`,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Quick check-in: ${params.company} interview`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendInterviewDebriefPromptEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Send a batched at-risk alert email to a counselor.
 * One email per counselor per day with all CRITICAL at-risk members.
 */
export async function sendCounselorAtRiskAlertEmail(params: {
  to: string;
  counselorName: string;
  members: {
    memberName: string;
    memberEmail: string;
    score: number;
    level: string;
    factors: string[];
    recommendedAction: string;
    profileUrl: string;
  }[];
  dashboardUrl: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendCounselorAtRiskAlertEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }

  const memberCount = params.members.length;
  const subjectLine =
    memberCount === 1
      ? '1 member needs attention today'
      : `${memberCount} members need attention today`;

  const html = brandedEmailLayout({
    title: 'At-Risk Alert',
    bodyHtml: counselorAtRiskBatchHtml({
      counselorName: params.counselorName,
      memberCount,
      members: params.members,
      dashboardUrl: params.dashboardUrl,
    }),
    ctaText: 'View At-Risk Dashboard',
    ctaUrl: params.dashboardUrl,
  });

  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`At-Risk Alert: ${subjectLine}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendCounselorAtRiskAlertEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

// ─── G5 retention nudge sends ───────────────────────────────────────────────

/**
 * Member check-in nudge (yellow tier, day ~4).
 */
export async function sendMemberCheckInEmail(params: {
  to: string;
  firstName: string;
  dashboardUrl: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendMemberCheckInEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'Quick check-in',
    bodyHtml: memberCheckInHtml({
      firstName: params.firstName,
      dashboardUrl: params.dashboardUrl,
    }),
    ctaText: 'Open my dashboard',
    ctaUrl: params.dashboardUrl,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(memberCheckInSubject),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendMemberCheckInEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Member come-back nudge (red tier, day 7+).
 */
export async function sendMemberComeBackEmail(params: {
  to: string;
  firstName: string;
  counselorName: string;
  nextBestActionUrl: string;
  nextBestActionLabel?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendMemberComeBackEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: 'A quick question',
    bodyHtml: memberComeBackHtml({
      firstName: params.firstName,
      counselorName: params.counselorName,
      nextBestActionUrl: params.nextBestActionUrl,
      nextBestActionLabel: params.nextBestActionLabel,
    }),
    ctaText: params.nextBestActionLabel ?? 'Take the next step',
    ctaUrl: params.nextBestActionUrl,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(memberComeBackSubject(params.counselorName)),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendMemberComeBackEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Member stuck nudge (red 14d+ or stalled training).
 */
export async function sendMemberStuckEmail(params: {
  to: string;
  firstName: string;
  counselorName: string;
  calendarUrl?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendMemberStuckEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const html = brandedEmailLayout({
    title: "Let's get unstuck",
    bodyHtml: memberStuckHtml({
      firstName: params.firstName,
      counselorName: params.counselorName,
      calendarUrl: params.calendarUrl,
    }),
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(memberStuckSubject),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendMemberStuckEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Send a logged-in member a link to the WIOA interview-prep tool. No token —
 * the member logs in to the portal and uses the existing tool. Sibling of
 * sendInvitationEmail; reuses brandedEmailLayout + org branding.
 */
export async function sendInterviewPrepLink(params: {
  to: string;
  name?: string | null;
  url: string;
  orgId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendInterviewPrepLink: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const branding = await getOrganizationBranding(params.orgId);
  const greeting = params.name?.trim() ? `Hi ${escapeHtml(params.name.trim())},` : 'Hi,';
  const title = 'Practice for your interview';
  const html = brandedEmailLayout({
    title,
    bodyHtml: `
      <p style="margin: 0 0 1rem;">${greeting}</p>
      <p style="margin: 0 0 1rem;">Your ${escapeHtml(branding.name)} team wants you to get ready for your next interview.
      Log in to your portal and use the interview-prep tool to practice common questions and sharpen your answers.</p>
      <p style="margin: 0 0 1rem;">Click the button below to get started — you'll be asked to log in if you aren't already.</p>
    `,
    ctaText: 'Start interview prep',
    ctaUrl: params.url,
    branding,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(`Practice for your interview with ${branding.name}`),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendInterviewPrepLink failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/**
 * Soft membership reminder copy for the Sept 14 WS5 campaign.
 * Reminder only — does NOT disable accounts or lock members out.
 */
export const ELIGIBILITY_SOFT_DEADLINE_COPY =
  'Please complete by September 14 to keep your membership current. This is a friendly reminder only — your account stays active either way.';

/**
 * Send a logged-in member a link to the eligibility questionnaire portal page,
 * where they can complete / update their WIOA eligibility info. No token —
 * the portal page is auth-gated. Sibling of sendInvitationEmail.
 */
export async function sendEligibilityLink(params: {
  to: string;
  name?: string | null;
  url: string;
  orgId?: string | null;
  /** When true, include Sept 14 soft-reminder language (WS5 non-CHS campaign). */
  softDeadlineReminder?: boolean;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendEligibilityLink: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const branding = await getOrganizationBranding(params.orgId);
  const greeting = params.name?.trim() ? `Hi ${escapeHtml(params.name.trim())},` : 'Hi,';
  const title = 'Complete your eligibility info';
  const softLine = params.softDeadlineReminder
    ? `<p style="margin: 0 0 1rem;"><strong>${escapeHtml(ELIGIBILITY_SOFT_DEADLINE_COPY)}</strong></p>`
    : '';
  const html = brandedEmailLayout({
    title,
    bodyHtml: `
      <p style="margin: 0 0 1rem;">${greeting}</p>
      <p style="margin: 0 0 1rem;">To keep your ${escapeHtml(branding.name)} file up to date, please take a moment to
      complete or update your eligibility information — your age group, location, and any barriers to employment.</p>
      ${softLine}
      <p style="margin: 0 0 1rem;">Click the button below to open the form. It's pre-filled with what we already have, so it
      only takes a minute. You'll be asked to log in if you aren't already.</p>
    `,
    ctaText: 'Update eligibility info',
    ctaUrl: params.url,
    branding,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(
        params.softDeadlineReminder
          ? `Please complete your eligibility info by Sept 14 — ${branding.name}`
          : `Complete your eligibility info for ${branding.name}`,
      ),
      html,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendEligibilityLink failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}
