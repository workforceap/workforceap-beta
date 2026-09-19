// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/db/prisma', () => {
  const tx = { memberNextBestAction: { findFirst: vi.fn(), update: vi.fn() }, memberEvent: { create: vi.fn() } };
  return { prisma: { ...tx, $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) } };
});
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { captureApiError } from '@/lib/observability/captureApiError';
import { PATCH } from '@/app/api/member/nba/[id]/route';

const request = (status?: string) => new Request('https://example.test/api/member/nba/action-1', {
  method: 'PATCH', ...(status ? { body: JSON.stringify({ status }) } : {}),
});
const context = () => ({ params: Promise.resolve({ id: 'action-1' }) });
describe('NBA mutation outcomes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(prisma.memberNextBestAction.findFirst).mockResolvedValue({ id: 'action-1' } as never);
    vi.mocked(prisma.memberNextBestAction.update).mockResolvedValue({ id: 'action-1' } as never);
    vi.mocked(prisma.memberEvent.create).mockResolvedValue({} as never);
    vi.mocked(auditLog).mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['COMPLETED', 'DISMISSED'])('reports failed %s persistence with no success event/audit', async (status) => {
    vi.mocked(prisma.memberNextBestAction.update).mockRejectedValueOnce(Object.assign(new Error('pool unavailable'), { code: 'P2024' }));
    const response = await PATCH(request(status), context());
    expect(response.status).toBe(500);
    expect(prisma.memberEvent.create).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(captureApiError).toHaveBeenCalledOnce();
  });

  it('retains the owner predicate and audits only a completed write', async () => {
    const response = await PATCH(request('COMPLETED'), context());
    expect(response.status).toBe(200);
    expect(prisma.memberNextBestAction.update).toHaveBeenCalledWith({
      where: { id: 'action-1', memberId: 'member-1' }, data: { status: 'COMPLETED' },
    });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.nba.complete' }));
  });

  it('does not expose or audit a missing/foreign completion row', async () => {
    vi.mocked(prisma.memberNextBestAction.findFirst).mockResolvedValueOnce(null);
    expect((await PATCH(request('COMPLETED'), context())).status).toBe(200);
    expect(prisma.memberNextBestAction.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('treats P2025 as the benign missing/foreign dismissal case', async () => {
    vi.mocked(prisma.memberNextBestAction.update).mockRejectedValueOnce({ code: 'P2025' });
    expect((await PATCH(request(), context())).status).toBe(200);
    expect(auditLog).not.toHaveBeenCalled();
    expect(captureApiError).not.toHaveBeenCalled();
  });

  it('does not undo durable completion when best-effort analytics fails', async () => {
    vi.mocked(prisma.memberEvent.create).mockRejectedValueOnce(new Error('event storage unavailable'));
    expect((await PATCH(request('COMPLETED'), context())).status).toBe(200);
    expect(auditLog).toHaveBeenCalledOnce();
  });

  it('denies anonymous requests without writes', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null);
    expect((await PATCH(request(), context())).status).toBe(401);
    expect(prisma.memberNextBestAction.update).not.toHaveBeenCalled();
  });
});
