import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProgramCourse } from '@/lib/content/programs';
import LearningHubEnrolledCourses from './LearningHubEnrolledCourses';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/portal/kit/hooks/useAnnounce', () => ({ useAnnounce: () => vi.fn() }));
vi.mock('@/components/portal/TrackedCourseraLaunchLink', () => ({
  default: ({ children, href }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const courses: ProgramCourse[] = [
  { slug: 'hardware-basics', name: 'Hardware basics', estimatedHours: 8, courseraCourseId: 'hw-1' },
  { slug: 'operating-systems', name: 'Operating systems', estimatedHours: 10, courseraCourseId: 'os-1' },
];

afterEach(cleanup);

describe('LearningHubEnrolledCourses course ids', () => {
  it('emits one DOM id per course slug', () => {
    render(
      <LearningHubEnrolledCourses
        programSlug="it-support-professional-certificate-ibm"
        programTitle="IT Support"
        courses={courses}
        completedSlugs={[]}
        assessmentCompleted
        eligibilityApproved
      />,
    );

    expect(document.querySelectorAll('#course-hardware-basics')).toHaveLength(1);
    expect(document.querySelectorAll('#course-operating-systems')).toHaveLength(1);
    const ids = [...document.querySelectorAll('[id^="course-"]')].map((node) => node.id);
    expect(ids).toEqual(['course-hardware-basics', 'course-operating-systems']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sends the enrolled-classes CTA to My Program, not the default dashboard', () => {
    const { getByRole } = render(
      <LearningHubEnrolledCourses
        programSlug="it-support-professional-certificate-ibm"
        programTitle="IT Support"
        courses={courses}
        completedSlugs={[]}
        assessmentCompleted
      />,
    );

    expect(getByRole('link', { name: 'Open My Program' })).toHaveAttribute('href', '/dashboard/program');
  });

  it('renders Open My Program as a kit ghost CTA with the kit focus ring, not a legacy .btn', () => {
    const { getByRole } = render(
      <LearningHubEnrolledCourses
        programSlug="it-support-professional-certificate-ibm"
        programTitle="IT Support"
        courses={courses}
        completedSlugs={[]}
        assessmentCompleted
      />,
    );

    const cta = getByRole('link', { name: 'Open My Program' });
    expect(cta).toHaveClass('wa-kit-cta', 'wa-kit-cta--ghost', 'wa-kit-focus');
    expect(cta).not.toHaveClass('btn');
    expect(cta).not.toHaveClass('btn-outline');
    expect(cta).not.toHaveClass('btn-sm');
  });
});
