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
  'program_completed',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
const eventNames: ReadonlySet<string> = new Set(EVENT_NAMES);
export function isEventName(value: string): value is EventName {
  return eventNames.has(value);
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
