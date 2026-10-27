import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator, type AbstractIntlMessages } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPostingApplicationStatus } from '@prisma/client';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import scoped from '@/messages/scoped/employer-applications.en.json';
import EmployerApplicationsClient, { type EmployerApplicationRow } from '@/components/employer/EmployerApplicationsClient';
import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import type { EmployerApplicationsSort } from '@/lib/employer/employerApplicationsListQuery';
import type { EmployerApplicationsEmptyContext } from '@/lib/employer/applicationEmptyState';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/components/portal/EmployerApplicationChatClient', () => ({ default: () => null }));

type Tree = { [key: string]: unknown };
type Locale = 'en' | 'es' | 'fr' | 'pt';

/** The same English-under-locale deep merge as i18n/request.ts. */
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

/** Fallback-available sentinel copy under the same keys as the scoped English catalog. */
const SENTINEL: Tree = {
  empty: { employer: {
    applicationsFiltered: { title: 'SENTINEL stage {stage}', body: 'SENTINEL filtered body', action: 'SENTINEL filtered action' },
    applicationsPage: { title: 'SENTINEL page', body: 'SENTINEL page body', action: 'SENTINEL page action' },
  } },
};

const STAGES: Array<[JobPostingApplicationStatus, string]> = [
  ['pending', 'New'],
  ['reviewing', 'Reviewing'],
  ['interview', 'Interviewing'],
  ['offered', 'Offer extended'],
  ['hired', 'Hired'],
  ['rejected', 'Not selected'],
];

const NEW_COPY = [
  /No applicants at the/,
  /No applicants on this page/,
  /Clear the stage filter to see every applicant\./,
  /Return to the first page to see the current list\./,
  /SENTINEL/,
];

type ClientProps = {
  initialRows: EmployerApplicationRow[];
  activeStatusFilter: JobPostingApplicationStatus | null;
  activeSort: EmployerApplicationsSort;
  emptyContext?: EmployerApplicationsEmptyContext;
};

const CLIENTS = {
  desktop: (props: ClientProps) => <EmployerApplicationsClient {...props} />,
  mobile: (props: ClientProps) => <MobileApplicationsClient {...props} />,
} as const;
type Layout = keyof typeof CLIENTS;
const LAYOUTS = Object.keys(CLIENTS) as Layout[];

function ui(layout: Layout, props: ClientProps, locale: Locale = 'en', messages: Tree = CATALOGS[locale]) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages as AbstractIntlMessages} timeZone="America/New_York">
      {CLIENTS[layout](props)}
    </NextIntlClientProvider>
  );
}

function hrefParts(href: string | null) {
  const url = new URL(href ?? '', 'https://example.test');
  return { path: url.pathname, params: Object.fromEntries(url.searchParams) };
}

const row = (id: string, status = 'reviewing'): EmployerApplicationRow => ({
  id, jobId: `job-${id}`, status, appliedAt: '2026-09-01T00:00:00Z', employerNotes: null,
  job: { id: `job-${id}`, title: `Role ${id}` },
  student: { id: `student-${id}`, fullName: `Applicant ${id}`, email: `${id}@example.test` },
});

function expectNoNewCopy() {
  for (const pattern of NEW_COPY) expect(document.body.textContent).not.toMatch(pattern);
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  window.history.replaceState(null, '', '/employer/candidates?view=applicants');
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this test'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('English stage-zero', () => {
  for (const layout of LAYOUTS) {
    it.each(STAGES)(`${layout}: %s reads its employer stage word and resets to every applicant with the sort kept`, (status, word) => {
      render(ui(layout, { initialRows: [], activeStatusFilter: status, activeSort: 'applied_asc', emptyContext: { locale: 'en', filteredTotal: 0 } }));
      const heading = screen.getByRole('heading', { level: 3, name: `No applicants at the ${word} stage` });
      expect(heading.closest('[data-kind]')).toHaveAttribute('data-kind', 'filtered');
      expect(screen.getByText('Clear the stage filter to see every applicant.')).toBeInTheDocument();
      expect(hrefParts(screen.getByRole('link', { name: 'Show all applicants' }).getAttribute('href'))).toEqual({
        path: '/employer/candidates', params: { view: 'applicants', sort: 'applied_asc' },
      });
      expect(document.body.textContent).not.toContain('{stage}');
      expect(screen.queryByRole('heading', { name: new RegExp(`\\b${status}\\b`) })).toBeNull();
      expect(screen.queryByText('No applicants match this filter')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it('keeps the desktop stage and sort controls usable around the new state', () => {
    render(ui('desktop', { initialRows: [], activeStatusFilter: 'interview', activeSort: 'applied_asc', emptyContext: { locale: 'en', filteredTotal: 0 } }));
    const chip = screen.getByRole('link', { name: 'Interviewing' });
    expect(chip).toHaveAttribute('aria-current', 'page');
    expect(hrefParts(chip.getAttribute('href')).params).toEqual({ view: 'applicants', status: 'interview', sort: 'applied_asc' });
    expect(hrefParts(screen.getByRole('link', { name: 'Newest' }).getAttribute('href')).params).toEqual({ view: 'applicants', status: 'interview' });
    expect(hrefParts(screen.getByRole('link', { name: 'All' }).getAttribute('href')).params).toEqual({ view: 'applicants', sort: 'applied_asc' });
  });

  it('keeps the mobile stage chips as URL links around the new state', () => {
    render(ui('mobile', { initialRows: [], activeStatusFilter: 'hired', activeSort: 'applied_asc', emptyContext: { locale: 'en', filteredTotal: 0 } }));
    const chip = screen.getByRole('link', { name: 'Hired' });
    expect(chip).toHaveAttribute('aria-current', 'page');
    expect(hrefParts(screen.getByRole('link', { name: 'Reviewing' }).getAttribute('href')).params).toEqual({ view: 'applicants', status: 'reviewing', sort: 'applied_asc' });
  });
});

describe('English empty page with a positive total', () => {
  const cases: Array<[string, JobPostingApplicationStatus | null, number]> = [
    ['without a stage', null, 30],
    ['with the reviewing stage', 'reviewing', 30],
    ['when the total fits on one page', null, 3],
  ];
  for (const layout of LAYOUTS) {
    it.each(cases)(`${layout}: %s points back to the first page without claiming a stage or account is empty`, (_label, status, total) => {
      render(ui(layout, { initialRows: [], activeStatusFilter: status, activeSort: 'applied_asc', emptyContext: { locale: 'en', filteredTotal: total } }));
      expect(screen.getByRole('heading', { level: 3, name: 'No applicants on this page' })).toBeInTheDocument();
      expect(screen.getByText('Return to the first page to see the current list.')).toBeInTheDocument();
      expect(hrefParts(screen.getByRole('link', { name: 'Show all applicants' }).getAttribute('href'))).toEqual({
        path: '/employer/candidates', params: { view: 'applicants', sort: 'applied_asc' },
      });
      expect(document.body.textContent).not.toMatch(/No applicants at the|No applications yet|No applicants match this filter|past the last/i);
      expect(document.body.textContent).not.toContain(en.employer.noApplicationsYet);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});

describe('locale isolation', () => {
  const scenarios: Array<[string, JobPostingApplicationStatus | null, number]> = [
    ['stage zero', 'reviewing', 0],
    ['empty page', null, 30],
    ['empty page with a stage', 'offered', 30],
  ];
  for (const locale of ['es', 'fr', 'pt'] as const) {
    for (const layout of LAYOUTS) {
      it.each(scenarios)(`${locale} ${layout}: %s keeps the existing empty rendering`, (_label, status, total) => {
        render(ui(layout, { initialRows: [], activeStatusFilter: status, activeSort: 'applied_asc', emptyContext: { locale, filteredTotal: total } }, locale));
        const legacyTitle = status
          ? 'No applicants match this filter'
          : layout === 'desktop' ? 'No applications yet' : (CATALOGS[locale].employer as Tree).noApplicationsYet as string;
        expect(screen.getByRole('heading', { level: 3, name: legacyTitle })).toBeInTheDocument();
        expectNoNewCopy();
      });
    }
  }

  for (const layout of LAYOUTS) {
    it(`${layout}: provider messages carrying the new keys cannot enable or replace the scoped state`, () => {
      const { unmount } = render(ui(layout, { initialRows: [], activeStatusFilter: 'reviewing', activeSort: 'applied_desc', emptyContext: { locale: 'es', filteredTotal: 0 } }, 'es', merge(CATALOGS.es, SENTINEL)));
      expect(screen.getByRole('heading', { level: 3, name: 'No applicants match this filter' })).toBeInTheDocument();
      expectNoNewCopy();
      unmount();

      render(ui(layout, { initialRows: [], activeStatusFilter: 'reviewing', activeSort: 'applied_desc', emptyContext: { locale: 'en', filteredTotal: 0 } }, 'en', merge(CATALOGS.en, SENTINEL)));
      expect(screen.getByRole('heading', { level: 3, name: 'No applicants at the Reviewing stage' })).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SENTINEL');
    });
  }
});

describe('missing or unusable evidence keeps the existing rendering', () => {
  const contexts: Array<[string, EmployerApplicationsEmptyContext | undefined]> = [
    ['no context', undefined],
    ['NaN total', { locale: 'en', filteredTotal: Number.NaN }],
    ['negative total', { locale: 'en', filteredTotal: -1 }],
    ['fractional total', { locale: 'en', filteredTotal: 1.5 }],
    ['region locale', { locale: 'en-US', filteredTotal: 0 }],
    ['upper-case locale', { locale: 'EN', filteredTotal: 0 }],
    ['empty locale', { locale: '', filteredTotal: 0 }],
    ['unsupported locale', { locale: 'de', filteredTotal: 0 }],
  ];
  for (const layout of LAYOUTS) {
    it.each(contexts)(`${layout}: %s`, (_label, emptyContext) => {
      render(ui(layout, { initialRows: [], activeStatusFilter: 'reviewing', activeSort: 'applied_desc', emptyContext }));
      expect(screen.getByRole('heading', { level: 3, name: 'No applicants match this filter' })).toBeInTheDocument();
      expectNoNewCopy();
    });

    it(`${layout}: an unfiltered zero stays with the existing first-use state`, () => {
      render(ui(layout, { initialRows: [], activeStatusFilter: null, activeSort: 'applied_desc', emptyContext: { locale: 'en', filteredTotal: 0 } }));
      const title = layout === 'desktop' ? 'No applications yet' : en.employer.noApplicationsYet;
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
      expectNoNewCopy();
    });

    it(`${layout}: rows present never show an empty state`, () => {
      render(ui(layout, { initialRows: [row('a1')], activeStatusFilter: 'reviewing', activeSort: 'applied_desc', emptyContext: { locale: 'en', filteredTotal: 30 } }));
      expect(screen.getAllByText('Applicant a1').length).toBeGreaterThan(0);
      expect(document.querySelector('[data-kind]')).toBeNull();
      expectNoNewCopy();
    });
  }

  it('direct callers without the new prop keep compiling and rendering as before', () => {
    render(<NextIntlClientProvider locale="en" messages={en}><MobileApplicationsClient initialRows={[]} /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { level: 3, name: en.employer.noApplicationsYet })).toBeInTheDocument();
    cleanup();
    render(ui('desktop', { initialRows: [], activeStatusFilter: null, activeSort: 'applied_desc' }));
    expect(screen.getByRole('heading', { level: 3, name: 'No applications yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Post a role' })).toHaveAttribute('href', '/employer/jobs/new');
  });
});

describe('row synchronization around the empty states', () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: a new server page replaces the empty state and a later empty page replaces the rows`, () => {
      const base = { activeSort: 'applied_desc' as const };
      const { rerender } = render(ui(layout, { ...base, initialRows: [], activeStatusFilter: 'reviewing', emptyContext: { locale: 'en', filteredTotal: 0 } }));
      expect(screen.getByRole('heading', { name: 'No applicants at the Reviewing stage' })).toBeInTheDocument();

      rerender(ui(layout, { ...base, initialRows: [row('b1')], activeStatusFilter: 'reviewing', emptyContext: { locale: 'en', filteredTotal: 1 } }));
      expect(screen.getAllByText('Applicant b1').length).toBeGreaterThan(0);
      expectNoNewCopy();

      rerender(ui(layout, { ...base, initialRows: [], activeStatusFilter: null, emptyContext: { locale: 'en', filteredTotal: 40 } }));
      expect(screen.queryByText('Applicant b1')).toBeNull();
      expect(screen.getByRole('heading', { name: 'No applicants on this page' })).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it('desktop: selection resets when the server rows change', () => {
    const props = { activeStatusFilter: null, activeSort: 'applied_desc' as const, emptyContext: { locale: 'en', filteredTotal: 2 } };
    const { rerender } = render(ui('desktop', { ...props, initialRows: [row('c1'), row('c2')] }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select applicant Applicant c1' }));
    expect(screen.getByRole('region', { name: 'Bulk update pipeline stages' })).toBeInTheDocument();
    rerender(ui('desktop', { ...props, initialRows: [row('c3')] }));
    expect(screen.queryByRole('region', { name: 'Bulk update pipeline stages' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select applicant Applicant c3' })).not.toBeChecked();
  });

  it('mobile: the expanded card resets and the record link keeps the list as its return context', () => {
    window.history.replaceState(null, '', '/employer/candidates?view=applicants&status=reviewing&sort=applied_asc');
    const props = { activeStatusFilter: 'reviewing' as const, activeSort: 'applied_asc' as const, emptyContext: { locale: 'en', filteredTotal: 1 } };
    const { rerender } = render(ui('mobile', { ...props, initialRows: [row('d1')] }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand details for Applicant d1' }));
    const review = hrefParts(screen.getByRole('link', { name: en.employer.applicationReviewMetaTitle }).getAttribute('href'));
    expect(review.path).toBe('/employer/applications/d1');
    expect(review.params.returnTo).toBe('/employer/candidates?view=applicants&status=reviewing&sort=applied_asc');
    rerender(ui('mobile', { ...props, initialRows: [row('d2')] }));
    expect(screen.getByRole('button', { name: 'Expand details for Applicant d2' })).toHaveAttribute('aria-expanded', 'false');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('scoped English catalog', () => {
  function leaves(tree: Tree, prefix = ''): Array<[string, unknown]> {
    return Object.entries(tree).flatMap(([key, value]) =>
      value && typeof value === 'object' ? leaves(value as Tree, `${prefix}${key}.`) : [[`${prefix}${key}`, value] as [string, unknown]],
    );
  }

  it('has exactly the six filled leaves and formats the stage placeholder', () => {
    const entries = leaves(scoped);
    expect(entries.map(([key]) => key).sort()).toEqual([
      'empty.employer.applicationsFiltered.action',
      'empty.employer.applicationsFiltered.body',
      'empty.employer.applicationsFiltered.title',
      'empty.employer.applicationsPage.action',
      'empty.employer.applicationsPage.body',
      'empty.employer.applicationsPage.title',
    ]);
    for (const [key, value] of entries) expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true);
    const t = createTranslator({ locale: 'en', messages: scoped, namespace: 'empty.employer' });
    expect(t('applicationsFiltered.title', { stage: 'Offer extended' })).toBe('No applicants at the Offer extended stage');
  });

  it('is not part of any shared locale catalog', () => {
    for (const [locale, catalog] of Object.entries({ en, es, fr, pt })) {
      const employer = ((catalog as Tree).empty as Tree | undefined)?.employer as Tree | undefined;
      expect(employer?.applicationsFiltered, locale).toBeUndefined();
      expect(employer?.applicationsPage, locale).toBeUndefined();
    }
  });
});
