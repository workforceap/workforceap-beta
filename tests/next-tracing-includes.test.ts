// @vitest-environment node
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import { GAME_LAB_ASSET_PATHS, GAME_LAB_GAMES, resolveGameLabAsset } from '../lib/game-lab/manifest';
import { listAppEntryNames, tracedIncludeFiles, tracingKeyMatchesEntry } from '../scripts/lib/next-tracing-includes.mjs';

// Behavior under test: which files `next build` puts in each route's serverless
// bundle. The helper applies Next's own matcher, exactly as collect-build-traces does.
const root = process.cwd();
const includes = nextConfig.outputFileTracingIncludes ?? {};
const GAME_LAB_ASSET_ENTRY = 'app/api/admin/game-lab/[game]/[...asset]/route';

describe('outputFileTracingIncludes', () => {
  const entries = listAppEntryNames(root);

  it('finds the Game Lab asset route among the app entries', () => {
    expect(entries).toContain(GAME_LAB_ASSET_ENTRY);
  });

  it.each(Object.keys(includes))('key %s matches at least one app route', (key) => {
    expect(entries.some((entry) => tracingKeyMatchesEntry(key, entry))).toBe(true);
  });

  it('treats bracketed dynamic segments in a key as a glob class, not literal text', () => {
    // The original Game Lab key. It never matched, so production shipped without the game files.
    expect(tracingKeyMatchesEntry('/api/admin/game-lab/[game]/[...asset]', GAME_LAB_ASSET_ENTRY)).toBe(false);
  });

  it('bundles every file the Game Lab asset route can serve', async () => {
    const traced = await tracedIncludeFiles(includes, GAME_LAB_ASSET_ENTRY, root);
    const served = GAME_LAB_GAMES.flatMap((game) =>
      GAME_LAB_ASSET_PATHS.map((asset) => resolveGameLabAsset(game.slug, asset.split('/'))?.file),
    );
    expect(served.length).toBeGreaterThan(0);
    for (const file of served) {
      expect(file).toBeTypeOf('string');
      expect(traced.has(file as string)).toBe(true);
    }
  });
});
