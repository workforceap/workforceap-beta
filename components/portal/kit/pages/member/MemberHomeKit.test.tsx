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
