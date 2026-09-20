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
