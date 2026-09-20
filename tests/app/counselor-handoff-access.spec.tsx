import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'staff-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(), isCounselor: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { counselor: { findFirst: vi.fn() }, user: { findFirst: vi.fn() } } }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: vi.fn() }));
vi.mock('@/lib/counselor/workQueue', () => ({
  getCounselorWorkQueue: vi.fn(),
  getCounselorWorkQueueContext: vi.fn(async () => ({ flaggedTotal: 1, awaitingReply: 1 })),
  formatTimeWaiting: () => '2d ago',
  previewMessageBody: (body: string) => body,
}));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => <h1>Work queue</h1> }));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SectionHeader: () => null,
  Avatar: () => null,
  StatusTag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  colorVar: () => 'inherit',
}));
vi.mock('@/components/portal/counselor/MemberProgressTimeline', () => ({ default: () => null }));
vi.mock('@/components/admin/AdminMemberCounselorChatClient', () => ({ default: () => null }));
vi.mock('@/components/billing/BillingPacketList', () => ({ default: () => null }));
vi.mock('@/components/counselor/StaffMemberResumePanel', () => ({ default: () => null }));
vi.mock('@/components/portal/AwardPointsButton', () => ({ default: () => null }));
vi.mock('@/lib/member/points', () => ({ getMemberPoints: vi.fn() }));
vi.mock('@/lib/billing/packetAccess', () => ({ listPacketsForMember: vi.fn() }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn() }));
vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: vi.fn() }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: vi.fn() }));

import CounselorWorkQueuePage from '@/app/(portal)/counselor/queue/page';
import CounselorStudentDetailPage from '@/app/(portal)/counselor/students/[memberId]/page';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { getCounselorWorkQueue } from '@/lib/counselor/workQueue';

describe('Counselor contextual handoffs and detail access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({ id: 'counselor-1' } as never);
  });
  afterEach(cleanup);
  it('opens the selected queue member using the authorized inbox query contract', async () => {
    vi.mocked(getCounselorWorkQueue).mockResolvedValue([{
      memberId: 'member-2', memberName: 'Second Member', memberEmail: 'second@example.test',
      threadId: 'thread-2', lastMessageBody: 'Please help with next steps',
      lastMessageAt: new Date('2026-09-07T12:00:00Z'), hoursWaiting: 48,
    }]);
    render(await CounselorWorkQueuePage());
    expect(screen.getByRole('link', { name: /Second Member/ })).toHaveAttribute('href', '/counselor/messages?memberId=member-2');
  });
  it.each(['unassigned counselor', 'other-organization admin'])('withholds detail and funding facts from an %s', async (actor) => {
    if (actor === 'other-organization admin') {
      vi.mocked(isCounselor).mockResolvedValue(false);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(prisma.counselor.findFirst).mockResolvedValue(null);
    }
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);
    await expect(CounselorStudentDetailPage({ params: Promise.resolve({ memberId: 'unassigned-member' }) })).rejects.toThrow('NOT_FOUND');
    expect(assertStaffCanAccessMemberRecord).toHaveBeenCalledWith('staff-1', 'unassigned-member');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
