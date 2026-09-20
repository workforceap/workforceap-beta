import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttentionQueue } from './evaluate';
import { attentionReasonDefinition } from './reasons';
import {
  ADMIN_ATTENTION_TILES,
  buildAdminAttentionTiles,
  buildAttentionDigest,
  buildCommandCenterAttentionRows,
} from './adminViews';
import { FIXTURE_NOW, fixtureRoster } from '@/tests/fixtures/attentionRoster';

/**
 * The Command Center (`/admin`) and the Detailed overview (`/admin/overview`)
 * must print the same "who needs attention" numbers with the same
 * definitions. Both are projections of one queue; this spec pins that.
 */

const queue = buildAttentionQueue(fixtureRoster(), FIXTURE_NOW);
const tiles = buildAdminAttentionTiles(queue);
const rows = buildCommandCenterAttentionRows(queue);
const digest = buildAttentionDigest(queue);

const bucketFor = { risk_alert: 'at-risk', no_activity_30d: 'stalled', new_no_counselor: 'new-applicants' } as const;

test('Command Center tiles and Detailed overview digest agree on every count', () => {
  for (const tile of tiles) {
    const bucket = digest.buckets.find((b) => b.key === bucketFor[tile.key]);
    assert.ok(bucket, `digest bucket for ${tile.key}`);
    assert.equal(bucket.count, tile.value, tile.key);
    assert.equal(bucket.members.length, Math.min(5, tile.value));
    assert.equal(bucket.href, tile.href);
  }
});

test('Command Center work-queue rows print the same counts as the tiles', () => {
  for (const row of rows) {
    const tile = tiles.find((t) => t.key === row.id);
    assert.ok(tile);
    assert.equal(row.count, tile.value);
    assert.ok(row.title.startsWith(`${row.count} `), row.title);
  }
});

test('every number is labelled with the rule behind it, identically on both pages', () => {
  for (const tile of tiles) {
    assert.equal(tile.definition, attentionReasonDefinition(tile.key));
    const bucket = digest.buckets.find((b) => b.key === bucketFor[tile.key]);
    assert.equal(bucket?.definition, tile.definition);
  }
  assert.equal(rows.find((r) => r.id === 'risk_alert')?.detail, attentionReasonDefinition('risk_alert'));
  assert.equal(rows.find((r) => r.id === 'no_activity_30d')?.detail, attentionReasonDefinition('no_activity_30d'));
  assert.notEqual(tiles[0].definition, tiles[1].definition, '"risk alert" and "no activity 30 d" are different rules');
});

test('fixture: one saved alert, one quiet member, one new applicant — and the members are the right ones', () => {
  assert.deepEqual(ADMIN_ATTENTION_TILES.map((t) => t.key), ['risk_alert', 'no_activity_30d', 'new_no_counselor']);
  assert.deepEqual(tiles.map((t) => t.value), [1, 1, 1]);
  assert.deepEqual(digest.buckets.map((b) => b.key), ['new-applicants', 'at-risk', 'stalled']);
  assert.deepEqual(digest.buckets.find((b) => b.key === 'at-risk')?.members.map((m) => m.id), ['m-risk']);
  assert.deepEqual(digest.buckets.find((b) => b.key === 'stalled')?.members.map((m) => m.id), ['m-quiet30']);
  assert.deepEqual(digest.buckets.find((b) => b.key === 'new-applicants')?.members.map((m) => m.id), ['m-new']);
  assert.equal(digest.allClear, false);
});

test('an empty roster is all clear on both pages', () => {
  const empty = buildAttentionQueue([], FIXTURE_NOW);
  assert.deepEqual(buildAdminAttentionTiles(empty).map((t) => t.value), [0, 0, 0]);
  assert.equal(buildAttentionDigest(empty).allClear, true);
  assert.ok(buildCommandCenterAttentionRows(empty).every((r) => r.count === 0 && !r.urgent));
});
