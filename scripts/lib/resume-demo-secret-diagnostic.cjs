const { DEMO_REF, PROD_REF, projectForUrl } = require('./supabase-project-guard.cjs');

/**
 * Reduce a possibly secret database URL to fixed, non-reversible categories.
 * Do not return URL components, parameter values, or parser errors.
 */
function inspectResumeDemoSecretUrl(value) {
  const present = typeof value === 'string' && value.trim().length > 0;
  let url;
  if (present) {
    try {
      url = new URL(value);
    } catch {
      // A parser error can contain the input URL, so never return it.
    }
  }

  const scheme = url && ['postgres:', 'postgresql:'].includes(url.protocol) ? 'postgres' : 'other';
  const hostname = url?.hostname.toLowerCase() || '';
  const hostClass =
    hostname === `db.${DEMO_REF}.supabase.co` || hostname === `db.${PROD_REF}.supabase.co`
      ? 'approved-direct'
      : hostname === 'pooler.supabase.com' || hostname.endsWith('.pooler.supabase.com')
        ? 'shared-pooler'
        : 'other';

  let username = '';
  try {
    username = decodeURIComponent(url?.username || '').toLowerCase();
  } catch {
    // Invalid percent encoding is not useful diagnostic material.
  }
  const userClass = username === 'postgres'
    ? 'postgres'
    : username === `postgres.${DEMO_REF}`
      ? 'dotted-demo'
      : /^postgres\.[a-z0-9]+$/.test(username)
        ? 'dotted-other'
        : /^[a-z_][a-z0-9_-]*(?:\.[a-z0-9]+)?$/.test(username)
          ? 'custom-role'
          : 'other';

  const referenceCount = url
    ? url.searchParams.getAll('options').reduce(
      (count, options) => count + new URLSearchParams(options).getAll('reference').length,
      0,
    )
    : 0;

  let project = present ? 'unknown' : 'unset';
  if (url) {
    try {
      project = projectForUrl(value);
    } catch {
      // The existing guard can reject malformed URL encoding while decoding a
      // username. The diagnostic remains a safe unknown classification.
    }
  }

  return { present, parseOk: Boolean(url), scheme, hostClass, userClass, referenceCount, projectForUrl: project };
}

/** The exact, redacted shape printed by the workflow CLI. */
function classifyPreviewDbUrl(name, value) {
  const diagnostic = inspectResumeDemoSecretUrl(value);
  let url;
  if (diagnostic.parseOk) {
    try {
      url = new URL(value);
    } catch {
      // Defensive only: the diagnostic already parsed this value.
    }
  }
  const pgbouncer = url?.searchParams.getAll('pgbouncer');
  const connectionLimit = url?.searchParams.getAll('connection_limit');
  return {
    name,
    // projectForUrl identifies a project, but it does not check the protocol.
    // A workflow gate must never approve an HTTP URL as a database secret.
    classification: diagnostic.scheme === 'postgres' && diagnostic.projectForUrl !== 'unset'
      ? diagnostic.projectForUrl : 'unknown',
    hostClass: diagnostic.hostClass === 'approved-direct'
      ? 'direct' : diagnostic.hostClass === 'shared-pooler' ? 'pooler' : 'other',
    refPresent: diagnostic.referenceCount > 0,
    pgbouncer: pgbouncer?.length === 1 && pgbouncer[0] === 'true',
    connectionLimit1: connectionLimit?.length === 1 && connectionLimit[0] === '1',
  };
}

module.exports = { inspectResumeDemoSecretUrl, classifyPreviewDbUrl };
