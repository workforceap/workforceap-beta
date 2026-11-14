'use strict';
/**
 * Fail-closed guard for the local preview. It inspects configuration only and
 * never opens a network connection. Messages name the variable and the rule,
 * never the value.
 *
 *   node scripts/lib/local-only-guard.cjs            # check process.env (strict)
 *   node scripts/lib/local-only-guard.cjs --dev      # strict only when LOCAL_PREVIEW=1
 */
const URL_VARS = ['DATABASE_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'NEXT_PUBLIC_SUPABASE_URL'];
const JWT_VARS = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const FORBIDDEN_REFS = ['jqddnyuszufndwwezdwp', 'esbdrgaonplpvzmtrdhw'];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_PORTS = { db: 54329, auth: 54331 };

function decodeLayers(value) {
  const out = [value];
  let cur = value;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      out.push(next);
      cur = next;
    } catch { break; }
  }
  return out;
}

function jwtRefs(value) {
  const found = [];
  for (const token of value.match(/[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g) || []) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      for (const k of ['ref', 'iss', 'aud']) if (typeof payload[k] === 'string') found.push(payload[k]);
    } catch { /* not a JWT */ }
  }
  return found;
}

function containsForbiddenRef(value) {
  const haystacks = [];
  for (const layer of decodeLayers(value)) haystacks.push(layer.toLowerCase(), ...jwtRefs(layer).map(s => s.toLowerCase()));
  return haystacks.some(h => FORBIDDEN_REFS.some(ref => h.includes(ref)));
}

function checkUrlVar(name, raw, expectedPort, problems) {
  if (typeof raw !== 'string' || raw.trim() === '') { problems.push({ variable: name, rule: 'is unset or empty' }); return; }
  if (containsForbiddenRef(raw)) problems.push({ variable: name, rule: 'contains a blocked Supabase project reference' });
  let url;
  try { url = new URL(raw.trim()); } catch { problems.push({ variable: name, rule: 'is not a parseable URL' }); return; }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (/(^|\.)supabase\.(co|com|net)$/.test(host) || host.includes('pooler')) problems.push({ variable: name, rule: 'points at a Supabase or pooler host' });
  if (!LOOPBACK.has(host)) problems.push({ variable: name, rule: 'host is not 127.0.0.1, localhost or ::1' });
  for (const key of ['host', 'hostaddr', 'options', 'sslmode', 'service']) {
    if (url.searchParams.has(key)) problems.push({ variable: name, rule: `uses the ${key} query option, which is not allowed in a local preview` });
  }
  if (url.username && /\./.test(decodeURIComponent(url.username))) problems.push({ variable: name, rule: 'user name looks like a pooler tenant (user.ref)' });
  const port = url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : '5432');
  if (Number(port) !== expectedPort) problems.push({ variable: name, rule: `port is not the preview's own port ${expectedPort}` });
}

/** Returns { ok, problems: [{variable, rule}] }. Pure; no I/O. */
function checkLocalOnly(env, opts = {}) {
  const ports = { ...DEFAULT_PORTS, ...(opts.ports || {}) };
  const problems = [];
  for (const name of ['VERCEL', 'VERCEL_ENV']) {
    if (env[name] !== undefined && env[name] !== '') problems.push({ variable: name, rule: 'is set; the preview never runs in a Vercel environment' });
  }
  if (String(env.NODE_ENV || '').toLowerCase() === 'production') problems.push({ variable: 'NODE_ENV', rule: 'is production' });
  for (const name of URL_VARS) checkUrlVar(name, env[name], name === 'NEXT_PUBLIC_SUPABASE_URL' ? ports.auth : ports.db, problems);
  for (const name of JWT_VARS) {
    const raw = env[name];
    if (typeof raw === 'string' && raw && containsForbiddenRef(raw)) problems.push({ variable: name, rule: 'contains a blocked Supabase project reference' });
  }
  return { ok: problems.length === 0, problems };
}

function describe(result) {
  return result.problems.map(p => `  - ${p.variable} ${p.rule}`).join('\n');
}

class LocalOnlyGuardError extends Error {
  constructor(result) {
    super(`Local-only guard refused to continue:\n${describe(result)}`);
    this.name = 'LocalOnlyGuardError';
    this.problems = result.problems;
  }
}

function assertLocalOnly(env, opts) {
  const result = checkLocalOnly(env, opts);
  if (!result.ok) throw new LocalOnlyGuardError(result);
  return result;
}

/** Request-level check for the auth shim: only loopback Host headers are served. */
function isLocalHostHeader(hostHeader, port) {
  if (typeof hostHeader !== 'string') return false;
  const m = hostHeader.trim().toLowerCase().match(/^(\[::1\]|127\.0\.0\.1|localhost)(?::(\d+))?$/);
  return Boolean(m) && Number(m[2]) === port;
}

module.exports = { checkLocalOnly, assertLocalOnly, isLocalHostHeader, LocalOnlyGuardError, FORBIDDEN_REFS, URL_VARS, DEFAULT_PORTS };

if (require.main === module) {
  const dev = process.argv.includes('--dev');
  if (dev && process.env.LOCAL_PREVIEW !== '1') process.exit(0); // ordinary `npm run dev` is unchanged
  const result = checkLocalOnly(process.env);
  if (!result.ok) { console.error(`Local-only guard refused:\n${describe(result)}`); process.exit(2); }
  console.log('Local-only guard: OK');
}
