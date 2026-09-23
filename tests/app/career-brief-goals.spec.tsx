import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

/**
 * WAP-188 Phase A: GoalsModule was only reachable from the legacy home's
 * Learning tab (`/dashboard?ui=legacy`), while readiness "Set goals", the
 * weekly recap and the help assistant already sent members to
 * /dashboard/career-brief. The career plan page has a single render path (no
 * `?ui=legacy` branch), so the module now mounts there, once, as the `#goals`
 * section those links target. The page is rendered for real; only auth, the
 * database and member state are stubbed, and the goals API is the fetch stub.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async () => ({})) }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/member/getMemberState', () => ({
  getMemberState: vi.fn(async () => ({
    trainingView: null,
    enrolledProgram: null,
    nextBestActions: [],
    jobApplicationCount: 0,
  })),
  getMemberStateFull: vi.fn(async () => ({})),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    aIJobMatch: { count: vi.fn(async () => 0) },
    memberNextBestAction: { findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => ({ assessmentScorePct: null, assessmentScore: null, courseEnrollments: [], profile: null })) },
    placementRecord: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => {
    let node: unknown = (en as Record<string, unknown>)[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === 'string' ? node : `${ns}.${key}`;
  }),
}));

import CareerBriefPage from '@/app/(portal)/dashboard/career-brief/page';

async function renderPage() {
  const page = await CareerBriefPage();
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {page}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.getUser.mockResolvedValue({ id: 'member-1' });
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue(Response.json({ goals: [], suggestions: [] }));
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('/dashboard/career-brief goals section (WAP-188)', () => {
  it('still requires sign-in before anything renders', async () => {
    mocks.getUser.mockResolvedValue(null);
    await expect(CareerBriefPage()).rejects.toThrow('redirect:/login?redirectTo=/dashboard/career-brief');
  });

  it('mounts exactly one #goals section, named by its visible "Your goals" h2', async () => {
    const { container } = await renderPage();
    const sections = container.querySelectorAll('#goals');
    expect(sections).toHaveLength(1);
    const section = sections[0] as HTMLElement;
    expect(section.tagName).toBe('SECTION');

    const heading = within(section).getByRole('heading', { level: 2, name: en.goals.title });
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(screen.getByRole('region', { name: en.goals.title })).toBe(section);
    // One goals heading on the page: the module's own title is the section heading.
    expect(screen.getAllByRole('heading', { name: en.goals.title })).toHaveLength(1);
  });

  it('is the working GoalsModule: it loads the member goals API once and offers to add a goal', async () => {
    const { container } = await renderPage();
    const section = container.querySelector<HTMLElement>('#goals') as HTMLElement;
    expect(await within(section).findByText(en.goals.empty.message)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: en.goals.form.addCta })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/member/goals');
  });

  it('shows the member’s active goals from the API inside that section', async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        goals: [
          {
            id: 'g-1',
            goalType: 'build_resume',
            title: 'Finish the resume draft',
            description: null,
            currentMetricValue: 0,
            targetMetricValue: null,
            status: 'ACTIVE',
            steps: [{ id: 's-1', text: 'Add the last role', done: false }],
          },
        ],
        suggestions: [],
      }),
    );
    const { container } = await renderPage();
    const section = container.querySelector<HTMLElement>('#goals') as HTMLElement;
    expect(await within(section).findByText('Finish the resume draft')).toBeInTheDocument();
    expect(within(section).getByRole('checkbox', { name: 'Add the last role' })).not.toBeChecked();
  });
});
