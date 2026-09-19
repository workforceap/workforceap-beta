import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), provision: vi.fn(), read: vi.fn(), update: vi.fn(), notify: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/member/ensureAppUser', () => ({ ensureAppUserProvisioned: mocks.provision }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: (callback: (tx: unknown) => unknown) => callback({ user: { findUnique: mocks.read, updateMany: mocks.update } }) } }));
vi.mock('@/lib/wioa/wioaNotification', () => ({ sendWioaScreeningNotification: mocks.notify }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.audit }));
import { GET, POST } from '@/app/api/member/wioa-qualification/route';

const answers = { ageBracket: '25_54', countyOrZip: ' 78701 ', primaryBarrier: 'transportation', dislocatedWorker: false, lowIncomeSelfReport: false, trainingInterest: true, completedIntakeSelfReport: false, publicAssistanceSelfReport: true };
const legacy = { version: 1, submittedAt: '2026-09-01T12:00:00Z', answers, signal: 'possible', reasons: ['Original historical note'], eligibilityForm: { employmentStatus: 'unemployed', submittedAt: '2026-09-02T12:00:00Z' } };
const request = (body: unknown) => new Request('https://example.test/api/member/wioa-qualification', { method: 'POST', body: JSON.stringify(body) });

describe('member WIOA versioned save boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'member-1' });
    mocks.provision.mockResolvedValue(undefined);
    mocks.read.mockResolvedValue({ email: 'member@example.test', fullName: 'Test Member', wioaQualificationJson: legacy });
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.notify.mockResolvedValue(true);
    mocks.audit.mockResolvedValue(undefined);
  });

  it('writes stable reasons, retains only server metadata and notifies after the conditional write', async () => {
    const response = await POST(request({ ...answers, eligibilityForm: { attacker: true }, injected: 'not persisted' }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.snapshot.version).toBe(2);
    expect(body.snapshot.signal).toBe('likely');
    expect(body.snapshot.reasons).toEqual([{ code: 'public_assistance' }, { code: 'barrier', params: { barrier: 'transportation' } }, { code: 'training_interest' }]);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'member-1', wioaQualificationJson: { equals: legacy } },
      data: { wioaQualificationJson: { ...body.snapshot, eligibilityForm: legacy.eligibilityForm }, wioaReviewStatus: 'pending', wioaReviewedAt: null, wioaReviewedByUserId: null, wioaReviewNotes: null },
    });
    expect(mocks.notify.mock.calls[0][0].snapshot).toEqual(body.snapshot);
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]);
    expect(body.snapshot).not.toHaveProperty('eligibilityForm');
    expect(body.snapshot.answers.countyOrZip).toBe('78701');
  });

  it('fails a competing JSON update without notifying or reporting a saved screening', async () => {
    // Models PostgreSQL UPDATE ... WHERE json = previous after another writer commits.
    mocks.update.mockResolvedValue({ count: 0 });
    const response = await POST(request(answers));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ errorCode: 'conflict' });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('uses a null-safe condition for a first screening and reports delivery failure honestly', async () => {
    mocks.read.mockResolvedValue({ email: 'member@example.test', fullName: 'Test Member', wioaQualificationJson: null });
    mocks.notify.mockResolvedValue(false);
    const response = await POST(request(answers));
    expect(response.status).toBe(200);
    expect((await response.json()).emailSent).toBe(false);
    expect(mocks.update.mock.calls[0][0].where.wioaQualificationJson.equals).toBe(Prisma.AnyNull);
  });

  it('returns legacy GET history without translating or rewriting it', async () => {
    expect(await (await GET(new Request('https://example.test/api/member/wioa-qualification'))).json()).toEqual({ snapshot: legacy });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns machine-readable errors before writes for unauthenticated or invalid answers', async () => {
    mocks.getUser.mockResolvedValueOnce(null);
    expect(await (await POST(request(answers))).json()).toMatchObject({ errorCode: 'unauthorized' });
    expect(await (await POST(request({}))).json()).toMatchObject({ errorCode: 'invalid_answers' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
