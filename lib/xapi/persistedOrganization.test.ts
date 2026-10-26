import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePersistedXapiOrganizationId } from './persistedOrganization';

test('replay only treats a real tenant id as persisted organization scope', () => {
  assert.equal(normalizePersistedXapiOrganizationId('org-a'), 'org-a');
  assert.equal(normalizePersistedXapiOrganizationId('  Org-A  '), 'Org-A');
  assert.equal(normalizePersistedXapiOrganizationId(null), null);
  assert.equal(normalizePersistedXapiOrganizationId(''), null);
  assert.equal(normalizePersistedXapiOrganizationId('   '), null);
  assert.equal(normalizePersistedXapiOrganizationId('unknown'), null);
  assert.equal(normalizePersistedXapiOrganizationId('UNKNOWN'), null);
  assert.equal(normalizePersistedXapiOrganizationId('unresolved-row-1'), null);
  assert.equal(normalizePersistedXapiOrganizationId('Unresolved-abc'), null);
});
