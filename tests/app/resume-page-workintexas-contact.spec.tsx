import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  getMemberState: vi.fn(),
}));

vi.mock('next/dynamic', () => ({ default: () => function ResumeClientStub() { return null; } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => () => 'Resume' }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'member-1' }) }));
vi.mock('@/lib/auth/memberDashboardAccess', () => ({ getMemberDashboardAccess: async () => ({ redirectTo: null }) }));
vi.mock('@/lib/member/getMemberState', () => ({ getMemberState: mocks.getMemberState }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock('@/lib/db/withDbRetry', () => ({ withDbRetry: (read: () => unknown) => read() }));
vi.mock('@/lib/member/ensureAppUser', () => ({ ensureAppUserProvisioned: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));

import DashboardResumePage from '@/app/(portal)/dashboard/resume/page';

type GuideProps = { witData: { phone: string }; hasOriginal: boolean };

function collectGuideProps(node: React.ReactNode): GuideProps[] {
  if (!React.isValidElement(node)) return [];
  const props = node.props as { witData?: GuideProps['witData']; hasOriginal?: boolean; children?: React.ReactNode };
  const current = props.witData ? [{ witData: props.witData, hasOriginal: !!props.hasOriginal }] : [];
  return [...current, ...React.Children.toArray(props.children).flatMap(collectGuideProps)];
}

describe('Resume page WorkInTexas contact source', () => {
  beforeEach(() => {
    mocks.findUser.mockReset();
    mocks.getMemberState.mockReset().mockResolvedValue({
      fullName: 'Jordan Example', email: 'jordan@example.org', profileCompletenessPct: 60,
    });
  });

  it.each([
    ['profile phone wins', { phone: '555-000-1000', profile: { profilePhone: '555-000-2000', resumeOriginalPath: 'original.pdf', resumeEnhancedPath: null } }, '555-000-2000', true],
    ['account phone is used when profile phone is empty', { phone: '555-000-1000', profile: { profilePhone: null, resumeOriginalPath: null, resumeEnhancedPath: null } }, '555-000-1000', false],
    ['account phone is used when profile is absent', { phone: '555-000-1000', profile: null }, '555-000-1000', false],
  ])('%s', async (_label, userRow, expectedPhone, hasOriginal) => {
    mocks.findUser.mockResolvedValue(userRow);

    const page = await DashboardResumePage();
    const guideProps = collectGuideProps(page);

    expect(guideProps).toHaveLength(2);
    expect(guideProps.every((props) => props.witData.phone === expectedPhone && props.hasOriginal === hasOriginal)).toBe(true);
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'member-1' },
      select: expect.objectContaining({ phone: true, profile: expect.objectContaining({ select: expect.objectContaining({ profilePhone: true }) }) }),
    }));
  });
});
