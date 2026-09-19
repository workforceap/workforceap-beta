const { projectForUrl } = require('./supabase-project-guard.cjs');

const QA_ROLES = ['member', 'partner', 'employer', 'admin'];

/** Validate before constructing clients or making any network/database call. */
function readPortalQaConfig(env = process.env) {
  if (env.VERCEL_ENV === 'production' || env.PORTAL_QA_TARGET !== 'demo') {
    throw new Error('Portal QA seeding requires PORTAL_QA_TARGET=demo and a non-production environment.');
  }
  if (projectForUrl(env.NEXT_PUBLIC_SUPABASE_URL, 'public') !== 'demo') {
    throw new Error('Portal QA Auth URL must identify the approved demo project.');
  }
  const databaseUrl = env.POSTGRES_PRISMA_URL || env.DATABASE_URL;
  if (projectForUrl(databaseUrl) !== 'demo') {
    throw new Error('Portal QA database URL must identify the approved demo project.');
  }
  if (env.POSTGRES_URL_NON_POOLING && projectForUrl(env.POSTGRES_URL_NON_POOLING) !== 'demo') {
    throw new Error('Portal QA direct database URL must identify the approved demo project.');
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('Portal QA requires an explicitly configured demo Auth admin key.');
  }
  const organizationId = env.PORTAL_QA_ORGANIZATION_ID?.trim();
  const organizationSlug = env.PORTAL_QA_ORGANIZATION_SLUG?.trim();
  if (!organizationId || !organizationSlug || !/^portal-qa-[a-z0-9-]+$/.test(organizationSlug)) {
    throw new Error('Specify the exact dedicated fixture organization ID and portal-qa-* slug.');
  }
  /** @type {Record<string, string>} */
  const passwords = {};
  for (const role of QA_ROLES) {
    const value = env[`PORTAL_QA_${role.toUpperCase()}_PASSWORD`];
    if (!value || value.length < 24 || /[\r\n\0]/.test(value)) {
      throw new Error(`Supply a unique generated secret of at least 24 characters for PORTAL_QA_${role.toUpperCase()}_PASSWORD.`);
    }
    passwords[role] = value;
  }
  if (new Set(Object.values(passwords)).size !== QA_ROLES.length) {
    throw new Error('Portal QA accounts must use distinct secrets.');
  }
  return { organizationId, organizationSlug, passwords, databaseUrl };
}

function assertPortalQaOrganization(actual, expected) {
  if (!actual || actual.id !== expected.organizationId || actual.slug !== expected.organizationSlug || !actual.active) {
    throw new Error('Dedicated portal QA organization preflight failed. No fixture writes are allowed.');
  }
}

module.exports = { QA_ROLES, readPortalQaConfig, assertPortalQaOrganization };
