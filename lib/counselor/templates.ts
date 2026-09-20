/**
 * Counselor inbox-zero follow-up templates (bulk send).
 *
 * Placeholders: {memberName}, {programName}, {certName}
 */

import type { InboxZeroFlagType } from '@/lib/counselor/inboxZero';

export type FollowUpTemplateId =
  | 'doc_missing_nudge'
  | 'application_stalled'
  | 'check_in'
  | 'congrats_placement';

export type FollowUpTemplate = {
  id: FollowUpTemplateId;
  name: string;
  subject: string;
  body: string;
  applicableTo: InboxZeroFlagType[];
};

export const FOLLOW_UP_TEMPLATES: Record<FollowUpTemplateId, FollowUpTemplate> = {
  doc_missing_nudge: {
    id: 'doc_missing_nudge',
    name: 'Resume missing nudge',
    subject: 'Quick check on your resume',
    body: `Hi {memberName} — we still need your resume on file for {programName}. Upload it in your portal when you have a few minutes, or reply here if something is blocking you and we'll help.`,
    applicableTo: ['resume_missing_3d'],
  },
  application_stalled: {
    id: 'application_stalled',
    name: 'Application stalled',
    subject: 'Your application — next step',
    body: `Hi {memberName} — your {programName} application has been waiting a few days. Reply with any question (even one sentence) and we'll unblock it the same day.`,
    applicableTo: ['application_stalled_5d', 'pending_application', 'missing_info'],
  },
  check_in: {
    id: 'check_in',
    name: 'Warm check-in',
    subject: 'Checking in',
    body: `Hi {memberName} — checking in on {programName}. Your seat is still here. If something's in the way, tell us what it is and we'll figure it out together.`,
    applicableTo: ['no_counselor_contact_7d', 'risk_alert', 'no_activity_30d', 'no_activity_10d'],
  },
  congrats_placement: {
    id: 'congrats_placement',
    name: 'Congrats on placement',
    subject: 'Congratulations',
    body: `Hi {memberName} — congratulations on your progress with {programName}. That's a real step forward. Reply when you're ready for the next piece and we're here to walk through it with you.`,
    applicableTo: ['resume_missing_3d', 'application_stalled_5d', 'risk_alert', 'no_counselor_contact_7d', 'milestone_reached'],
  },
};

export function listFollowUpTemplates(): FollowUpTemplate[] {
  return Object.values(FOLLOW_UP_TEMPLATES);
}

export function getFollowUpTemplate(id: FollowUpTemplateId): FollowUpTemplate | null {
  return FOLLOW_UP_TEMPLATES[id] ?? null;
}

export type FollowUpRenderContext = {
  memberName: string;
  programName: string;
  certName?: string;
};

export function renderFollowUpTemplate(
  template: FollowUpTemplate,
  ctx: FollowUpRenderContext,
): { subject: string; body: string } {
  const memberName = ctx.memberName.trim() || 'there';
  const programName = ctx.programName.trim() || 'your program';
  const certName = ctx.certName?.trim() || 'your certification';
  const replace = (s: string) =>
    s
      .replaceAll('{memberName}', memberName)
      .replaceAll('{programName}', programName)
      .replaceAll('{certName}', certName);
  return {
    subject: replace(template.subject),
    body: replace(template.body),
  };
}

export function templateMatchesFlags(
  template: FollowUpTemplate,
  flags: InboxZeroFlagType[],
): boolean {
  if (flags.length === 0) return true;
  return flags.some((f) => template.applicableTo.includes(f));
}
