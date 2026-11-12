/** Offline unit tests for the local-preview guard. No network, no database, no Docker. */
const assert = require('node:assert/strict');
const test = require('node:test');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { checkLocalOnly, assertLocalOnly, isLocalHostHeader, LocalOnlyGuardError } = require('./local-only-guard.cjs');

const GUARD = path.join(__dirname, 'local-only-guard.cjs');
const PROD = 'jqddnyuszufndwwezdwp';
const DEMO = 'esbdrgaonplpvzmtrdhw';
const good = () => ({
  DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:54329/wap_preview',
  POSTGRES_PRISMA_URL: 'postgresql://postgres:pw@127.0.0.1:54329/wap_preview',
  POSTGRES_URL_NON_POOLING: 'postgresql://postgres:pw@localhost:54329/wap_preview',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
});
const jwt = (payload) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'c2ln'].join('.');
const refused = (env, variable) => {
  const r = checkLocalOnly(env);
  assert.equal(r.ok, false);
  if (variable) assert.ok(r.problems.some((p) => p.variable === variable), JSON.stringify(r.problems));
  return r;
};

test('allows 127.0.0.1, localhost and ::1 on the preview ports', () => {
  assert.equal(checkLocalOnly(good()).ok, true);
  assert.equal(checkLocalOnly({ ...good(), DATABASE_URL: 'postgresql://u:p@[::1]:54329/db' }).ok, true);
});

test('refuses a URL carrying either blocked project ref', () => {
  refused({ ...good(), DATABASE_URL: `postgresql://postgres:pw@127.0.0.1:54329/${PROD}` }, 'DATABASE_URL');
  refused({ ...good(), POSTGRES_PRISMA_URL: `postgresql://postgres:pw@127.0.0.1:54329/db?x=${DEMO}` }, 'POSTGRES_PRISMA_URL');
  refused({ ...good(), NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }, 'NEXT_PUBLIC_SUPABASE_URL');
  refused({ ...good(), NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO}.supabase.co` }, 'NEXT_PUBLIC_SUPABASE_URL');
});

test('refuses a pooler URL with options=reference=<either ref>, plain or percent-encoded', () => {
  for (const ref of [PROD, DEMO]) {
    refused({ ...good(), DATABASE_URL: `postgresql://postgres.${ref}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?options=reference%3D${ref}` }, 'DATABASE_URL');
    refused({ ...good(), DATABASE_URL: `postgresql://u:p@127.0.0.1:54329/db?options=reference%253D${ref}` }, 'DATABASE_URL');
    refused({ ...good(), DATABASE_URL: `postgresql://u:p@127.0.0.1:54329/db?options=reference=${ref.toUpperCase()}` }, 'DATABASE_URL');
  }
});

test('refuses *.supabase.co and any pooler host', () => {
  refused({ ...good(), DATABASE_URL: 'postgresql://u:p@db.someotherref.supabase.co:5432/postgres' }, 'DATABASE_URL');
  refused({ ...good(), POSTGRES_URL_NON_POOLING: 'postgresql://u:p@aws-0-eu.pooler.example.net:5432/db' }, 'POSTGRES_URL_NON_POOLING');
});

test('refuses unset, empty and unparseable values', () => {
  for (const name of ['DATABASE_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'NEXT_PUBLIC_SUPABASE_URL']) {
    const unset = good(); delete unset[name];
    refused(unset, name);
    refused({ ...good(), [name]: '' }, name);
    refused({ ...good(), [name]: 'not a url' }, name);
  }
});

test('refuses a remote IP, a lookalike host and a wrong port', () => {
  refused({ ...good(), DATABASE_URL: 'postgresql://u:p@203.0.113.9:54329/db' }, 'DATABASE_URL');
  refused({ ...good(), DATABASE_URL: 'postgresql://u:p@localhost.evil.example:54329/db' }, 'DATABASE_URL');
  refused({ ...good(), DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db' }, 'DATABASE_URL');
  refused({ ...good(), NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329' }, 'NEXT_PUBLIC_SUPABASE_URL');
  refused({ ...good(), DATABASE_URL: 'postgresql://u:p@127.0.0.1:54329/db?host=db.example.com' }, 'DATABASE_URL');
});

test('refuses VERCEL, VERCEL_ENV and NODE_ENV=production', () => {
  refused({ ...good(), VERCEL_ENV: 'production' }, 'VERCEL_ENV');
  refused({ ...good(), VERCEL_ENV: 'preview' }, 'VERCEL_ENV');
  refused({ ...good(), VERCEL: '1' }, 'VERCEL');
  refused({ ...good(), NODE_ENV: 'production' }, 'NODE_ENV');
  assert.equal(checkLocalOnly({ ...good(), NODE_ENV: 'development' }).ok, true);
});

test('refuses a blocked ref inside a JWT ref claim', () => {
  refused({ ...good(), NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: PROD }) }, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  refused({ ...good(), SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: DEMO }) }, 'SUPABASE_SERVICE_ROLE_KEY');
  refused({ ...good(), DATABASE_URL: `postgresql://u:${jwt({ ref: PROD })}@127.0.0.1:54329/db` }, 'DATABASE_URL');
  assert.equal(checkLocalOnly({ ...good(), NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'anon', iss: 'preview-local' }) }).ok, true);
});

test('messages name the variable and never print a value', () => {
  const secret = 'hunter2-SENTINEL';
  const env = { ...good(), DATABASE_URL: `postgresql://postgres:${secret}@db.${PROD}.supabase.co:5432/postgres` };
  const r = checkLocalOnly(env);
  const text = JSON.stringify(r) + new LocalOnlyGuardError(r).message;
  assert.match(text, /DATABASE_URL/);
  assert.ok(!text.includes(secret) && !text.includes(PROD) && !text.includes('supabase.co'), text);
  assert.throws(() => assertLocalOnly(env), LocalOnlyGuardError);
});

test('the check opens no connection', () => {
  const original = net.Socket.prototype.connect;
  let attempts = 0;
  net.Socket.prototype.connect = function (...args) { attempts += 1; return original.apply(this, args); };
  try {
    checkLocalOnly({ ...good(), DATABASE_URL: `postgresql://u:p@db.${PROD}.supabase.co:5432/postgres` });
    checkLocalOnly(good());
  } finally { net.Socket.prototype.connect = original; }
  assert.equal(attempts, 0);
});

test('CLI exits non-zero when refused and zero on a local environment', () => {
  const run = (env, args = []) => spawnSync(process.execPath, [GUARD, ...args], { env, encoding: 'utf8' });
  const refusedRun = run({ ...good(), VERCEL_ENV: 'production' });
  assert.equal(refusedRun.status, 2);
  assert.match(refusedRun.stderr, /VERCEL_ENV/);
  assert.equal(run({}).status, 2);
  assert.equal(run(good()).status, 0);
  // `npm run dev` keeps working for ordinary development: strict only when LOCAL_PREVIEW=1.
  assert.equal(run({}, ['--dev']).status, 0);
  assert.equal(run({ LOCAL_PREVIEW: '1', DATABASE_URL: `postgresql://u:p@db.${PROD}.supabase.co:5432/postgres` }, ['--dev']).status, 2);
});

test('auth shim host gate answers only loopback Host headers on its own port', () => {
  assert.equal(isLocalHostHeader('127.0.0.1:54331', 54331), true);
  assert.equal(isLocalHostHeader('localhost:54331', 54331), true);
  assert.equal(isLocalHostHeader('example.com', 54331), false);
  assert.equal(isLocalHostHeader('127.0.0.1:80', 54331), false);
  assert.equal(isLocalHostHeader(undefined, 54331), false);
});
