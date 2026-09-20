/** Runtime member-event vocabulary. Browser engagement is an explicit subset;
 * account, approval, enrollment and completion evidence must originate on the server.
 * Names already persisted retain their exact spelling; no historical rewrite is implied.
 */
export const EVENT_NAMES = [
  'member_logged_in',
  'member_logged_out',
  'email_verified',
  'dashboard_viewed',
  'member_dashboard_viewed',
  'member_dashboard_action_clicked',
  'first_value_panel_rendered',
  'goal_created',
  'goal_updated',
  'goal_completed',
  'resource_viewed',
  'resource_downloaded',
  'resource_saved',
  'resource_completed',
  'ai_tool_opened',
  'journey_stage_selected',
  'ai_tool_run_started',
  'ai_tool_submitted',
  'ai_tool_run_completed',
  'ai_tool_result_saved',
  'ai_result_viewed',
  'pathway_started',
  'pathway_step_completed',
  'pathway_completed',
  'certification_marked_complete',
  'certification_earned',
  'program_enrolled',
  'program_change_approved',
  'course_completed',
  'placement_recorded',
  'application_added',
  'application_updated',
  'application_status_changed',
  'application_approved',
  'application_denied',
  'apply_step_completed',
  'apply_signup_started',
  'apply_signup_completed',
  'employer_import_started',
  'employer_import_succeeded',
  'employer_import_fallback_used',
  'feedback_submitted',
  'employer_job_draft_saved',
  'employer_job_submitted_for_review',
  'employer_job_posted_live',
  'admin_review_queue_viewed',
  'admin_job_review_viewed',
  'admin_recommendations_inspected',
  'weekly_recap_generated',
  'weekly_recap_viewed',
  'training_access_requested',
  'training_access_approved',
  'training_access_activated',
  'member_referral_link_copied',
  'partner_invite_sent',
  'milestone_cascade_sent',
  'milestone_cascade_dismissed',
  'skill_checkpoint_completed',
  'member_dashboard_activated',
  'career_os.learning_completion_duplicate',
  'career_os.learning_completion_processed',
  'career_os.interview_practice_completed',
  'program_completed',
  // Guided tours (lib/tours/registry.ts): written server-side by /api/tours/[tourKey].
  'tour_started',
  'tour_completed',
  'tour_dismissed',
  // WAP-39: names below were written by direct `memberEvent.create` callers
  // before every writer was routed through lib/events/track.ts. Spelling is
  // preserved exactly so existing rows and their readers keep matching.
  'account_deleted',
  'application_reminder_sent',
  'certification_celebration_sent',
  'counselor_bulk_followup_sent',
  'counselor_followup_needed',
  'counselor_inbox_zero_contacted',
  'counselor_inbox_zero_dismissed',
  'counselor_inbox_zero_follow_up_sent',
  'counselor_nudge_sent',
  'course_accountability_sent',
  'course_kickoff_email_sent',
  'employer_intro_created',
  'first90_check_in_submitted',
  'inactive_nudge_sent',
  'member_next_best_action_clicked',
  'partner_payout_sent',
  'pitch_deployed',
  'placement_confirmation_submitted',
  'skill_mission_needs_retry',
  'skill_mission_passed',
  'skill_mission_submitted',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
const eventNames: ReadonlySet<string> = new Set(EVENT_NAMES);
export function isEventName(value: string): value is EventName {
  return eventNames.has(value);
}

/**
 * Historical spellings that were persisted before the taxonomy was enforced
 * (WAP-39). Writers now store the canonical lower_snake_case name; readers
 * must query both spellings via `eventNameReadCandidates` because existing
 * rows are never rewritten in place. Add an entry here whenever a stored
 * spelling is retired; never remove one while rows with that spelling exist.
 */
export const LEGACY_EVENT_NAME_ALIASES = {
  APPLICATION_REMINDER_SENT: 'application_reminder_sent',
  EMPLOYER_INTRO_CREATED: 'employer_intro_created',
  PARTNER_PAYOUT_SENT: 'partner_payout_sent',
  PLACEMENT_CONFIRMATION_SUBMITTED: 'placement_confirmation_submitted',
} as const satisfies Record<string, EventName>;

export type LegacyEventNameAlias = keyof typeof LEGACY_EVENT_NAME_ALIASES;

const legacyAliases: ReadonlyMap<string, EventName> = new Map(
  Object.entries(LEGACY_EVENT_NAME_ALIASES),
);

export function isLegacyEventNameAlias(value: string): value is LegacyEventNameAlias {
  return legacyAliases.has(value);
}

/**
 * Resolve any accepted spelling to the canonical vocabulary name, or `null`
 * when the value is neither a current name nor a known historical alias.
 */
export function canonicalEventName(value: string): EventName | null {
  if (isEventName(value)) return value;
  return legacyAliases.get(value) ?? null;
}

/**
 * Every stored spelling a reader must match for one canonical name: the
 * canonical name first, then any historical aliases. Use this in `where`
 * clauses (`eventName: { in: eventNameReadCandidates('partner_payout_sent') }`)
 * so rows written before the rename stay visible.
 */
export function eventNameReadCandidates(name: EventName): string[] {
  const candidates = [name as string];
  for (const [alias, canonical] of legacyAliases) {
    if (canonical === name) candidates.push(alias);
  }
  return candidates;
}

/** Engagement observations are not proof of completing the referenced action. */
export const CLIENT_EVENT_NAMES = [
  'member_dashboard_viewed',
  'member_dashboard_activated',
  'member_dashboard_action_clicked',
  'first_value_panel_rendered',
  'member_referral_link_copied',
  'journey_stage_selected',
  'admin_job_review_viewed',
] as const satisfies readonly EventName[];
export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];
