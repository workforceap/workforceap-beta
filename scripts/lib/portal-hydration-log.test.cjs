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
    elapsedMs: secret,
    bodyTags: ['div', secret, 'header', { secret }],
    bodyChildCount: secret,
    mainCount: 100_001,
    mainBodyIndex: -999,
    mainTags: Array(50).fill(secret),
    mainChildCount: 2,
    routeLoadingCount: 100_001,
    routeHeadingCount: -1,
    portalTouchFirst: secret,
    shellCount: 1,
    shellTags: ['span', secret],
    shellChildCount: 2,
    memberName: secret,
    toJSON: () => secret,
  };
  const browserTrace = {
    auditTraceVersion: 1,
    initialPathname: `/partner/private/member-123?token=${secret}`,
    errorPathname: `/partner/members/member-123?token=${secret}`,
    firstShellPathname: `/${secret}`,
    lastShellPathname: '/employer/messages',
    firstMarketingNavPathname: '/partner/members/member-123',
    firstMarketingNavNullPath: false,
    firstMarketingNavHidden: true,
    lastMarketingNavPathname: `/${secret}`,
    lastMarketingNavNullPath: secret,
    lastMarketingNavHidden: secret,
    firstPortalShellPathname: '/employer/messages',
    firstPortalShellNullPath: false,
    firstPortalShellShowNav: false,
    lastPortalShellPathname: '/partner/private/member-123',
    lastPortalShellNullPath: true,
    lastPortalShellShowNav: true,
    firstMarketingNav: { injected: secret },
    first: Array(30).fill(sample),
    recent: Array(30).fill(sample),
    atError: sample,
    firstObservedPage: {
      boundary: secret, childCount: 100_001, textContent: secret,
      children: Array(20).fill({
        tag: secret, marker: secret, childCount: secret,
        children: [{ tag: 'section', marker: 'portal-page-frame', id: secret }, { tag: secret, marker: secret }],
        className: secret,
      }),
    },
    detachedMainPageCandidate: {
      boundary: 'workspace-main-body', childCount: 1,
      children: [{ tag: 'article', marker: 'wa-kit-card', childCount: 1,
        children: [{ tag: 'h2', marker: 'other', textContent: secret }],
      }],
    },
    atErrorPage: { boundary: 'portal-touch-target', childCount: secret, children: [] },
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
  assert.deepEqual(safe.firstMarketingNav, {
    pathname: '/partner/members/[id]', nullPath: false, hidden: true,
  });
  assert.deepEqual(safe.lastMarketingNav, {
    pathname: '[unmatched-route]', nullPath: null, hidden: null,
  });
  assert.deepEqual(safe.firstPortalShell, {
    pathname: '/employer/messages', nullPath: false, showNav: false,
  });
  assert.deepEqual(safe.lastPortalShell, {
    pathname: '[unmatched-route]', nullPath: true, showNav: true,
  });
  assert.equal(safe.first.length, 4);
  assert.equal(safe.recent.length, 16);
  assert.equal(safe.atError.phase, 'unknown');
  assert.equal(safe.atError.elapsedMs, null);
  assert.deepEqual(safe.atError.bodyTags, ['div', 'unknown', 'header', 'unknown']);
  assert.equal(safe.atError.bodyChildCount, null);
  assert.equal(safe.atError.mainCount, 10_000);
  assert.equal(safe.atError.mainBodyIndex, null);
  assert.equal(safe.atError.mainTags.length, 8);
  assert.equal(safe.atError.routeLoadingCount, 1_000);
  assert.equal(safe.atError.routeHeadingCount, null);
  assert.equal(safe.atError.portalTouchFirst, null);
  assert.equal(safe.firstObservedPage.boundary, 'unknown');
  assert.equal(safe.firstObservedPage.childCount, 10_000);
  assert.equal(safe.firstObservedPage.children.length, 6);
  assert.deepEqual(safe.firstObservedPage.children[0], {
    tag: 'unknown', marker: 'other', childCount: null,
    children: [{ tag: 'section', marker: 'portal-page-frame' }, { tag: 'unknown', marker: 'other' }],
  });
  assert.deepEqual(safe.detachedMainPageCandidate, {
    boundary: 'workspace-main-body', childCount: 1,
    children: [{ tag: 'article', marker: 'wa-kit-card', childCount: 1,
      children: [{ tag: 'h2', marker: 'other' }],
    }],
  });
  assert.deepEqual(safe.atErrorPage, { boundary: 'portal-touch-target', childCount: null, children: [] });
  const serialized = JSON.stringify(safe);
  assert.doesNotMatch(serialized, /PRIVATE_MEMBER_RESUME_123|member-123|PRIVATE_TOKEN/);
  assert.deepEqual(Object.keys(safe.atError), [
    'phase', 'elapsedMs', 'bodyTags', 'bodyChildCount', 'mainCount', 'mainBodyIndex',
    'mainTags', 'mainChildCount', 'routeLoadingCount', 'routeHeadingCount', 'portalTouchFirst', 'shellCount',
    'shellTags', 'shellChildCount',
  ]);
});

test('hydration log retains approved root diagnostics', async () => {
  const { sanitizePortalHydrationTrace } = await import('./portal-hydration-log.mjs');
  const sample = {
    phase: 'react-error', elapsedMs: 321, bodyTags: ['script', 'main'], bodyChildCount: 2,
    mainCount: 1, mainBodyIndex: 1, mainTags: ['div'], mainChildCount: 1,
    routeLoadingCount: 0, routeHeadingCount: 1,
    portalTouchFirst: true, shellCount: 1, shellTags: ['header'], shellChildCount: 1,
  };
  const safe = sanitizePortalHydrationTrace({
    auditTraceVersion: 1,
    initialPathname: '/dashboard/ai-tools/elevator-pitch',
    errorPathname: '/dashboard/ai-tools/elevator-pitch',
    firstMarketingNavPathname: '/dashboard/ai-tools/elevator-pitch',
    firstMarketingNavNullPath: false,
    firstMarketingNavHidden: true,
    firstPortalShellPathname: '/dashboard/ai-tools/elevator-pitch',
    firstPortalShellNullPath: false,
    firstPortalShellShowNav: false,
    first: [sample], recent: [sample], atError: sample,
  }, {
    role: 'member', viewport: 'mobile', artifactPath: '/dashboard/ai-tools/elevator-pitch',
  });

  assert.equal(safe.path, '/dashboard/ai-tools/elevator-pitch');
  assert.equal(safe.viewport, 'mobile');
  assert.equal(safe.firstMarketingNav.hidden, true);
  assert.equal(safe.firstPortalShell.showNav, false);
  assert.deepEqual(safe.atError, sample);
});

test('hydration log requires the opt-in trace version', async () => {
  const { sanitizePortalHydrationTrace } = await import('./portal-hydration-log.mjs');
  const context = { role: 'member', viewport: 'desktop', artifactPath: '/dashboard' };
  assert.equal(sanitizePortalHydrationTrace({ first: [] }, context), null);
  assert.equal(sanitizePortalHydrationTrace({ auditTraceVersion: '1', first: [] }, context), null);
});

test('hydration logging stays disabled outside opt-in isolated Preview and without #418', async () => {
  const { logPortalHydrationTrace } = await import('./portal-hydration-log.mjs');
  let evaluations = 0;
  const writes = [];
  const args = {
    page: { evaluate: async () => { evaluations += 1; return { auditTraceVersion: 1 }; } },
    pageErrors: ['Minified React error #418'],
    role: 'partner', viewport: 'desktop', artifactPath: '/partner/members',
    write: (...parts) => writes.push(parts),
  };

  assert.equal(await logPortalHydrationTrace({ ...args, enabled: false, auditMode: 'isolated_preview' }), false);
  assert.equal(await logPortalHydrationTrace({ ...args, enabled: true, auditMode: 'local' }), false);
  assert.equal(await logPortalHydrationTrace({ ...args, enabled: true, auditMode: 'production_canary' }), false);
  assert.equal(await logPortalHydrationTrace({
    ...args, enabled: true, auditMode: 'isolated_preview', pageErrors: ['Unrelated page error'],
  }), false);
  assert.equal(evaluations, 0);
  assert.deepEqual(writes, []);
});

test('redirect hydration logging emits only Node-sanitized route templates and structure', async () => {
  const { logPortalHydrationTrace } = await import('./portal-hydration-log.mjs');
  const secret = 'PRIVATE_MEMBER_RESUME_123';
  const browserTrace = {
    auditTraceVersion: 1,
    initialPathname: '/partner/members/member-123',
    errorPathname: `/partner/members/member-123?token=${secret}`,
    firstMarketingNavPathname: '/partner/members/member-123',
    firstMarketingNavNullPath: false,
    firstMarketingNavHidden: true,
    first: [{
      phase: 'react-error', bodyTags: ['main', secret], bodyChildCount: 2,
      mainCount: 1, mainBodyIndex: 0, mainTags: ['div'], mainChildCount: 1,
      portalTouchFirst: true, shellCount: 1, shellTags: ['header'], shellChildCount: 1,
      memberResume: secret,
    }],
    memberResume: secret,
  };
  const writes = [];
  const captured = await logPortalHydrationTrace({
    page: { evaluate: async () => browserTrace },
    enabled: true, auditMode: 'isolated_preview',
    pageErrors: ['Minified React error #418'],
    role: 'partner', viewport: 'desktop', artifactPath: '/partner/members',
    write: (...parts) => writes.push(parts),
  });

  assert.equal(captured, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], '[portal-hydration-structure]');
  const payload = JSON.parse(writes[0][1]);
  assert.equal(payload.path, '/partner/members');
  assert.equal(payload.errorPathname, '/partner/members/[id]');
  assert.deepEqual(payload.first[0].bodyTags, ['main', 'unknown']);
  assert.equal(payload.firstMarketingNav.hidden, true);
  assert.doesNotMatch(writes[0][1], /PRIVATE_MEMBER_RESUME_123|member-123|token=/);
});

test('trace capture failure does not change the audit verdict', async () => {
  const { logPortalHydrationTrace } = await import('./portal-hydration-log.mjs');
  const writes = [];
  assert.equal(await logPortalHydrationTrace({
    page: { evaluate: async () => { throw new Error('browser context closed'); } },
    enabled: true, auditMode: 'isolated_preview',
    pageErrors: ['Hydration failed'], role: 'member', viewport: 'desktop', artifactPath: '/dashboard',
    write: (...parts) => writes.push(parts),
  }), false);
  assert.deepEqual(writes, []);
});
