import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ upsert: vi.fn(async () => undefined) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { emailSendLog: { upsert: mocks.upsert } } }));

import { buildEmailSendLogBase, prismaEmailSendLogStore } from '@/lib/email/sendLog';

describe('member email send-log storage', () => {
  it('omits a provider lookup key on insert and clears one on an existing row', async () => {
    const base = buildEmailSendLogBase({
      to: 'member@example.org', subject: 'Private reset', memberEffectClaim: true,
    }, Date.UTC(2026, 8, 27));

    await prismaEmailSendLogStore.record({ ...base, status: 'sent', providerMessageId: 'resend-private-id' });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ providerMessageId: null }),
      update: expect.objectContaining({ providerMessageId: null }),
    }));
  });
});
