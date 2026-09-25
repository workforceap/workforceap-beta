import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

import CourseraLaunchErrorNotice from '@/components/portal/CourseraLaunchErrorNotice';
import { MemberProgramKit } from '@/components/portal/kit/pages/member/MemberProgramKit';
import type { TrainingWorkspace } from '@/lib/member/trainingWorkspace';

vi.mock('@/app/(portal)/dashboard/_actions/analyticsActions', () => ({
  logCourseraLaunchFromPortal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

/**
 * M02: lib/coursera/launchRouteCore.ts sends a failed Coursera launch to
 * /dashboard/training?error=<code>, which forwards to /dashboard/program with
 * the query intact. Nothing on My Program read `error`, so the member landed
 * on the page they had just clicked from with no word about what happened.
 * The notice turns the three known codes into plain language with a next
 * step; any other value renders nothing.
 */
function visit(search: string) {
  window.history.replaceState(null, '', `/dashboard/program${search}`);
}

describe('CourseraLaunchErrorNotice', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('explains a failed launch and links to the counselor', async () => {
    visit('?error=launch_failed&course=second-course');
    render(<CourseraLaunchErrorNotice />);

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toMatch(/couldn.t open your course on Coursera/i);
    expect(notice.textContent).toMatch(/try again/i);
    const link = screen.getByRole('link', { name: /message your counselor/i });
    expect(link.getAttribute('href')).toBe('/dashboard/messages');
  });

  it('explains a course outside the member program', async () => {
    visit('?error=course_not_assigned');
    render(<CourseraLaunchErrorNotice />);

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toMatch(/isn.t part of your program/i);
    expect(screen.getByRole('link', { name: /message your counselor/i })).toBeTruthy();
  });

  it('explains a program whose Coursera courses are still being set up', async () => {
    visit('?error=curriculum_track_pending');
    render(<CourseraLaunchErrorNotice />);

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toMatch(/still being set up/i);
    expect(screen.getByRole('link', { name: /message your counselor/i })).toBeTruthy();
  });

  it('never shows provider text or raw codes', async () => {
    visit('?error=launch_failed');
    render(<CourseraLaunchErrorNotice />);

    const notice = await screen.findByRole('status');
    expect(notice.textContent).not.toMatch(/launch_failed/);
  });

  it('removes ?error from the address bar and keeps the other params', async () => {
    visit('?error=launch_failed&course=second-course');
    render(<CourseraLaunchErrorNotice />);

    await screen.findByRole('status');
    expect(window.location.search).toBe('?course=second-course');
  });

  it('renders nothing for an unknown code', () => {
    visit('?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    const { container } = render(<CourseraLaunchErrorNotice />);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders nothing without an error param', () => {
    visit('?course=second-course');
    const { container } = render(<CourseraLaunchErrorNotice />);

    expect(container.innerHTML).toBe('');
  });
});

describe('My Program mounts the notice', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  const withIntl = (ui: React.ReactElement) => render(
    <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>,
  );

  it('shows on the program overview (no pinned workspace)', async () => {
    visit('?error=launch_failed');
    withIntl(<MemberProgramKit modules={[]} resumeHref="/dashboard/learning" />);

    const notice = await screen.findByText(/couldn.t open your course on Coursera/i);
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });

  it('shows above the pinned training workspace', async () => {
    visit('?error=launch_failed');
    const workspace = {
      programSlug: 'fixture-program',
      programTitle: 'Fixture program',
      curriculumVersion: 'fixture-v1',
      weeklyHours: null,
      planStartDate: null,
      totalEstimatedHours: 0,
      publishedSyllabusHours: 0,
      courses: [],
    } as unknown as TrainingWorkspace;
    withIntl(
      <MemberProgramKit
        trainingWorkspace={{ workspace, programTitle: 'Fixture program', completedSlugs: [], destinations: [] }}
      />,
    );

    const notice = await screen.findByText(/couldn.t open your course on Coursera/i);
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });
});
