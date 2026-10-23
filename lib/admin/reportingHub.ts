/**
 * The admin reporting hub (`/admin/reporting`).
 *
 * Admin reporting used to live on seven routes with overlapping numbers and
 * three definitions of "placement rate" (admin audit 2026-09-19, §6.1). The
 * hub renders ONE page with server-driven tabs — Overview, Outcomes, Training
 * progress, Coursera, Exports — and each old route forwards to its tab, with
 * the pre-kit view still reachable behind `?ui=legacy` so no URL dies.
 *
 * Tabs are links (`?tab=`), not a client island, so one request loads one
 * tab's data instead of every loader at once. Everything here is pure so the
 * tab list, the URL parsing and the old→new route map are testable without
 * React or Prisma.
 */

import type { KitTabItem } from '@/components/portal/kit/Tabs';
import type { BoardOutcomesPeriod } from '@/lib/admin/boardOutcomes';

export const REPORTING_HUB_PATH = '/admin/reporting';

export const REPORTING_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'outcomes', label: 'Outcomes' },
  { id: 'training', label: 'Training progress' },
  { id: 'coursera', label: 'Coursera' },
  { id: 'exports', label: 'Exports' },
] as const satisfies ReadonlyArray<KitTabItem>;

export type ReportingTabId = (typeof REPORTING_TABS)[number]['id'];

export const REPORTING_TAB_PARAM = 'tab';
export const REPORTING_PERIOD_PARAM = 'period';

const DEFAULT_TAB: ReportingTabId = 'overview';

type ParamValue = string | string[] | undefined | null;

function first(value: ParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : undefined;
}

/** `?tab=` → tab id; anything unknown opens the Overview. */
export function parseReportingTab(value: ParamValue): ReportingTabId {
  const raw = first(value);
  return REPORTING_TABS.some((tab) => tab.id === raw) ? (raw as ReportingTabId) : DEFAULT_TAB;
}

export const REPORTING_PERIODS = ['all-time', 'ytd', 'q-current', 'q-prev'] as const satisfies ReadonlyArray<BoardOutcomesPeriod>;

/** `?period=` → outcomes period; anything unknown is all time (the board default). */
export function parseReportingPeriod(value: ParamValue): BoardOutcomesPeriod {
  const raw = first(value);
  return (REPORTING_PERIODS as readonly string[]).includes(raw ?? '') ? (raw as BoardOutcomesPeriod) : 'all-time';
}

export const REPORTING_PERIOD_LABELS: Record<BoardOutcomesPeriod, string> = {
  'all-time': 'All time',
  ytd: 'Year to date',
  'q-current': 'This quarter',
  'q-prev': 'Last quarter',
};

/**
 * Hub URL for a tab. Every tab — including Overview — is `?tab=<id>` so
 * sidebar deep-links (Analytics → overview, Outcomes → outcomes) can match
 * the active rail row via query (UI-19). Extra params (e.g. `period`) follow
 * in insertion order. Bare `/admin/reporting` still parses as Overview.
 */
export function reportingTabHref(tab: ReportingTabId, extra: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  query.set(REPORTING_TAB_PARAM, tab);
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string' && value.length > 0) query.set(key, value);
  }
  return `${REPORTING_HUB_PATH}?${query.toString()}`;
}

/**
 * Old reporting routes → the hub tab that now owns them. Each page keeps its
 * pre-kit view behind `?ui=legacy`; without that flag it forwards here.
 */
export const REPORTING_REDIRECTS = {
  '/admin/analytics': 'overview',
  '/admin/metrics': 'overview',
  '/admin/board': 'outcomes',
  '/admin/outcomes': 'outcomes',
  '/admin/training-progress': 'training',
  '/admin/coursera': 'coursera',
  '/admin/exports': 'exports',
} as const satisfies Record<string, ReportingTabId>;

export type ReportingLegacyPath = keyof typeof REPORTING_REDIRECTS;

/** Query keys a legacy route carries into the hub (only the outcomes period today). */
const CARRIED_PARAMS: Partial<Record<ReportingLegacyPath, readonly string[]>> = {
  '/admin/board': [REPORTING_PERIOD_PARAM],
  '/admin/outcomes': [REPORTING_PERIOD_PARAM],
};

/** Where a legacy route forwards, with the params it still honours. */
export function reportingRedirectHref(
  path: ReportingLegacyPath,
  params: Record<string, ParamValue> = {},
): string {
  const extra: Record<string, string | undefined> = {};
  for (const key of CARRIED_PARAMS[path] ?? []) {
    const value = first(params[key]);
    if (key === REPORTING_PERIOD_PARAM) {
      // Only a valid period travels; junk falls back to the hub default.
      if (value && (REPORTING_PERIODS as readonly string[]).includes(value)) extra[key] = value;
    } else if (value) {
      extra[key] = value;
    }
  }
  return reportingTabHref(REPORTING_REDIRECTS[path], extra);
}

/** True when a legacy route should still render its own pre-kit view. */
export function wantsLegacyView(params: Record<string, ParamValue> | undefined): boolean {
  return first(params?.ui) === 'legacy';
}

export type ReportingTabCopy = {
  title: string;
  lede: string;
};

/** Section title + one-line definition of what the tab counts. */
export const REPORTING_TAB_COPY: Record<ReportingTabId, ReportingTabCopy> = {
  overview: {
    title: 'Overview',
    lede: 'Enrollment, placement outcomes and portal engagement, with the period shown beside each measure.',
  },
  outcomes: {
    title: 'Outcomes',
    lede: 'Board- and funder-ready placement outcomes from the outcomes snapshot; the same source as the printable board report.',
  },
  training: {
    title: 'Training progress',
    lede: 'Per-learner curriculum progress and pace, on the one admin roster (members only).',
  },
  coursera: {
    title: 'Coursera',
    lede: 'Sync health, unmatched learners and catalog health for the Coursera integration.',
  },
  exports: {
    title: 'Exports',
    lede: 'Choose the report, confirm its period and filters, then download or print.',
  },
};

export type ReportingRelatedLink = {
  href: string;
  label: string;
  description: string;
};

/**
 * Reporting surfaces that stay on their own routes (print layouts, client-side
 * report builders and specialised dashboards) but are reachable from the hub.
 */
export const REPORTING_RELATED_LINKS: readonly ReportingRelatedLink[] = [
  { href: '/admin/reports/quarterly-outcomes', label: 'Quarterly outcomes report', description: 'Grant-ready quarter report with CSV bundle' },
  { href: '/admin/board/print', label: 'Board report (print)', description: 'Print-ready funder outcomes, no portal chrome' },
  { href: '/admin/outcomes/methodology', label: 'Outcomes methodology', description: 'Metric definitions and query sources' },
  { href: '/admin/weekly-recap', label: 'Weekly recap', description: 'Week-over-week cohort and scoreboard digest' },
  { href: '/admin/dashboard', label: 'Executive dashboard', description: 'Funnel targets and weekly trends' },
  { href: '/admin/analytics/ai-efficacy', label: 'AI tool efficacy', description: 'Which AI tools move members forward' },
  { href: '/admin/growth', label: 'Growth', description: 'Paid-traffic signup sanity check' },
];

/** Reading context only: these descriptions do not change any metric query.
 * An outcomes period is carried between tabs, but never relabels rolling or
 * current-state metrics as if they had been filtered to that period. */
export function reportingViewContext(tab: ReportingTabId, period: BoardOutcomesPeriod, superAdmin = false): {
  periodLabel: string;
  scopeLabel: string;
  definition: string;
} {
  switch (tab) {
    case 'outcomes':
      return {
        periodLabel: `Outcomes: ${REPORTING_PERIOD_LABELS[period]}`,
        scopeLabel: superAdmin ? 'All organizations' : 'This organization',
        definition: 'Enrollment and placement measures use the selected outcomes period. Activity and recent certification measures keep their labeled rolling windows. See the methodology for each denominator.',
      };
    case 'training':
      return {
        periodLabel: 'Latest saved training progress',
        scopeLabel: 'Members in your admin scope',
        definition: 'Course completion follows each student’s assigned curriculum. Pace and last activity are separate signals; unmatched provider records remain identified. The outcomes period does not filter this roster.',
      };
    case 'coursera':
      return {
        periodLabel: 'Latest sync status · activity: last 30 days',
        scopeLabel: 'Configured Coursera organization',
        definition: 'Provider progress and unmatched identities are shown with their sync status. Missing credentials or unavailable evidence must remain visible; they do not mean no activity.',
      };
    case 'exports':
      return {
        periodLabel: `Outcomes files: ${REPORTING_PERIOD_LABELS[period]}`,
        scopeLabel: 'Each report uses its existing access scope',
        definition: 'Outcomes CSV and board PDF use the retained outcomes period. Training and eligibility exports have their own filters; the program catalog is a current catalog export.',
      };
    case 'overview':
    default:
      return {
        periodLabel: 'Current totals and labeled activity windows',
        scopeLabel: superAdmin ? 'Enrollment: your organization · engagement: all organizations' : 'This organization',
        definition: 'Weekly active counts cover seven days. Saved AI-result and voice-session totals use their stated windows. The outcomes period is retained for Outcomes and its exports, without changing these measures.',
      };
  }
}

export function reportingRelatedHref(href: string, period: BoardOutcomesPeriod): string {
  return href === '/admin/board/print' && period !== 'all-time' ? `${href}?period=${period}` : href;
}
