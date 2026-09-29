import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    const step = within(section).getByRole('checkbox', { name: 'Add the last role' });
    expect(step).not.toBeChecked();
    // The whole labelled row is the 44px target, not just the 1rem box.
    expect(step.closest('label')).toHaveStyle({ minHeight: '44px' });
  });

  it('names the add-goal fields with visible labels, not placeholders', async () => {
    const { container } = await renderPage();
    const section = container.querySelector<HTMLElement>('#goals') as HTMLElement;
    fireEvent.click(await within(section).findByRole('button', { name: en.goals.form.addCta }));

    const type = within(section).getByRole('combobox', { name: en.goals.form.typeLabel });
    const title = within(section).getByRole('textbox', { name: en.goals.form.titleLabel });
    expect(within(section).getByText(en.goals.form.typeLabel).tagName).toBe('LABEL');
    expect(within(section).getByText(en.goals.form.titleLabel).tagName).toBe('LABEL');
    expect(title).toHaveAttribute('placeholder', en.goals.form.customPlaceholder);
    expect(type.id).not.toBe(title.id);
  });
});

/**
 * WAP-197 item 7: the rest of the page (metric tiles, next best action,
 * program context, quick links) moved off Material Symbols and legacy
 * `--color-*` refs onto the kit: PageOpener, StatSparkTile, kit rows and
 * CTAs, Lucide icons. Destinations are unchanged.
 */
describe('/dashboard/career-brief kit restyle (WAP-197)', () => {
  it('opens with the kit PageOpener h1 instead of PageHeader breadcrumbs', async () => {
    const { container } = await renderPage();
    expect(container.querySelector('.wa-page-opener')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: en.dashboard.careerBrief })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
  });

  it('renders no Material Symbols ligature and no legacy --color-* reference', async () => {
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.memberNextBestAction.findMany).mockResolvedValueOnce([
      { id: 'nba-1', title: 'Finish module 2', description: 'Two lessons left', ctaHref: '/dashboard/program', ctaLabel: 'Open', priority: 5, icon: 'school' },
    ] as never);
    const { container } = await renderPage();
    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
    expect(container.innerHTML).not.toMatch(/--color-/);
    expect(container.innerHTML).not.toMatch(/portal-metric-card|portal-quick-action-item/);
  });

  it('keeps every metric tile and its destination', async () => {
    const { container } = await renderPage();
    const tiles = container.querySelector('[data-career-brief-metrics]') as HTMLElement;
    expect(within(tiles).getAllByTestId('stat-spark-tile')).toHaveLength(6);
    const hrefs = within(tiles).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/dashboard/learning',
      '/dashboard/ai-tools/skill-mapper',
      '/dashboard/ai-tools/resume-studio?view=rewrite',
      '/dashboard/jobs',
      '/dashboard/job-applications',
    ]);
    expect(within(tiles).getByText(en.dashboard.missing)).toBeInTheDocument();
    expect(within(tiles).getByText(en.dashboard.notPlacedYet)).toBeInTheDocument();
  });

  it('renders the persisted next best action as one kit row with its link', async () => {
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.memberNextBestAction.findMany).mockResolvedValueOnce([
      { id: 'nba-1', title: 'Finish module 2', description: 'Two lessons left', ctaHref: '/dashboard/program', ctaLabel: 'Open', priority: 5, icon: 'school' },
    ] as never);
    await renderPage();
    const section = screen.getByRole('region', { name: en.dashboard.nextBestAction });
    const row = within(section).getByRole('link', { name: /Finish module 2/ });
    expect(row).toHaveAttribute('href', '/dashboard/program');
    expect(row.className).toContain('wa-kit-toolkit-row');
    expect(row).toHaveTextContent('Two lessons left');
    // The stored ligature name draws as a Lucide svg, never as literal text.
    expect(row.querySelector('svg')).not.toBeNull();
    expect(row).not.toHaveTextContent('school');
  });

  it('quick links are kit ghost CTAs with the same destinations', async () => {
    await renderPage();
    const section = screen.getByRole('region', { name: en.dashboard.careerToolkit });
    const links = within(section).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard/ai-tools',
      '/dashboard/ai-tools/skill-mapper',
      '/dashboard/ai-tools/resume-studio?view=rewrite',
      '/dashboard/jobs',
      '/dashboard/readiness',
    ]);
    for (const link of links) expect(link.className).toContain('wa-kit-cta--ghost');
  });
});
