import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import {
  CLIENT_EVENT_NAMES,
  EVENT_NAMES,
  LEGACY_EVENT_NAME_ALIASES,
  canonicalEventName,
  eventNameReadCandidates,
  isEventName,
} from './names';

const REPO = join(__dirname, '..', '..');

/** The one production module allowed to call `memberEvent.create` (WAP-39). */
const CANONICAL_EVENT_WRITER = 'lib/events/track.ts';

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      files.push(...productionTypeScriptFiles(path));
    } else if (/\.(?:ts|tsx)$/.test(entry) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

test('only lib/events/track.ts creates MemberEvent rows', () => {
  const files = [
    ...productionTypeScriptFiles(join(REPO, 'app')),
    ...productionTypeScriptFiles(join(REPO, 'lib')),
    ...productionTypeScriptFiles(join(REPO, 'components')),
  ];
  const writers = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // Matches `x.memberEvent.create(`, the multi-line `.memberEvent\n.create(`
    // form and createMany/upsert.
    if (/\bmemberEvent\s*\.\s*(?:create|createMany|upsert)\s*\(/.test(source)) {
      writers.add(relative(REPO, file).split('\\').join('/'));
    }
  }
  assert.deepEqual(
    [...writers].sort(),
    [CANONICAL_EVENT_WRITER],
    'route every MemberEvent write through persistEvent/trackEvent in lib/events/track.ts',
  );
});

test('every event name a production writer passes is in the typed vocabulary', () => {
  const files = [
    ...productionTypeScriptFiles(join(REPO, 'app')),
    ...productionTypeScriptFiles(join(REPO, 'lib')),
    ...productionTypeScriptFiles(join(REPO, 'components')),
  ];
  const unknown: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\beventName:\s*'([^']+)'/g)) {
      const name = match[1]!;
      // `orderBy: { eventName: 'asc' }` style sort keys are not event names.
      if (name === 'asc' || name === 'desc') continue;
      // Readers may still filter historical rows by a spelling that has
      // no writer; only reject names that are neither current nor aliased
      // and that are being written.
      if (!canonicalEventName(name) && /persistEvent|trackEvent/.test(source)) {
        unknown.push(`${relative(REPO, file)}: ${name}`);
      }
    }
  }
  assert.deepEqual(unknown, [], 'add new names to lib/events/names.ts before writing them');
});

test('vocabulary names follow one lower_snake_case taxonomy and aliases resolve into it', () => {
  for (const name of EVENT_NAMES) {
    assert.match(name, /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/, `${name} breaks the taxonomy`);
  }
  assert.equal(new Set(EVENT_NAMES).size, EVENT_NAMES.length, 'duplicate vocabulary entry');
  for (const [alias, canonical] of Object.entries(LEGACY_EVENT_NAME_ALIASES)) {
    assert.ok(isEventName(canonical), `${alias} must alias a vocabulary name`);
    assert.ok(!isEventName(alias), `${alias} cannot be both an alias and a current name`);
    assert.equal(canonicalEventName(alias), canonical);
    assert.deepEqual(eventNameReadCandidates(canonical), [canonical, alias]);
  }
  assert.deepEqual(eventNameReadCandidates('course_completed'), ['course_completed']);
  assert.equal(canonicalEventName('made_up'), null);
  for (const name of CLIENT_EVENT_NAMES) {
    assert.ok(isEventName(name), `client emitter ${name} must stay in the server vocabulary`);
  }
});
