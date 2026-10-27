import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator, type AbstractIntlMessages } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

type Tree = { [key: string]: unknown };
type Locale = 'en' | 'es' | 'fr' | 'pt';

const mocks = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'es' | 'fr' | 'pt',
  catalogs: {} as Record<string, unknown>,
  calls: [] as string[],
  user: vi.fn(), employer: vi.fn(), rows: vi.fn(), count: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => { mocks.calls.push('locale'); return mocks.locale; },
  getTranslations: async (namespace: string) => createTranslator({ locale: mocks.locale, messages: mocks.catalogs[mocks.locale] as AbstractIntlMessages, namespace: namespace as never }),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: (...args: unknown[]) => { mocks.calls.push('user'); return mocks.user(...args); } }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: (...args: unknown[]) => { mocks.calls.push('employer'); return mocks.employer(...args); } }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: async () => '/employer/setup' }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { jobPostingApplication: {
  findMany: (...args: unknown[]) => { mocks.calls.push('findMany'); return mocks.rows(...args); },
  count: (...args: unknown[]) => { mocks.calls.push('count'); return mocks.count(...args); },
} } }));
vi.mock('@/components/portal/EmployerApplicationChatClient', () => ({ default: () => null }));

import EmployerCandidatesPage from '@/app/(portal)/employer/candidates/page';
import EmployerApplicationsPage from '@/app/(portal)/employer/applications/page';

function merge(base: Tree, override: Tree): Tree {
  const out: Tree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] = value && typeof value === 'object' && !Array.isArray(value) && existing && typeof existing === 'object' && !Array.isArray(existing)
      ? merge(existing as Tree, value as Tree)
      : value;
  }
  return out;
}
const CATALOGS: Record<Locale, Tree> = { en, es: merge(en, es), fr: merge(en, fr), pt: merge(en, pt) };
mocks.catalogs = CATALOGS;

const ROUTES = {
  candidates: (params: Record<string, string>) => EmployerCandidatesPage({ searchParams: Promise.resolve({ view: 'applicants', ...params }) }),
  applications: (params: Record<string, string>) => EmployerApplicationsPage({ searchParams: Promise.resolve(params) }),
} as const;
type Route = keyof typeof ROUTES;
const ROUTE_NAMES = Object.keys(ROUTES) as Route[];

async function renderRoute(route: Route, params: Record<string, string>, locale: Locale = 'en') {
  mocks.locale = locale;
  const element = await ROUTES[route](params);
  return render(
    <NextIntlClientProvider locale={locale} messages={CATALOGS[locale] as AbstractIntlMessages} timeZone="America/New_York">
      {element}
    </NextIntlClientProvider>,
  );
}

function employerCopy(locale: Locale) {
  return CATALOGS[locale].employer as Record<string, string>;
}

const NEW_COPY = /No applicants at the|No applicants on this page|Clear the stage filter|Return to the first page/;

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.locale = 'en';
  mocks.user.mockResolvedValue({ id: 'viewer-1' });
  mocks.employer.mockResolvedValue({ employerId: 'company-1' });
  mocks.rows.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  window.history.replaceState(null, '', '/employer/candidates?view=applicants');
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this test'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(ROUTE_NAMES)('%s route', (route) => {
  it('keeps the translated genuine zero with the route-owned action and heading outline', async () => {
    await renderRoute(route, {});
    const copy = employerCopy('en');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.candidatesWorkspaceTitle);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`${copy.applicantsMetaTitle} (0)`);
    const heading = screen.getByRole('heading', { level: 3, name: copy.noApplicationsYet });
    expect(screen.getByText(copy.postRoleToStartReceiving)).toBeInTheDocument();
    expect(within(heading.closest('[data-kind]') as HTMLElement).getByRole('link', { name: copy.postAJob })).toHaveAttribute('href', '/employer/jobs/new');
    expect(document.body.textContent).not.toMatch(NEW_COPY);
  });

  it('renders the English stage-zero in both layouts below the Applicants heading', async () => {
    await renderRoute(route, { status: 'interview', sort: 'applied_asc' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    const headings = screen.getAllByRole('heading', { level: 3, name: 'No applicants at the Interviewing stage' });
    expect(headings).toHaveLength(2);
    for (const link of screen.getAllByRole('link', { name: 'Show all applicants' })) {
      expect(link).toHaveAttribute('href', '/employer/candidates?view=applicants&sort=applied_asc');
    }
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { job: { employerId: 'company-1' }, status: 'interview' }, skip: 0, take: 25, orderBy: { appliedAt: 'asc' } }));
    expect(mocks.count).toHaveBeenCalledWith({ where: { job: { employerId: 'company-1' }, status: 'interview' } });
  });

  it('renders the English empty page for a positive total, with and without a stage', async () => {
    mocks.count.mockResolvedValue(30);
    const { unmount } = await renderRoute(route, { page: '9' });
    expect(screen.getAllByRole('heading', { level: 3, name: 'No applicants on this page' })).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/No applicants at the|past the last/);
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { job: { employerId: 'company-1' } }, skip: 200, take: 25, orderBy: { appliedAt: 'desc' } }));
    unmount();

    await renderRoute(route, { page: '4', status: 'reviewing' });
    expect(screen.getAllByRole('heading', { level: 3, name: 'No applicants on this page' })).toHaveLength(2);
    expect(screen.queryByText(/No applicants at the Reviewing stage/)).toBeNull();
  });
});

describe('non-English requests keep the existing rendering', () => {
  for (const locale of ['es', 'fr', 'pt'] as const) {
    it(`${locale}: genuine zero, stage zero and empty page`, async () => {
      const copy = employerCopy(locale);
      const first = await renderRoute('candidates', {}, locale);
      const firstHeading = screen.getByRole('heading', { level: 3, name: copy.noApplicationsYet });
      expect(within(firstHeading.closest('[data-kind]') as HTMLElement).getByRole('link', { name: copy.postAJob })).toHaveAttribute('href', '/employer/jobs/new');
      expect(document.body.textContent).not.toMatch(NEW_COPY);
      first.unmount();

      const stage = await renderRoute('candidates', { status: 'reviewing' }, locale);
      expect(screen.getAllByRole('heading', { level: 3, name: 'No applicants match this filter' })).toHaveLength(2);
      expect(document.body.textContent).not.toMatch(NEW_COPY);
      stage.unmount();

      mocks.count.mockResolvedValue(30);
      await renderRoute('applications', { page: '9' }, locale);
      expect(screen.getByRole('heading', { level: 3, name: 'No applications yet' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: copy.noApplicationsYet })).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(NEW_COPY);
    });
  }

  it('a query parameter cannot select English under a non-English request', async () => {
    await renderRoute('candidates', { status: 'reviewing', locale: 'en', lang: 'en', hl: 'en' }, 'es');
    expect(document.body.textContent).not.toMatch(NEW_COPY);
  });
});

describe('authorization and reads', () => {
  it('authorizes before any read and adds no read for the new states', async () => {
    mocks.count.mockResolvedValue(30);
    await renderRoute('candidates', { page: '3', status: 'offered', sort: 'applied_asc' });
    expect(mocks.calls.slice(0, 2)).toEqual(['user', 'employer']);
    expect(mocks.calls.filter((call) => call === 'findMany')).toHaveLength(1);
    expect(mocks.calls.filter((call) => call === 'count')).toHaveLength(1);
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { job: { employerId: 'company-1' }, status: 'offered' }, skip: 50, take: 25, orderBy: { appliedAt: 'asc' } }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('redirects signed-out and unlinked viewers before records or locale are read', async () => {
    mocks.user.mockResolvedValueOnce(null);
    await expect(EmployerApplicationsPage({ searchParams: Promise.resolve({ status: 'reviewing' }) })).rejects.toThrow('redirect:/login?redirectTo=/employer/applications');
    mocks.employer.mockResolvedValueOnce(null);
    await expect(EmployerCandidatesPage({ searchParams: Promise.resolve({ view: 'applicants' }) })).rejects.toThrow('redirect:/employer/setup');
    expect(mocks.rows).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.calls).not.toContain('locale');
  });

  it('an invalid status goes through the existing parser and the unfiltered genuine zero', async () => {
    await renderRoute('candidates', { status: 'archived' });
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { job: { employerId: 'company-1' } } }));
    expect(screen.getByRole('heading', { level: 3, name: employerCopy('en').noApplicationsYet })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(NEW_COPY);
  });

  it('a failed list or count read stays a failure, never an empty list', async () => {
    mocks.rows.mockRejectedValueOnce(new Error('list read failed'));
    await expect(ROUTES.candidates({ status: 'reviewing' })).rejects.toThrow('list read failed');
    mocks.count.mockRejectedValueOnce(new Error('count read failed'));
    await expect(ROUTES.applications({})).rejects.toThrow('count read failed');
  });

  it('populated rows keep the table and cards', async () => {
    mocks.rows.mockResolvedValue([{ id: 'application-1', jobId: 'job-1', status: 'reviewing', appliedAt: new Date('2026-09-01'), employerNotes: null, job: { id: 'job-1', title: 'Support' }, student: { id: 'member-1', fullName: 'Fixture Member', email: 'member@example.test' } }]);
    mocks.count.mockResolvedValue(1);
    await renderRoute('candidates', { status: 'reviewing' });
    expect(screen.getAllByText('Fixture Member').length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toMatch(NEW_COPY);
    expect(document.body.textContent).not.toContain('No applicants match this filter');
  });
});
