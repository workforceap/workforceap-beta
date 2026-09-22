import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';

const routerRefresh = vi.fn();
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: routerRefresh, prefetch: vi.fn() }),
  usePathname: () => '/employer/jobs',
  useSearchParams: () => new URLSearchParams(),
}));
// Server pages: auth, DB and loaders are stubbed; translations are the real en.json.
const db = vi.hoisted(() => {
  const overrides: Record<string, (args: unknown) => Promise<unknown>> = {};
  const defaultFor = (method: string) => async () => (method === 'count' ? 0 : method === 'findMany' || method === 'groupBy' ? [] : null);
  const prisma = new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) =>
      new Proxy({}, { get: (_m, method: string) => (args: unknown) => (overrides[`${model}.${method}`] ?? defaultFor(method))(args) }),
  });
  return { prisma, overrides };
});
const workQueue = vi.hoisted(() => ({ slices: vi.fn(async (): Promise<unknown> => ({ needsReviewTodayApps: [], jobsAwaitingPublish: [], staleApps: [], interviewPending: [] })) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'employer-user-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: vi.fn(async () => ({ employerId: 'emp-1', employer: { companyName: 'Fixture Co', status: 'active' } })) }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: vi.fn(async () => '/employer/setup') }));
vi.mock('@/lib/db/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/lib/employer/workQueue', () => ({ getEmployerWorkQueueSlices: workQueue.slices }));
vi.mock('@/lib/portal/workflowEvents', () => ({ listEmployerWorkflowEvents: vi.fn(async () => []) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string, values?: Record<string, string | number>) => {
    let node: unknown = (en as Record<string, unknown>)[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    if (typeof node !== 'string') return `${ns}.${key}`;
    return node.replace(/\{(\w+)(, plural[^}]*\}[^}]*\})?\}/g, (_m, name) => String(values?.[name] ?? `{${name}}`));
  }),
}));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/employer/EmployerWorkflowTimeline', () => ({ default: () => null }));
vi.mock('@/components/employer/EmployerApplicationsPager', () => ({ default: () => null }));
vi.mock('@/components/portal/EmployerApplicationChatClient', () => ({ default: () => null }));

import EmployerEmptyState from '@/components/employer/EmployerEmptyState';
import EmployerKanban from '@/components/employer/EmployerKanban';
import EmployerJobsBoard from '@/components/employer/EmployerJobsBoard';
import EmployerMatchHistoryClient from '@/components/employer/EmployerMatchHistoryClient';
import EmployerApplicationsClient, { type EmployerApplicationRow } from '@/components/employer/EmployerApplicationsClient';
import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import EmployerWorkQueueClient from '@/components/employer/EmployerWorkQueueClient';
import { EmployerHomeKit } from '@/components/portal/kit/pages/employer/EmployerHomeKit';
import { EMPLOYER_EMPTY, employerPipelineEmptyVariant } from '@/lib/employer/emptyState';
import { jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';
import EmployerPipelinePage from '@/app/(portal)/employer/pipeline/page';
import EmployerJobsPage from '@/app/(portal)/employer/jobs/page';
import EmployerMatchesPage from '@/app/(portal)/employer/matches/page';
import EmployerApplicationsPage from '@/app/(portal)/employer/applications/page';
import EmployerWorkQueuePage from '@/app/(portal)/employer/work-queue/page';

/**
 * PR 6 of the empty-state consolidation (KIT_GUIDE §6): every employer empty
 * state renders through KitEmptyState with a `kind` that follows the loader's
 * row rule and copy from `empty.employer.*`:
 *  - no posting at all / no application at all is `first` with Post a job
 *  - postings but none live, or live postings the matcher has not paired, is
 *    `unavailable`/info — matching runs when WorkforceAP approves a posting,
 *    so the honest action is to look at the postings, never "AI will match"
 *  - a status chip or a page past the last row is `filtered` + the full list
 *  - the work queues are `clear` (zero is the goal) with the rule restated in
 *    the vocabulary's stage words; a failed read is `unavailable`/danger + retry
 */

const LOCALES = { en, es, fr, pt } as const;
type Locale = keyof typeof LOCALES;
const RAW_KEY = /\bempty\.[a-zA-Z]+\.[a-zA-Z]+\b/;
const OLD_WORDS = /No pipeline yet|Nothing in this (queue|stage|view)|No applications found|AI will match|admin runs|will appear here|Post a Job\b/;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  for (const key of Object.keys(db.overrides)) delete db.overrides[key];
});

function portal(locale: Locale, ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale={locale} messages={pickClientMessageSlice(LOCALES[locale], 'portal')}>{ui}</NextIntlClientProvider>);
}
function emptyOf(root: ParentNode, kind: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`.wa-kit-empty[data-kind="${kind}"]`);
  expect(el, `a KitEmptyState with data-kind="${kind}"`).not.toBeNull();
  return el as HTMLElement;
}
function clean(root: ParentNode) {
  expect(root.querySelector('.portal-empty-state')).toBeNull();
  expect(root.textContent).not.toMatch(RAW_KEY);
  expect(root.textContent).not.toMatch(OLD_WORDS);
}
function link(root: HTMLElement, name: string, href: string) {
  const a = within(root).getByRole('link', { name });
  expect(a).toHaveAttribute('href', href);
  expect(a.className).toContain('wa-kit-cta');
  return a;
}

const appRow = (id: string, status: string): EmployerApplicationRow => ({
  id, jobId: 'job-1', status, appliedAt: '2026-09-01T00:00:00Z', employerNotes: null,
  job: { id: 'job-1', title: 'Warehouse Associate' }, student: { id: `s-${id}`, fullName: `Member ${id}`, email: `${id}@example.test` },
});

describe('lib/employer/emptyState', () => {
  it('picks the state from the posting counts: none → postings, none live → not live, no match → no matches, rows → null', () => {
    expect(employerPipelineEmptyVariant({ postings: 0, live: 0, matches: 0 })).toBe('postings');
    expect(employerPipelineEmptyVariant({ postings: 2, live: 0, matches: 0 })).toBe('pipelineNotLive');
    expect(employerPipelineEmptyVariant({ postings: 2, live: 1, matches: 0 })).toBe('pipelineNoMatches');
    expect(employerPipelineEmptyVariant({ postings: 2, live: 1, matches: 3 })).toBeNull();
    expect(EMPLOYER_EMPTY.pipelineNotLive.kind).toBe('unavailable');
    expect(EMPLOYER_EMPTY.postings.kind).toBe('first');
  });
});

describe('EmployerEmptyState', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: no postings is first with Post a job and a ghost Import jobs', (locale) => {
    const { container } = portal(locale, <EmployerEmptyState variant="postings" headingAs="h2" framed />);
    const empty = emptyOf(container, 'first');
    const m = LOCALES[locale].empty.employer.postings;
    expect(empty.dataset.tone).toBe('muted');
    expect(empty.dataset.variant).toBe('postings');
    expect(empty.className).toContain('wa-kit-empty--framed');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(m.title);
    expect(within(empty).getByText(m.body).className).toContain('wa-kit-lede');
    link(empty, m.action, '/employer/jobs/new');
    expect(link(empty, m.secondary, '/employer/jobs/import').className).toContain('wa-kit-cta--ghost');
    clean(container);
  });

  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: postings but none live, and live postings without a match, are unavailable/info pointing at the postings', (locale) => {
    const m = LOCALES[locale].empty.employer;
    for (const variant of ['pipelineNotLive', 'pipelineNoMatches'] as const) {
      const { container, unmount } = portal(locale, <EmployerEmptyState variant={variant} />);
      const empty = emptyOf(container, 'unavailable');
      expect(empty.dataset.tone).toBe('info');
      expect(empty).not.toHaveAttribute('role');
      expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(m[variant].title);
      expect(within(empty).getByText(m[variant].body)).toBeInTheDocument();
      link(empty, m[variant].action, '/employer/jobs');
      expect(within(empty).queryByRole('link', { name: m.postings.action })).toBeNull();
      clean(container);
      unmount();
    }
  });

  it('the filtered postings state links to the list without its filter', () => {
    const { container } = portal('en', <EmployerEmptyState variant="postingsFiltered" showAllHref="/employer/jobs?locationType=remote" framed />);
    const empty = emptyOf(container, 'filtered');
    expect(within(empty).getByRole('heading')).toHaveTextContent('No postings match this filter');
    link(empty, 'Show all postings', '/employer/jobs?locationType=remote');
  });
});

describe('/employer/pipeline page', () => {
  async function page() {
    return portal('en', <>{await EmployerPipelinePage()}</>);
  }
  it('no posting at all: the first state once per breakpoint, as h2, with Post a job', async () => {
    const { container } = await page();
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="employer-empty"]');
    expect(empties).toHaveLength(2);
    for (const empty of Array.from(empties)) {
      expect(empty.dataset.kind).toBe('first');
      expect(empty.dataset.variant).toBe('postings');
      expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('No postings yet');
      link(empty, 'Post a job', '/employer/jobs/new');
    }
    clean(container);
  });
  it('postings exist but none is live: not-live, not "post a job"', async () => {
    db.overrides['job.count'] = async (args) => ((args as { where: { status?: string } }).where.status === 'live' ? 0 : 3);
    const { container } = await page();
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="employer-empty"]');
    expect(empties).toHaveLength(2);
    expect(empties[0].dataset.variant).toBe('pipelineNotLive');
    expect(empties[0].dataset.kind).toBe('unavailable');
    expect(within(empties[0]).getByRole('heading', { level: 2 })).toHaveTextContent('No live postings yet');
    expect(empties[0].textContent).toMatch(/None of your postings is live right now/);
    link(empties[0], 'View your postings', '/employer/jobs');
  });
  it('a live posting the matcher has not paired: no suggested candidates, never a promise that AI will match', async () => {
    db.overrides['job.count'] = async () => 1;
    db.overrides['job.findMany'] = async () => [{ id: 'job-1', title: 'Warehouse Associate' }];
    const { container } = await page();
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="employer-empty"]');
    expect(empties).toHaveLength(2);
    expect(empties[1].dataset.variant).toBe('pipelineNoMatches');
    expect(within(empties[1]).getByRole('heading', { level: 2 })).toHaveTextContent('No suggested candidates yet');
    clean(container);
  });
});

describe('EmployerKanban', () => {
  it('zero matches is the no-suggested-candidates state inside the card', () => {
    const { container } = portal('en', <EmployerKanban initialMatches={[]} />);
    const empty = emptyOf(container, 'unavailable');
    expect(empty.closest('.wa-kit-card')).not.toBeNull();
    expect(empty.className).not.toContain('wa-kit-empty--framed');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('No suggested candidates yet');
    clean(container);
  });
});

describe('/employer/jobs page + EmployerJobsBoard', () => {
  it('no posting in the account: first on both breakpoints', async () => {
    const { container } = portal('en', <>{await EmployerJobsPage({ searchParams: Promise.resolve({}) })}</>);
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="employer-empty"]');
    expect(empties).toHaveLength(2);
    for (const empty of Array.from(empties)) {
      expect(empty.dataset.variant).toBe('postings');
      expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('No postings yet');
      link(empty, 'Post a job', '/employer/jobs/new');
      link(empty, 'Import jobs', '/employer/jobs/import');
    }
    expect(container.textContent).not.toMatch(/No jobs yet|Nothing in this view/);
    clean(container);
  });
  it('postings exist but the status chip matched none: filtered, with the unfiltered list', async () => {
    db.overrides['job.count'] = async (args) => (JSON.stringify((args as { where: unknown }).where).includes('status') ? 0 : 4);
    const { container } = portal('en', <>{await EmployerJobsPage({ searchParams: Promise.resolve({ filter: 'filled' }) })}</>);
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="employer-empty"]');
    expect(empties).toHaveLength(2);
    for (const empty of Array.from(empties)) {
      expect(empty.dataset.kind).toBe('filtered');
      expect(empty.dataset.variant).toBe('postingsFiltered');
      link(empty, 'Show all postings', '/employer/jobs');
    }
    clean(container);
  });
  it('the board alone: zero in the DB is first (bare, role=status card); zero in the filter is filtered', () => {
    const base = { jobs: [], filter: 'draft' as const, page: 1, pageSize: 20, deletableInFilter: [], closableInFilter: [], titleByIdInFilter: {} };
    const a = portal('en', <EmployerJobsBoard {...base} totalInFilter={0} totalInDb={0} />);
    const first = emptyOf(a.container, 'first');
    expect(first.closest('[role="status"]')).not.toBeNull();
    link(first, 'Post a job', '/employer/jobs/new');
    a.unmount();
    const b = portal('en', <EmployerJobsBoard {...base} totalInFilter={0} totalInDb={3} locationType="remote" />);
    const filtered = emptyOf(b.container, 'filtered');
    expect(within(filtered).getByRole('heading', { level: 2 })).toHaveTextContent('No postings match this filter');
    link(filtered, 'Show all postings', '/employer/jobs?locationType=remote');
    clean(b.container);
  });
});

describe('/employer/matches page + EmployerMatchHistoryClient', () => {
  it('the client defaults to no-suggested-candidates and the page passes the posting-count variant', async () => {
    const a = portal('en', <EmployerMatchHistoryClient initialRows={[]} />);
    expect(emptyOf(a.container, 'unavailable').dataset.variant).toBe('pipelineNoMatches');
    a.unmount();
    const b = portal('en', <EmployerMatchHistoryClient initialRows={[]} emptyVariant="postings" />);
    link(emptyOf(b.container, 'first'), 'Post a job', '/employer/jobs/new');
    b.unmount();
    db.overrides['job.count'] = async (args) => ((args as { where: { status?: string } }).where.status === 'live' ? 0 : 2);
    const { container } = portal('en', <>{await EmployerMatchesPage()}</>);
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.variant).toBe('pipelineNotLive');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('No live postings yet');
    clean(container);
  });
});

describe('/employer/applications page + clients', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: no application and no filter is first with Post a job and a ghost postings route', async (locale) => {
    const { container } = portal(locale, <>{await EmployerApplicationsPage({ searchParams: Promise.resolve({}) })}</>);
    const empty = emptyOf(container, 'first');
    const m = LOCALES[locale].empty.employer.applications;
    expect(empty.dataset.variant).toBe('applications');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(m.title);
    link(empty, m.action, '/employer/jobs/new');
    expect(link(empty, m.secondary, '/employer/jobs').className).toContain('wa-kit-cta--ghost');
    clean(container);
  });
  it('desktop: a stage filter that matched none names the vocabulary stage word and links to every applicant', () => {
    const { container } = portal('en', <EmployerApplicationsClient initialRows={[]} activeStatusFilter="reviewing" activeSort="applied_asc" />);
    const empty = emptyOf(container, 'filtered');
    expect(empty.dataset.variant).toBe('applicationsFiltered');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(`No applicants at the ${jobApplicationStatusLabel('reviewing', 'employer')} stage`);
    expect(empty.textContent).not.toMatch(/\{stage\}/);
    link(empty, 'Show all applicants', '/employer/applications?sort=applied_asc');
    clean(container);
  });
  it('desktop: no filter but zero rows (a page past the last applicant) is filtered, never "No applications yet"', () => {
    const { container } = portal('en', <EmployerApplicationsClient initialRows={[]} activeStatusFilter={null} activeSort="applied_desc" />);
    const empty = emptyOf(container, 'filtered');
    expect(empty.dataset.variant).toBe('applicationsPage');
    expect(within(empty).getByRole('heading')).toHaveTextContent('No applicants on this page');
    expect(container.textContent).not.toMatch(/No applications yet/);
    link(empty, 'Show all applicants', '/employer/applications');
  });
  it('mobile: a chip that matches nobody clears in place; the URL filter links to the full list', () => {
    const a = portal('en', <MobileApplicationsClient initialRows={[appRow('a', 'pending')]} />);
    fireEvent.click(screen.getByRole('button', { name: jobApplicationStatusLabel('hired', 'employer') }));
    const empty = emptyOf(a.container, 'filtered');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(`No applicants at the ${jobApplicationStatusLabel('hired', 'employer')} stage`);
    const clear = within(empty).getByRole('button', { name: 'Show all applicants' });
    expect(clear.className).toContain('wa-kit-cta');
    fireEvent.click(clear);
    expect(a.container.querySelector('.wa-kit-empty')).toBeNull();
    expect(screen.getByText('Member a')).toBeInTheDocument();
    a.unmount();
    const b = portal('en', <MobileApplicationsClient initialRows={[]} activeStatusFilter="offered" />);
    const urlEmpty = emptyOf(b.container, 'filtered');
    expect(urlEmpty.textContent).toContain(jobApplicationStatusLabel('offered', 'employer'));
    link(urlEmpty, 'Show all applicants', '/employer/applications');
    b.unmount();
    const c = portal('en', <MobileApplicationsClient initialRows={[]} />);
    expect(emptyOf(c.container, 'filtered').dataset.variant).toBe('applicationsPage');
    clean(c.container);
  });
});

describe('EmployerWorkQueueClient + /employer/work-queue page', () => {
  const none = { needsReviewTodayApps: [], jobsAwaitingPublish: [], staleApps: [], interviewPending: [] };
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: three empty queues are three clear/ok states whose bodies restate the rule with the stage words', (locale) => {
    const { container } = portal(locale, <EmployerWorkQueueClient {...none} />);
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="employer-work-queue-empty"]');
    expect(empties).toHaveLength(3);
    const m = LOCALES[locale].empty.employer;
    for (const empty of Array.from(empties)) {
      expect(empty.dataset.kind).toBe('clear');
      expect(empty.dataset.tone).toBe('ok');
      expect(empty).not.toHaveAttribute('role');
      expect(within(empty).getByRole('heading', { level: 3 })).toBeInTheDocument();
    }
    expect(within(empties[0]).getByRole('heading')).toHaveTextContent(m.workQueueReviewClear.title);
    expect(empties[1].textContent).toContain(jobApplicationStatusLabel('pending', 'employer'));
    expect(empties[1].textContent).toContain(jobApplicationStatusLabel('reviewing', 'employer'));
    expect(empties[2].textContent).toContain(jobApplicationStatusLabel('interview', 'employer'));
    expect(container.textContent).not.toMatch(/\{stage\}|\{newStage\}|\{reviewingStage\}/);
    expect(screen.queryByRole('alert')).toBeNull();
    clean(container);
  });
  it('focusing one queue leaves one clear state', () => {
    const { container } = portal('en', <EmployerWorkQueueClient {...none} initialFocus="stale" />);
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="employer-work-queue-empty"]');
    expect(empties).toHaveLength(1);
    expect(empties[0].dataset.variant).toBe('workQueueStaleClear');
  });
  it('a failed read is one unavailable/danger alert with Try again (router.refresh), no queues and no tablist', () => {
    const { container } = portal('en', <EmployerWorkQueueClient {...none} loadFailed />);
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('danger');
    expect(empty).toHaveAttribute('role', 'alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent("Couldn't load the work queue");
    fireEvent.click(within(empty).getByRole('button', { name: 'Try again' }));
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.wa-kit-empty[data-kind="clear"]')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
  it('the page turns a thrown queue read into the failed state instead of three clear queues', async () => {
    workQueue.slices.mockRejectedValueOnce(new Error('queue down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = portal('en', <>{await EmployerWorkQueuePage({ searchParams: Promise.resolve({}) })}</>);
    consoleError.mockRestore();
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.variant).toBe('workQueueUnavailable');
    expect(container.querySelector('.wa-kit-empty[data-kind="clear"]')).toBeNull();
    const ok = portal('en', <>{await EmployerWorkQueuePage({ searchParams: Promise.resolve({ focus: 'interview' }) })}</>);
    expect(ok.container.querySelectorAll('.wa-kit-empty[data-kind="clear"]')).toHaveLength(1);
  });
});

describe('EmployerHomeKit', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: an empty candidate table and an empty open-roles queue are first states routed to Post a role', (locale) => {
    const { container } = portal(locale, <EmployerHomeKit companyName="Fixture Co" candidates={[]} openRolesList={[]} postRoleHref="/employer/jobs/new" />);
    const empties = Array.from(container.querySelectorAll<HTMLElement>('[data-testid="employer-home-empty"]'));
    const m = LOCALES[locale].empty.employer;
    // The candidate DataTable mounts its empty state once per breakpoint (table + cards, one visible).
    const candidateEmpties = empties.filter((e) => e.dataset.variant === 'homeCandidates');
    const roleEmpties = empties.filter((e) => e.dataset.variant === 'homeOpenRoles');
    expect(candidateEmpties.length).toBeGreaterThanOrEqual(1);
    expect(roleEmpties).toHaveLength(1);
    expect(empties).toHaveLength(candidateEmpties.length + 1);
    const roles = roleEmpties[0];
    for (const empty of empties) {
      expect(empty.dataset.kind).toBe('first');
      expect(empty.className).not.toContain('wa-kit-empty--framed');
    }
    for (const candidates of candidateEmpties) {
      expect(within(candidates).getByRole('heading', { level: 3 })).toHaveTextContent(m.homeCandidates.title);
      link(candidates, m.homeCandidates.action, '/employer/jobs/new');
    }
    expect(within(roles).getByRole('heading', { level: 3 })).toHaveTextContent(m.homeOpenRoles.title);
    link(roles, m.homeOpenRoles.action, '/employer/jobs/new');
    expect(container.textContent).not.toMatch(/Post a role to start building|New job applications will appear/);
    clean(container);
  });
});

describe('retired employer.* copy keys', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: the seven dead keys are gone and empty.employer carries the words', (locale) => {
    const employer = LOCALES[locale].employer as Record<string, unknown>;
    for (const key of ['nothingInThisView', 'tryAnotherFilter', 'showAllPostings', 'noJobsYet', 'postFirstRole', 'noMatchesYet', 'noMatchesDesc']) {
      expect(employer[key], `employer.${key}`).toBeUndefined();
    }
    expect(Object.keys(LOCALES[locale].empty.employer)).toHaveLength(13);
  });
});
