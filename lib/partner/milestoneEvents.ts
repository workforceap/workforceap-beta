import { eventNameReadCandidates, type EventName } from '@/lib/events/names';

/**
 * Member events a partner sees as milestones (WAP-214): progress a referring
 * partner cares about, never engagement noise such as logins, page views or
 * AI tool runs. The `/partner/milestones` feed and the rail's Milestones
 * badge both read this list, so the badge never counts a row the page hides.
 */
export const PARTNER_MILESTONE_EVENT_NAMES = [
  'program_enrolled',
  'training_access_activated',
  'course_completed',
  'pathway_completed',
  'program_completed',
  'skill_mission_passed',
] as const satisfies readonly EventName[];

/** Every stored spelling of the milestone events, for `eventName: { in }` filters. */
export function partnerMilestoneEventNameCandidates(): string[] {
  return PARTNER_MILESTONE_EVENT_NAMES.flatMap((name) => eventNameReadCandidates(name));
}
