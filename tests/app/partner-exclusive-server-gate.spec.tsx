import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPartnerForUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  headers: vi.fn(),
  isReadOnlyPortalAuditHeader: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    const error = new Error(`REDIRECT:${href}`) as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${href};307;`;
    throw error;
  },
}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: mocks.getPartnerForUser,
  isSuperAdmin: mocks.isSuperAdmin,
}));
vi.mock('@/lib/db/withDbRetry', () => ({ withDbRetry: async (load: () => Promise<unknown>) => load() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({
  isReadOnlyPortalAuditHeader: mocks.isReadOnlyPortalAuditHeader,
}));

import PartnerExclusiveServerGate from '@/components/portal/PartnerExclusiveServerGate';

describe('partner-only server gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ 'x-pathname': '/dashboard' }));
    mocks.isReadOnlyPortalAuditHeader.mockReturnValue(false);
    mocks.getUser.mockResolvedValue({ id: 'partner-only' });
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.getPartnerForUser.mockResolvedValue({ id: 'partner-1' });
  });

  it.each([false, true])('lets the partner redirect escape role lookup in read-only audit=%s', async (readOnlyAudit) => {
    mocks.isReadOnlyPortalAuditHeader.mockReturnValue(readOnlyAudit);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(PartnerExclusiveServerGate()).rejects.toThrow('REDIRECT:/partner');
      expect(mocks.getPartnerForUser).toHaveBeenCalledWith('partner-only', { isSuperAdminHint: false });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('allows a super admin with a partner association', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    await expect(PartnerExclusiveServerGate()).resolves.toBeNull();
    expect(mocks.getPartnerForUser).toHaveBeenCalledWith('partner-only', { isSuperAdminHint: true });
  });

  it('skips partner shell paths before doing any auth lookup', async () => {
    mocks.headers.mockResolvedValue(new Headers({ 'x-pathname': '/partner/referred-members' }));
    await expect(PartnerExclusiveServerGate()).resolves.toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
