/**
 * Analytics events — pushes to GTM dataLayer for GA4 / tags.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

type EventPayload = {
  event: string;
  [key: string]: unknown;
};

function pushEvent(payload: EventPayload) {
  try {
    if (typeof window === 'undefined') return;
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(payload);
  } catch (err) {
    console.warn('[analytics] dataLayer push failed', err instanceof Error ? err.message : err);
  }
}

export function trackFunnelEvent(
  funnel: string,
  stepName: string,
  extra?: Record<string, unknown>
) {
  pushEvent({
    event: 'funnel_event',
    funnel,
    funnel_step: stepName,
    ...extra,
  });
}

export function trackLeadFormEvent(
  formType: 'contact' | 'employer_intake' | 'partner_signup' | 'careers',
  phase: 'viewed' | 'submitted' | 'succeeded' | 'errored',
  extra?: Record<string, unknown>
) {
  pushEvent({
    event: 'lead_form',
    lead_form_type: formType,
    lead_form_phase: phase,
    ...extra,
  });
}

export function trackMemberReferralShare(action: 'copy_link') {
  pushEvent({
    event: 'member_referral_share',
    member_referral_share_action: action,
  });
}

export function trackApplyFunnel(
  step: number,
  stepName: string,
  extra?: Record<string, unknown>
) {
  pushEvent({
    event: 'apply_funnel',
    apply_step: step,
    apply_step_name: stepName,
    ...extra,
  });
}

export function trackLearningHubNavigate(
  destination: 'career_library' | 'program_resources' | 'wioa_screening'
) {
  pushEvent({
    event: 'learning_hub_navigate',
    learning_hub_destination: destination,
  });
}

export function trackEmployerJobAction(
  action: 'edit' | 'submit_review' | 'publish' | 'pause_job' | 'close_job' | 'view_applications',
  jobId: string,
  extra?: { status?: string }
) {
  pushEvent({
    event: 'employer_job_action',
    employer_job_action: action,
    job_id: jobId,
    ...extra,
  });
}

export function trackEmployerBulkDelete(deletedCount: number, extra?: Record<string, unknown>) {
  pushEvent({
    event: 'employer_bulk_delete',
    deleted_count: deletedCount,
    ...extra,
  });
}

export function trackResourceOpen(resourceId: string, resourceTitle: string) {
  pushEvent({
    event: 'resource_open',
    resource_id: resourceId,
    resource_title: resourceTitle,
  });
}

export function trackToolLaunch(toolId: string, toolTitle: string) {
  pushEvent({
    event: 'tool_launch',
    tool_id: toolId,
    tool_title: toolTitle,
  });
}

export function trackAIToolRun(
  phase: 'started' | 'completed' | 'errored',
  toolId: string,
  extra?: Record<string, unknown>
) {
  pushEvent({
    event: 'ai_tool_run',
    ai_tool_phase: phase,
    tool_id: toolId,
    ...extra,
  });
}

export function trackEmployerImport(
  phase: 'started' | 'succeeded' | 'fallback_used' | 'errored',
  extra?: Record<string, unknown>
) {
  pushEvent({
    event: 'employer_import',
    employer_import_phase: phase,
    ...extra,
  });
}

export function trackLicenseRequest(benefitName: string) {
  pushEvent({
    event: 'license_request',
    benefit_name: benefitName,
  });
}

export function trackBriefOpen(briefId: string, briefTitle: string) {
  pushEvent({
    event: 'brief_open',
    brief_id: briefId,
    brief_title: briefTitle,
  });
}

export function trackApplicationTrackerOpen() {
  pushEvent({
    event: 'application_tracker_open',
  });
}

export function trackConversionRouteView(route: string) {
  pushEvent({
    event: 'conversion_route_view',
    conversion_route: route,
  });
}

export type LearningMilestone = 'course_launched' | 25 | 50 | 75 | 100;

export function trackLearningMilestone(
  milestone: LearningMilestone,
  courseSlug: string,
  extra?: Record<string, unknown>
) {
  pushEvent({
    event: 'learning_milestone',
    milestone: String(milestone),
    course_slug: courseSlug,
    ...extra,
  });
}

/** Member / employer / partner / counselor / admin workspace views (for GA4 exploration). */
export function trackPortalRouteView(route: string) {
  pushEvent({
    event: 'portal_route_view',
    portal_route: route,
  });
}

export function trackWebVitalMetric(
  name: string,
  value: number,
  id: string,
  rating: 'good' | 'needs-improvement' | 'poor',
  route?: string
) {
  pushEvent({
    event: 'web_vital',
    metric_name: name,
    metric_value: Number(value.toFixed(2)),
    metric_id: id,
    metric_rating: rating,
    ...(route ? { conversion_route: route } : {}),
  });
}

export function trackCtaExperimentExposure(experiment: string, variant: string, route: string) {
  pushEvent({
    event: 'cta_experiment_exposure',
    experiment_name: experiment,
    experiment_variant: variant,
    conversion_route: route,
  });
}

export function trackCtaExperimentClick(
  experiment: string,
  variant: string,
  route: string,
  targetHref: string
) {
  pushEvent({
    event: 'cta_experiment_click',
    experiment_name: experiment,
    experiment_variant: variant,
    conversion_route: route,
    cta_target_href: targetHref,
  });
}

export function trackPaidApplyVariantRendered(utmSource: string) {
  pushEvent({
    event: 'paid_apply_variant_rendered',
    utm_source: utmSource,
  });
}

export function trackMemberLoggedIn(extra?: Record<string, unknown>) {
  pushEvent({
    event: 'member_logged_in',
    ...extra,
  });
}

export type ThankYouFunnel = 'apply' | 'employer' | 'partners' | 'careers';

/** Post-conversion thank-you page views (GTM / GA4 custom events). */
export function trackThankYouViewed(funnel: ThankYouFunnel) {
  pushEvent({
    event: `${funnel}_thank_you_viewed`,
    thank_you_funnel: funnel,
  });
}

/**
 * GTM mirror of the server-side `tour_*` member events written by
 * `/api/tours/[tourKey]` (lib/events/names.ts). Engagement only; the server
 * row is the record.
 */
export function trackTourEvent(
  phase: 'started' | 'completed' | 'dismissed',
  tourKey: string,
  extra?: { version?: number; last_step?: number; role?: string; source_page?: string }
) {
  pushEvent({
    event: `tour_${phase}`,
    tour_key: tourKey,
    ...extra,
  });
}
