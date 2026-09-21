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
 * Hub URL for a tab. The Overview is the bare hub path; every other tab is
 * `?tab=<id>`. Extra params (e.g. `period`) are appended in insertion order.
 */
export function reportingTabHref(tab: ReportingTabId, extra: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  if (tab !== DEFAULT_TAB) query.set(REPORTING_TAB_PARAM, tab);
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string' && value.length > 0) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${REPORTING_HUB_PATH}?${qs}` : REPORTING_HUB_PATH;
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
    lede: 'Enrollment, placements and engagement for this organization — the numbers /admin/analytics and /admin/metrics used to print separately.',
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
    lede: 'Every CSV, PDF and datasheet funders and the state ask for, listed once.',
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
