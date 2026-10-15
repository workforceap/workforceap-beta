import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { countConfirmedProgramEnrollments } from '@/lib/admin/confirmedEnrollmentCounts';
import { buildProgramHealthRows } from '@/lib/admin/commandCenterHelpers';

const db = vi.hoisted(() => ({ member: vi.fn(), count: vi.fn(), programHealth: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next/link', () => ({ default: ({ children, href }: React.ComponentProps<'a'>) => <a href={href}>{children}</a> }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: async () => ({}) }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }), withAuthGuc: (fn: () => unknown) => fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/tenant/adminPageScope', async () => {
  const { prisma } = await import('@/lib/db/prisma');
  return { resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }), withAdminPageScope: async (_scope: unknown, fn: (client: unknown) => unknown) => fn(prisma) };
});
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findFirst: db.member, count: db.count },
  placementRecord: { findUnique: async () => null, count: async () => 0, findMany: async () => [] },
  placedOutcome: { findUnique: async () => null },
  preScreeningResponse: { findUnique: async () => null },
} }));
vi.mock('@/lib/coursera/progressQueries', () => ({ loadLearnerProgressByUserId: async () => null }));
vi.mock('@/lib/admin/commandCenter', () => ({ getAdminCommandCenter: async () => ({ needsReply: [], atRisk: [], interviewing: [], applicationsPending: [], programHealth: db.programHealth(), totals: { needsReplyCount: 0, atRiskCount: 0, interviewingCount: 0, applicationsPendingCount: 0, certificationsPendingCount: 0, oldestPendingApplicationDays: null } }) }));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title, subtitle }: { title: string; subtitle: string }) => <><h1>{title}</h1><p>{subtitle}</p></> }));
vi.mock('@/app/admin/members/[id]/readiness/ReadinessCounselorClient', () => ({ default: ({ programName }: { programName: string }) => <output aria-label="Readiness program">{programName}</output> }));
vi.mock('@/components/portal/MemberProgressStrip', () => ({ default: () => null }));
vi.mock('@/components/admin/AdminMemberResumeSection', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/admin/CommandCenterKit', () => ({ CommandCenterKit: ({ kpis }: { kpis: Array<{ label: string; value: number }> }) => <>{kpis.map((kpi) => <output key={kpi.label} aria-label={kpi.label}>{kpi.value}</output>)}</> }));

import ReadinessPage from '@/app/admin/members/[id]/readiness/page';
import StakeholderPage from '@/app/admin/members/[id]/stakeholder/page';
import CommandCenterPage from '@/app/admin/command-center/page';

const primary = 'software-developer-professional-certificate-ibm';
const secondary = 'it-support-professional-certificate-ibm';
const enrollment = (programSlug: string, isPrimary = true) => ({ programSlug, curriculumVersion: 'legacy-v1', isPrimary, enrolledAt: new Date('2026-10-01') });
const member = (overrides: Record<string, unknown> = {}) => ({
  id: 'learner-1', fullName: 'Synthetic Learner', email: 'learner@example.invalid', deletedAt: null,
  enrolledProgram: null, enrolledAt: null, courseEnrollments: [], courseProgress: [], userCertifications: [], assessmentCompleted: false, onboardingCompletedAt: null, ...overrides,
});
const props = { params: Promise.resolve({ id: 'learner-1' }) };
beforeEach(() => { vi.clearAllMocks(); db.member.mockResolvedValue(member()); db.programHealth.mockReturnValue([]); });
afterEach(cleanup);

describe('admin readiness and stakeholder assignment display', () => {
  it('uses a durable-only primary assignment on both pages despite a stale legacy pointer', async () => {
    db.member.mockResolvedValue(member({ enrolledProgram: secondary, courseEnrollments: [enrollment(primary)] }));
    let view = render(await ReadinessPage(props));
    expect(screen.getByLabelText('Readiness program')).toHaveTextContent(programDisplayTitle(primary));
    expect(screen.getByText(`Program: ${programDisplayTitle(primary)}`)).toBeInTheDocument();
    view.unmount();
    view = render(await StakeholderPage(props));
    expect(screen.getByText(programDisplayTitle(primary))).toBeInTheDocument();
    expect(screen.queryByText(programDisplayTitle(secondary))).toBeNull();
  });

  it('resolves alias-equivalent unmarked enrollment before using legacy-only curriculum', async () => {
    db.member.mockResolvedValue(member({ enrolledProgram: 'comptia-a-plus', courseEnrollments: [enrollment('comptia-a-professional-certificate', false)] }));
    const view = render(await ReadinessPage(props));
    expect(screen.getByLabelText('Readiness program')).toHaveTextContent(programDisplayTitle('comptia-a-plus'));
    view.unmount();
    render(await StakeholderPage(props));
    expect(screen.getByText(programDisplayTitle('comptia-a-plus'))).toBeInTheDocument();
  });

  it('leaves ambiguous enrollment rows unresolved rather than selecting secondary progress', async () => {
    db.member.mockResolvedValue(member({ courseEnrollments: [enrollment(primary, false), enrollment(secondary, false)], courseProgress: [{ programSlug: primary, courseSlug: 'observed', courseId: null, status: 'IN_PROGRESS', percentComplete: 45, lastUpdatedAt: new Date() }] }));
    const view = render(await ReadinessPage(props));
    expect(screen.getByLabelText('Readiness program')).toHaveTextContent('—');
    view.unmount();
    render(await StakeholderPage(props));
    expect(screen.getByText('Not enrolled')).toBeInTheDocument();
    expect(screen.queryByText(programDisplayTitle(primary))).toBeNull();
  });

  it('retains the legacy-only fallback when no durable enrollment exists', async () => {
    db.member.mockResolvedValue(member({ enrolledProgram: primary }));
    render(await ReadinessPage(props));
    expect(screen.getByLabelText('Readiness program')).toHaveTextContent(programDisplayTitle(primary));
  });
});

it('uses the same confirmed assignments in the active-student headline and program-share breakdown', async () => {
  const base = { deletedAt: null, organizationId: 'org-1', email: 'learner@example.invalid', profile: { role: 'member' }, userRoles: [{ role: { name: 'member' } }], enrolledProgram: null, courseEnrollments: [] };
  const population = [
    { ...base, courseEnrollments: [enrollment(primary)] },
    { ...base, enrolledProgram: primary },
    { ...base, courseProgress: [{ status: 'IN_PROGRESS' }] },
    { ...base, courseEnrollments: [enrollment(primary, false)] },
    { ...base, enrolledProgram: primary, organizationId: 'org-2' },
    { ...base, enrolledProgram: primary, deletedAt: new Date() },
    { ...base, enrolledProgram: primary, profile: { role: 'counselor' } },
  ];
  const activeMembers = population.filter((row) => matchesWhere(row, { organizationId: 'org-1', deletedAt: null, ...MEMBER_ONLY_WHERE }));
  db.programHealth.mockReturnValue(buildProgramHealthRows(countConfirmedProgramEnrollments(activeMembers), { limit: 5, labelFor: programDisplayTitle }));
  render(await CommandCenterPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByLabelText('Active Students')).toHaveTextContent('2');
  expect(db.count).not.toHaveBeenCalled();
});
