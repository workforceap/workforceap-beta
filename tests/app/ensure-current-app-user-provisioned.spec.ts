// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
} }));

import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { ensureCurrentAppUserProvisioned } from '@/lib/member/ensureCurrentAppUserProvisioned';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'auth-only-user', email: 'fixture@example.invalid' } as never);
  vi.mocked(headers).mockResolvedValue(new Headers({
    'x-workforceap-read-only-audit': '1',
  }) as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
});

it('keeps Auth-only read-only audits free of provisioning writes', async () => {
  await ensureCurrentAppUserProvisioned('auth-only-user');

  expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'auth-only-user' },
  }));
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('rejects a mismatched authenticated identity before app database access', async () => {
  await expect(ensureCurrentAppUserProvisioned('other-user')).rejects.toThrow(
    'Authenticated user changed during application provisioning',
  );
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});
