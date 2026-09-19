import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

const durableRouteCallers = [
  'app/api/member/applications/[id]/messages/route.ts',
  'app/api/employer/applications/[id]/messages/route.ts',
  'app/api/employer/signup/route.ts',
  'app/api/admin/employers/[id]/approve/route.ts',
];

test('request-scoped Discord notifications are scheduled with Next after()', () => {
  for (const path of durableRouteCallers) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /import\s*\{[^}]*after[^}]*\}\s*from\s*['\"]next\/server['\"]/, `${path} must import after`);
    assert.doesNotMatch(source, /void\s+notifyDiscord\s*\(/, `${path} still abandons Discord work`);
    assert.match(source, /after\s*\(\s*\(\)\s*=>\s*notifyDiscord\s*\(/, `${path} must retain Discord work with after()`);
  }
});

test('notification helpers await both aggregated Discord paths', () => {
  const source = readFileSync('lib/notifications/create.ts', 'utf8');
  assert.equal((source.match(/await\s+notifyDiscord\s*\(/g) ?? []).length, 2);
  assert.doesNotMatch(source, /void\s+notifyDiscord\s*\(/);
});


test('request-lifetime code never abandons createNotification promises', () => {
  const matches: string[] = [];
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (entry.isFile() && !entry.name.endsWith('.test.ts')) {
        readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
          if (line.includes('void createNotification')) matches.push(`${path}:${index + 1}`);
        });
      }
    }
  }
  for (const root of ['app', 'lib']) inspect(root);
  assert.deepEqual(matches, [], 'Notification writes must remain in the request lifetime');
});
