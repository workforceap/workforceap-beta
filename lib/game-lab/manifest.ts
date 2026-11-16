/**
 * Fixed allowlist for the admin-only Game Lab (pre-release). Nothing here is
 * derived from a request: the asset route looks the requested path up in this
 * table and only then reads the matching file, so no filesystem path is ever
 * built from user input.
 */
export const GAME_LAB_FLAG_KEY = 'admin_game_lab';

export const GAME_LAB_SAVE_KEYS = ['wap-practice-3d-save-v1', 'wap-practice-3d-security-save-v1'] as const;

export type GameLabGameSlug = 'packet-quest-3d' | 'firewall-defender-3d';

export type GameLabGame = {
  slug: GameLabGameSlug;
  title: string;
  summary: string;
  saveKey: (typeof GAME_LAB_SAVE_KEYS)[number];
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
    summary: 'Write firewall rules to let good traffic in and keep bad traffic out across three escalating stages.',
    saveKey: 'wap-practice-3d-security-save-v1',
  },
];

const HTML = 'text/html; charset=utf-8';
const JS = 'text/javascript; charset=utf-8';

export type GameLabAssetEntry = { file: string; contentType: string };

const GAME_FILES: Record<string, string> = {
  'index.html': HTML,
  'game.mjs': JS,
  'rules.mjs': JS,
  'look.mjs': JS,
  'scene.mjs': JS,
};

const VENDOR_FILE = 'vendor/three.module.min.js';

export function getGameLabGame(slug: string): GameLabGame | undefined {
  return GAME_LAB_GAMES.find((game) => game.slug === slug);
}

/**
 * Resolves (game, asset path) to a repo-relative file and MIME type, or null.
 * Exact, case-sensitive matches only.
 */
export function resolveGameLabAsset(game: string, assetSegments: readonly string[]): GameLabAssetEntry | null {
  if (!getGameLabGame(game)) return null;
  const assetPath = assetSegments.join('/');
  if (Object.prototype.hasOwnProperty.call(GAME_FILES, assetPath)) {
    return { file: `assets/game-lab/${game}/${assetPath}`, contentType: GAME_FILES[assetPath] };
  }
  if (assetPath === VENDOR_FILE) {
    return { file: 'assets/game-lab/vendor/three.module.min.js', contentType: JS };
  }
  return null;
}
