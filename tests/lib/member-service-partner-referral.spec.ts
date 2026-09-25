// @vitest-environment node
/**
 * createMember (the /signup door) must attribute a partner referral the same
 * way the /apply door does: the partner lookup is scoped to the member's
 * organization and active partners only, and a PartnerReferral row is
 * upserted inside the signup transaction so the member appears in the
 * partner's referred list (every partner surface reads PartnerReferral).
 *
 * Prisma, the tenant resolver, request headers and email are mocked; the real
 * createMember orchestration runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    role: { findUnique: vi.fn(), create: vi.fn() },
    user: { create: vi.fn() },
    userRole: { create: vi.fn() },
    profile: { create: vi.fn() },
    application: { create: vi.fn() },
    partnerReferral: { upsert: vi.fn() },
  };
  return {
    tx,
    partnerFindFirst: vi.fn(),
    userFindUnique: vi.fn(),
    resolveProvisionOrganizationId: vi.fn(),
    sendNewApplicationAdminEmail: vi.fn(),
    loggerWarn: vi.fn(),
  };
});

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partner: { findFirst: mocks.partnerFindFirst },
    user: { findUnique: mocks.userFindUnique },
    $transaction: (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx),
  },
}));
vi.mock('@/lib/db/withDbRetry', () => ({
  withDbRetry: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/tenant/resolveProvisionOrg', () => ({
  resolveProvisionOrganizationId: mocks.resolveProvisionOrganizationId,
}));
vi.mock('@/lib/tenant/currentRequestHeaders', () => ({
  tryCurrentRequestHeaders: async () => undefined,
}));
vi.mock('@/lib/email', () => ({
  sendNewApplicationAdminEmail: mocks.sendNewApplicationAdminEmail,
}));
vi.mock('@/lib/observability/logger', () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createMember } from '@/lib/member/service';
import type { MemberSignupInput } from '@/lib/validation/member';

const USER_ID = 'user-1';

function input(overrides: Partial<MemberSignupInput> = {}): MemberSignupInput {
  return {
    fullName: 'Test Member',
    email: 'member@example.com',
    password: 'Password1',
    programInterest: 'Digital Literacy Empowerment Class (6 weeks, 30 hours total)',
    consentTerms: true,
    consentCommunications: false,
    ...overrides,
  } as MemberSignupInput;
}

type PartnerRow = { id: string; active: boolean; organizationId: string; referralCode: string };
type PartnerWhere = {
  where: { active?: boolean; organizationId?: string; OR?: { referralCode?: string; slug?: string }[] };
};

/**
 * Apply the same filter the database would, so "inactive partner" and
 * "partner in another org" are real drops rather than a hand-fed null.
 */
function seedPartner(row: PartnerRow): void {
  mocks.partnerFindFirst.mockImplementation(async (args: PartnerWhere) => {
    const { where } = args;
    if (where.active === true && !row.active) return null;
    if (where.organizationId !== row.organizationId) return null;
    const codes = (where.OR ?? []).flatMap((clause) => [clause.referralCode, clause.slug]);
    if (!codes.includes(row.referralCode)) return null;
    return { id: row.id };
  });
}

function applicationData(): Record<string, unknown> {
  expect(mocks.tx.application.create).toHaveBeenCalledTimes(1);
  return mocks.tx.application.create.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations; seedPartner() installs one.
  mocks.partnerFindFirst.mockReset();
  mocks.resolveProvisionOrganizationId.mockResolvedValue('org-A');
  mocks.tx.role.findUnique.mockResolvedValue({ id: 'role-member', name: 'member' });
  mocks.tx.user.create.mockResolvedValue({ id: USER_ID });
  mocks.tx.userRole.create.mockResolvedValue({});
  mocks.tx.profile.create.mockResolvedValue({});
  mocks.tx.application.create.mockResolvedValue({ id: 'app-1' });
  mocks.tx.partnerReferral.upsert.mockResolvedValue({});
  mocks.sendNewApplicationAdminEmail.mockResolvedValue(undefined);
  mocks.userFindUnique.mockResolvedValue(null);
});

describe('createMember partner attribution (/signup door)', () => {
  it('(a) upserts exactly one PartnerReferral for a same-org active ref, keeping Application attribution', async () => {
    mocks.partnerFindFirst.mockResolvedValue({ id: 'partner-A' });

    await createMember(USER_ID, input({ referralRef: '  Acme-Ref ' }));

    expect(mocks.tx.partnerReferral.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.tx.partnerReferral.upsert).toHaveBeenCalledWith({
      where: { partnerId_memberId: { partnerId: 'partner-A', memberId: USER_ID } },
      create: { partnerId: 'partner-A', memberId: USER_ID },
      update: {},
    });
    const data = applicationData();
    expect(data.referralPartnerId).toBe('partner-A');
    expect(data.referralSource).toBe('partner_ref:acme-ref');
  });

  it('(b) scopes the partner lookup to the member org; a foreign-org code attributes nothing', async () => {
    mocks.partnerFindFirst.mockResolvedValue(null);

    await createMember(USER_ID, input({ referralRef: 'other-org-code' }));

    expect(mocks.partnerFindFirst).toHaveBeenCalledTimes(1);
    const where = mocks.partnerFindFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-A');
    expect(where.OR).toEqual([{ referralCode: 'other-org-code' }, { slug: 'other-org-code' }]);
    expect(mocks.tx.partnerReferral.upsert).not.toHaveBeenCalled();
    const data = applicationData();
    expect(data.referralPartnerId).toBeNull();
    expect(data.referralSource).toBeNull();
    // The user row is stamped with the same org the lookup was scoped to.
    expect(mocks.tx.user.create.mock.calls[0][0].data.organizationId).toBe('org-A');
  });

  it('(c) only matches active partners', async () => {
    mocks.partnerFindFirst.mockResolvedValue({ id: 'partner-A' });

    await createMember(USER_ID, input({ referralRef: 'acme' }));

    expect(mocks.partnerFindFirst.mock.calls[0][0].where.active).toBe(true);
  });

  it('(d) with no ref, does not look up a partner or write a PartnerReferral', async () => {
    await createMember(USER_ID, input({ referralRef: '   ' }));
    await createMember(USER_ID, input());

    expect(mocks.partnerFindFirst).not.toHaveBeenCalled();
    expect(mocks.tx.partnerReferral.upsert).not.toHaveBeenCalled();
    expect(mocks.tx.application.create.mock.calls[0][0].data.referralPartnerId).toBeNull();
  });

  /**
   * A ref that matches nothing used to be dropped in silence, so a broken
   * partner link looked exactly like organic traffic. The drop still happens
   * — attribution must stay off — but it is now visible in the logs.
   */
  it('(g) logs the dropped ref and its org when the code belongs to another organization', async () => {
    seedPartner({ id: 'partner-B', active: true, organizationId: 'org-B', referralCode: 'other-org-code' });

    await createMember(USER_ID, input({ referralRef: 'other-org-code' }));

    expect(mocks.tx.partnerReferral.upsert).not.toHaveBeenCalled();
    expect(applicationData().referralPartnerId).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1);
    const [message, context] = mocks.loggerWarn.mock.calls[0];
    expect(message).toMatch(/partner ref/i);
    expect(context).toEqual({ refFingerprint: '42e3390fed4764a9', organizationId: 'org-A' });
  });

  it('(h) logs the dropped ref when the partner exists in this org but is inactive', async () => {
    seedPartner({ id: 'partner-A', active: false, organizationId: 'org-A', referralCode: 'retired-ref' });

    await createMember(USER_ID, input({ referralRef: 'Retired-Ref' }));

    expect(mocks.tx.partnerReferral.upsert).not.toHaveBeenCalled();
    expect(applicationData().referralPartnerId).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1);
    expect(mocks.loggerWarn.mock.calls[0][1]).toEqual({ refFingerprint: 'b737fdc99508ac5a', organizationId: 'org-A' });
  });

  it('(i) keeps personal data out of the dropped-ref log line', async () => {
    seedPartner({ id: 'partner-B', active: true, organizationId: 'org-B', referralCode: 'other-org-code' });

    await createMember(
      USER_ID,
      input({ referralRef: 'private.person@example.com', email: 'private.person@example.com', fullName: 'Private Person' }),
    );

    const logged = JSON.stringify(mocks.loggerWarn.mock.calls);
    expect(logged).not.toContain('private.person@example.com');
    expect(logged).not.toContain('Private Person');
    expect(logged).not.toContain(USER_ID);
  });

  it('(j) logs nothing when the ref resolves to a partner, and nothing when there is no ref', async () => {
    mocks.partnerFindFirst.mockResolvedValue({ id: 'partner-A' });
    await createMember(USER_ID, input({ referralRef: 'acme' }));
    await createMember(USER_ID, input());

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('(e) rejects when the PartnerReferral upsert fails and the user row does not exist', async () => {
    mocks.partnerFindFirst.mockResolvedValue({ id: 'partner-A' });
    mocks.tx.partnerReferral.upsert.mockRejectedValue(new Error('upsert failed'));
    mocks.userFindUnique.mockResolvedValue(null);

    await expect(createMember(USER_ID, input({ referralRef: 'acme' }))).rejects.toThrow('upsert failed');
  });

  it('(f) resolves when the upsert error is a lost ack and the user row already exists', async () => {
    mocks.partnerFindFirst.mockResolvedValue({ id: 'partner-A' });
    mocks.tx.partnerReferral.upsert.mockRejectedValue(new Error('connection closed'));
    mocks.userFindUnique.mockResolvedValue({ id: USER_ID });

    await expect(createMember(USER_ID, input({ referralRef: 'acme' }))).resolves.toBeUndefined();
  });
});
