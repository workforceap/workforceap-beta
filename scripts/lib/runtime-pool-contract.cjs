/**
 * Inspect only non-secret runtime URL parameters. Never return the input URL,
 * hostname, username, password, options, or arbitrary parameter values.
 */
function inspectRuntimePoolContract(value) {
  const errors = [];
  let url;
  try {
    url = new URL(value || '');
  } catch {
    return { valid: false, parameters: null, errors: ['POSTGRES_PRISMA_URL must be a valid PostgreSQL URL.'] };
  }
  const integer = (name) => {
    const values = url.searchParams.getAll(name);
    if (values.length !== 1 || !/^[1-9][0-9]*$/.test(values[0])) return null;
    const number = Number(values[0]);
    return Number.isSafeInteger(number) ? number : null;
  };
  const connectionLimit = integer('connection_limit');
  const poolTimeout = integer('pool_timeout');
  const pgbouncerValues = url.searchParams.getAll('pgbouncer');
  const pgbouncer = pgbouncerValues.length === 1 && ['true', 'false'].includes(pgbouncerValues[0])
    ? pgbouncerValues[0] === 'true' : null;
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) errors.push('Runtime URL must use the PostgreSQL protocol.');
  if (url.port !== '6543') errors.push('Runtime URL must use transaction-pooler port 6543.');
  if (connectionLimit !== 1) errors.push('Runtime URL must explicitly set connection_limit=1.');
  if (poolTimeout === null) errors.push('Runtime URL must explicitly set a positive integer pool_timeout.');
  if (pgbouncer !== true) errors.push('Runtime URL must explicitly set pgbouncer=true.');
  return {
    valid: errors.length === 0,
    parameters: { port: url.port ? Number(url.port) : null, connectionLimit, poolTimeout, pgbouncer },
    errors,
  };
}
module.exports = { inspectRuntimePoolContract };
