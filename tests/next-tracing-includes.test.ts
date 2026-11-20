// @vitest-environment node
import { readdirSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import { GAME_LAB_ASSET_PATHS, GAME_LAB_GAMES, resolveGameLabAsset } from '../lib/game-lab/manifest';

// Use Next's own matcher, exactly as `next build` applies outputFileTracingIncludes
// (next/dist/build/collect-build-traces.js): the key is a picomatch glob tested
// with { dot, contains } against normalizeAppPath(entryName).
const require = createRequire(import.meta.url);
const picomatch = require('next/dist/compiled/picomatch') as (
  glob: string,
  options: { dot: boolean; contains: boolean },
) => (input: string) => boolean;
const { normalizeAppPath } = require('next/dist/shared/lib/router/utils/app-paths') as {
  normalizeAppPath: (route: string) => string;
};

const root = process.cwd();
const includes = nextConfig.outputFileTracingIncludes ?? {};

function keyMatches(key: string, entryName: string): boolean {
  return picomatch(key, { dot: true, contains: true })(normalizeAppPath(entryName));
}

/** App Router server entries, named the way the build trace step names them. */
function appEntryNames(dir = path.join(root, 'app')): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...appEntryNames(full));
    } else if (/^(route|page)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const rel = path.relative(root, full).split(path.sep).join('/');
      out.push(rel.replace(/\.(ts|tsx|js|jsx)$/, ''));
    }
  }
  return out;
}

async function tracedFilesFor(entryName: string): Promise<Set<string>> {
  const files = new Set<string>();
  for (const [key, patterns] of Object.entries(includes)) {
    if (!keyMatches(key, entryName)) continue;
    for (const pattern of patterns) {
      for await (const file of glob(pattern, { cwd: root })) files.add(file.split(path.sep).join('/'));
    }
  }
  return files;
}

const GAME_LAB_ASSET_ENTRY = 'app/api/admin/game-lab/[game]/[...asset]/route';

describe('outputFileTracingIncludes', () => {
  const entries = appEntryNames();

  it('finds the Game Lab asset route among the app entries', () => {
    expect(entries).toContain(GAME_LAB_ASSET_ENTRY);
  });

  it.each(Object.keys(includes))('key %s matches at least one app route', (key) => {
    expect(entries.some((entry) => keyMatches(key, entry))).toBe(true);
  });

  it('treats bracketed dynamic segments in a key as a glob class, not literal text', () => {
    // The original Game Lab key. It never matched, so production shipped without the game files.
    expect(keyMatches('/api/admin/game-lab/[game]/[...asset]', GAME_LAB_ASSET_ENTRY)).toBe(false);
  });

  it('bundles every file the Game Lab asset route can serve', async () => {
    const traced = await tracedFilesFor(GAME_LAB_ASSET_ENTRY);
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
