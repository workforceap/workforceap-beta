import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), member: vi.fn(), access: vi.fn(), fetch: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: mocks.member } } }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'tenant' }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: (_org: string, callback: (db: unknown) => unknown) => callback({ user: { findUnique: mocks.member } }) }));
vi.mock('@/lib/coursera/memberCourseAccess', () => ({ hasMemberCourseraCourseAccess: mocks.access }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: (slug: string) => ({ slug }) }));
vi.mock('@/lib/member/curriculumAssignment', () => ({ getProgramCoursesForCurriculumVersion: () => [
  { slug: 'course', name: 'Assigned course', estimatedHours: 10, courseraCourseId: 'course-id' },
  { slug: 'lab', name: 'Assigned lab', estimatedHours: 2, kind: 'workforceap' },
] }));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
  PageOpener: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/portal/kit/hooks/useAnnounce', () => ({ useAnnounce: () => vi.fn() }));
vi.mock('@/components/portal/TrackedCourseraLaunchLink', () => ({
  default: ({ children, courseSlug: _courseSlug, ...props }: { children: ReactNode; courseSlug?: string }) => <a {...props}>{children}</a>,
}));
import Page from '@/app/(portal)/dashboard/program/coursera-enrollment/page';

const member = {
  organizationId: 'tenant', enrolledProgram: 'primary', courseraEnrollmentApproved: true,
  courseEnrollments: [
    { id: 'one', programSlug: 'primary', curriculumVersion: 'legacy-v1', isPrimary: true, enrolledAt: new Date() },
    { id: 'two', programSlug: 'secondary', curriculumVersion: 'legacy-v1', isPrimary: false, enrolledAt: new Date() },
  ],
};
const page = (course = 'course') => Page({ searchParams: Promise.resolve({ program: 'secondary', course }) });

describe('explicit course enrollment handoff', () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch);
    mocks.user.mockResolvedValue({ id: 'learner', email: 'learner@example.invalid' });
    mocks.member.mockResolvedValue(member); mocks.access.mockResolvedValue(false);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('renders the funding lock without initiating enrollment for an unapproved learner', async () => {
    mocks.member.mockResolvedValue({ ...member, courseraEnrollmentApproved: false });
    render(await page());
    expect(screen.getByText(/Enrollment locked/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enroll in this course:/ })).not.toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('requires an explicit POST click and preserves the secondary enrollment', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: 'invited' }), { status: 200 }));
    render(await page());
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enroll in this course: Assigned course' }));
    expect(await screen.findByRole('dialog', { name: 'Check your email' })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/member/coursera/enroll-in-course', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ courseraCourseId: 'course-id', programSlug: 'secondary' }),
    }));
    expect(screen.queryByRole('link', { name: /Continue in Coursera/ })).not.toBeInTheDocument();
  });

  it('preserves already confirmed course access after new-enrollment approval is revoked', async () => {
    mocks.member.mockResolvedValue({ ...member, courseraEnrollmentApproved: false }); mocks.access.mockResolvedValue(true);
    render(await page());
    expect(screen.getByRole('link', { name: /Continue in Coursera/ })).toHaveAttribute('href', '/api/member/coursera/launch?course=course&program=secondary');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('rejects a hand-edited course outside the pinned curriculum', async () => {
    await expect(page('retired-course')).rejects.toThrow('redirect:/dashboard/program?error=course_not_assigned');
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('keeps an assigned lab in the platform without a provider-access check', async () => {
    await expect(page('lab')).rejects.toThrow('redirect:/dashboard/learning/modules/lab?program=secondary');
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('preserves course and program through sign-in', async () => {
    mocks.user.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('redirect:/login?redirectTo=%2Fdashboard%2Fprogram%2Fcoursera-enrollment%3Fprogram%3Dsecondary%26course%3Dcourse');
    expect(mocks.member).not.toHaveBeenCalled();
  });
});
