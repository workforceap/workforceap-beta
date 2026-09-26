import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getResume: vi.fn(),
  findMember: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => function SessionRunClientStub() { return null; },
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => () => 'Sessions' }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound'); },
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'staff-1' }) }));
vi.mock('@/lib/auth/roles', () => ({
  isCounselor: async () => true,
  isAdmin: async () => false,
  isSuperAdmin: async () => false,
}));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: async () => true,
}));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, tenantId: 'org-1' }),
  withAdminPageScope: async (_scope: unknown, run: (db: unknown) => unknown) =>
    run({ user: { findFirst: mocks.findMember } }),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique: mocks.findMember } },
}));
vi.mock('@/lib/member/getMemberResumePlainText', () => ({
  getMemberResumePlainText: mocks.getResume,
}));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({
  isReadOnlyPortalAuditHeader: () => false,
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/CourseraProgressCard', () => ({ default: () => null }));

import CounselorSessionRunPage from '@/app/(portal)/counselor/sessions/[memberId]/run/page';
import AdminSessionRunPage from '@/app/admin/sessions/[memberId]/run/page';

const member = {
  id: 'member-1', fullName: 'Jordan Example', email: 'jordan@example.org',
  phone: null, enrolledProgram: null, programInterest: 'Support Specialist',
};
const sid = '00000000-0000-4000-8000-000000000001';

async function renderPage(page: typeof CounselorSessionRunPage | typeof AdminSessionRunPage) {
  const tree = await page({
    params: Promise.resolve({ memberId: member.id }),
    searchParams: Promise.resolve({ sid }),
  });
  const children = React.Children.toArray((tree as React.ReactElement<{ children: React.ReactNode }>).props.children);
  const client = children.find((node) => React.isValidElement(node) &&
    (node.props as { memberId?: string }).memberId === member.id);
  expect(client).toBeDefined();
  return (client as React.ReactElement<{ originalResume: string; existingResume: string }>).props;
}

describe.each([
  ['counselor', CounselorSessionRunPage],
  ['admin', AdminSessionRunPage],
] as const)('%s session resume provenance', (_role, page) => {
  beforeEach(() => {
    mocks.findMember.mockReset().mockResolvedValue(member);
    mocks.getResume.mockReset();
  });

  it('passes the original to Rewriter and avoids an enhanced read when extraction succeeds', async () => {
    const original = 'Original work history from the member with roles, dates and accomplishments.';
    mocks.getResume.mockResolvedValue(original);

    const props = await renderPage(page);

    expect(props).toMatchObject({ originalResume: original, existingResume: original });
    expect(mocks.getResume).toHaveBeenCalledTimes(1);
    expect(mocks.getResume).toHaveBeenCalledWith(member.id, 8000, {
      originalOnly: true, readOnlyAudit: false,
    });
  });

  it('retains enhanced context but gives Rewriter no source when the original is absent or unreadable', async () => {
    const enhanced = 'Prior enhanced draft for cover letters, interview prep, gap analysis, and job matching.';
    mocks.getResume.mockImplementation(async (_id: string, _limit: number, options: { originalOnly?: boolean }) =>
      options.originalOnly ? '' : enhanced);

    const props = await renderPage(page);

    expect(props).toMatchObject({ originalResume: '', existingResume: enhanced });
    expect(mocks.getResume).toHaveBeenNthCalledWith(1, member.id, 8000, {
      originalOnly: true, readOnlyAudit: false,
    });
    expect(mocks.getResume).toHaveBeenNthCalledWith(2, member.id, 8000, {
      enhancedOnly: true, readOnlyAudit: false,
    });
  });
});
