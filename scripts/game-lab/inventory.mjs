// Verifier inputs, never request-driven. Load the same TypeScript manifest the route uses.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { require as load } from 'tsx/cjs/api';
import programs from '../../assets/game-lab/practice-arcade/games/registry.mjs';

const { GAME_LAB_GAMES, GAME_LAB_SERVED_FILES, GAME_LAB_ASSET_PATHS, resolveGameLabAsset } = load('../../lib/game-lab/manifest.ts', import.meta.url);
const ROOT = new URL('../../assets/game-lab/', import.meta.url);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const GAME_SLUGS = GAME_LAB_GAMES.map(({ slug }) => slug);
const releaseCounts = { 'packet-quest': 2, 'network-path': 4, 'practice-arcade': 81 };

// Sorting without deduplicating catches equal totals with a missing and a repeated row.
export function exactCoverage(label, expected, observed) {
  assert.equal(new Set(expected).size, expected.length, `${label}: duplicate expected key`);
  assert.deepEqual([...observed].sort(), [...expected].sort(), `${label}: incomplete, unexpected or duplicate keys`);
}

exactCoverage('reviewed launcher entries', ['packet-quest-3d', 'firewall-defender-3d', ...Object.keys(releaseCounts)], GAME_SLUGS);

function inventoryFiles(dir) {
  return readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? inventoryFiles(`${dir}${e.name}/`) : [`${dir}${e.name}`]);
}

export const assets = GAME_SLUGS.flatMap((slug) => {
  const prefix = `assets/game-lab/${slug}/`;
  // The originals serve one shared vendor file under two distinct URLs.
  const relative = slug.endsWith('-3d') ? GAME_LAB_ASSET_PATHS : GAME_LAB_SERVED_FILES.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length));
  if (slug in releaseCounts) {
    assert.equal(relative.length, releaseCounts[slug], `${slug}: reviewed release asset count`);
    exactCoverage(`${slug}: copied files vs allowlist`, inventoryFiles(`${slug}/`), relative.map((p) => `${slug}/${p}`));
  }
  return relative.map((p) => {
    const { file, contentType } = resolveGameLabAsset(slug, p.split('/'));
    const bytes = readFileSync(new URL(`../../${file}`, import.meta.url));
    assert.ok(bytes.length, `${file}: empty asset`);
    return { name: `${slug}/${p}`, path: `/api/admin/game-lab/${slug}/${p}`, file, kind: 'asset', type: contentType, bytes: bytes.length, sha256: sha256(bytes) };
  });
});
assert.deepEqual(assets.map((a) => a.file).sort(), [...GAME_LAB_SERVED_FILES].sort(), 'matrix files must match the entire route manifest, including shared-file multiplicity');
const modules = assets.flatMap(({ name }) => name.match(/^practice-arcade\/games\/([a-z0-9-]+)\/game\.mjs$/)?.slice(1) ?? []);
const lessonMap = JSON.parse(readFileSync(new URL('practice-arcade/data/lesson-map.json', ROOT), 'utf8'));
export const arcadeIds = lessonMap.games.map((g) => g.programSlug);
exactCoverage('lesson map vs served game modules', arcadeIds, modules);
export const programIds = programs.map(({ id }) => id);
export const demoIds = arcadeIds.filter((id) => !programIds.includes(id));
assert.equal(programIds.length, 20);
assert.equal(demoIds.length, 7);
exactCoverage('arcade game modules', arcadeIds, [...programIds, ...demoIds]);
export const winIds = ['packet-quest', 'network-path', ...arcadeIds];
