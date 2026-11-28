/**
 * Fixed allowlist for the admin-only Game Lab (pre-release). Nothing here is
 * derived from a request: the asset route looks the requested path up in this
 * table and only then reads the matching file, so no filesystem path is ever
 * built from user input.
 *
 * The two original games share five fixed names plus one vendor file. The
 * Practice Arcade does not: its hub and shell import files by name
 * (`./games/<id>/game.mjs`, mechanics, worlds, its own three.js). Those paths
 * come from the generated table in `manifest.arcade.ts`, which lists the exact
 * files copied into `assets/game-lab/practice-arcade`. Regenerate it with
 * `node scripts/game-lab/generate-arcade-manifest.mjs` after changing that tree.
 */
import { ARCADE_FILES } from './manifest.arcade';

export const GAME_LAB_FLAG_KEY = 'admin_game_lab';

export const GAME_LAB_SAVE_KEYS = [
  'wap-practice-3d-save-v1',
  'wap-practice-3d-security-save-v1',
  'packet-quest-v1',
  'wap-practice-local-network-v1',
  'wap-arcade-v1:settings',
  'wap-arcade-v1:last',
] as const;

/** Arcade per-game saves are `wap-arcade-v1:<game-id>`. The prefix alone is enough for the reset button. */
export const GAME_LAB_ARCADE_SAVE_PREFIX = 'wap-arcade-v1:';

export type GameLabGameSlug = 'packet-quest-3d' | 'firewall-defender-3d' | 'packet-quest' | 'network-path' | 'practice-arcade';

export type GameLabGame = {
  slug: GameLabGameSlug;
  title: string;
  summary: string;
  /** Fixed storage key, or the arcade prefix (every key that starts with it belongs to this game). */
  saveKey: (typeof GAME_LAB_SAVE_KEYS)[number] | typeof GAME_LAB_ARCADE_SAVE_PREFIX;
};

export const GAME_LAB_GAMES: readonly GameLabGame[] = [
  {
    slug: 'packet-quest-3d',
    title: 'Packet Quest 3D',
    summary: 'Route a packet hop by hop through a small network: three stages, including a DNS side path and a boss.',
    saveKey: 'wap-practice-3d-save-v1',
  },
  {
    slug: 'firewall-defender-3d',
    title: 'Firewall Defender 3D',
    summary: 'Judge incoming traffic against a firewall policy: allow, block or reset across three stages and a boss.',
    saveKey: 'wap-practice-3d-security-save-v1',
  },
  {
    slug: 'packet-quest',
    title: 'Packet Quest (2D)',
    summary: 'The same routing lesson as a flat map: three stages, a DNS side path and a boss. Pre-release, not teaching-reviewed.',
    saveKey: 'packet-quest-v1',
  },
  {
    slug: 'network-path',
    title: 'Follow a request through the local network',
    summary: 'Build the name-lookup path and the page-request path for one fictional office ticket. Pre-release, not teaching-reviewed.',
    saveKey: 'wap-practice-local-network-v1',
  },
  {
    slug: 'practice-arcade',
    title: 'Practice Arcade',
    summary: 'One hub for the 20 program practice games, plus 7 demos labelled Demo. Pre-release, not teaching-reviewed.',
    saveKey: GAME_LAB_ARCADE_SAVE_PREFIX,
  },
];

const HTML = 'text/html; charset=utf-8';
const JS = 'text/javascript; charset=utf-8';
const CSS = 'text/css; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
const SVG = 'image/svg+xml';
const PNG = 'image/png';
const TEXT = 'text/plain; charset=utf-8';

export type GameLabAssetEntry = { file: string; contentType: string };

const FIXED_GAME_FILES: Record<string, string> = {
  'index.html': HTML,
  'game.mjs': JS,
  'rules.mjs': JS,
  'look.mjs': JS,
  'scene.mjs': JS,
};

/** Games that share the original five-file shape and the one shared vendor file. */
const FIXED_SHAPE_GAMES = ['packet-quest-3d', 'firewall-defender-3d'] as const;

const VENDOR_FILE = 'vendor/three.module.min.js';

const EXTENSION_TYPES: Record<string, string> = {
  '.html': HTML,
  '.mjs': JS,
  '.js': JS,
  '.css': CSS,
  '.json': JSON_TYPE,
  '.svg': SVG,
  '.png': PNG,
  '.txt': TEXT,
  '.md': TEXT,
};

/** Packet Quest 2D ships its page and rules module and nothing else. */
const PACKET_QUEST_2D_FILES = ['index.html', 'rules.mjs'] as const;

/** The network lesson ships its page, stylesheet and two classic scripts. */
const NETWORK_PATH_FILES = ['index.html', 'styles.css', 'lesson.js', 'app.js'] as const;

function contentTypeFor(relativePath: string): string | null {
  const dot = relativePath.lastIndexOf('.');
  if (dot < 0) return null;
  return EXTENSION_TYPES[relativePath.slice(dot).toLowerCase()] ?? null;
}

/**
 * Every asset the route can serve, keyed by `game + "/" + asset path`.
 * Built once from the fixed lists and the generated arcade table. A request
 * is served only when it matches a key here exactly.
 */
const ASSET_TABLE: ReadonlyMap<string, GameLabAssetEntry> = (() => {
  const table = new Map<string, GameLabAssetEntry>();
  const add = (game: string, assetPath: string, file: string, contentType: string) => {
    table.set(`${game}/${assetPath}`, { file, contentType });
  };
  for (const game of FIXED_SHAPE_GAMES) {
    for (const [name, type] of Object.entries(FIXED_GAME_FILES)) add(game, name, `assets/game-lab/${game}/${name}`, type);
    add(game, VENDOR_FILE, 'assets/game-lab/vendor/three.module.min.js', JS);
  }
  for (const name of PACKET_QUEST_2D_FILES) add('packet-quest', name, `assets/game-lab/packet-quest/${name}`, contentTypeFor(name)!);
  for (const name of NETWORK_PATH_FILES) add('network-path', name, `assets/game-lab/network-path/${name}`, contentTypeFor(name)!);
  for (const relative of ARCADE_FILES) {
    const type = contentTypeFor(relative);
    if (!type) throw new Error(`practice-arcade file has no servable type: ${relative}`);
    add('practice-arcade', relative, `assets/game-lab/practice-arcade/${relative}`, type);
  }
  return table;
})();

/** Every asset path the route serves, across every game (input to tracing tests). */
export const GAME_LAB_SERVED_FILES: readonly string[] = [...ASSET_TABLE.values()].map((entry) => entry.file);

/** Asset paths the original five-file games serve. Kept for callers that probe one game's shape. */
export const GAME_LAB_ASSET_PATHS: readonly string[] = [...Object.keys(FIXED_GAME_FILES), VENDOR_FILE];

export function getGameLabGame(slug: string): GameLabGame | undefined {
  return GAME_LAB_GAMES.find((game) => game.slug === slug);
}

const REJECTED_SEGMENT = /\\|\.\.|%|\/\/|[\u0000-\u001f]/;

/**
 * Resolves (game, asset path) to a repo-relative file and MIME type, or null.
 * Exact, case-sensitive matches against the built table only: the request is
 * never joined onto a directory.
 */
export function resolveGameLabAsset(game: string, assetSegments: readonly string[]): GameLabAssetEntry | null {
  if (!getGameLabGame(game)) return null;
  if (assetSegments.some((segment) => segment === '' || REJECTED_SEGMENT.test(segment))) return null;
  return ASSET_TABLE.get(`${game}/${assetSegments.join('/')}`) ?? null;
}
