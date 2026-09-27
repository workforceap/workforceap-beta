import { describe, expect, it, vi } from 'vitest';

const auditLog = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/audit', () => ({ auditLog: (...args: unknown[]) => auditLog(...args) }));

import { anonymizeMember } from '@/lib/member/anonymizeMember';
import { buildErasedEmail } from '@/lib/member/deletedEmail';

describe('admin erasure tombstone', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const now = new Date('2026-09-26T01:00:00Z');

  it.each([
    { email: 'private@example.com', deletedAt: null },
    { email: `deleted_${id}_1717080000000_private@example.com@deleted.invalid`, deletedAt: new Date('2026-09-01T00:00:00Z') },
  ])('drops recoverable email from $email before retiring Auth', async (existing) => {
    const update = vi.fn(async (args: { data: { email: string } }) => args);
    const tx = {
      user: { findUnique: vi.fn(async () => existing), update },
      profile: { updateMany: vi.fn(async () => ({ count: 1 })) },
      pushSubscription: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      emailSendLog: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    };
    const db = { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) };

    await anonymizeMember(id, { reason: 'admin_erase', now, actorUserId: 'admin-id' }, db as never);

    const data = update.mock.calls[0]?.[0]?.data;
    expect(data.email).toBe(buildErasedEmail(id, (existing.deletedAt ?? now).getTime()));
    expect(JSON.stringify(data)).not.toContain('private@example.com');
    expect(tx.emailSendLog.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: id }, { entityId: id }] },
    });
    expect(auditLog).toHaveBeenCalled();
  });
});
