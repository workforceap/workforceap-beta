// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  isFlagEnabledForUser: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/feature-flags/isFlagEnabledForUser', () => ({ isFlagEnabledForUser: mocks.isFlagEnabledForUser }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { canUseGameLab } from '@/lib/game-lab/access';

describe('canUseGameLab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(true);
    mocks.isFlagEnabledForUser.mockResolvedValue(true);
  });

  it('allows an admin with the admin_game_lab flag on', async () => {
    await expect(canUseGameLab('u1')).resolves.toBe(true);
    expect(mocks.isFlagEnabledForUser).toHaveBeenCalledWith('admin_game_lab', 'u1');
  });

  it('denies without a user id', async () => {
    await expect(canUseGameLab(null)).resolves.toBe(false);
    await expect(canUseGameLab(undefined)).resolves.toBe(false);
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });

  it('denies a non-admin even with the flag on, without reading the flag', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    await expect(canUseGameLab('u1')).resolves.toBe(false);
    expect(mocks.isFlagEnabledForUser).not.toHaveBeenCalled();
  });

  it('denies an admin when the flag is off or the row is missing', async () => {
    mocks.isFlagEnabledForUser.mockResolvedValue(false);
    await expect(canUseGameLab('u1')).resolves.toBe(false);
  });

  it('fails closed when the role check throws', async () => {
    mocks.isAdmin.mockRejectedValue(new Error('db down'));
    await expect(canUseGameLab('u1')).resolves.toBe(false);
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('fails closed when the flag lookup throws, logging no message text', async () => {
    mocks.isFlagEnabledForUser.mockRejectedValue(new Error('secret@example.test'));
    await expect(canUseGameLab('u1')).resolves.toBe(false);
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('secret@example.test');
  });
});
