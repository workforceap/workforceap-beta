import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { JOBS_OPEN_ROLES_ANCHOR, MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';
import { MemberJobsBoard } from '@/components/portal/kit/pages/member/MemberJobsBoard';
import JobsListingClient from '@/app/(portal)/dashboard/jobs/JobsListingClient';
import JobApplicationsTracker from '@/components/portal/JobApplicationsTracker';
import JobApplicationKanban from '@/components/portal/JobApplicationKanban';
import type { JobApplication } from '@/types/job-application';

const routerMock = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/dashboard/jobs',
  useSearchParams: () => searchParams,
}));

/**
 * PR 2 of the empty-state consolidation (KIT_GUIDE §6), jobs surfaces: the
 * pipeline kit, the live listing, the application tracker and its kanban all
 * render KitEmptyState with the situation `kind` and `empty.*` copy in every
 * locale. JobsEmptyState / JobsNoResultsState and the `.portal-kanban-empty`
 * boxes are gone.
 */

const LOCALES = { en, es, fr, pt } as const;
type Locale = keyof typeof LOCALES;
const RAW_KEY = /\bempty\.[a-zA-Z]+\.[a-zA-Z]+\b/;

const fetchMock = vi.fn();
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  routerMock.push.mockReset();
  searchParams = new URLSearchParams();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(locale: Locale, ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale={locale} messages={LOCALES[locale]}>{ui}</NextIntlClientProvider>);
}

function empties(root: ParentNode, kind?: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(kind ? `.wa-kit-empty[data-kind="${kind}"]` : '.wa-kit-empty')];
}

describe('MemberJobsKit (/dashboard/jobs pipeline)', () => {
  it.each(Object.keys(LOCALES) as Locale[])('%s: applications first, open roles unavailable, matches first', (locale) => {
    const m = LOCALES[locale];
    const { container } = wrap(locale, <MemberJobsKit applications={[]} openRoles={[]} recommended={[]} />);

    const all = empties(container);
    expect(all.map((e) => e.dataset.kind)).toEqual(['first', 'unavailable', 'first']);
    expect(all.map((e) => e.dataset.tone)).toEqual(['muted', 'warn', 'muted']);
    for (const e of all) expect(e.textContent).not.toMatch(RAW_KEY);

    const [applications, openings, matches] = all;
    expect(within(applications).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.applications.title);
    expect(within(applications).getByText(m.empty.applications.body)).toBeInTheDocument();
    expect(within(applications).getByRole('link', { name: m.empty.applications.action })).toHaveAttribute('href', JOBS_OPEN_ROLES_ANCHOR);

    expect(openings.closest('#open-roles')).not.toBeNull();
    expect(within(openings).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.openings.title);
    expect(within(openings).getByText(m.empty.openings.body)).toBeInTheDocument();
    expect(within(openings).getByRole('link', { name: m.empty.openings.action })).toHaveAttribute('href', '/dashboard/profile');
    expect(within(openings).getByRole('link', { name: m.empty.openings.secondary })).toHaveAttribute('href', '/dashboard/messages');

    expect(within(matches).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.matches.title);
    expect(within(matches).getByRole('link', { name: m.empty.matches.action })).toHaveAttribute('href', '/dashboard/profile');
    expect(within(matches).getByRole('link', { name: m.empty.matches.secondary })).toHaveAttribute('href', JOBS_OPEN_ROLES_ANCHOR);

    for (const old of ['Track jobs you apply to. They appear here.', 'No matching roles yet', 'Update your profile so we can match you to openings.']) {
      expect(screen.queryByText(old)).toBeNull();
    }
  });

  it('drops the browse route from the matches state once the member tracks an application', () => {
    const { container } = wrap('en', (
      <MemberJobsKit
        applications={[{ id: 'a1', role: 'Help Desk', company: 'Acme', location: 'Remote', applied: 'Sep 1', stage: 'Applied', tone: 'muted' }]}
        recommended={[]}
      />
    ));
    const matches = empties(container, 'first').find((e) => e.textContent?.includes(en.empty.matches.title)) as HTMLElement;
    expect(within(matches).getByRole('link', { name: en.empty.matches.action })).toBeInTheDocument();
    expect(within(matches).queryByRole('link', { name: en.empty.matches.secondary })).toBeNull();
  });

  it('shares the open-roles state with the board proof', () => {
    const { container } = wrap('en', <MemberJobsBoard jobs={[]} />);
    const [openings] = empties(container, 'unavailable');
    expect(within(openings).getByRole('heading', { level: 3 })).toHaveTextContent(en.empty.openings.title);
    expect(within(openings).getByRole('link', { name: en.empty.openings.action })).toHaveAttribute('href', '/dashboard/profile');
    expect(within(openings).getByRole('link', { name: en.empty.openings.secondary })).toHaveAttribute('href', '/dashboard/messages');
  });
});

describe('JobsListingClient (/dashboard/jobs live listing)', () => {
  it.each(Object.keys(LOCALES) as Locale[])('%s: an active filter with no rows is a filtered state whose Clear filters resets the URL', async (locale) => {
    const m = LOCALES[locale];
    searchParams = new URLSearchParams('q=welder');
    fetchMock.mockResolvedValue(json([]));
    const { container } = wrap(locale, <JobsListingClient initialJobs={[]} />);

    await screen.findByRole('heading', { level: 3, name: m.empty.jobsFiltered.title });
    const [filtered] = empties(container, 'filtered');
    expect(filtered.dataset.tone).toBe('muted');
    expect(filtered.closest('.wa-kit-card')).not.toBeNull();
    expect(within(filtered).getByText(m.empty.jobsFiltered.body)).toBeInTheDocument();
    expect(filtered.textContent).not.toMatch(RAW_KEY);
    expect(screen.queryByText(m.jobs.noJobsMatchFilters)).toBeNull();

    const clear = within(filtered).getByRole('button', { name: m.empty.jobsFiltered.action });
    expect(clear.className).toContain('wa-kit-cta');
    fireEvent.click(clear);
    expect(routerMock.push).toHaveBeenCalledWith('/dashboard/jobs');
  });

  it.each(Object.keys(LOCALES) as Locale[])('%s: no live openings for a member is unavailable (warn) with profile and counselor routes', async (locale) => {
    const m = LOCALES[locale];
    fetchMock.mockResolvedValue(json([]));
    const { container } = wrap(locale, <JobsListingClient initialJobs={[]} isAuthenticated />);

    await screen.findByRole('heading', { level: 3, name: m.empty.openings.title });
    const [openings] = empties(container, 'unavailable');
    expect(openings.dataset.tone).toBe('warn');
    expect(openings).not.toHaveAttribute('role');
    expect(within(openings).getByText(m.empty.openings.body)).toBeInTheDocument();
    expect(within(openings).getByRole('link', { name: m.empty.openings.action })).toHaveAttribute('href', '/dashboard/profile');
    expect(within(openings).getByRole('link', { name: m.empty.openings.secondary })).toHaveAttribute('href', '/dashboard/messages');
    expect(openings.textContent).not.toMatch(RAW_KEY);
    expect(empties(container, 'filtered')).toHaveLength(0);
  });

  it.each(Object.keys(LOCALES) as Locale[])('%s: no live openings for a visitor points at programs and the application', async (locale) => {
    const m = LOCALES[locale];
    fetchMock.mockResolvedValue(json([]));
    const { container } = wrap(locale, <JobsListingClient initialJobs={[]} isAuthenticated={false} />);

    await screen.findByRole('heading', { level: 3, name: m.empty.openingsPublic.title });
    const [openings] = empties(container, 'unavailable');
    expect(within(openings).getByText(m.empty.openingsPublic.body)).toBeInTheDocument();
    expect(within(openings).getByRole('link', { name: m.empty.openingsPublic.action })).toHaveAttribute('href', '/programs');
    expect(within(openings).getByRole('link', { name: m.empty.openingsPublic.secondary })).toHaveAttribute('href', '/apply');
    expect(within(openings).getAllByRole('link')).toHaveLength(2);
    expect(openings.textContent).not.toMatch(RAW_KEY);
  });

  it('keeps the structural change on record: before/after outerHTML of the filtered card', async () => {
    searchParams = new URLSearchParams('q=welder');
    fetchMock.mockResolvedValue(json([]));
    const { container } = wrap('en', <JobsListingClient initialJobs={[]} />);
    await screen.findByRole('heading', { level: 3, name: en.empty.jobsFiltered.title });
    const card = empties(container, 'filtered')[0].closest('.wa-kit-card') as HTMLElement;
    await expect(card.outerHTML).toMatchFileSnapshot('../fixtures/empty-state-2/jobs-listing-filtered.after.html');

    const before = readFileSync(join(__dirname, '../fixtures/empty-state-2/jobs-listing-filtered.before.html'), 'utf8');
    // Before: the generic default kind and a bespoke ghost button in the deprecated `action` slot.
    expect(before).toContain('No jobs match your filters');
    expect(before).toContain('data-kind="first"');
    expect(before).not.toContain('wa-kit-empty-actions');
    // After: the situation is named and the action is the kit's primary CTA.
    expect(card.outerHTML).toContain('data-kind="filtered"');
    expect(card.outerHTML).toContain('wa-kit-empty-actions');
    expect(card.outerHTML).not.toContain('wa-kit-cta--ghost');
  });
});

describe('JobApplicationsTracker + JobApplicationKanban (/dashboard/job-applications)', () => {
  it.each(Object.keys(LOCALES) as Locale[])('%s: no tracked applications is a first state whose primary opens the add dialog', async (locale) => {
    const m = LOCALES[locale];
    fetchMock.mockResolvedValue(json([]));
    const { container } = wrap(locale, <JobApplicationsTracker userId="user-1" />);

    await screen.findByRole('heading', { level: 3, name: m.empty.applications.title });
    const [first] = empties(container, 'first');
    expect(first.dataset.tone).toBe('muted');
    expect(within(first).getByText(m.empty.applications.body)).toBeInTheDocument();
    const browse = within(first).getByRole('link', { name: m.empty.applications.action });
    expect(browse).toHaveAttribute('href', '/dashboard/jobs');
    expect(browse.className).toContain('wa-kit-cta--ghost');
    expect(first.textContent).not.toMatch(RAW_KEY);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(first).getByRole('button', { name: m.empty.applications.add }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('renders the kanban placeholders through the kit, not .portal-kanban-empty boxes', () => {
    const application: JobApplication = {
      id: 'a1',
      userId: 'user-1',
      jobTitle: 'Help Desk Technician',
      companyName: 'Acme',
      status: 'APPLIED',
      createdAt: new Date('2026-09-01T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-01T00:00:00Z').toISOString(),
    } as unknown as JobApplication;

    const { container, rerender } = wrap('en', <JobApplicationKanban applications={[]} onStatusChange={vi.fn()} />);
    const mobile = empties(container, 'first').find((e) => e.textContent?.includes(en.empty.applications.title)) as HTMLElement;
    expect(mobile.className).toContain('wa-kit-empty--framed');
    expect(within(mobile).getByText(en.empty.applications.body)).toBeInTheDocument();
    expect(container.querySelector('.portal-kanban-mobile-empty, .portal-kanban-empty')).toBeNull();
    expect(screen.queryByText('No applications yet.')).toBeNull();

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <JobApplicationKanban applications={[application]} onStatusChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const stages = empties(container, 'first').filter((e) => e.textContent === en.empty.stage.title);
    expect(stages).toHaveLength(6);
    for (const stage of stages) expect(within(stage).getByRole('heading', { level: 4 })).toHaveTextContent(en.empty.stage.title);
    expect(container.querySelector('.portal-kanban-empty')).toBeNull();
    expect(screen.queryByText('No applications')).toBeNull();
  });
});
