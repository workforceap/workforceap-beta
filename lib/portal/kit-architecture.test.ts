import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

test('missions empty state renders KitEmptyState with a kit CTA, not a 14px pill', () => {
  // SkillMissionEmpty.tsx was folded into the page (empty-state consolidation
  // PR 4); the rendered CTA class is asserted in tests/app/skill-missions-page.spec.tsx.
  const src = source('app/(portal)/dashboard/missions/page.tsx');
  assert.match(src, /KitEmptyState/);
  assert.match(src, /primaryAction=/);
  assert.doesNotMatch(src, /fontSize:\s*14/);
});

test('jobs listing KitCta uses wa-kit-cta, not fontSize 14', () => {
  const src = source('app/(portal)/dashboard/jobs/JobsListingClient.tsx');
  const start = src.indexOf('function KitCta');
  const end = src.indexOf('const FILTER_CONTROL');
  assert.ok(start > 0 && end > start, 'KitCta missing');
  const block = src.slice(start, end);
  assert.match(block, /wa-kit-cta/);
  assert.doesNotMatch(block, /fontSize:\s*14/);
});

test('kit barrel does not claim primitives fan out Astryx', () => {
  const src = source('components/portal/kit/index.ts');
  assert.doesNotMatch(src, /fan out Astryx/);
  assert.match(src, /Do not collapse those tones/);
});

test('Voice Studio session error uses --wa-danger, not raw magenta', () => {
  const src = source('components/portal/kit/pages/VoiceStudioKit.tsx');
  const start = src.indexOf('function SessionPanel');
  const end = src.indexOf('function SessionStat');
  assert.ok(start > 0 && end > start, 'SessionPanel missing');
  const block = src.slice(start, end);
  assert.match(block, /var\(--wa-danger\)/);
  assert.doesNotMatch(block, /rgba\(173,\s*44,\s*77/);
  assert.doesNotMatch(block, /rgba\(255,255,255/);
});

test('KitEmptyState title uses the body type floor token', () => {
  const src = source('components/portal/kit/KitEmptyState.tsx');
  assert.match(src, /fontSize: 'var\(--wa-type-body\)'/);
  assert.doesNotMatch(src, /fontSize:\s*16/);
});
