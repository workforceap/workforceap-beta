const assert = require('node:assert/strict');
const { test } = require('node:test');

test('hydration log paths contain only checked-in route templates', async () => {
  const { safeHydrationRoute } = await import('./portal-hydration-log.mjs');

  assert.equal(safeHydrationRoute('/employer/messages'), '/employer/messages');
  assert.equal(safeHydrationRoute('/admin/members/member-123'), '/admin/members/[id]');
  assert.equal(safeHydrationRoute('/partner/members/member-123'), '/partner/members/[id]');
  assert.equal(safeHydrationRoute('/partner/referred-members/member-123'),
    '/partner/referred-members/[memberId]');
  assert.equal(safeHydrationRoute('/en/partner/members/member-123?token=PRIVATE_TOKEN'),
    '/partner/members/[id]');
  assert.equal(safeHydrationRoute('/partner/private/member-123'), '[unmatched-route]');
  assert.equal(safeHydrationRoute('/partner/members/member-123/extra'), '[unmatched-route]');
  assert.equal(safeHydrationRoute('//attacker.test/partner/members/member-123'), '[unmatched-route]');
  assert.equal(safeHydrationRoute('https://attacker.test/partner/members/member-123'), '[unmatched-route]');
});

test('hydration log discards injected browser strings and bounds structural fields', async () => {
  const { sanitizePortalHydrationTrace } = await import('./portal-hydration-log.mjs');
  const secret = 'PRIVATE_MEMBER_RESUME_123';
  const sample = {
    phase: secret,
    bodyTags: ['div', secret, 'header', { secret }],
    bodyChildCount: secret,
    mainCount: 100_001,
    mainBodyIndex: -999,
    mainTags: Array(50).fill(secret),
    mainChildCount: 2,
    portalTouchFirst: secret,
    shellCount: 1,
    shellTags: ['span', secret],
    shellChildCount: 2,
    memberName: secret,
    toJSON: () => secret,
  };
  const browserTrace = {
    initialPathname: `/partner/private/member-123?token=${secret}`,
    errorPathname: `/partner/members/member-123?token=${secret}`,
    firstShellPathname: `/${secret}`,
    lastShellPathname: '/employer/messages',
    first: Array(30).fill(sample),
    recent: Array(30).fill(sample),
    atError: sample,
    arbitraryText: secret,
    toJSON: () => secret,
  };
  const safe = sanitizePortalHydrationTrace(browserTrace, {
    role: 'partner', viewport: 'desktop', artifactPath: `/partner/private/member-123?token=${secret}`,
  });

  assert.equal(safe.path, '[unmatched-route]');
  assert.equal(safe.initialPathname, '[unmatched-route]');
  assert.equal(safe.errorPathname, '/partner/members/[id]');
  assert.equal(safe.firstShellPathname, '[unmatched-route]');
  assert.equal(safe.lastShellPathname, '/employer/messages');
  assert.equal(safe.first.length, 4);
  assert.equal(safe.recent.length, 16);
  assert.equal(safe.atError.phase, 'unknown');
  assert.deepEqual(safe.atError.bodyTags, ['div', 'unknown', 'header', 'unknown']);
  assert.equal(safe.atError.bodyChildCount, null);
  assert.equal(safe.atError.mainCount, 10_000);
  assert.equal(safe.atError.mainBodyIndex, null);
  assert.equal(safe.atError.mainTags.length, 8);
  assert.equal(safe.atError.portalTouchFirst, null);
  const serialized = JSON.stringify(safe);
  assert.doesNotMatch(serialized, /PRIVATE_MEMBER_RESUME_123|member-123|PRIVATE_TOKEN/);
  assert.deepEqual(Object.keys(safe.atError), [
    'phase', 'bodyTags', 'bodyChildCount', 'mainCount', 'mainBodyIndex',
    'mainTags', 'mainChildCount', 'portalTouchFirst', 'shellCount',
    'shellTags', 'shellChildCount',
  ]);
});

test('hydration log retains approved root diagnostics', async () => {
  const { sanitizePortalHydrationTrace } = await import('./portal-hydration-log.mjs');
  const sample = {
    phase: 'react-error', bodyTags: ['script', 'main'], bodyChildCount: 2,
    mainCount: 1, mainBodyIndex: 1, mainTags: ['div'], mainChildCount: 1,
    portalTouchFirst: true, shellCount: 1, shellTags: ['header'], shellChildCount: 1,
  };
  const safe = sanitizePortalHydrationTrace({
    initialPathname: '/dashboard/ai-tools/elevator-pitch',
    errorPathname: '/dashboard/ai-tools/elevator-pitch',
    first: [sample], recent: [sample], atError: sample,
  }, {
    role: 'member', viewport: 'mobile', artifactPath: '/dashboard/ai-tools/elevator-pitch',
  });

  assert.equal(safe.path, '/dashboard/ai-tools/elevator-pitch');
  assert.equal(safe.viewport, 'mobile');
  assert.deepEqual(safe.atError, sample);
});
