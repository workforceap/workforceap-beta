import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ member: vi.fn(), workbench: vi.fn((_props: unknown) => null) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, organizationId: 'tenant' }),
  withAdminPageScope: (_scope: unknown, callback: (db: unknown) => unknown) => callback({ user: { findFirst: mocks.member }, trainingBillingPacket: { findMany: async () => [] } }),
}));
vi.mock('@/lib/billing/packetAccess', () => ({ resolveAssignedCounselorContact: async () => null, serializeBillingPacket: vi.fn() }));
vi.mock('@/lib/billing/packetDocument', () => ({ resolveProgramTitle: (slug: string) => slug }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/billing/BillingPacketList', () => ({ default: () => null }));
vi.mock('@/app/admin/members/[id]/billing/TwoStageBillingCase', () => ({ default: mocks.workbench }));

import Page from '@/app/admin/members/[id]/billing/page';

describe('billing program terms from approved source', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(cleanup);

  it('passes explicit availability and missing-syllabus reason without inventing hours', async () => {
    mocks.member.mockResolvedValue({ id: 'member', fullName: 'Synthetic member', email: 'member@example.invalid', organizationId: 'tenant', deletedAt: null, enrolledProgram: null,
      courseEnrollments: [
        { id: 'primary', programSlug: 'it-support-professional-certificate-ibm', isPrimary: true, enrolledAt: new Date() },
        { id: 'secondary', programSlug: 'comptia-network-professional-certificate', isPrimary: false, enrolledAt: new Date() },
      ],
    });
    render(await Page({ params: Promise.resolve({ id: 'member' }) }));
    expect(mocks.workbench).toHaveBeenCalled();
    const props = mocks.workbench.mock.calls[0][0] as unknown as { enrolledPrograms: Array<{ slug: string; billingTerms: { available: boolean; reason: string | null } }> };
    expect(props.enrolledPrograms[0].billingTerms).toEqual({ available: true, reason: null });
    expect(props.enrolledPrograms[1].billingTerms).toEqual({ available: false, reason: expect.stringContaining('No approved syllabus') });
    expect(props.enrolledPrograms[1]).not.toHaveProperty('contactHours');
  });
});
