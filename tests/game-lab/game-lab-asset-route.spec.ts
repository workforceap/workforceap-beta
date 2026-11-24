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
import { GAME_LAB_GAMES, resolveGameLabAsset } from '@/lib/game-lab/manifest';

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
      const entries: [string[], string][] = [
        [['index.html'], 'text/html; charset=utf-8'],
        [['game.mjs'], 'text/javascript; charset=utf-8'],
        [['rules.mjs'], 'text/javascript; charset=utf-8'],
        [['look.mjs'], 'text/javascript; charset=utf-8'],
        [['scene.mjs'], 'text/javascript; charset=utf-8'],
        [['vendor', 'three.module.min.js'], 'text/javascript; charset=utf-8'],
      ];
      for (const [asset, type] of entries) {
        const res = await call(game.slug, asset);
        expect(res.status, asset.join('/')).toBe(200);
        expect(res.headers.get('content-type')).toBe(type);
        expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
        expect(res.headers.get('vary')).toBe('Cookie');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
      }
    });
  }

  it('serves the shared vendored three.js blob for both games', async () => {
    const disk = readFileSync(join(process.cwd(), 'assets/game-lab/vendor/three.module.min.js'));
    for (const game of GAME_LAB_GAMES) {
      const res = await call(game.slug, ['vendor', 'three.module.min.js']);
      expect(Buffer.from(await res.arrayBuffer()).equals(disk)).toBe(true);
    }
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
      ['packet-quest-3d', ['vendor', 'THREE-LICENSE.txt']],
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
  });
});
