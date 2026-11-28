import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installNativeDialogStub } from '@/tests/helpers/nativeDialogStub';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  canUseGameLab: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error('not-found');
  },
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/game-lab/access', () => ({ canUseGameLab: mocks.canUseGameLab }));

import GameLabPage from '@/app/admin/game-lab/page';
import GameLabPlayPage from '@/app/admin/game-lab/[game]/page';
import { FLAG_GATED_PATHS } from '@/scripts/lib/portal-audit-paths.mjs';

installNativeDialogStub();

const play = (game: string) => GameLabPlayPage({ params: Promise.resolve({ game }) });

describe('Game Lab pages (flag-gated: not found while admin_game_lab is off)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'admin-1' });
    mocks.canUseGameLab.mockResolvedValue(true);
  });

  it('are the routes the audit inventory classifies as flag-gated, naming this file', () => {
    expect(FLAG_GATED_PATHS.admin.map((entry: { path: string }) => entry.path)).toEqual(['/admin/game-lab', '/admin/game-lab/[game]']);
    for (const entry of FLAG_GATED_PATHS.admin) expect(entry.coveredBy).toBe('tests/game-lab/game-lab-pages.spec.tsx');
  });

  it('send an anonymous visitor to login before evaluating the gate', async () => {
    mocks.getUser.mockResolvedValue(null);
    await expect(GameLabPage()).rejects.toThrow('redirect:/login?redirectTo=/admin/game-lab');
    await expect(play('packet-quest-3d')).rejects.toThrow('redirect:/login?redirectTo=%2Fadmin%2Fgame-lab%2Fpacket-quest-3d');
    expect(mocks.canUseGameLab).not.toHaveBeenCalled();
  });

  it('answer not found when the gate denies (non-admin, flag off, or lookup failure)', async () => {
    mocks.canUseGameLab.mockResolvedValue(false);
    await expect(GameLabPage()).rejects.toThrow('not-found');
    await expect(play('packet-quest-3d')).rejects.toThrow('not-found');
    await expect(play('firewall-defender-3d')).rejects.toThrow('not-found');
    expect(mocks.canUseGameLab).toHaveBeenCalledWith('admin-1');
  });

  it('answer not found for an unknown game even when allowed', async () => {
    await expect(play('not-a-game')).rejects.toThrow('not-found');
  });

  it('render the launcher with both games when allowed', async () => {
    render(await GameLabPage());
    expect(screen.getByTestId('game-lab-prerelease-badge')).toBeTruthy();
    expect(screen.getByTestId('game-card-packet-quest-3d')).toBeTruthy();
    expect(screen.getByTestId('game-card-firewall-defender-3d').textContent).toContain('three stages and a boss');
    expect(screen.getByTestId('game-card-packet-quest').textContent).toContain('Pre-release');
    expect(screen.getByTestId('game-card-network-path')).toBeTruthy();
    expect(screen.getByTestId('game-card-practice-arcade').textContent).toContain('20 program');
  });

  it('load nothing until Launch, then mount the frame in a modal and unmount it on Exit', async () => {
    render(await play('firewall-defender-3d'));
    expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByTestId('game-lab-launch'));
    const frame = screen.getByTestId('game-lab-frame');
    expect(frame.getAttribute('src')).toBe('/api/admin/game-lab/firewall-defender-3d/index.html');
    expect(frame.closest('dialog')?.hasAttribute('open')).toBe(true);
    fireEvent.click(screen.getByTestId('game-lab-exit'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith('/admin/game-lab');
  });
});
