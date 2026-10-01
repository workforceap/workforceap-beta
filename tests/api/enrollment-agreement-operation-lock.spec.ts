// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), findFence: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRaw: mocks.query, $executeRaw: mocks.execute } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: (fn: () => Promise<unknown>) => fn(),
  withTenantScope: (_org: string, fn: (db: unknown) => Promise<unknown>) => fn({ enrollmentAgreementOperationLock: { findFirst: mocks.findFence } }),
}));
import { acquireEnrollmentAgreementUploadLock, assertEnrollmentAgreementNotErasing, claimEnrollmentAgreementErasure, releaseEnrollmentAgreementUploadLock } from '@/lib/enrollmentAgreements/operationLock';

const actor = { id: 'actor', organizationId: 'org', role: 'admin' };
const schema = { submissions: 'enrollment_agreement_submissions', locks: 'enrollment_agreement_operation_locks' };
beforeEach(() => { vi.resetAllMocks(); });

describe('persistent enrollment operation fences', () => {
  it('refuses a competing upload or erasure before any storage phase can begin', async () => {
    mocks.query.mockResolvedValue([]);
    await expect(acquireEnrollmentAgreementUploadLock(actor, 'member')).rejects.toMatchObject({ status: 409, code: 'AGREEMENT_OPERATION_IN_PROGRESS' });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it('releases exactly the token owned by this member upload', async () => {
    mocks.execute.mockResolvedValue(1);
    await releaseEnrollmentAgreementUploadLock(actor, 'member', 'owned-token');
    const [, ...values] = mocks.execute.mock.calls[0];
    expect(values).toEqual(['member', 'org', 'owned-token']);
  });
  it('does not silently succeed if the release token no longer owns the operation', async () => {
    mocks.execute.mockResolvedValue(0);
    await expect(releaseEnrollmentAgreementUploadLock(actor, 'member', 'stale-token')).rejects.toMatchObject({ code: 'AGREEMENT_LOCK_RECONCILIATION_REQUIRED' });
  });
  it('is a pre-rollout no-op only when both new tables are absent', async () => {
    mocks.query.mockResolvedValue([{ submissions: null, locks: null }]);
    await claimEnrollmentAgreementErasure('member'); expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it('fails closed on partial schema or failed introspection', async () => {
    mocks.query.mockResolvedValue([{ submissions: schema.submissions, locks: null }]);
    await expect(claimEnrollmentAgreementErasure('member')).rejects.toMatchObject({ code: 'AGREEMENT_ERASURE_UNAVAILABLE' });
    mocks.query.mockResolvedValue([]);
    await expect(claimEnrollmentAgreementErasure('member')).rejects.toMatchObject({ code: 'AGREEMENT_ERASURE_UNAVAILABLE' });
  });
  it('prevents erasure while an upload owns its fence, even with the feature disabled', async () => {
    vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
    mocks.query.mockResolvedValueOnce([schema]).mockResolvedValueOnce([{ memberExists: true, claimed: false }]);
    await expect(claimEnrollmentAgreementErasure('member')).rejects.toMatchObject({ code: 'AGREEMENT_UPLOAD_IN_PROGRESS' });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('accepts a newly claimed or previously retained erasure fence without releasing it', async () => {
    mocks.query.mockResolvedValueOnce([schema]).mockResolvedValueOnce([{ memberExists: true, claimed: true }]);
    await claimEnrollmentAgreementErasure('member'); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('allows storage erasure for a detached identity that cannot acquire a future upload', async () => {
    mocks.query.mockResolvedValueOnce([schema]).mockResolvedValueOnce([{ memberExists: false, claimed: false }]);
    await claimEnrollmentAgreementErasure('already-absent-member');
  });
  it('blocks new document reads while the erasure fence is retained', async () => {
    mocks.findFence.mockResolvedValue({ memberId: 'member' });
    await expect(assertEnrollmentAgreementNotErasing('member', 'org')).rejects.toMatchObject({ code: 'ACCOUNT_ERASURE_IN_PROGRESS' });
    expect(mocks.findFence).toHaveBeenCalledWith({ where: { memberId: 'member', organizationId: 'org', state: 'erasure' }, select: { memberId: true } });
  });
});
