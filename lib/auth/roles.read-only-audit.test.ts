import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  partnerUserFindUnique: vi.fn(),
  partnerFindFirst: vi.fn(),
  partnerFindUnique: vi.fn(),
  partnerUpsert: vi.fn(),
  employerFindFirst: vi.fn(),
  employerFindUnique: vi.fn(),
  employerUpsert: vi.fn(),
  userFindUnique: vi.fn(),
  userUpsert: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
  headers: async () => new Headers(),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerUser: { findUnique: mocks.partnerUserFindUnique },
    partner: {
      findFirst: mocks.partnerFindFirst,
      findUnique: mocks.partnerFindUnique,
      upsert: mocks.partnerUpsert,
    },
    employer: {
      findFirst: mocks.employerFindFirst,
      findUnique: mocks.employerFindUnique,
      upsert: mocks.employerUpsert,
    },
    user: {
      findUnique: mocks.userFindUnique,
      upsert: mocks.userUpsert,
    },
    organization: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/tenant/organization', () => ({
  getDefaultOrganizationId: vi.fn(),
}));
vi.mock('@/lib/storage/publicAssetUrl', () => ({
  resolveSupabasePublicAssetUrl: (_bucket: string, value: string | null) => value,
}));
vi.mock('@/lib/auth/roleAccess', () => ({
  hasAdminAccess: vi.fn(),
  hasSuperAdminAccess: vi.fn(),
}));

import { getEmployerForUser, getPartnerForUser } from './roles';

describe('super-admin portal fallbacks during read-only audits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.partnerUserFindUnique.mockResolvedValue(null);
    mocks.partnerFindFirst.mockResolvedValue(null);
    mocks.employerFindFirst.mockResolvedValue(null);
    mocks.employerFindUnique.mockResolvedValue(null);
  });

  it('does not provision or select an arbitrary partner when the fallback is absent', async () => {
    await expect(getPartnerForUser('admin-1', {
      isSuperAdminHint: true,
      readOnlyAudit: true,
    })).resolves.toBeNull();

    expect(mocks.partnerUpsert).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.partnerFindFirst).toHaveBeenCalledTimes(1);
  });

  it('does not provision or select an arbitrary employer when the fallback is absent', async () => {
    await expect(getEmployerForUser('admin-1', {
      isSuperAdminHint: true,
      readOnlyAudit: true,
    })).resolves.toBeNull();

    expect(mocks.userUpsert).not.toHaveBeenCalled();
    expect(mocks.employerUpsert).not.toHaveBeenCalled();
    expect(mocks.employerFindFirst).toHaveBeenCalledTimes(1);
  });
});

describe('super-admin portal fallbacks never write on the read path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.partnerUserFindUnique.mockResolvedValue(null);
    mocks.partnerFindFirst.mockResolvedValue(null);
    mocks.employerFindFirst.mockResolvedValue(null);
    mocks.employerFindUnique.mockResolvedValue(null);
  });

  it('does not upsert a fallback partner during a normal (non-audit) read', async () => {
    await expect(getPartnerForUser('admin-1', {
      isSuperAdminHint: true,
      readOnlyAudit: false,
    })).resolves.toBeNull();

    expect(mocks.partnerUpsert).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    // cookie fallback lookup + fallback-slug lookup + any-active lookup are all reads
    expect(mocks.partnerFindFirst).toHaveBeenCalled();
  });

  it('does not upsert a fallback employer during a normal (non-audit) read', async () => {
    await expect(getEmployerForUser('admin-1', {
      isSuperAdminHint: true,
      readOnlyAudit: false,
    })).resolves.toBeNull();

    expect(mocks.userUpsert).not.toHaveBeenCalled();
    expect(mocks.employerUpsert).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });
});
