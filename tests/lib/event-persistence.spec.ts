import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
vi.mock('@/lib/db/prisma', () => ({ prisma: { memberEvent: { create: vi.fn() } } }));
vi.mock('@/lib/observability/requestId', () => ({ getRequestId: () => 'request-1' }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn() } }));
import { prisma } from '@/lib/db/prisma';
import { persistEvent, trackEvent, type TrackEventParams } from '@/lib/events/track';
import { logger } from '@/lib/observability/logger';

beforeEach(() => { vi.clearAllMocks(); });
describe('event persistence contracts', () => {
  it('writes on the supplied transaction client and preserves event evidence', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'event' });
    const tx = { memberEvent: { create } } as unknown as Prisma.TransactionClient;
    await persistEvent({ userId: 'member', eventName: 'course_completed', entityId: 'course', metadata: { completedCount: 2 } }, tx);
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'member', eventName: 'course_completed', entityId: 'course', requestId: 'request-1', metadata: { completedCount: 2 } }) });
    expect(prisma.memberEvent.create).not.toHaveBeenCalled();
  });
  it('propagates transaction event failure so a caller cannot silently commit without evidence', async () => {
    const failure = new Error('storage unavailable');
    const tx = { memberEvent: { create: vi.fn().mockRejectedValue(failure) } } as unknown as Prisma.TransactionClient;
    await expect(persistEvent({ userId: 'member', eventName: 'program_completed' }, tx)).rejects.toBe(failure);
    expect(prisma.memberEvent.create).not.toHaveBeenCalled();
  });
  it('retains the nonthrowing contract for best-effort analytics', async () => {
    vi.mocked(prisma.memberEvent.create).mockRejectedValue(new Error('storage unavailable'));
    await expect(trackEvent({ userId: 'member', eventName: 'ai_tool_opened' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
  it('rejects unknown event names at runtime before touching storage', async () => {
    const create = vi.fn();
    const tx = { memberEvent: { create } } as unknown as Prisma.TransactionClient;
    await expect(persistEvent({ userId: 'member', eventName: 'made_up' } as unknown as TrackEventParams, tx)).rejects.toThrow('Unknown member event');
    expect(create).not.toHaveBeenCalled();
  });
});
