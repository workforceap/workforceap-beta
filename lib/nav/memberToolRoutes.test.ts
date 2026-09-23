import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_PORTAL_NAV_ITEMS } from './portalNav';
import {
  MEMBER_TOOLKIT_HUB_HREF,
  MEMBER_TOOLKIT_HUB_LABEL,
  claimedNavHrefs,
  humanizeToolSlug,
  memberContextualToolItem,
  memberToolSlugForPath,
  withContextualToolRow,
} from './memberToolRoutes';

const claimed = claimedNavHrefs(MEMBER_PORTAL_NAV_ITEMS);
const primaryOrder = (items: typeof MEMBER_PORTAL_NAV_ITEMS) =>
  items.filter((item) => item.group === 'primary').map((item) => item.href);

test('a tool route resolves to its own slug; the hub resolves to none', () => {
  assert.equal(memberToolSlugForPath('/dashboard/ai-tools/resume-studio'), 'resume-studio');
  assert.equal(memberToolSlugForPath('/dashboard/ai-tools/interview-practice/session/42'), 'interview-practice');
  assert.equal(memberToolSlugForPath('/dashboard/ai-tools/resume-studio/'), 'resume-studio');
  assert.equal(memberToolSlugForPath('/dashboard/ai-tools'), null);
  assert.equal(memberToolSlugForPath('/dashboard/ai-tools/'), null);
  assert.equal(memberToolSlugForPath('/dashboard/jobs'), null);
  assert.equal(memberToolSlugForPath(''), null);
});

test('a tool route marks that tool current, not the hub', () => {
  const { items, toolItem } = withContextualToolRow(MEMBER_PORTAL_NAV_ITEMS, '/dashboard/ai-tools/cover-letter');
  assert.ok(toolItem, 'expected a contextual tool row');
  assert.equal(toolItem.href, '/dashboard/ai-tools/cover-letter');
  assert.equal(toolItem.label, 'Cover letter');
  assert.equal(toolItem.nestedUnder, MEMBER_TOOLKIT_HUB_HREF);
  assert.equal(toolItem.group, 'primary');
  // The row sits directly under the AI Career Tools entry.
  const hubIndex = items.findIndex((item) => item.href === MEMBER_TOOLKIT_HUB_HREF);
  assert.equal(items[hubIndex + 1]?.href, '/dashboard/ai-tools/cover-letter');
});

test('the hub route itself shows zero tool rows', () => {
  for (const hubPath of ['/dashboard/ai-tools', '/dashboard/ai-tools/']) {
    const { items, toolItem } = withContextualToolRow(MEMBER_PORTAL_NAV_ITEMS, hubPath);
    assert.equal(toolItem, null, `${hubPath} must add no tool row`);
    assert.equal(items.length, MEMBER_PORTAL_NAV_ITEMS.length);
    assert.equal(items.filter((item) => item.nestedUnder).length, 0);
  }
});

test('only one tool row is ever produced, on every tool route', () => {
  const slugs = [
    'resume-studio',
    'cover-letter',
    'interview-practice',
    'interview-coach',
    'job-match-scorer',
    'skill-mapper',
    'training-bridge',
    'linkedin-headline',
    'linkedin-about',
    'gap-analyzer',
    'salary-negotiation',
    'benefits-cliff',
    'skill-checkpoints',
    'elevator-pitch',
    'career-business-coach',
    'readiness-coach',
    'resume-rewriter',
    'voice-interview',
  ];
  for (const slug of slugs) {
    const { items } = withContextualToolRow(MEMBER_PORTAL_NAV_ITEMS, `/dashboard/ai-tools/${slug}`);
    const nested = items.filter((item) => item.nestedUnder);
    assert.equal(nested.length, 1, `${slug} must add exactly one row, got ${nested.length}`);
    assert.equal(nested[0].href, `/dashboard/ai-tools/${slug}`);
    assert.equal(items.length, MEMBER_PORTAL_NAV_ITEMS.length + 1);
  }
});

test('routes a permanent rail entry already claims grow no duplicate row', () => {
  // Job applications owns the application tracker; the hub owns /studio.
  assert.equal(memberContextualToolItem('/dashboard/ai-tools/application-tracker', claimed), null);
  assert.equal(memberContextualToolItem('/dashboard/ai-tools/studio', claimed), null);
  // The AI Advisor lives outside /dashboard/ai-tools and keeps its own row.
  assert.equal(memberContextualToolItem('/dashboard/counselor', claimed), null);
});

test('an unmapped tool slug still gets a readable contextual row', () => {
  const item = memberContextualToolItem('/dashboard/ai-tools/brand-new-tool', claimed);
  assert.ok(item);
  assert.equal(item.href, '/dashboard/ai-tools/brand-new-tool');
  assert.equal(item.label, 'Brand new tool');
  assert.equal(humanizeToolSlug('offer-negotiation'), 'Offer negotiation');
});

// WAP-189 (owner-approved) supersedes the seven-row PR #2322 order: My progress
// and Skill missions moved into Training & progress, leaving five primary rows.
test('the WAP-189 five-row primary ordering survives the contextual row', () => {
  const baseline = primaryOrder(MEMBER_PORTAL_NAV_ITEMS);
  assert.deepEqual(baseline, [
    '/dashboard',
    '/dashboard/program',
    '/dashboard/jobs',
    '/dashboard/ai-tools',
    '/dashboard/messages',
  ]);
  const { items } = withContextualToolRow(MEMBER_PORTAL_NAV_ITEMS, '/dashboard/ai-tools/resume-studio');
  const withTool = primaryOrder(items);
  // Same order, with the single tool row inserted directly after the hub.
  assert.deepEqual(
    withTool.filter((href) => href !== '/dashboard/ai-tools/resume-studio'),
    baseline,
  );
  assert.equal(withTool.indexOf('/dashboard/ai-tools/resume-studio'), withTool.indexOf('/dashboard/ai-tools') + 1);
  // The source array is never mutated.
  assert.deepEqual(primaryOrder(MEMBER_PORTAL_NAV_ITEMS), baseline);
});

test('the hub keeps one name across the rail and the tool pages', () => {
  const hub = MEMBER_PORTAL_NAV_ITEMS.find((item) => item.href === MEMBER_TOOLKIT_HUB_HREF);
  assert.equal(hub?.label, MEMBER_TOOLKIT_HUB_LABEL);
  assert.equal(MEMBER_TOOLKIT_HUB_LABEL, 'AI Career Tools');
});
