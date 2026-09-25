import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/memberDashboardAccess', () => ({ getMemberDashboardAccess: vi.fn(async () => ({ redirectTo: null })) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: vi.fn() }, message: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock('@/lib/messages/counselorThread', () => ({ getOrCreateMemberCounselorThread: vi.fn(), serializeMessage: vi.fn() }));
vi.mock('@/lib/member/loadTrainingWorkspace', () => ({ loadTrainingWorkspace: vi.fn() }));
vi.mock('next-intl/server', async () => {
  const en = (await import('@/messages/en.json')).default as Record<string, Record<string, unknown>>;
  return { getTranslations: vi.fn(async (ns: string) => (key: string) => {
    const value = en[ns]?.[key];
    return typeof value === 'string' ? value : key;
  }) };
});
vi.mock('@/components/portal/kit/pages/member/MemberMessagesKit', () => ({ MemberMessagesKit: () => null }));
vi.mock('@/components/portal/MemberCounselorChatClient', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberMessagesMobileClient', () => ({ default: () => null }));

import MemberMessagesPage from '@/app/(portal)/dashboard/messages/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';
import { loadTrainingWorkspace } from '@/lib/member/loadTrainingWorkspace';

const params = { program: 'it-support-professional-certificate-ibm', course: 'networking', curriculum: 'legacy-v1' };
const workspace = {
  programSlug: params.program, programTitle: 'IT Support (IBM)', curriculumVersion: 'legacy-v1',
  courses: [{ slug: 'networking', name: 'Networking', notes: 'Private reflection', artifactUrl: 'https://example.org/my-project' }],
};
const propsOf = (result: unknown) => (result as ReactElement<{ feedbackDraft?: { text: string }; feedbackNotice?: string }>).props;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'member-own-id' } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'member-own-id' } as never);
  vi.mocked(prisma.message.findMany).mockResolvedValue([]);
  vi.mocked(getOrCreateMemberCounselorThread).mockResolvedValue({ id: 'own-thread', counselorUserId: null, memberLastReadAt: null } as never);
  vi.mocked(loadTrainingWorkspace).mockResolvedValue(workspace as never);
});

describe('member course feedback context', () => {
  it('loads context from the authenticated member assignment and omits private notes', async () => {
    const props = propsOf(await MemberMessagesPage({ searchParams: Promise.resolve(params) }));
    expect(loadTrainingWorkspace).toHaveBeenCalledExactlyOnceWith({ userId: 'member-own-id', programSlug: params.program });
    expect(props.feedbackDraft?.text).toContain('Networking');
    expect(props.feedbackDraft?.text).toContain('https://example.org/my-project');
    expect(props.feedbackDraft?.text).not.toContain('Private reflection');
  });

  it('declines unassigned program, unassigned course, and stale curriculum context', async () => {
    vi.mocked(loadTrainingWorkspace).mockResolvedValueOnce(null);
    expect(propsOf(await MemberMessagesPage({ searchParams: Promise.resolve(params) })).feedbackDraft).toBeUndefined();
    expect(propsOf(await MemberMessagesPage({ searchParams: Promise.resolve({ ...params, course: 'unassigned' }) })).feedbackDraft).toBeUndefined();
    const props = propsOf(await MemberMessagesPage({ searchParams: Promise.resolve({ ...params, curriculum: 'stale-v0' }) }));
    expect(props.feedbackDraft).toBeUndefined();
    expect(props.feedbackNotice).toContain('could not load');
  });

  it('keeps the normal inbox available when optional workspace storage fails', async () => {
    vi.mocked(loadTrainingWorkspace).mockRejectedValue(new Error('Storage unavailable'));
    const props = propsOf(await MemberMessagesPage({ searchParams: Promise.resolve(params) }));
    expect(props.feedbackDraft).toBeUndefined();
    expect(props.feedbackNotice).toContain('write your message');
  });

  it('does not load context for ordinary inbox requests or malformed identifiers', async () => {
    expect(propsOf(await MemberMessagesPage({ searchParams: Promise.resolve({}) })).feedbackDraft).toBeUndefined();
    expect(loadTrainingWorkspace).not.toHaveBeenCalled();
    const props = propsOf(await MemberMessagesPage({ searchParams: Promise.resolve({ ...params, course: '<script>' }) }));
    expect(props.feedbackDraft).toBeUndefined();
    expect(loadTrainingWorkspace).not.toHaveBeenCalled();
  });

  it('preserves only safe course identifiers through sign-in', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(MemberMessagesPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
      `REDIRECT:/login?redirectTo=${encodeURIComponent('/dashboard/messages?' + new URLSearchParams(params).toString())}`,
    );
    expect(loadTrainingWorkspace).not.toHaveBeenCalled();
  });
});
