import test from 'node:test';
import assert from 'node:assert/strict';
import { aiToolsActivityScope, aiToolsUserScope } from './admin/cohortAnalytics';
import { MEMBER_ONLY_WHERE } from './admin/memberOnlyWhere';

// The page's auth/scope ordering and the raw voice-analytics tenant predicate
// are exercised behaviourally in tests/app/admin-ai-tools-page.spec.tsx and
// tests/lib/ai-tools-cohort-analytics.spec.ts. This file keeps the pure
// predicate-builder contract.

test('AI tools analytics builds isolated predicates for two orgs and keeps super-admin global', () => {
  // Member accounts only (number audit 2026-09-20): staff dogfooding the
  // tools are not a cohort's members.
  assert.deepEqual(aiToolsUserScope('org-a'), {
    deletedAt: null,
    ...MEMBER_ONLY_WHERE,
    organizationId: 'org-a',
  });
  assert.deepEqual(aiToolsUserScope('org-b'), {
    deletedAt: null,
    ...MEMBER_ONLY_WHERE,
    organizationId: 'org-b',
  });
  assert.notDeepEqual(aiToolsUserScope('org-a'), aiToolsUserScope('org-b'));

  assert.deepEqual(aiToolsActivityScope('org-a'), {
    user: { organizationId: 'org-a' },
  });
  assert.deepEqual(aiToolsActivityScope('org-b'), {
    user: { organizationId: 'org-b' },
  });
  assert.notDeepEqual(aiToolsActivityScope('org-a'), aiToolsActivityScope('org-b'));

  assert.deepEqual(aiToolsUserScope(undefined), { deletedAt: null, ...MEMBER_ONLY_WHERE });
  assert.deepEqual(aiToolsUserScope(null), { deletedAt: null, ...MEMBER_ONLY_WHERE });
  assert.deepEqual(aiToolsActivityScope(undefined), {});
  assert.deepEqual(aiToolsActivityScope(null), {});
});
