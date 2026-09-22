import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemberProgramKit } from '@/components/portal/kit/pages/member/MemberProgramKit';
import { workforceApCourseHref } from '@/lib/content/courseDelivery';

/** The kit reads its `empty.*` copy through next-intl, as the (portal) layout provides it. */
const render = (ui: ReactElement) => rtlRender(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);

// The Coursera CTA is a tracked link backed by a server action. Keep the real
// anchor mounted so the rendered href is the thing under assertion.
vi.mock('@/app/(portal)/dashboard/_actions/analyticsActions', () => ({
  logCourseraLaunchFromPortal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const RESUME_HREF = '/dashboard/learning';
const DIGITAL_LITERACY = 'digital-literacy-empowerment-class';
const COURSERA_PROGRAM = 'it-support-professional-certificate-ibm';

/**
 * A WorkforceAP-authored pathway (DigitalLearn-linked Digital Literacy) has no
 * Coursera launch for any course. Before this was wired, the module CTA fell
 * through to `${resumeHref}#course-<slug>` — the Learning Hub, which renders no
 * module content and no link onward — so an enrolled member could never reach
 * the provider lesson and just cycled back to the dashboard.
 */
describe('member program module CTAs', () => {
  it('sends a WorkforceAP-authored module to its in-platform module page', () => {
    const href = workforceApCourseHref('computer-basics', DIGITAL_LITERACY);
    render(
      <MemberProgramKit
        resumeHref={RESUME_HREF}
        modules={[{ title: 'Computer Basics', state: 'active', slug: 'computer-basics', moduleHref: href }]}
      />,
    );

    const cta = screen.getByRole('link', { name: /continue/i });
    expect(cta).toHaveAttribute('href', href);
    expect(cta).toHaveClass('wa-kit-cta');
    expect(cta).not.toHaveClass('wa-page-action');
    expect(cta.getAttribute('href')).toContain('/dashboard/learning/modules/');
  });

  it('keeps completed WorkforceAP modules openable as kit CTAs', () => {
    const href = workforceApCourseHref('computer-basics', DIGITAL_LITERACY);
    render(
      <MemberProgramKit
        resumeHref={RESUME_HREF}
        modules={[{ title: 'Computer Basics', state: 'done', slug: 'computer-basics', moduleHref: href }]}
      />,
    );

    const cta = screen.getByRole('link', { name: /^Open$/ });
    expect(cta).toHaveAttribute('href', href);
    expect(cta).toHaveClass('wa-kit-cta');
  });

  it('never leaves a non-Coursera module pointing at the Learning Hub anchor', () => {
    // The regression itself: an anchor into a page with no module content.
    render(
      <MemberProgramKit
        resumeHref={RESUME_HREF}
        modules={[{
          title: 'Computer Basics',
          state: 'active',
          slug: 'computer-basics',
          moduleHref: workforceApCourseHref('computer-basics', DIGITAL_LITERACY),
        }]}
      />,
    );

    const href = screen.getByRole('link', { name: /continue/i }).getAttribute('href') ?? '';
    expect(href).not.toContain('#course-');
    expect(href).not.toBe(RESUME_HREF);
  });

  it('still prefers the Coursera launch endpoint when one exists', () => {
    const launchHref = `/api/member/coursera/launch?course=${COURSERA_PROGRAM}-course-1`;
    render(
      <MemberProgramKit
        resumeHref={RESUME_HREF}
        modules={[{
          title: 'Introduction to Technical Support',
          state: 'active',
          slug: `${COURSERA_PROGRAM}-course-1`,
          launchHref,
          // A course carrying both must launch through Coursera, not the
          // in-platform page.
          moduleHref: workforceApCourseHref(`${COURSERA_PROGRAM}-course-1`, COURSERA_PROGRAM),
        }]}
      />,
    );

    const cta = screen.getByRole('link', { name: /continue in coursera/i });
    expect(cta).toHaveAttribute('href', launchHref);
    expect(cta).toHaveClass('wa-page-action');
    expect(cta).not.toHaveClass('wa-kit-cta');
  });

  it('keeps the Learning Hub fallback for a module with neither destination', () => {
    render(
      <MemberProgramKit
        resumeHref={RESUME_HREF}
        modules={[{ title: 'Unmapped module', state: 'active', slug: 'unmapped' }]}
      />,
    );

    expect(screen.getByRole('link', { name: /continue/i }))
      .toHaveAttribute('href', `${RESUME_HREF}#course-unmapped`);
  });

  it('keeps locked modules labeled Locked instead of a live Continue', () => {
    const activeHref = workforceApCourseHref('computer-basics', DIGITAL_LITERACY);
    const lockedHref = workforceApCourseHref('basic-search', DIGITAL_LITERACY);
    render(
      <MemberProgramKit
        resumeHref={RESUME_HREF}
        modules={[
          { title: 'Computer Basics', state: 'active', slug: 'computer-basics', moduleHref: activeHref },
          { title: 'Basic Search', state: 'locked', slug: 'basic-search', moduleHref: lockedHref },
        ]}
      />,
    );

    const continues = screen.getAllByRole('link', { name: /continue/i });
    expect(continues).toHaveLength(1);
    expect(continues[0]).toHaveAttribute('href', activeHref);
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(
      screen.getAllByRole('link').map((el) => el.getAttribute('href')),
    ).not.toContain(lockedHref);
    expect(screen.queryByRole('link', { name: /basic search/i })).toBeNull();
  });
});

