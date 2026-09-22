import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reporting Coursera tab and the legacy /admin/coursera page when
 * `coursera_xapi_events` is absent (db:push environments). #2494 gave
 * /admin/students the calm notice; these two surfaces read the same
 * unmatched-learner loaders and were still silent. They must show the same
 * sentence in an info-toned `role="status"` slot, and with the table present
 * render nothing extra and query nothing beyond the probe itself.
 *
 * The real section / page, progressQueries, kit and notice module render
 * here; only the database client, tenant scope, the unrelated Coursera
 * loaders and the design-system primitives are swapped.
 */

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }),
  withAdminPageScope: async (_scope: unknown, run: (db: unknown) => unknown) =>
    run({ user: { findMany: async () => [], count: async () => 0 } }),
  inheritUserOrg: () => ({}),
  inheritMemberOrg: () => ({}),
  inheritLeaderOrg: () => ({}),
  inheritInvitedByOrg: () => ({}),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: db.$queryRaw,
    courseProgress: { findMany: async () => [] },
  },
}));
// Coursera loaders that are not the unmatched-learner reads under test.
vi.mock('@/lib/coursera/programCourseList', () => ({ loadValidatedProgramCatalog: async () => [] }));
vi.mock('@/lib/coursera/replayPendingXapi', () => ({ countUnresolvedXapiOrganizations: async () => 0 }));
vi.mock('@/lib/admin/courseraOps', () => ({
  getCourseraSyncStatus: async () => ({ lastXapiReceivedAt: null, distinctMembersWithCourseProgress: 0, attentionStatementCount: 0 }),
  listXapiStatementsNeedingAttention: async () => [],
  loadMemberProgressAuditByEmail: async () => null,
}));
vi.mock('@/lib/xapi/mappings', () => ({
  getCourseraSkillsetProgressSummary: async () => ({ totalRows: 0, latestSyncedAt: null, topMembers: [] }),
  getCourseraUnmatchedActorAlertStats: async () => ({ distinctUnmatchedActorEmails: 0, newAlertRowsLast7Days: 0, recentFirstSeen: [] }),
  listCourseraIdentityMappings: async () => [],
}));
vi.mock('@/components/admin/CourseraCatalogHealthTable', () => ({ CourseraCatalogHealthSection: () => null }));
// Legacy-page client tooling that is not part of the unmatched section.
vi.mock('@/components/admin/CourseraMappingsAdmin', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraUnmatchedLearners', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraPipelineFlow', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraSyncProgressButton', () => ({ default: () => null }));
vi.mock('@/components/admin/SeedCanonicalMappingsButton', () => ({ default: () => null }));
vi.mock('@/components/admin/SeedCanonicalMappingsFromB4BButton', () => ({ default: () => null }));
vi.mock('@/components/admin/B4BBindingsSuggestionsCard', () => ({ default: () => null }));
vi.mock('@/components/admin/B4BProgramsListButton', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraSelfTest', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraReconcileCard', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraInspectByEmailCard', () => ({ default: () => null }));
vi.mock('@/components/portal/ui/DataTable', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
// Design-system primitives as plain elements: the assertions are about the
// notice slot, not Astryx internals.
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@astryxdesign/core/Button', () => ({
  Button: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/Link', () => ({
  Link: ({ children, href }: { children?: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@astryxdesign/core/Token', () => ({
  Token: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
}));

const PROBE = /to_regclass\('public\.coursera_xapi_events'\)/;
const isProbe = (call: unknown[]) => PROBE.test((call[0] as TemplateStringsArray).join(''));
const probeCalls = () => db.$queryRaw.mock.calls.filter(isProbe);
const otherCalls = () => db.$queryRaw.mock.calls.filter((call) => !isProbe(call));

/** The probe answers `present`; every other raw read returns nothing. */
function mockDatabase(present: boolean): void {
  db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
    PROBE.test(strings.join('')) ? [{ present }] : [],
  );
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  db.$queryRaw.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  warn.mockRestore();
  error.mockRestore();
});

/** Fresh module graph per render so the once-per-process "table present" memo starts clean. */
async function renderCourseraTab() {
  const { ReportingCourseraSection } = await import('@/app/admin/reporting/sections/CourseraSection');
  render(
    await ReportingCourseraSection({
      scope: { ok: true, orgId: 'org-1', superAdmin: false },
      userId: 'admin-1',
      readOnlyAudit: false,
    }),
  );
}

async function renderLegacyPage(params: Record<string, string> = {}) {
  const { default: Page } = await import('@/app/admin/coursera/page');
  render(await Page({ searchParams: Promise.resolve({ ui: 'legacy', ...params }) }));
}

// The Coursera surfaces call their unmatched section an activity backlog, "not a
// provider membership roster", one line above this notice — so it says "list".
const DEGRADED_TEXT =
  'Coursera unmatched-learner data is unavailable in this environment; the list below excludes those rows.';

function expectCalmNotice(testId: string) {
  const notice = screen.getByRole('status');
  expect(notice).toHaveTextContent(DEGRADED_TEXT);
  expect(notice).not.toHaveTextContent(/roster/);
  expect(notice).not.toHaveTextContent(/refresh in a few minutes/);
  expect(notice).not.toHaveTextContent(/error|failed/i);
  // The kit's info-toned notice, not an error banner.
  expect(notice).toHaveClass('wa-kit-training-notice');
  expect(notice).toHaveAttribute('data-testid', testId);
  // Nothing threw: the reads succeeded without the xAPI branch.
  expect(error).not.toHaveBeenCalled();
  // The unmatched UNIONs that did run left the missing table out. (The
  // Coursera tab's "active last 30 days" tile reads coursera_xapi_events
  // directly and fails soft to "—" via allSettled; that is a separate read,
  // not the unmatched-learner gap this notice describes.)
  const unmatchedUnions = otherCalls().filter((call) => /FROM coursera_course_progress/.test((call[0] as TemplateStringsArray).join('')));
  expect(unmatchedUnions.length).toBeGreaterThan(0);
  for (const call of unmatchedUnions) {
    expect((call[0] as TemplateStringsArray).join('')).not.toMatch(/coursera_xapi_events/);
  }
}

function expectProductionPath(maxProbes: number) {
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText(DEGRADED_TEXT)).toBeNull();
  // Only the probe #2483 added, at most once per concurrent read on a cold
  // process; no other catalog lookups.
  expect(probeCalls().length).toBeLessThanOrEqual(maxProbes);
  for (const call of otherCalls()) {
    expect((call[0] as TemplateStringsArray).join('')).not.toMatch(/to_regclass|information_schema/);
  }
  expect(warn).not.toHaveBeenCalled();
}

describe('reporting Coursera tab when coursera_xapi_events is absent', () => {
  it('says the unmatched list excludes xAPI rows, in the kit notice slot, calmly', async () => {
    mockDatabase(false);
    await renderCourseraTab();

    expectCalmNotice('coursera-sync-notice');
    // The unmatched card still loaded (this is a gap, not a failure).
    expect(screen.getByRole('heading', { name: 'Unmatched Learners' })).toBeInTheDocument();
    expect(screen.queryByText('Unmatched records unavailable')).toBeNull();
  });
});

describe('reporting Coursera tab when coursera_xapi_events is present (production path)', () => {
  it('renders no notice and asks the catalog at most once per concurrent read', async () => {
    mockDatabase(true);
    await renderCourseraTab();

    // Three unmatched reads start concurrently before the `true` memo lands.
    expectProductionPath(3);
    expect(screen.queryByTestId('coursera-sync-notice')).toBeNull();
  });
});

describe('/admin/coursera?ui=legacy when coursera_xapi_events is absent', () => {
  it('opens the unmatched section with the same notice', async () => {
    mockDatabase(false);
    await renderLegacyPage();

    expectCalmNotice('coursera-xapi-notice');
    const details = screen.getByRole('status').closest('details');
    expect(details).not.toBeNull();
    expect(details).toHaveAttribute('open');
  });

  it('keeps the notice when test accounts are shown (only the list read runs)', async () => {
    mockDatabase(false);
    await renderLegacyPage({ showTest: '1' });

    expect(screen.getByRole('status')).toHaveTextContent(DEGRADED_TEXT);
  });
});

describe('/admin/coursera?ui=legacy when coursera_xapi_events is present (production path)', () => {
  it('renders no notice and asks the catalog exactly once', async () => {
    mockDatabase(true);
    await renderLegacyPage();

    // The two unmatched reads run sequentially here, so the memo lands after the first.
    expectProductionPath(1);
    expect(screen.queryByTestId('coursera-xapi-notice')).toBeNull();
  });
});
