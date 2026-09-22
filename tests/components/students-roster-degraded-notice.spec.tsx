import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /admin/students when `coursera_xapi_events` is absent (db:push
 * environments). The probe in lib/coursera/progressQueries.ts drops the xAPI
 * UNION branch instead of throwing, so the roster loads clean but without
 * unmatched Coursera learners. The page must say so, calmly, in the kit's
 * existing notice slot; with the table present nothing extra renders and
 * nothing beyond the probe itself is queried.
 *
 * The real page, loaders, progressQueries and kit render here; only the
 * database client and the design-system primitives are swapped.
 */

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
const mocks = vi.hoisted(() => ({ headers: vi.fn(async () => new Headers()) }));

vi.mock('server-only', () => ({}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }),
  withAdminPageScope: async (_scope: unknown, run: (db: unknown) => unknown) =>
    run({
      user: { findMany: async () => [], count: async () => 0 },
      memberEvent: { groupBy: async () => [] },
      counselorAssignment: { findMany: async () => [] },
      courseEnrollment: { findMany: async () => [] },
    }),
  inheritUserOrg: () => ({}),
  inheritMemberOrg: () => ({}),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: db.$queryRaw,
    courseProgress: { findMany: async () => [] },
  },
}));
vi.mock('@/lib/admin/studentsRosterEnrichment', () => ({ loadStudentRosterEnrichment: async () => [] }));

// Design-system primitives as plain elements: the assertions are about the
// roster's notice, not Astryx internals.
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@astryxdesign/core/Button', () => ({
  Button: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/Link', () => ({
  Link: ({ children, href }: { children?: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@astryxdesign/core/SegmentedControl', () => ({
  SegmentedControl: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SegmentedControlItem: () => null,
}));
vi.mock('@astryxdesign/core/Token', () => ({
  Token: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/ProgressBar', () => ({
  ProgressBar: () => <div role="progressbar" />,
}));

import AdminStudentsPage from '@/app/admin/students/page';

const PROBE = /to_regclass\('public\.coursera_xapi_events'\)/;
const isProbe = (call: unknown[]) => PROBE.test((call[0] as TemplateStringsArray).join(''));
const probeCalls = () => db.$queryRaw.mock.calls.filter(isProbe);
const otherCalls = () => db.$queryRaw.mock.calls.filter((call) => !isProbe(call));

/** The probe answers `present`; every other raw read (unmatched UNIONs, badges, grades) returns nothing. */
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

/**
 * Fresh module graph per render so the once-per-process "table present" memo
 * in progressQueries starts clean for each state.
 */
async function renderPage(params: Record<string, string> = {}) {
  const { default: Page } = await import('@/app/admin/students/page');
  render(await Page({ searchParams: Promise.resolve(params) }));
}

const DEGRADED_TEXT =
  'Coursera unmatched-learner data is unavailable in this environment; the roster below excludes those rows.';

describe('/admin/students when coursera_xapi_events is absent', () => {
  it('says the roster excludes unmatched Coursera rows, in the kit notice slot, calmly', async () => {
    mockDatabase(false);
    await renderPage();

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(DEGRADED_TEXT);
    expect(notice).not.toHaveTextContent(/refresh in a few minutes/);
    expect(notice).not.toHaveTextContent(/error|failed/i);
    // The kit's info-toned notice, not an error banner.
    expect(notice).toHaveClass('wa-kit-training-notice');
    expect(notice).toHaveAttribute('data-testid', 'students-roster-notice');
    // Nothing threw: the reads succeeded without the xAPI branch.
    expect(document.querySelector('[data-portal-error-state]')).toBeNull();
    expect(error).not.toHaveBeenCalled();
    // The UNIONs that did run left the missing table out.
    for (const call of otherCalls()) {
      expect((call[0] as TemplateStringsArray).join('')).not.toMatch(/coursera_xapi_events/);
    }
  });

  it('shows the same notice on the training roster preset', async () => {
    mockDatabase(false);
    await renderPage({ view: 'training' });

    expect(screen.getByRole('status')).toHaveTextContent(DEGRADED_TEXT);
    expect(document.querySelector('[data-portal-error-state]')).toBeNull();
  });
});

describe('/admin/students when coursera_xapi_events is present (production path)', () => {
  it('renders no notice and asks the catalog exactly once', async () => {
    mockDatabase(true);
    await renderPage();

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('students-roster-notice')).toBeNull();
    expect(screen.queryByText(DEGRADED_TEXT)).toBeNull();
    // Only the probe #2483 added: the two unmatched reads start concurrently
    // on a cold process and each asks once before the `true` memo lands, so
    // at most one probe per read, and no other catalog lookups.
    expect(probeCalls().length).toBeLessThanOrEqual(2);
    for (const call of otherCalls()) {
      expect((call[0] as TemplateStringsArray).join('')).not.toMatch(/to_regclass|information_schema/);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders no notice on the training roster preset either', async () => {
    mockDatabase(true);
    await renderPage({ view: 'training' });

    expect(screen.queryByRole('status')).toBeNull();
    expect(probeCalls().length).toBeLessThanOrEqual(2);
    for (const call of otherCalls()) {
      expect((call[0] as TemplateStringsArray).join('')).not.toMatch(/to_regclass|information_schema/);
    }
  });
});
