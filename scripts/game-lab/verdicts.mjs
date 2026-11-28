// Pure pass/fail rules for the Game Lab local-preview verification (scripts/game-lab/verify-preview.mjs).
// tests/game-lab/verdicts.test.mjs proves that a wrong status, a content leak,
// an external request, a console error, a DB write or a missing/non-empty mail sink cannot PASS.

import { assets, GAME_SLUGS } from './inventory.mjs';

export const MATRIX_TARGETS = [
  { name: 'launcher', path: '/admin/game-lab', kind: 'page' },
  ...GAME_SLUGS.map((slug) => ({ name: `play ${slug}`, path: `/admin/game-lab/${slug}`, kind: 'page' })),
  { name: 'unknown game page', path: '/admin/game-lab/not-a-game', kind: 'unknown-page' },
  ...assets,
  { name: 'unknown asset', path: '/api/admin/game-lab/packet-quest-3d/nope.mjs', kind: 'deny-asset' },
  { name: 'README not served', path: '/api/admin/game-lab/packet-quest-3d/README.md', kind: 'deny-asset' },
  { name: 'unknown game asset', path: '/api/admin/game-lab/not-a-game/index.html', kind: 'deny-asset' },
  { name: 'encoded traversal', path: '/api/admin/game-lab/packet-quest-3d/..%2f..%2fpackage.json', kind: 'deny-asset' },
  { name: 'raw traversal', path: '/api/admin/game-lab/packet-quest-3d/../../../package.json', kind: 'deny-any' },
];

/**
 * Markers that only appear in Game Lab output: launcher/play test ids, the game documents'
 * own markup and module source, and the vendored engine. Used to detect content leaks.
 */
const GAME_CONTENT = [
  /data-testid="game-lab-(launch|prerelease-badge|disclaimer|reset)"/,
  /data-testid="game-card-/,
  /id="pauseScreen"/,
  /id="stageList"/,
  /window\.__(pq|fd)\b/,
  /from '\.\/(rules|scene|look)\.mjs'/,
  /WebGLRenderer/,
  /export const STAGES\b/,
  /data-game-lab-prerelease/,
  /PACKET QUEST/,
  /Follow a request through the local network/,
  /WAP Practice hub/,
  /window\.__arcade\b/,
  /"programCount": 20/,
  /portal\.cedar\.example/,
  /id: 'demo-sort'/,
  /Original WAP Practice demo/,
];

export function hasGameContent(body) {
  return GAME_CONTENT.some((re) => re.test(String(body ?? '')));
}

export function isNotFoundShell(body) {
  return /NEXT_HTTP_ERROR_FALLBACK;404|This page could not be found/i.test(String(body ?? ''));
}

/**
 * Expected outcome for one actor/target.
 * actor.kind: 'anonymous' | 'non-admin' | 'admin-off' | 'admin-on'
 */
export function expectedFor(actor, target) {
  if (target.kind === 'deny-any') return { status: [400, 404], content: false };
  if (actor.kind === 'anonymous') {
    if (target.kind === 'page' || target.kind === 'unknown-page') return { status: [307], locationIncludes: '/login', content: false };
    return { status: [401], content: false };
  }
  if (actor.kind === 'non-admin') {
    if (target.kind === 'page' || target.kind === 'unknown-page') return { status: [307], locationExcludes: '/admin/game-lab', content: false };
    return { status: [404], content: false };
  }
  if (actor.kind === 'admin-off') {
    // App Router streams notFound() as the 404 shell with HTTP 200; the body must be that shell and carry no game content.
    if (target.kind === 'page' || target.kind === 'unknown-page') return { status: [200, 404], notFoundShell: true, content: false };
    return { status: [404], content: false };
  }
  if (actor.kind === 'admin-on') {
    if (target.kind === 'page') return { status: [200], content: true };
    if (target.kind === 'unknown-page') return { status: [200, 404], notFoundShell: true, content: false };
    if (target.kind === 'asset') return { status: [200], content: true, type: target.type, privateNoStore: true, varyCookie: true };
    return { status: [404], content: false };
  }
  throw new Error(`unknown actor kind ${actor.kind}`);
}

/** Returns a list of failure strings for one observed row (empty = pass). */
export function judgeRow(actor, target, observed) {
  const want = expectedFor(actor, target);
  const failures = [];
  if (!want.status.includes(observed.status)) failures.push(`status ${observed.status}, expected ${want.status.join('|')}`);
  const content = hasGameContent(observed.body);
  if (target.kind === 'asset') {
    if (want.content) {
      if (observed.bodyBytes !== target.bytes || observed.sha256 !== target.sha256) failures.push('wrong asset bytes');
    } else {
      const error = actor.kind === 'anonymous' ? 'Unauthorized' : 'Not found';
      if (observed.body !== JSON.stringify({ error }) || observed.contentType?.split(';')[0] !== 'application/json') failures.push('unexpected asset denial payload');
    }
  } else if (want.content && !content) failures.push('expected game content, none found');
  if (!want.content && content) failures.push('LEAK: game content served');
  if (want.notFoundShell && !isNotFoundShell(observed.body)) failures.push('expected the not-found shell');
  if (want.locationIncludes && !String(observed.location ?? '').includes(want.locationIncludes)) failures.push(`redirect to ${observed.location}, expected ${want.locationIncludes}`);
  if (want.locationExcludes && String(observed.location ?? '').includes(want.locationExcludes)) failures.push(`redirect stays in ${want.locationExcludes}`);
  if (want.type && observed.contentType !== want.type) failures.push(`content-type ${observed.contentType}, expected ${want.type}`);
  if (want.privateNoStore && !(/\bprivate\b/.test(observed.cacheControl ?? '') && /\bno-store\b/.test(observed.cacheControl ?? ''))) failures.push(`cache-control ${observed.cacheControl}`);
  if (want.varyCookie && !/\bcookie\b/i.test(observed.vary ?? '')) failures.push(`vary ${observed.vary}`);
  return failures;
}

/** The effective role the server reports must match the fixture, or the row proves nothing. */
export function judgeRole(expectedRole, reported) {
  return reported === expectedRole ? [] : [`effective role ${reported ?? 'none'}, expected ${expectedRole}`];
}

/** Any request leaving the local origin fails, whatever frame made it. */
export function judgeRequests(urls, origin) {
  const allowed = new URL(origin).origin;
  return urls
    .filter((u) => !/^(data|blob|about):/.test(u))
    .filter((u) => { try { return new URL(u).origin !== allowed; } catch { return true; } })
    .map((u) => `external request ${u}`);
}

/** Any console error/warning or page error fails. No pattern filtering. */
export function judgeConsole(events) {
  return events.map((e) => `${e.type}: ${e.text}`);
}

/**
 * Database rule: during the gameplay window (after login, flag setup and a settle period),
 * no table may gain, change or lose a row. `before`/`after` map table -> exact row count plus
 * the max xmin-age watermark (any insert/update moves it).
 */
export function judgeDb(before, after) {
  const failures = [];
  for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[table];
    const b = after[table];
    if (!a || !b) { failures.push(`table ${table} appeared or vanished`); continue; }
    if (a.rows !== b.rows) failures.push(`${table}: ${a.rows} -> ${b.rows} rows`);
    if (a.lastXmin !== b.lastXmin) failures.push(`${table}: row written (xmin ${a.lastXmin} -> ${b.lastXmin})`);
  }
  return failures;
}

/**
 * Mail rule: the sink must be reachable, the synthetic control send must have been captured
 * (proving the app is wired to it), and the gameplay window must add zero messages.
 */
export function judgeMail({ control, before, after }) {
  const failures = [];
  if (!control || control.reachable !== true) failures.push('mail sink unreachable');
  else if (!(control.captured >= 1)) failures.push('control send was not captured: app is not wired to the sink');
  if (!before || before.reachable !== true || !after || after.reachable !== true) failures.push('mail sink unreachable during the gameplay window');
  else if (after.total !== before.total) failures.push(`gameplay window sent ${after.total - before.total} message(s)`);
  if ((after?.unexpected ?? []).length) failures.push(`sink saw unexpected provider calls: ${after.unexpected.join(', ')}`);
  return failures;
}
