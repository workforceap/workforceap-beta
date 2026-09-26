const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readPortalQaConfig, assertPortalQaOrganization } = require('./portal-qa-guard.cjs');
const { DEMO_REF, PROD_REF } = require('./supabase-project-guard.cjs');

function environment() {
  return {
    PORTAL_QA_TARGET: 'demo',
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO_REF}.supabase.co`,
    POSTGRES_PRISMA_URL: `postgresql://postgres:example@db.${DEMO_REF}.supabase.co:5432/postgres`,
    SUPABASE_SERVICE_ROLE_KEY: 'test-only-admin-key',
    PORTAL_QA_ORGANIZATION_ID: 'qa-org', PORTAL_QA_ORGANIZATION_SLUG: 'portal-qa-test',
    ...Object.fromEntries(['member', 'partner', 'employer', 'admin', 'counselor'].map(role => [
      `PORTAL_QA_${role.toUpperCase()}_PASSWORD`, `${role}-unique-fixture-secret-123456`,
    ])),
  };
}

test('accepts only explicitly selected matching demo targets and distinct supplied secrets', () => {
  const env = environment();
  const config = readPortalQaConfig(env);
  assert.equal(config.organizationId, 'qa-org');
  assert.deepEqual(Object.keys(config.passwords), ['member', 'partner', 'employer', 'admin', 'counselor']);
  assert.equal(new Set(Object.values(config.passwords)).size, 5);
});

for (const [name, change] of Object.entries({
  'missing opt-in': { PORTAL_QA_TARGET: undefined },
  'production environment': { VERCEL_ENV: 'production' },
  'production auth': { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` },
  'production database': { POSTGRES_PRISMA_URL: `postgresql://postgres:example@db.${PROD_REF}.supabase.co/postgres` },
  'production direct URL': { POSTGRES_URL_NON_POOLING: `postgresql://postgres:example@db.${PROD_REF}.supabase.co/postgres` },
  'forged suffix': { NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO_REF}.supabase.co.attacker.invalid` },
  'main organization': { PORTAL_QA_ORGANIZATION_SLUG: 'workforceap' },
  'missing key': { SUPABASE_SERVICE_ROLE_KEY: undefined },
  'missing password': { PORTAL_QA_MEMBER_PASSWORD: undefined },
  'short password': { PORTAL_QA_MEMBER_PASSWORD: 'short' },
  'missing counselor password': { PORTAL_QA_COUNSELOR_PASSWORD: undefined },
  'short counselor password': { PORTAL_QA_COUNSELOR_PASSWORD: 'short' },
  'duplicate passwords': { PORTAL_QA_MEMBER_PASSWORD: 'admin-unique-fixture-secret-123456' },
  'duplicate counselor password': { PORTAL_QA_COUNSELOR_PASSWORD: 'admin-unique-fixture-secret-123456' },
})) {
  test(`rejects ${name} without including credentials in its error`, () => {
    const env = { ...environment(), ...change };
    assert.throws(() => readPortalQaConfig(env), error => {
      assert.ok(!error.message.includes(env.SUPABASE_SERVICE_ROLE_KEY));
      assert.ok(!error.message.includes(env.POSTGRES_PRISMA_URL));
      for (const [key, value] of Object.entries(env)) {
        if (key.endsWith('_PASSWORD') && value) assert.ok(!error.message.includes(value));
      }
      return true;
    });
  });
}

test('requires exact live ID, slug, and active fixture organization', () => {
  const expected = readPortalQaConfig(environment());
  assertPortalQaOrganization({ id: 'qa-org', slug: 'portal-qa-test', active: true }, expected);
  for (const actual of [null, { id: 'other', slug: 'portal-qa-test', active: true },
    { id: 'qa-org', slug: 'workforceap', active: true }, { id: 'qa-org', slug: 'portal-qa-test', active: false }]) {
    assert.throws(() => assertPortalQaOrganization(actual, expected));
  }
});
