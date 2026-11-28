// node:test — proves the Game Lab local-preview verdicts cannot PASS a contract violation.
// Runs in `npm run test:unit` (scripts/test-unit.mjs collects tests/game-lab/*.test.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256, exactCoverage } from '../../scripts/game-lab/inventory.mjs';
import { readFileSync } from 'node:fs';
import {
  MATRIX_TARGETS, expectedFor, judgeRow, judgeRole, judgeRequests, judgeConsole, judgeDb, judgeMail, hasGameContent,
} from '../../scripts/game-lab/verdicts.mjs';

const ORIGIN = 'http://localhost:3100';
const target = (name) => MATRIX_TARGETS.find((t) => t.name === name);
const asset = (file) => readFileSync(new URL(`../../assets/game-lab/${file}`, import.meta.url), 'utf8');
const NOT_FOUND = '<html><body>NEXT_HTTP_ERROR_FALLBACK;404 This page could not be found.</body></html>';
const okAsset = (body, type) => ({ status: 200, body, sha256: sha256(body), bodyBytes: Buffer.byteLength(body), contentType: `${type}; charset=utf-8`, cacheControl: 'private, no-store', vary: 'Cookie' });

test('previously sampled asset bodies are recognised as game content', () => {
  for (const file of [
    'packet-quest-3d/index.html', 'packet-quest-3d/game.mjs', 'firewall-defender-3d/index.html', 'firewall-defender-3d/rules.mjs', 'vendor/three.module.min.js',
    'packet-quest/index.html', 'packet-quest/rules.mjs', 'network-path/index.html', 'network-path/lesson.js', 'network-path/styles.css',
    'practice-arcade/index.html', 'practice-arcade/play.html', 'practice-arcade/hub.mjs', 'practice-arcade/kit/shell.mjs',
    'practice-arcade/data/source/_index.json', 'practice-arcade/games/demo-sort/game.mjs', 'practice-arcade/kit/vendor/three.module.min.js',
  ]) {
    assert.equal(hasGameContent(asset(file)), true, file);
  }
  assert.equal(hasGameContent(NOT_FOUND), false);
});

test('correct rows pass for every actor', () => {
  const html = asset('packet-quest-3d/index.html');
  assert.deepEqual(judgeRow({ kind: 'admin-on' }, target('packet-quest-3d/index.html'), okAsset(html, 'text/html')), []);
  assert.deepEqual(judgeRow({ kind: 'anonymous' }, target('packet-quest-3d/index.html'), { status: 401, body: '{"error":"Unauthorized"}', contentType: 'application/json' }), []);
  assert.deepEqual(judgeRow({ kind: 'anonymous' }, target('launcher'), { status: 307, location: '/en/login?redirectTo=x', body: '' }), []);
  assert.deepEqual(judgeRow({ kind: 'non-admin' }, target('launcher'), { status: 307, location: '/dashboard', body: '' }), []);
  assert.deepEqual(judgeRow({ kind: 'admin-off' }, target('launcher'), { status: 200, body: NOT_FOUND }), []);
  assert.deepEqual(judgeRow({ kind: 'admin-on' }, target('raw traversal'), { status: 404, body: '' }), []);
});

test('an allowed response must match the requested file, not merely contain a known game marker', () => {
  const t = target('packet-quest-3d/index.html');
  const wrong = okAsset(asset('firewall-defender-3d/index.html'), 'text/html');
  assert.match(judgeRow({ kind: 'admin-on' }, t, wrong).join(), /bytes/);
});

test('denied assets accept only the denial payload, including for files without a game marker', () => {
  const t = target('practice-arcade/kit/vendor/THREE-LICENSE.txt');
  const row = { status: 404, body: '{"error":"Not found"}', contentType: 'application/json' };
  assert.deepEqual(judgeRow({ kind: 'non-admin' }, t, row), []);
  assert.match(judgeRow({ kind: 'non-admin' }, t, { ...row, body: row.body + ' extra bytes' }).join(), /denial/);
});

test('equal counts cannot hide a duplicate, substitution or missing row', () => {
  for (const bad of [['a'], ['a', 'a'], ['a', 'c'], ['a', 'b', 'b']]) {
    assert.throws(() => exactCoverage('sample', ['a', 'b'], bad));
  }
  assert.throws(() => exactCoverage('sample', ['a', 'a'], ['a', 'a']));
  exactCoverage('sample', ['a', 'b'], ['b', 'a']);
});

test('a wrong auth status fails', () => {
  assert.notDeepEqual(judgeRow({ kind: 'anonymous' }, target('packet-quest-3d/index.html'), { status: 404, body: '' }), []);
  assert.notDeepEqual(judgeRow({ kind: 'non-admin' }, target('packet-quest-3d/game.mjs'), { status: 403, body: '' }), []);
  assert.notDeepEqual(judgeRow({ kind: 'admin-off' }, target('packet-quest-3d/index.html'), { status: 200, body: '' }), []);
  assert.notDeepEqual(judgeRow({ kind: 'admin-on' }, target('unknown asset'), { status: 200, body: '' }), []);
  assert.notDeepEqual(judgeRow({ kind: 'anonymous' }, target('launcher'), { status: 307, location: '/admin/game-lab', body: '' }), []);
});

test('leaked game content fails even with the expected status', () => {
  const html = asset('firewall-defender-3d/index.html');
  assert.match(judgeRow({ kind: 'admin-off' }, target('launcher'), { status: 200, body: NOT_FOUND + html }).join(), /LEAK/);
  assert.match(judgeRow({ kind: 'admin-on' }, target('raw traversal'), { status: 404, body: html }).join(), /LEAK/);
  assert.match(judgeRow({ kind: 'admin-off' }, target('launcher'), { status: 200, body: '<p>blank</p>' }).join(), /not-found shell/);
});

test('missing private no-store, Vary: Cookie or MIME on an allowed asset fails', () => {
  const js = asset('packet-quest-3d/game.mjs');
  const t = target('packet-quest-3d/game.mjs');
  assert.match(judgeRow({ kind: 'admin-on' }, t, { ...okAsset(js, 'text/javascript'), cacheControl: 'public, max-age=60' }).join(), /cache-control/);
  assert.match(judgeRow({ kind: 'admin-on' }, t, { ...okAsset(js, 'text/javascript'), vary: '' }).join(), /vary/);
  assert.match(judgeRow({ kind: 'admin-on' }, t, okAsset(js, 'text/plain')).join(), /content-type/);
});

test('every matrix target has an expectation for every actor kind', () => {
  for (const t of MATRIX_TARGETS) for (const kind of ['anonymous', 'non-admin', 'admin-off', 'admin-on']) assert.ok(expectedFor({ kind }, t).status.length);
});

test('a fixture whose effective role differs fails', () => {
  assert.deepEqual(judgeRole('counselor', 'counselor'), []);
  assert.notDeepEqual(judgeRole('counselor', 'member'), []);
  assert.notDeepEqual(judgeRole('counselor', undefined), []);
});

test('any external request fails, whichever frame made it', () => {
  assert.deepEqual(judgeRequests([`${ORIGIN}/admin/game-lab`, 'data:image/png;base64,AA', 'blob:x'], ORIGIN), []);
  assert.equal(judgeRequests(['https://www.googletagmanager.com/gtm.js?id=x'], ORIGIN).length, 1);
  assert.equal(judgeRequests(['https://cdn.jsdelivr.net/npm/three'], ORIGIN).length, 1);
  assert.equal(judgeRequests(['http://127.0.0.1:3100/x'], ORIGIN).length, 1, 'a different origin is external');
});

test('any console error or warning fails, with no pattern filter', () => {
  assert.deepEqual(judgeConsole([]), []);
  assert.equal(judgeConsole([{ type: 'error', text: 'net::ERR_NAME_NOT_RESOLVED' }]).length, 1);
  assert.equal(judgeConsole([{ type: 'warning', text: 'Detected `scroll-behavior: smooth`' }]).length, 1);
});

test('a DB write in the gameplay window fails', () => {
  const before = { member_events: { rows: 3, lastXmin: '900' }, feature_flags: { rows: 1, lastXmin: '901' } };
  assert.deepEqual(judgeDb(before, structuredClone(before)), []);
  assert.match(judgeDb(before, { ...before, member_events: { rows: 4, lastXmin: '950' } }).join(), /member_events/);
  assert.match(judgeDb(before, { ...before, feature_flags: { rows: 1, lastXmin: '960' } }).join(), /row written/, 'an update with the same row count still fails');
  assert.match(judgeDb(before, { feature_flags: before.feature_flags }).join(), /vanished/);
});

test('a missing sink, an unwired app or a gameplay message fails', () => {
  const up = (total) => ({ reachable: true, total, unexpected: [] });
  assert.deepEqual(judgeMail({ control: { reachable: true, captured: 1 }, before: up(1), after: up(1) }), []);
  assert.match(judgeMail({ control: { reachable: false }, before: up(0), after: up(0) }).join(), /unreachable/);
  assert.match(judgeMail({ control: { reachable: true, captured: 0 }, before: up(0), after: up(0) }).join(), /not wired/);
  assert.match(judgeMail({ control: { reachable: true, captured: 1 }, before: up(1), after: up(2) }).join(), /sent 1 message/);
  assert.match(judgeMail({ control: { reachable: true, captured: 1 }, before: up(1), after: { reachable: false } }).join(), /unreachable/);
  assert.match(judgeMail({ control: { reachable: true, captured: 1 }, before: up(1), after: { ...up(1), unexpected: ['GET /domains'] } }).join(), /unexpected/);
});
