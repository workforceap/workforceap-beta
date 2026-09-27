import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(), transaction: vi.fn(), lock: vi.fn(), pending: vi.fn(),
  executeRaw: vi.fn(),
  applicationFind: vi.fn(), applicationUpdate: vi.fn(), applicationCreate: vi.fn(),
  enrollmentFind: vi.fn(), enrollmentUpdateMany: vi.fn(), enrollmentUpdate: vi.fn(),
  userUpdate: vi.fn(),
}));

const tx = {
  $executeRaw: h.executeRaw,
  application: { findFirst: h.applicationFind, update: h.applicationUpdate, create: h.applicationCreate },
  courseEnrollment: { findUnique: h.enrollmentFind, updateMany: h.enrollmentUpdateMany, update: h.enrollmentUpdate },
  user: { update: h.userUpdate },
};

vi.mock('@/lib/auth/server', () => ({ getUser: h.getUser }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (route: unknown) => route }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: h.transaction } }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: () => true }));
vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: h.lock,
  billingLifecyclePending: h.pending,
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { PATCH as saveApplication } from '@/app/api/member/application-onboarding/route';
import { POST as setPrimary } from '@/app/api/member/enrollments/[id]/set-primary/route';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const ENROLLMENT_ID = '20000000-0000-4000-8000-000000000002';

const applicationRequest = () => new Request('http://localhost/api/member/application-onboarding', {
  method: 'PATCH', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ programInterest: 'Digital literacy' }),
});
const primaryRequest = () => new Request(`http://localhost/api/member/enrollments/${ENROLLMENT_ID}/set-primary`, {
  method: 'POST',
});
const primaryContext = () => ({ params: Promise.resolve({ id: ENROLLMENT_ID }) });

beforeEach(() => {
  vi.resetAllMocks();
  h.getUser.mockResolvedValue({ id: USER_ID });
  h.transaction.mockImplementation(async (write: (client: typeof tx) => Promise<unknown>) => write(tx));
  h.lock.mockResolvedValue(undefined);
  h.pending.mockResolvedValue(false);
  h.executeRaw.mockResolvedValue(0);
  h.applicationFind.mockResolvedValue(null);
  h.applicationCreate.mockResolvedValue({ id: 'application-1' });
  h.applicationUpdate.mockResolvedValue({ id: 'application-1' });
  h.enrollmentFind.mockResolvedValue({
    id: ENROLLMENT_ID, userId: USER_ID, programSlug: 'digital-literacy', isPrimary: false,
  });
  h.enrollmentUpdateMany.mockResolvedValue({ count: 1 });
  h.enrollmentUpdate.mockResolvedValue({ id: ENROLLMENT_ID });
  h.userUpdate.mockResolvedValue({ id: USER_ID });
});

describe('member onboarding and primary enrollment deletion boundary', () => {
  it('writes both onboarding copies inside one lifecycle-guarded transaction', async () => {
    const response = await saveApplication(applicationRequest());
    expect(response.status).toBe(200);
    expect(h.transaction).toHaveBeenCalledOnce();
    expect(h.lock).toHaveBeenCalledExactlyOnceWith(tx, USER_ID);
    expect(h.pending).toHaveBeenCalledExactlyOnceWith(tx, USER_ID);
    expect(h.applicationCreate).toHaveBeenCalledOnce();
    expect(h.userUpdate).toHaveBeenCalledOnce();
    expect(h.pending.mock.invocationCallOrder[0]).toBeLessThan(h.applicationCreate.mock.invocationCallOrder[0]);
    expect(h.applicationCreate.mock.invocationCallOrder[0]).toBeLessThan(h.userUpdate.mock.invocationCallOrder[0]);
  });

  it('refuses an onboarding save that waited behind erasure', async () => {
    let finishErasure: (() => void) | undefined;
    const erasure = new Promise<void>((resolve) => { finishErasure = resolve; });
    h.lock.mockImplementationOnce(async () => erasure);
    h.pending.mockResolvedValue(true);

    const response = saveApplication(applicationRequest());
    await vi.waitFor(() => expect(h.lock).toHaveBeenCalledOnce());
    finishErasure?.();
    expect((await response).status).toBe(409);
    expect(h.applicationFind).not.toHaveBeenCalled();
    expect(h.applicationCreate).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('demotes before promoting and updates the legacy pointer in the guarded transaction', async () => {
    const response = await setPrimary(primaryRequest(), primaryContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ changed: true, programSlug: 'digital-literacy' });
    expect(h.transaction).toHaveBeenCalledOnce();
    expect(h.lock).toHaveBeenCalledExactlyOnceWith(tx, USER_ID);
    expect(h.lock.mock.invocationCallOrder[0]).toBeLessThan(h.executeRaw.mock.invocationCallOrder[0]);
    expect(h.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(h.enrollmentFind.mock.invocationCallOrder[0]);
    expect(h.enrollmentUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(h.enrollmentUpdate.mock.invocationCallOrder[0]);
    expect(h.enrollmentUpdate.mock.invocationCallOrder[0]).toBeLessThan(h.userUpdate.mock.invocationCallOrder[0]);
  });

  it('refuses stale primary promotion after erasure without touching the assignment', async () => {
    h.pending.mockResolvedValue(true);
    const response = await setPrimary(primaryRequest(), primaryContext());
    expect(response.status).toBe(409);
    expect(h.enrollmentFind).not.toHaveBeenCalled();
    expect(h.enrollmentUpdateMany).not.toHaveBeenCalled();
    expect(h.enrollmentUpdate).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('does not expose or promote another member enrollment', async () => {
    h.enrollmentFind.mockResolvedValue({
      id: ENROLLMENT_ID, userId: 'someone-else', programSlug: 'digital-literacy', isPrimary: false,
    });
    const response = await setPrimary(primaryRequest(), primaryContext());
    expect(response.status).toBe(404);
    expect(h.enrollmentUpdateMany).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });
});
