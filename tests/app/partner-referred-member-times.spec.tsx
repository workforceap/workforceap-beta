process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: vi.fn() }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: vi.fn() }));
vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: vi.fn(async () => new Map()) }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn(async () => null) }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: vi.fn(async () => []) }));
vi.mock('@/components/portal/SkillsetProgressList', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerReferral: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    memberEvent: { findMany: vi.fn() },
    partnerOutreachLog: { findMany: vi.fn() },
  },
}));

import PartnerReferredMemberDetailPage from '@/app/(portal)/partner/referred-members/[memberId]/page';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

const INSTANT = new Date('2026-09-19T02:30:00Z'); // 9:30 PM CDT, Sep 18

describe('PartnerReferredMemberDetailPage timestamps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'partner-user-1' } as never);
    vi.mocked(getPartnerForUser).mockResolvedValue({ partnerId: 'partner-1', partner: { organizationId: 'org-1' } } as never);
    vi.mocked(prisma.partnerReferral.findFirst).mockResolvedValue({ id: 'ref-1', referredAt: INSTANT } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'member-1',
      fullName: 'Fixture Member',
      email: null,
      enrolledProgram: null,
      enrolledAt: INSTANT,
      courseEnrollments: [],
      courseProgress: [],
      placementRecord: null,
      userCertifications: [],
      memberProgramProgress: [],
    } as never);
    // Two event queries: the placement self-report lookup and the
    // partner-visible activity list (both filter on eventName.in).
    vi.mocked(prisma.memberEvent.findMany).mockImplementation((async (args: { where?: { eventName?: { in?: string[] } } }) =>
      args?.where?.eventName?.in?.includes('placement_confirmation_submitted') &&
      !args.where.eventName.in.includes('program_enrolled')
        ? []
        : [{ id: 'ev-1', userId: 'member-1', eventName: 'program_enrolled', createdAt: INSTANT }]) as never);
    vi.mocked(prisma.partnerOutreachLog.findMany).mockResolvedValue([
      { id: 'log-1', channel: 'email', note: 'Fixture note', createdAt: INSTANT, createdBy: { fullName: 'Fixture Staff' } },
    ] as never);
  });

  it('renders activity, outreach, and journey dates in Central time', async () => {
    const html = renderToStaticMarkup(await PartnerReferredMemberDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }));
    expect(html).toContain('Sep 18, 2026, 9:30 PM CDT');
    expect(html).not.toContain('2:30 AM');
    expect(html).not.toContain('Sep 19');
    expect(html).toContain('Enrolled in a program');
  });
});

/**
 * Vision C3: the detail page shows a referred member's progress events in
 * plain language, never logins, AI tool runs, staff follow-ups or metadata.
 */
describe('PartnerReferredMemberDetailPage partner-visible activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'partner-user-1' } as never);
    vi.mocked(getPartnerForUser).mockResolvedValue({ partnerId: 'partner-1', partner: { organizationId: 'org-1' } } as never);
    vi.mocked(prisma.partnerReferral.findFirst).mockResolvedValue({ id: 'ref-1', referredAt: INSTANT } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'member-1',
      fullName: 'Fixture Member',
      email: null,
      enrolledProgram: null,
      enrolledAt: INSTANT,
      courseEnrollments: [],
      courseProgress: [],
      placementRecord: null,
      userCertifications: [],
      memberProgramProgress: [],
    } as never);
    vi.mocked(prisma.partnerOutreachLog.findMany).mockResolvedValue([] as never);
  });

  it('filters the activity query to the allowlist and never selects metadata', async () => {
    vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([] as never);
    await PartnerReferredMemberDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) });
    const calls = vi.mocked(prisma.memberEvent.findMany).mock.calls.map(
      (c) => c[0] as { where: { userId: string; eventName?: { in: string[] } }; select?: Record<string, unknown>; take?: number },
    );
    const activity = calls.find((c) => c.where.eventName?.in.includes('program_enrolled'));
    expect(activity).toBeDefined();
    expect(activity!.where.userId).toBe('member-1');
    expect(activity!.where.eventName!.in).not.toContain('member_logged_in');
    expect(activity!.where.eventName!.in).not.toContain('counselor_followup_needed');
    expect(activity!.select).toBeDefined();
    expect(activity!.select).not.toHaveProperty('metadata');
    // Every event query is filtered: none may read an unfiltered event stream.
    for (const c of calls) expect(c.where.eventName?.in?.length).toBeGreaterThan(0);
  });

  it('renders plain-language labels and hides raw names, metadata and non-allowlisted rows', async () => {
    vi.mocked(prisma.memberEvent.findMany).mockImplementation((async (args: { where?: { eventName?: { in?: string[] } } }) =>
      args?.where?.eventName?.in?.includes('program_enrolled')
        ? [
            { id: 'ev-1', userId: 'member-1', eventName: 'course_completed', createdAt: INSTANT, metadata: { label: 'SECRET_NOTE' } },
            { id: 'ev-2', userId: 'member-1', eventName: 'counselor_followup_needed', createdAt: INSTANT, metadata: null },
          ]
        : []) as never);
    const html = renderToStaticMarkup(await PartnerReferredMemberDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }));
    expect(html).toContain('Completed a course');
    expect(html).not.toContain('course_completed');
    expect(html).not.toContain('SECRET_NOTE');
    expect(html).not.toContain('counselor_followup_needed');
  });

  it('keeps the empty state when the member has no partner-visible activity', async () => {
    vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([] as never);
    const html = renderToStaticMarkup(await PartnerReferredMemberDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }));
    expect(html).toContain('No recent member activity recorded yet.');
  });

  it('keeps an unverified placement pending and hides its employer, role, salary and retention details', async () => {
    vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'member-1', fullName: 'Fixture Member', email: null, enrolledProgram: null, enrolledAt: INSTANT,
      courseEnrollments: [], courseProgress: [], userCertifications: [], memberProgramProgress: [],
      placementRecord: {
        employerName: 'SECRET_EMPLOYER', jobTitle: 'SECRET_ROLE', salaryOffered: 98765,
        placedAt: INSTANT, startDateVerified: false, retentionDecision: 'SECRET_RETENTION',
        retentionStatus: null, onboardingWindowEnd: null,
      },
    } as never);
    const html = renderToStaticMarkup(await PartnerReferredMemberDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }));
    expect(html).toContain('Placement reported, pending verification');
    expect(html).not.toContain('SECRET_EMPLOYER');
    expect(html).not.toContain('SECRET_ROLE');
    expect(html).not.toContain('98,765');
    expect(html).not.toContain('SECRET_RETENTION');
    expect(html).not.toContain('>Placed<');
  });

  it('404s a member this partner did not refer (or another org member) before reading any events', async () => {
    vi.mocked(prisma.partnerReferral.findFirst).mockResolvedValue(null as never);
    await expect(
      PartnerReferredMemberDetailPage({ params: Promise.resolve({ memberId: 'other-org-member' }) }),
    ).rejects.toThrow('NOT_FOUND');
    const where = vi.mocked(prisma.partnerReferral.findFirst).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ partnerId: 'partner-1', memberId: 'other-org-member' });
    expect(prisma.memberEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
