// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  canUseGameLab: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser, resolveAuthGucContext: vi.fn() }));
vi.mock('@/lib/game-lab/access', () => ({ canUseGameLab: mocks.canUseGameLab }));
// Pass-through: the guard only sets request context, which this spec does not exercise.
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));

import { GET } from '@/app/api/admin/game-lab/[game]/[...asset]/route';
import { GAME_LAB_GAMES, GAME_LAB_SERVED_FILES, resolveGameLabAsset } from '@/lib/game-lab/manifest';

function call(game: string, asset: string[]): Promise<Response> {
  return (GET as unknown as (r: Request, c: { params: Promise<{ game: string; asset: string[] }> }) => Promise<Response>)(
    new Request(`http://localhost/api/admin/game-lab/${game}/${asset.join('/')}`),
    { params: Promise.resolve({ game, asset }) },
  );
}

describe('Game Lab asset route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'admin-1' });
    mocks.canUseGameLab.mockResolvedValue(true);
  });

  it('returns 401 with no session and never evaluates the gate', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await call('packet-quest-3d', ['index.html']);
    expect(res.status).toBe(401);
    expect(mocks.canUseGameLab).not.toHaveBeenCalled();
  });

  it('returns 404 (not 403) when the gate denies, so the surface is not revealed', async () => {
    mocks.canUseGameLab.mockResolvedValue(false);
    const res = await call('packet-quest-3d', ['index.html']);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('<html');
  });

  for (const game of GAME_LAB_GAMES) {
    it(`serves every ${game.slug} manifest entry with explicit MIME and private no-store`, async () => {
      const files = GAME_LAB_SERVED_FILES.filter((file) => file.startsWith(`assets/game-lab/${game.slug}/`) || (game.slug.endsWith('-3d') && file === 'assets/game-lab/vendor/three.module.min.js'));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const asset = file.replace(`assets/game-lab/${game.slug}/`, '').replace('assets/game-lab/', '').split('/');
        const res = await call(game.slug, asset);
        expect(res.status, file).toBe(200);
        const expected = resolveGameLabAsset(game.slug, asset);
        expect(res.headers.get('content-type')).toBe(expected?.contentType ?? null);
        expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
        expect(res.headers.get('vary')).toBe('Cookie');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
      }
    });
  }

  it('serves the shared vendored three.js blob for the two original 3D games only', async () => {
    const disk = readFileSync(join(process.cwd(), 'assets/game-lab/vendor/three.module.min.js'));
    for (const game of ['packet-quest-3d', 'firewall-defender-3d']) {
      const res = await call(game, ['vendor', 'three.module.min.js']);
      expect(Buffer.from(await res.arrayBuffer()).equals(disk)).toBe(true);
    }
    // The arcade vendors its own copy under kit/vendor and must not reach the shared one.
    expect((await call('practice-arcade', ['vendor', 'three.module.min.js'])).status).toBe(404);
    expect((await call('packet-quest', ['vendor', 'three.module.min.js'])).status).toBe(404);
  });

  it('returns 404 for unknown games, unknown assets, tests, readmes and case variants', async () => {
    const cases: [string, string[]][] = [
      ['nope', ['index.html']],
      ['packet-quest-3d', ['missing.mjs']],
      ['packet-quest-3d', ['rules.test.mjs']],
      ['packet-quest-3d', ['README.md']],
      ['packet-quest-3d', ['browser-check.mjs']],
      ['packet-quest-3d', ['INDEX.HTML']],
      ['Packet-Quest-3D', ['index.html']],
      ['packet-quest', ['game.mjs']],
      ['network-path', ['rules.mjs']],
      ['practice-arcade', ['tools', 'serve.mjs']],
      ['practice-arcade', ['kit', 'mechanics', 'gate.test.mjs']],
      ['practice-arcade', ['kit', 'AUTHORING.md']],
      ['packet-quest-3d', ['vendor', 'three.module.min.js', 'x']],
    ];
    for (const [game, asset] of cases) {
      const res = await call(game, asset);
      expect(res.status, `${game}/${asset.join('/')}`).toBe(404);
    }
  });

  it('returns 404 for traversal, encoded, backslash and absolute segments', async () => {
    const attempts: string[][] = [
      ['..', '..', 'package.json'],
      ['..', 'firewall-defender-3d', 'game.mjs'],
      ['%2e%2e', 'package.json'],
      ['..%2fpackage.json'],
      ['..\package.json'],
      ['vendor', '..', 'index.html'],
      ['.', 'index.html'],
      ['/etc/passwd'],
      ['C:\Windows\win.ini'],
      ['index.html\u0000.png'],
      ['games', '..', 'registry.mjs'],
      ['kit', 'vendor', '..', '..', 'hub.mjs'],
    ];
    for (const asset of attempts) {
      const res = await call('packet-quest-3d', asset);
      expect(res.status, asset.join('/')).toBe(404);
    }
  });

  it('never builds a path from the request: resolver output is a fixed manifest file', () => {
    expect(resolveGameLabAsset('packet-quest-3d', ['index.html'])).toEqual({
      file: 'assets/game-lab/packet-quest-3d/index.html',
      contentType: 'text/html; charset=utf-8',
    });
    expect(resolveGameLabAsset('packet-quest-3d', ['constructor'])).toBeNull();
    expect(resolveGameLabAsset('packet-quest-3d', ['__proto__'])).toBeNull();
    expect(resolveGameLabAsset('practice-arcade', ['games', 'demo-sort', 'game.mjs'])?.file).toBe('assets/game-lab/practice-arcade/games/demo-sort/game.mjs');
    expect(resolveGameLabAsset('practice-arcade', ['games', 'not-a-game', 'game.mjs'])).toBeNull();
    expect(resolveGameLabAsset('practice-arcade', ['..', 'packet-quest', 'rules.mjs'])).toBeNull();
    expect(resolveGameLabAsset('practice-arcade', ['games\\demo-sort\\game.mjs'])).toBeNull();
  });
});
