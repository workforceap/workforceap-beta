import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ member: vi.fn(), certs: vi.fn(), surveys: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error('not-found'); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/seo', () => ({ buildPageMetadata: () => ({}), buildPageMetadataAsync: async () => ({}) }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin' }) }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: async () => false, getProfileRole: async () => 'member' }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/db/withDbRetry', () => ({ withDbRetry: (work: () => unknown) => work() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }),
  withAdminPageScope: async (_scope: unknown, work: (db: unknown) => unknown) => {
    const { prisma } = await import('@/lib/db/prisma'); return work(prisma);
  },
  inheritUserOrg: () => ({ user: { organizationId: 'org-1' } }),
  inheritMemberOrg: () => ({}), inheritLeaderOrg: () => ({}), inheritInvitedByOrg: () => ({}),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findFirst: h.member }, courseraIdentityMapping: { findMany: async () => [] },
  userCertification: { findMany: h.certs },
  placementSurvey: { findMany: h.surveys, count: async () => 2, aggregate: async () => ({ _avg: {} }) },
} }));
vi.mock('@/lib/coursera/progressQueries', () => ({ loadLearnerProgressByUserId: async () => null }));
vi.mock('@/lib/admin/cohortAnalytics', () => ({ getCertificationsCohortStats: async () => [], cohortLabel: (slug: string | null) => slug ? `Cohort ${slug}` : 'Unassigned' }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => { throw new Error('not expected in read-only audit'); } }));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/CourseraProgressCard', () => ({ default: () => null }));
vi.mock('@/components/admin/PlacementSurveysWhatsThis', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/admin-subviews/CertificationsQueueKit', () => ({
  CertificationsQueueKit: ({ submissions }: { submissions: Array<{ id: string; member: string; meta: string }> }) => <section>{submissions.map((row) => <p key={row.id}>{row.member}: {row.meta}</p>)}</section>,
}));

import LearnerPage from '@/app/admin/coursera/learners/[userId]/page';
import CertificationsPage from '@/app/admin/certifications/page';
import SurveysPage from '@/app/admin/placement-surveys/page';
import { programDisplayTitle } from '@/lib/content/programTitle';

const program = 'comptia-a-professional-certificate';
const enrollment = { programSlug: program, curriculumVersion: 'legacy-v1', isPrimary: true, enrolledAt: new Date('2026-10-01T00:00:00Z') };
const member = { id: 'learner', fullName: 'Synthetic Learner', email: 'learner@example.invalid', enrolledProgram: 'old-other-program', courseEnrollments: [enrollment], workspaceEmail: null, workspaceEmailProvisioned: false };

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('admin records use confirmed current assignment labels', () => {
  it('shows a durable primary program on learner detail while keeping unresolved records accessible', async () => {
    h.member.mockResolvedValue(member);
    const { unmount } = render(await LearnerPage({ params: Promise.resolve({ userId: member.id }) }));
    expect(screen.getByText(programDisplayTitle(program))).toBeInTheDocument();
    expect(screen.queryByText('old-other-program')).not.toBeInTheDocument();
    unmount();
    h.member.mockResolvedValue({ ...member, courseEnrollments: [{ ...enrollment, isPrimary: false }] });
    render(await LearnerPage({ params: Promise.resolve({ userId: member.id }) }));
    expect(screen.getByRole('heading', { name: member.fullName })).toBeInTheDocument();
    expect(screen.queryByText(programDisplayTitle(program))).not.toBeInTheDocument();
    expect(h.member.mock.calls[0][0].where).toEqual({ id: 'learner', deletedAt: null, organizationId: 'org-1' });
  });

  it('keeps both pending certificates and labels each from the actual assignment rather than stale legacy text', async () => {
    h.certs.mockResolvedValue([
      { id: 'cert-primary', certName: 'Synthetic credential', proofUrl: null, submittedAt: null, user: member },
      { id: 'cert-unresolved', certName: 'Synthetic credential', proofUrl: null, submittedAt: null, user: { ...member, fullName: 'Unresolved Learner', courseEnrollments: [{ ...enrollment, isPrimary: false }] } },
    ]);
    render(await CertificationsPage({}));
    expect(screen.getByText(`Synthetic Learner: Cohort ${program} · submitted recently`)).toBeInTheDocument();
    expect(screen.getByText('Unresolved Learner: Unassigned · submitted recently')).toBeInTheDocument();
    expect(h.certs.mock.calls[0][0].where).toEqual({ status: 'pending', user: { organizationId: 'org-1' } });
  });

  it('keeps both survey records while resolving a primary or alias-matched enrollment label', async () => {
    const survey = { wave: 'thirty_day', sentAt: new Date('2026-10-01T00:00:00Z'), completedAt: null, stillEmployed: null, jobSatisfaction: null, trainingRelevance: null, supportQuality: null, allowTestimonial: false };
    h.surveys.mockResolvedValue([
      { ...survey, id: 'survey-primary', user: member },
      { ...survey, id: 'survey-alias', user: { ...member, fullName: 'Alias Learner', enrolledProgram: 'comptia-a-plus', courseEnrollments: [{ ...enrollment, isPrimary: false }] } },
    ]);
    render(await SurveysPage({ searchParams: Promise.resolve({ ui: 'legacy' }) }));
    expect(screen.getAllByText(programDisplayTitle(program))).toHaveLength(2);
    expect(screen.getByText('Alias Learner')).toBeInTheDocument();
    expect(screen.getByText('Synthetic Learner')).toBeInTheDocument();
    expect(h.surveys.mock.calls[0][0].where).toEqual({ sentAt: { not: null }, user: { organizationId: 'org-1' } });
  });
});
