/**
 * Guided-tour registry (design: scratchpad tours/design.md §4-5).
 *
 * One entry per tour key. Copy lives in `messages/<locale>.json` under the
 * `tours` namespace; `titleKey` / `bodyKey` are relative to that namespace so
 * the client resolves them with `useTranslations('tours')`. Bump `version`
 * when a tour's steps change enough that people who finished the old one
 * should see it again; `UserTourState.version < registry.version` re-tours.
 *
 * Pure data + pure functions: safe to import from server components, API
 * routes, client components and `node --test`.
 */

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right';

/** Persona a tour is written for; also stored on tour telemetry. */
export type TourRole = 'member' | 'employer' | 'partner' | 'counselor' | 'admin';

export const TOUR_STATUSES = ['STARTED', 'COMPLETED', 'DISMISSED'] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export interface TourStepDefinition {
  /** `data-tour` attribute value of the anchor element. Missing anchors are skipped by the engine. */
  target: string;
  /** i18n key relative to the `tours` namespace, e.g. `member.home.dashboard.title`. */
  titleKey: string;
  bodyKey: string;
  placement: TourPlacement;
}

export interface TourDefinition {
  key: TourKey;
  version: number;
  role: TourRole;
  /** Route the tour is written for; `?tour=<key>` deep links land here. */
  route: string;
  steps: readonly TourStepDefinition[];
}

export const TOUR_KEYS = ['member.home', 'employer.home', 'partner.home', 'counselor.home'] as const;
export type TourKey = (typeof TOUR_KEYS)[number];

/** Step shape consumed by the tour engine (`components/portal/kit/GuidedTour`). */
export interface TourStep {
  targetId: string;
  titleKey: string;
  bodyKey: string;
  placement?: TourPlacement;
}

function step(
  tour: TourKey,
  slug: string,
  target: string,
  placement: TourPlacement = 'right',
): TourStepDefinition {
  return {
    target,
    titleKey: `${tour}.${slug}.title`,
    bodyKey: `${tour}.${slug}.body`,
    placement,
  };
}

export const TOUR_REGISTRY: Readonly<Record<TourKey, TourDefinition>> = {
  'member.home': {
    key: 'member.home',
    version: 2,
    role: 'member',
    route: '/dashboard',
    steps: [
      step('member.home', 'dashboard', 'tour-dashboard'),
      step('member.home', 'aiTools', 'tour-ai-tools'),
      step('member.home', 'learning', 'tour-learning'),
      step('member.home', 'messages', 'tour-messages'),
      step('member.home', 'profile', 'tour-profile'),
    ],
  },
  /**
   * Employer first-login tour (tours wave 3, v3). Written for the /employer
   * overview: `tour-post-job` is the page's Post a job action, the `tour-*`
   * nav anchors are `tourTarget`s on `EMPLOYER_PORTAL_NAV_ITEMS` (rendered by
   * `WorkspaceShell`) and `tour-help` is the header Help menu that reopens the
   * tour. Post a job → review candidates → pipeline → messages → settings.
   * v3 supersedes the v2 rail walk-through (work queue / jobs / matches are
   * named in the copy instead of getting their own step).
   */
  'employer.home': {
    key: 'employer.home',
    version: 3,
    role: 'employer',
    route: '/employer',
    steps: [
      step('employer.home', 'overview', 'tour-overview'),
      step('employer.home', 'postJob', 'tour-post-job', 'bottom'),
      step('employer.home', 'applicants', 'tour-applicants'),
      step('employer.home', 'pipeline', 'tour-pipeline'),
      step('employer.home', 'messages', 'tour-messages'),
      step('employer.home', 'settings', 'tour-settings'),
      step('employer.home', 'help', 'tour-help', 'bottom'),
    ],
  },
  /**
   * Partner first-login tour (tours wave 3, v3). Written for the /partner
   * overview: `tour-referral-link` and `tour-payouts` are page sections
   * (payouts renders for referral partners only, so that step is skipped for
   * everyone else), the `tour-*` nav anchors are `tourTarget`s on
   * `PARTNER_PORTAL_NAV_ITEMS` and `tour-help` is the header Help menu.
   * Referral link → referred members → attention → payouts → exports → messages.
   */
  'partner.home': {
    key: 'partner.home',
    version: 3,
    role: 'partner',
    route: '/partner',
    steps: [
      step('partner.home', 'referralLink', 'tour-referral-link', 'bottom'),
      step('partner.home', 'members', 'tour-members'),
      step('partner.home', 'attention', 'tour-attention'),
      step('partner.home', 'payouts', 'tour-payouts', 'top'),
      step('partner.home', 'exports', 'tour-exports'),
      step('partner.home', 'messages', 'tour-messages'),
      step('partner.home', 'help', 'tour-help', 'bottom'),
    ],
  },
  /**
   * Counselor wave (tours wave 2). Written for the Today landing page: the
   * three page anchors live in `CounselorTodayKit`, the three `tour-nav-*`
   * anchors are `tourTarget`s on `COUNSELOR_PORTAL_NAV_ITEMS` (rendered by
   * `WorkspaceShell`), and `tour-help` is the header Help menu that reopens
   * the tour (`PortalHelpMenu`). Every anchor is present on /counselor/today,
   * so the step counter never jumps; the same steps still resolve from any
   * counselor page for the shell anchors (missing page anchors are skipped).
   */
  'counselor.home': {
    key: 'counselor.home',
    version: 1,
    role: 'counselor',
    route: '/counselor/today',
    steps: [
      step('counselor.home', 'attention', 'tour-today-attention', 'bottom'),
      step('counselor.home', 'queue', 'tour-today-queue'),
      step('counselor.home', 'openMember', 'tour-today-roster', 'bottom'),
      step('counselor.home', 'memberRecord', 'tour-nav-members'),
      step('counselor.home', 'atRisk', 'tour-nav-at-risk'),
      step('counselor.home', 'messages', 'tour-nav-messages'),
      step('counselor.home', 'help', 'tour-help', 'bottom'),
    ],
  },
};

/** Portal names used by the legacy `startTour(steps, portal)` API and `/api/onboarding/tour-complete`. */
export type LegacyTourPortal = 'member' | 'employer' | 'partner';

export const LEGACY_PORTAL_TOUR_KEY: Readonly<Record<LegacyTourPortal, TourKey>> = {
  member: 'member.home',
  employer: 'employer.home',
  partner: 'partner.home',
};

/** Version recorded for rows synthesised from the legacy `tourCompletedAt` timestamps. */
export const LEGACY_TOUR_VERSION = 1;

export function isTourKey(value: unknown): value is TourKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TOUR_REGISTRY, value);
}

export function isTourStatus(value: unknown): value is TourStatus {
  return typeof value === 'string' && (TOUR_STATUSES as readonly string[]).includes(value);
}

export function getTour(key: string): TourDefinition | null {
  return isTourKey(key) ? TOUR_REGISTRY[key] : null;
}

export function listTours(): TourDefinition[] {
  return TOUR_KEYS.map((key) => TOUR_REGISTRY[key]);
}

/**
 * The tour a persona's shell offers on first login and from the Help menu:
 * the first registered tour written for that role, or null when the wave for
 * that role has not landed. Order follows `TOUR_KEYS`.
 */
export function getHomeTourForRole(role: string): TourDefinition | null {
  return listTours().find((tour) => tour.role === role) ?? null;
}

/** Engine steps for a registered tour. */
export function toTourSteps(tour: TourDefinition): TourStep[] {
  return tour.steps.map((s) => ({
    targetId: s.target,
    titleKey: s.titleKey,
    bodyKey: s.bodyKey,
    placement: s.placement,
  }));
}
