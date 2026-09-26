import { canonicalEventName } from '@/lib/events/names';
import {
  PARTNER_MILESTONE_EVENT_NAMES,
  partnerMilestoneEventNameCandidates,
} from '@/lib/partner/milestoneEvents';

type PartnerMilestoneEventName = (typeof PARTNER_MILESTONE_EVENT_NAMES)[number];

/**
 * What a referring partner may see about a referred member's activity
 * (privacy §3.3: "enrollment status, progress, and outcomes"), and the
 * plain-language label shown for it. Keyed by the WAP-214 milestone list so
 * the rail badge, the milestones feed and the member detail page stay on one
 * allowlist; adding a name to that list without a label here fails typecheck.
 *
 * Labels are fixed strings. Nothing a writer put in event metadata (notes,
 * free text, staff context) is ever shown to a partner, and neither is the
 * raw event name. Logins, AI tool runs, feedback, counselor follow-ups and
 * nudges, application denials and check-ins are never partner-visible.
 */
export const PARTNER_VISIBLE_EVENTS: Readonly<Record<PartnerMilestoneEventName, string>> = {
  program_enrolled: 'Enrolled in a program',
  training_access_activated: 'Training access activated',
  course_completed: 'Completed a course',
  pathway_completed: 'Completed a learning pathway',
  program_completed: 'Completed program training',
  skill_mission_passed: 'Passed a skill check',
};

/** Every stored spelling of the partner-visible events, for `eventName: { in }` filters. */
export function partnerVisibleEventNames(): string[] {
  return partnerMilestoneEventNameCandidates();
}

/**
 * The partner-facing label for a stored event name (current or legacy
 * spelling), or `null` when the event is not partner-visible. Never reads
 * event metadata.
 */
export function partnerEventLabel(name: string): string | null {
  const canonical = canonicalEventName(name);
  if (!canonical || !Object.hasOwn(PARTNER_VISIBLE_EVENTS, canonical)) return null;
  return PARTNER_VISIBLE_EVENTS[canonical as PartnerMilestoneEventName];
}

/**
 * Partner-facing placement wording (decision 19 on the open-decisions list;
 * wording may still change, so it lives only here). A placement reads as
 * confirmed only when staff verified its start date (`startDateVerified`,
 * the same rule the partner outcome packet, #2570, uses). A member
 * self-report (`app/(portal)/dashboard/placementAction.ts`) creates an
 * unverified record; partners see that it was reported, never the employer,
 * job or salary, until it is verified.
 */
export const PARTNER_PLACEMENT_LABELS = {
  verified: (employerName: string, jobTitle: string) => `Placed at ${employerName} — ${jobTitle}`,
  pendingVerification: 'Placement reported, pending verification',
} as const;

export function partnerPlacementLabel(placement: {
  employerName: string;
  jobTitle: string;
  startDateVerified: boolean | null;
}): string {
  return placement.startDateVerified === true
    ? PARTNER_PLACEMENT_LABELS.verified(placement.employerName, placement.jobTitle)
    : PARTNER_PLACEMENT_LABELS.pendingVerification;
}
