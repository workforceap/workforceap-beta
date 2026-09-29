import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/memberDashboardAccess', () => ({ getMemberDashboardAccess: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    profile: { findUnique: vi.fn() },
    weeklyRecap: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn(),
  serializeMessage: vi.fn(),
}));
vi.mock('@/lib/recap/generate', () => ({ generateWeeklyRecap: vi.fn() }));
vi.mock('@/lib/content/careerBriefs', () => ({ getCareerBriefs: vi.fn(), getCareerBriefContent: vi.fn() }));
vi.mock('@/lib/content/careerBriefPersonalization', () => ({ getCareerBriefContext: vi.fn() }));
vi.mock('@/lib/ai/careerBriefAI', () => ({ generatePersonalizedBriefSection: vi.fn() }));
vi.mock('@/lib/member/getMemberState', () => ({ getMemberState: vi.fn() }));
vi.mock('@/lib/member/ensureAppUser', () => ({ ensureAppUserProvisioned: vi.fn() }));
vi.mock('@/components/portal/MemberCounselorChatClient', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberMessagesMobileClient', () => ({ default: () => null }));

import MemberMessagesPage from '@/app/(portal)/dashboard/messages/page';
import WeeklyRecapPage from '@/app/(portal)/dashboard/weekly-recap/page';
import CareerBriefDetailPage from '@/app/(portal)/dashboard/career-brief/[slug]/page';
import DashboardResumePage from '@/app/(portal)/dashboard/resume/page';
import { getUser } from '@/lib/auth/server';
import { getMemberDashboardAccess } from '@/lib/auth/memberDashboardAccess';
import { prisma } from '@/lib/db/prisma';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';
import { generateWeeklyRecap } from '@/lib/recap/generate';
import { getCareerBriefContext } from '@/lib/content/careerBriefPersonalization';
import { generatePersonalizedBriefSection } from '@/lib/ai/careerBriefAI';
import { getMemberState } from '@/lib/member/getMemberState';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';

const protectedPages = [
  ['/dashboard/messages', () => MemberMessagesPage({ searchParams: Promise.resolve({}) })],
  ['/dashboard/weekly-recap', () => WeeklyRecapPage()],
  ['/dashboard/career-brief/[slug]', () => CareerBriefDetailPage({ params: Promise.resolve({ slug: 'example' }) })],
  ['/dashboard/resume', () => DashboardResumePage()],
] as const;

function expectNoMemberWork() {
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(prisma.profile.findUnique).not.toHaveBeenCalled();
  expect(prisma.weeklyRecap.findUnique).not.toHaveBeenCalled();
  expect(prisma.weeklyRecap.update).not.toHaveBeenCalled();
  expect(getOrCreateMemberCounselorThread).not.toHaveBeenCalled();
  expect(generateWeeklyRecap).not.toHaveBeenCalled();
  expect(getCareerBriefContext).not.toHaveBeenCalled();
  expect(generatePersonalizedBriefSection).not.toHaveBeenCalled();
  expect(getMemberState).not.toHaveBeenCalled();
  expect(ensureAppUserProvisioned).not.toHaveBeenCalled();
}

describe('high-risk member dashboard deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'staff-only-1' } as never);
  });

  for (const destination of ['/employer', '/counselor'] as const) {
    it.each(protectedPages)(`%s redirects a denied role to ${destination} before member work`, async (_route, run) => {
      vi.mocked(getMemberDashboardAccess).mockResolvedValue({
        portalRoles: [],
        superAdmin: false,
        redirectTo: destination,
      });

      await expect(run()).rejects.toThrow(`REDIRECT:${destination}`);
      expect(getMemberDashboardAccess).toHaveBeenCalledExactlyOnceWith('staff-only-1');
      expectNoMemberWork();
    });
  }

  it.each(protectedPages)('%s stops before member work when role lookup fails', async (_route, run) => {
    vi.mocked(getMemberDashboardAccess).mockRejectedValue(new Error('role lookup unavailable'));

    await expect(run()).rejects.toThrow('role lookup unavailable');
    expectNoMemberWork();
  });
});
