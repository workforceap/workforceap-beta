import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '@/messages/en.json';
import { MemberHomeKit } from './MemberHomeKit';

// The kit's cards use next/navigation hooks that need a mounted app router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
// The placement strip and the First 90 Days card call server actions; the
// render tests never click them.
vi.mock('@/app/(portal)/dashboard/placementAction', () => ({ confirmPlacement: vi.fn() }));
vi.mock('@/app/(portal)/dashboard/first90DaysAction', () => ({ submitFirst90DaysCheckIn: vi.fn() }));

function renderKit(ui: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
}

const base = {
  firstName: 'Sam',
  coursePercent: 0,
  programTitle: 'IT Support Professional Certificate (IBM)',
  programStatus: 'In progress',
  activeJobs: 0,
  certs: 0,
  points: 0,
  currentStreak: 0,
  longestStreak: 0,
  goals: [],
  pipeline: [],
  pointsLedger: [],
  certModulesDone: 0,
  certModulesTotal: 9,
  doThisNext: {
    id: 'skills_assessment',
    title: 'Complete your Training Preassessment',
    body: 'Short preassessment.',
    href: '/dashboard/assessment',
    cta: 'Start preassessment',
    variant: 'urgent' as const,
    weight: 90,
  },
};

describe('MemberHomeKit certification-path card', () => {
  it('links the next module title when the loader supplies a module href', () => {
    renderKit(
      <MemberHomeKit
        {...base}
        nextLesson="Introduction to Technical Support"
        nextLessonHref="/dashboard/program?course=introduction-to-technical-support"
      />,
    );
    const link = screen.getByRole('link', { name: 'Introduction to Technical Support' });
    expect(link.getAttribute('href')).toBe('/dashboard/program?course=introduction-to-technical-support');
    expect(screen.queryByText('No next module on file.')).toBeNull();
    // Hero CTA is untouched.
    expect(screen.getByRole('link', { name: /Start preassessment/ })).toBeTruthy();
  });

  it('falls back to plain text without a module href and to the empty copy without a next lesson', () => {
    const { unmount } = renderKit(<MemberHomeKit {...base} nextLesson="Complete your Training Preassessment" />);
    expect(screen.queryByRole('link', { name: 'Complete your Training Preassessment' })).toBeNull();
    expect(screen.getAllByText(/Next:/).length).toBeGreaterThan(0);
    unmount();

    renderKit(<MemberHomeKit {...base} />);
    expect(screen.getByText('No next module on file.')).toBeTruthy();
  });

  // Dashboard progress semantics (PRODUCT_STAKES, Approval Required): partial
  // course progress reads as progress, never as an earned certificate. This
  // pinned the legacy home's first-cert bar until WAP-195 retired it; the kit
  // certification-path card is the one surface that shows it now.
  it('shows recorded course progress without claiming a certificate', () => {
    renderKit(<MemberHomeKit {...base} coursePercent={50} certModulesDone={1} certModulesTotal={2} />);
    expect(screen.getByRole('progressbar', { name: 'Certification module progress' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.queryByText(/certifi(ed|cation earned)|certificate earned/i)).toBeNull();
  });
});

describe('MemberHomeKit resume module CTA', () => {
  it('rewrites the dead training stub to My Program and keeps the query string', () => {
    const { container } = renderKit(
      <MemberHomeKit {...base} resumeHref="/dashboard/training?program=google-it-support" />,
    );
    const link = screen.getByRole('link', { name: /Resume module/ });
    expect(link.getAttribute('href')).toBe('/dashboard/program?program=google-it-support');
    // The CTA lives in the certification-path card inside the 4-column rail.
    const card = link.closest('.wa-kit-cert-path');
    expect(card).not.toBeNull();
    expect(card!.parentElement?.className).toBe('lg:wa-col-span-4 wa-min-w-0');
    expect(container.querySelector('a[href="/dashboard/training"]')).toBeNull();
    expect(container.querySelector('a[href^="/dashboard/training?"]')).toBeNull();
  });

  it('leaves a real resume destination alone and defaults to My Program', () => {
    const { unmount } = renderKit(<MemberHomeKit {...base} resumeHref="/dashboard/learning" />);
    expect(screen.getByRole('link', { name: /Resume module/ }).getAttribute('href')).toBe('/dashboard/learning');
    unmount();

    renderKit(<MemberHomeKit {...base} />);
    expect(screen.getByRole('link', { name: /Resume module/ }).getAttribute('href')).toBe('/dashboard/program');
  });
});

/**
 * The Course tile used to warn purely because progress was 0%, so a member who
 * enrolled an hour ago opened the dashboard to a gold chip. The warn tone now
 * waits for the shared staleness threshold (`STALE_TRAINING_ACTIVITY_DAYS`,
 * 14 days) that the loader evaluates.
 */
describe('MemberHomeKit Course tile warning', () => {
  /**
   * Locates the Course stat tile and proves the row is really there first: a
   * `querySelector` that stops matching would otherwise make every tone
   * assertion below vacuously true.
   */
  function courseTileTone(): string | null {
    // The home tiles are the kit StatSparkTile: the marked inner element declares
    // the tone hook itself and sits inside an Astryx Card, whose parent is the row.
    const tile = screen.getByText('Course').closest<HTMLElement>('[data-testid="stat-spark-tile"]');
    expect(tile).not.toBeNull();
    const card = tile!.parentElement!;
    const row = card.parentElement!;
    expect(row.children).toHaveLength(4);
    expect(row.children[0]).toBe(card);
    expect(row.children[1].textContent).toContain('Active jobs');
    const toned = tile!.matches('[class*="wa-kit-tone--"]') ? tile : tile!.querySelector<HTMLElement>('[class*="wa-kit-tone--"]');
    return toned ? toned.className.match(/wa-kit-tone--(\w+)/)![1] : null;
  }

  it('does not warn at 0% for a member whose training has not gone stale', () => {
    renderKit(<MemberHomeKit {...base} coursePercent={0} courseProgressStale={false} />);
    expect(courseTileTone()).toBeNull();
  });

  it('defaults to no warning when the caller supplies no staleness signal', () => {
    renderKit(<MemberHomeKit {...base} coursePercent={0} />);
    expect(courseTileTone()).toBeNull();
  });

  it('warns at 0% once the staleness threshold has been crossed', () => {
    renderKit(<MemberHomeKit {...base} coursePercent={0} courseProgressStale />);
    expect(courseTileTone()).toBe('warn');
  });

  it('never warns without an enrolled program, stale or not', () => {
    renderKit(<MemberHomeKit {...base} programTitle={undefined} coursePercent={0} courseProgressStale />);
    expect(courseTileTone()).toBeNull();
  });

  it('still reads as done at 100%, and staleness does not override it', () => {
    renderKit(<MemberHomeKit {...base} coursePercent={100} courseProgressStale />);
    expect(courseTileTone()).toBe('ok');
  });
});

describe('MemberHomeKit up next + recommended tool', () => {
  const upNext = [
    {
      id: 'upload_resume',
      title: 'Add your resume',
      body: 'Upload a resume so employers and AI tools can tailor help to your background.',
      href: '/dashboard/ai-tools/resume-studio?view=rewrite',
      cta: 'Try resume rewriter',
      variant: 'default' as const,
      weight: 80,
    },
    {
      id: 'career_readiness',
      title: 'Build your job readiness plan',
      body: 'Review your readiness checklist.',
      href: '/dashboard/readiness',
      cta: 'Open readiness',
      variant: 'default' as const,
      weight: 68,
    },
  ];
  const recommendedTool = {
    slug: 'interview-prep',
    title: 'Get ready for your interview',
    body: 'You have an interview or screening in your tracker.',
    href: '/dashboard/ai-tools/interview-prep',
    cta: 'Open interview prep',
  };

  it('lists each next step as one link to its page, in order', () => {
    renderKit(<MemberHomeKit {...base} upNext={upNext} />);
    const list = screen.getByRole('list', { name: 'Up next' });
    const links = Array.from(list.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard/ai-tools/resume-studio?view=rewrite',
      '/dashboard/readiness',
    ]);
    expect(links[0]?.textContent).toContain('Add your resume');
    expect(links[0]?.textContent).toContain('Try resume rewriter');
  });

  it('names the recommended tool and keeps the way to every tool', () => {
    renderKit(<MemberHomeKit {...base} upNext={upNext} recommendedTool={recommendedTool} />);
    const card = screen.getByTestId('recommended-tool');
    expect(card.getAttribute('data-tool')).toBe('interview-prep');
    expect(screen.getByRole('link', { name: /Open interview prep/ }).getAttribute('href')).toBe(
      '/dashboard/ai-tools/interview-prep',
    );
    expect(screen.getByRole('link', { name: 'All AI Career Tools' }).getAttribute('href')).toBe('/dashboard/ai-tools');
  });

  it('renders neither block when the loader has nothing to add', () => {
    renderKit(<MemberHomeKit {...base} />);
    expect(screen.queryByRole('list', { name: 'Up next' })).toBeNull();
    expect(screen.queryByTestId('recommended-tool')).toBeNull();
  });
});

/**
 * WAP-188 Phase A: what only the `?ui=legacy` home showed now renders on the
 * kit home, each piece only for the members it applies to, and the goals
 * links stay on kit pages.
 */
describe('MemberHomeKit pieces moved over from the legacy home', () => {
  const first90 = {
    stage: 'day_30' as const,
    daysSincePlacement: 20,
    employerName: 'Acme Health',
    currentStageResponse: null,
    completedStages: ['week_1' as const],
  };

  it('asks about each OFFER application, below the hero', () => {
    renderKit(<MemberHomeKit {...base} jobOffers={[{ id: 'o1', role: 'IT Support Specialist', company: 'Acme Health' }]} />);
    const question = screen.getByRole('heading', { name: 'Did you accept the role at Acme Health?' });
    expect(screen.getByRole('button', { name: /notify my team/ })).toBeTruthy();
    const hero = screen.getByRole('link', { name: /Start preassessment/ });
    expect(hero.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Flush in the kit column: no legacy 1.25rem gutter or trailing margin on the strip or its card.
    const strip = question.closest('section') as HTMLElement;
    expect(strip.style.padding).toBe('');
    expect(strip.style.marginBottom).toBe('');
    expect((strip.firstElementChild as HTMLElement).style.marginBottom).toBe('');
  });

  it('shows the First 90 Days check-in for a placed member', () => {
    renderKit(<MemberHomeKit {...base} first90={first90} />);
    expect(screen.getByText('Your new job at Acme Health')).toBeTruthy();
    expect(screen.getByText("How's the job going?")).toBeTruthy();
    // Flush in the kit column: no legacy 1rem / 1.25rem section padding.
    const card = screen.getByRole('region', { name: 'First 90 Days' });
    expect(card.style.padding).toBe('');
  });

  it('shows the youth notice for a member under 18', () => {
    renderKit(<MemberHomeKit {...base} youthNoticeAge={16} />);
    const notice = screen.getByRole('region', { name: 'Youth Member Portal (Age 16)' });
    expect(notice.textContent).toContain('Full job board access and applications become available when you turn 18');
  });

  it('renders none of them for a member they do not apply to', () => {
    renderKit(<MemberHomeKit {...base} />);
    expect(screen.queryByText(/Did you accept the role/)).toBeNull();
    expect(screen.queryByText('First 90 Days')).toBeNull();
    expect(screen.queryByText(/Youth Member Portal/)).toBeNull();
  });

  it('sends "Open goals" to the goals section on the career brief, never into ?ui=legacy', () => {
    const { container } = renderKit(<MemberHomeKit {...base} goals={[{ title: 'Apply to 5 roles', percent: 40 }]} />);
    expect(screen.getByRole('link', { name: 'Open goals' }).getAttribute('href')).toBe('/dashboard/career-brief#goals');
    expect(screen.queryByRole('link', { name: /Set a goal/ })).toBeNull();
    expect(container.querySelector('a[href*="ui=legacy"]')).toBeNull();
  });

  it('offers a quiet "Set a goal" link in the Next badge tile when there are no goals', () => {
    const { container } = renderKit(<MemberHomeKit {...base} goals={[]} />);
    const link = screen.getByRole('link', { name: /Set a goal/ });
    expect(link.getAttribute('href')).toBe('/dashboard/career-brief#goals');
    expect(link.closest('.wa-kit-card')?.textContent).toContain('Next badge');
    expect(screen.queryByRole('link', { name: 'Open goals' })).toBeNull();
    expect(container.querySelector('a[href*="ui=legacy"]')).toBeNull();
  });
});

// ── WAP-194: the staff-view banner and the view-only program switch ─────────
const TWO_PROGRAMS = {
  options: [
    { id: 'enr-1', programSlug: 'aws-cloud-technology-amazon', programTitle: 'AWS Cloud Technology Certificate', isPrimary: true },
    { id: 'enr-2', programSlug: 'comptia-a-professional-certificate', programTitle: 'CompTIA A+ Professional Certificate (CompTIA A+)', isPrimary: false },
  ],
  activeProgramSlug: 'aws-cloud-technology-amazon',
  viewingSecondary: false,
};

describe('MemberHomeKit staff-view banner', () => {
  it('shows StaffViewBanner only for a staff viewer', () => {
    const { container, unmount } = renderKit(<MemberHomeKit {...base} showStaffViewBanner />);
    const banner = container.querySelector('[data-staff-view-banner="dashboard"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toMatch(/viewing this as a super-admin/);
    // Kit paint: lucide icons, no Material Symbols, no legacy --color-* chain.
    expect(banner?.querySelector('.material-symbols-outlined')).toBeNull();
    expect(banner?.querySelectorAll('svg.lucide').length).toBe(2);
    expect(banner?.getAttribute('style') ?? '').not.toMatch(/--color-|rgba?\(/);
    unmount();

    const member = renderKit(<MemberHomeKit {...base} />);
    expect(member.container.querySelector('[data-staff-view-banner]')).toBeNull();
  });
});

describe('MemberHomeKit enrolled-program switch (view only)', () => {
  it('puts DashboardProgramSelector on the Certification path card when there are two or more enrollments', () => {
    renderKit(<MemberHomeKit {...base} programSwitch={TWO_PROGRAMS} />);
    const wrap = screen.getByTestId('home-program-switch');
    const card = wrap.closest('.wa-kit-cert-path');
    expect(card, 'the switch sits on the Certification path card').not.toBeNull();
    const chip = screen.getByTestId('dashboard-program-selector');
    expect(chip).toHaveTextContent('1 of 2 programs');
    expect(chip.querySelector('.material-symbols-outlined')).toBeNull();
    expect(chip.getAttribute('style') ?? '').not.toMatch(/--color-|rgba?\(/);
    // The primary view says nothing about Learning hub links.
    expect(screen.queryByText(/My Program shows your primary program/)).toBeNull();
  });

  it('links a secondary program into My Program for that program (WAP-196)', () => {
    const href = '/dashboard/program?program=comptia-a-professional-certificate';
    renderKit(
      <MemberHomeKit
        {...base}
        programHref={href}
        programSwitch={{ ...TWO_PROGRAMS, activeProgramSlug: 'comptia-a-professional-certificate', viewingSecondary: true }}
      />,
    );
    expect(screen.getByTestId('dashboard-program-selector')).toHaveTextContent('2 of 2 programs');
    // The old "links open the Learning hub" caveat is gone: the links now open this program.
    expect(screen.queryByText(/My Program shows your primary program/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open plan' }).getAttribute('href')).toBe(href);
  });

  it('renders no switch for one enrollment or none', () => {
    const { unmount } = renderKit(
      <MemberHomeKit {...base} programSwitch={{ ...TWO_PROGRAMS, options: TWO_PROGRAMS.options.slice(0, 1) }} />,
    );
    expect(screen.queryByTestId('home-program-switch')).toBeNull();
    unmount();
    renderKit(<MemberHomeKit {...base} programSwitch={null} />);
    expect(screen.queryByTestId('dashboard-program-selector')).toBeNull();
  });
});
