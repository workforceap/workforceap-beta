import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import en from '@/messages/en.json';
import { JOBS_OPEN_ROLES_ANCHOR, MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';
import { JOBS_BOARD_EMPTY } from '@/lib/member/jobPipelineDisplay';

/** The kit reads its empty-state copy from the `empty` namespace (KIT_GUIDE §6). */
function show(ui: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard/jobs',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Member audit 7b: the job board was a dead end — "Open board" linked to
 * `?ui=legacy`, which landed back on the pipeline, and the page had no link
 * to any live job. The pipeline now lists live openings itself and every
 * browse CTA jumps to that list.
 */

const openRoles = [
  { id: 'job-1', title: 'Help Desk Technician', meta: 'Acme IT · Austin, TX · $42k–$48k', logo: 'AC' },
  { id: 'job-2', title: 'Cloud Support Associate', meta: 'Northwind · Remote', logo: 'NO', applied: true },
];

describe('MemberJobsKit open roles', () => {
  afterEach(() => cleanup());

  it('links every live opening to its job page and points the browse CTAs at the in-page list', () => {
    show(<MemberJobsKit openRoles={openRoles} openRolesTotal={12} />);

    const jobLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/dashboard/jobs/"]')];
    expect(jobLinks.map((a) => a.getAttribute('href'))).toEqual(['/dashboard/jobs/job-1', '/dashboard/jobs/job-2']);
    expect(document.querySelector('a[href*="ui=legacy"]')).toBeNull();

    const section = document.getElementById('open-roles') as HTMLElement;
    expect(section).not.toBeNull();
    expect(within(section).getByRole('heading', { level: 2, name: 'Open roles' })).toBeInTheDocument();
    expect(within(section).getByText('12 live openings')).toBeInTheDocument();
    // The "Applied" tag sits on the row the member already applied to (the KPI label is outside the section).
    expect(within(section).getByText('Applied')).toBeInTheDocument();
    expect(within(section).getAllByRole('link')).toHaveLength(2);

    expect(screen.getByRole('link', { name: 'Browse openings' })).toHaveAttribute('href', JOBS_OPEN_ROLES_ANCHOR);
    expect(screen.getByRole('link', { name: 'Browse jobs' })).toHaveAttribute('href', JOBS_OPEN_ROLES_ANCHOR);
  });

  it('shows the honest empty board state with real next steps when nothing is live', () => {
    show(<MemberJobsKit openRoles={[]} />);

    const section = document.getElementById('open-roles') as HTMLElement;
    expect(within(section).getByText(en.empty.openings.title)).toBeInTheDocument();
    expect(section.querySelector('.wa-kit-empty')?.getAttribute('data-kind')).toBe(JOBS_BOARD_EMPTY.kind);
    expect(within(section).getByRole('link', { name: en.empty.openings.action })).toHaveAttribute('href', JOBS_BOARD_EMPTY.primaryHref);
    expect(within(section).getByRole('link', { name: en.empty.openings.secondary })).toHaveAttribute('href', JOBS_BOARD_EMPTY.secondaryHref);
    expect(document.querySelector('a[href^="/dashboard/jobs/"]')).toBeNull();
    expect(screen.queryByText(/^\d+ live openings?$/)).toBeNull();
  });
});
