'use strict';
/**
 * Local-only guard for the throwaway preview (npm run preview:local).
 *
 * Fail-closed: anything unset, unparseable or not clearly local is refused.
 * Pure string/URL inspection. It never opens a socket and never resolves DNS.
 * Messages name the variable and the rule, never the value.
 *
 * Modes
 *   strict (preview): all four URL variables must be set, point at 127.0.0.1,
 *     localhost or ::1 on the preview's own port, and carry neither blocked ref.
 *   deny (the `dev` script and seed-demo.ts outside the preview): unset variables
 *     are skipped; set ones may not carry either blocked ref; production flags
 *     still refuse.
 */

const BLOCKED_REFS = Object.freeze(['jqddnyuszufndwwezdwp', 'esbdrgaonplpvzmtrdhw']);
const URL_VARS = Object.freeze([
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'NEXT_PUBLIC_SUPABASE_URL',
]);
const JWT_VARS = Object.freeze(['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
const PRODUCTION_FLAGS = Object.freeze(['VERCEL', 'VERCEL_ENV', 'NODE_ENV']);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const DEFAULT_PORTS = Object.freeze({ db: 54329, supabase: 54331 });

class LocalOnlyGuardError extends Error {
  constructor(problems) {
    super(
      'local-only guard refused: ' + problems.map((p) => `${p.variable}: ${p.reason}`).join('; '),
    );
    this.name = 'LocalOnlyGuardError';
    this.problems = problems;
  }
}

function present(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function containsBlockedRef(raw) {
  const hay = [raw.toLowerCase()];
  try {
    hay.push(decodeURIComponent(raw).toLowerCase());
  } catch {
    /* undecodable text is still scanned raw */
  }
  return BLOCKED_REFS.some((ref) => hay.some((h) => h.includes(ref)));
}

/** A JWT 'ref' claim is checked even when the token text has no ref substring. */
function jwtCarriesBlockedRef(raw) {
  const parts = raw.trim().split('.');
  if (parts.length < 2) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.ref === 'string' && containsBlockedRef(payload.ref);
  } catch {
    return false;
  }
}

function checkUrlVar(name, raw, expectedPort, strict, problems) {
  if (!present(raw)) {
    if (strict) problems.push({ variable: name, reason: 'is unset (fail closed)' });
    return;
  }
  if (containsBlockedRef(raw)) {
    problems.push({ variable: name, reason: 'contains a blocked Supabase project ref' });
  }
  if (!strict) return;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    problems.push({ variable: name, reason: 'is not a parseable URL (fail closed)' });
    return;
  }
  const host = url.hostname.toLowerCase();
  if (/\.supabase\.(co|com|net)$/.test(host) || host.includes('pooler') || host.includes('pgbouncer')) {
    problems.push({ variable: name, reason: 'points at a Supabase or pooler host' });
  } else if (!LOCAL_HOSTS.has(host)) {
    problems.push({ variable: name, reason: 'host is not 127.0.0.1, localhost or ::1' });
  } else if (!url.port || Number(url.port) !== expectedPort) {
    problems.push({ variable: name, reason: `port is not the preview port ${expectedPort}` });
  }
}

/**
 * @param {Record<string,string|undefined>} env environment to inspect (never read from disk)
 * @param {{strict?: boolean, ports?: {db?: number, supabase?: number}}} [opts]
 * @returns {{ok: boolean, problems: {variable: string, reason: string}[]}}
 */
function checkLocalOnly(env, opts = {}) {
  const strict = opts.strict !== false;
  const ports = { ...DEFAULT_PORTS, ...(opts.ports || {}) };
  const problems = [];
  if (!env || typeof env !== 'object') {
    return { ok: false, problems: [{ variable: '(environment)', reason: 'missing (fail closed)' }] };
  }

  for (const flag of PRODUCTION_FLAGS) {
    const v = env[flag];
    const set = flag === 'NODE_ENV' ? String(v || '').trim().toLowerCase() === 'production' : present(v);
    if (set) problems.push({ variable: flag, reason: 'production environment flag is set' });
  }

  for (const name of URL_VARS) {
    const expected = name === 'NEXT_PUBLIC_SUPABASE_URL' ? ports.supabase : ports.db;
    checkUrlVar(name, env[name], expected, strict, problems);
  }
  for (const name of JWT_VARS) {
    const raw = env[name];
    if (present(raw) && (containsBlockedRef(raw) || jwtCarriesBlockedRef(raw))) {
      problems.push({ variable: name, reason: 'carries a blocked Supabase project ref' });
    }
  }
  if (strict) {
    // The env handed to child processes is built in-process: no value may carry a blocked ref.
    for (const [name, value] of Object.entries(env)) {
      if (URL_VARS.includes(name) || JWT_VARS.includes(name)) continue;
      if (present(value) && containsBlockedRef(value)) {
        problems.push({ variable: name, reason: 'contains a blocked Supabase project ref' });
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

function assertLocalOnly(env, opts) {
  const result = checkLocalOnly(env, opts);
  if (!result.ok) throw new LocalOnlyGuardError(result.problems);
  return result;
}

function portsFromEnv(env) {
  const n = (v) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return { db: n(env.PREVIEW_DB_PORT), supabase: n(env.PREVIEW_SUPABASE_PORT) };
}

/** True when the process was started by the preview script. */
function isPreviewRun(env) {
  return env.LOCAL_PREVIEW === '1';
}

/** For `dev` and seed scripts: strict inside the preview, deny-list everywhere else. */
function assertForCurrentProcess(env = process.env) {
  return assertLocalOnly(env, { strict: isPreviewRun(env), ports: portsFromEnv(env) });
}

module.exports = {
  BLOCKED_REFS,
  URL_VARS,
  LocalOnlyGuardError,
  checkLocalOnly,
  assertLocalOnly,
  assertForCurrentProcess,
  isPreviewRun,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict') || (!args.includes('--dev') && isPreviewRun(process.env));
  try {
    assertLocalOnly(process.env, { strict, ports: portsFromEnv(process.env) });
    process.stdout.write(`local-only guard: ok (${strict ? 'strict' : 'deny-list'})\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
}
