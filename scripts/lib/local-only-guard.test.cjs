const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { checkLocalOnly, assertLocalOnly, LocalOnlyGuardError, BLOCKED_REFS } = require('./local-only-guard.cjs');

const PROD = BLOCKED_REFS[0];
const DEMO = BLOCKED_REFS[1];
const GOOD = Object.freeze({
  DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:54329/postgres',
  POSTGRES_PRISMA_URL: 'postgresql://postgres:pw@127.0.0.1:54329/postgres',
  POSTGRES_URL_NON_POOLING: 'postgresql://postgres:pw@localhost:54329/postgres',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
});
const withEnv = (patch) => ({ ...GOOD, ...patch });
const vars = (result) => result.problems.map((p) => p.variable);

test('allows the preview env on 127.0.0.1, localhost and ::1', () => {
  assert.equal(checkLocalOnly(GOOD).ok, true);
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'postgresql://u:p@[::1]:54329/db' })).ok, true);
});

for (const [label, ref] of [['production-style ref', PROD], ['demo-style ref', DEMO]]) {
  test(`refuses a Supabase URL carrying the ${label}`, () => {
    const r = checkLocalOnly(withEnv({ DATABASE_URL: `postgresql://postgres.${ref}:pw@db.${ref}.supabase.co:5432/postgres` }));
    assert.equal(r.ok, false);
    assert.ok(vars(r).includes('DATABASE_URL'));
  });
  test(`refuses a pooler URL with options=reference=<${label}>`, () => {
    const r = checkLocalOnly(withEnv({ POSTGRES_PRISMA_URL: `postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?options=reference%3D${ref}` }));
    assert.equal(r.ok, false);
    assert.ok(vars(r).includes('POSTGRES_PRISMA_URL'));
  });
  test(`refuses a local-looking URL that still carries the ${label}, in strict and deny mode`, () => {
    const env = withEnv({ POSTGRES_URL_NON_POOLING: `postgresql://u:p@127.0.0.1:54329/db?options=reference%3D${ref}` });
    assert.equal(checkLocalOnly(env).ok, false);
    assert.equal(checkLocalOnly(env, { strict: false }).ok, false);
  });
  test(`refuses a JWT whose ref claim is the ${label}`, () => {
    const payload = Buffer.from(JSON.stringify({ role: 'anon', ref })).toString('base64url');
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    // The claim is base64, so a plain substring scan alone would miss it.
    assert.ok(!jwt.includes(ref));
    const r = checkLocalOnly(withEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt }));
    assert.equal(r.ok, false);
    assert.ok(vars(r).includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  });
}

test('refuses any *.supabase.co host even without a ref', () => {
  const r = checkLocalOnly(withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghij.supabase.co' }));
  assert.equal(r.ok, false);
  assert.ok(vars(r).includes('NEXT_PUBLIC_SUPABASE_URL'));
});

test('refuses a pooler host', () => {
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'postgresql://u:p@pooler.example.net:54329/db' })).ok, false);
});

test('refuses each unset variable (fail closed)', () => {
  for (const name of Object.keys(GOOD)) {
    const env = { ...GOOD };
    delete env[name];
    const r = checkLocalOnly(env);
    assert.equal(r.ok, false, name);
    assert.ok(vars(r).includes(name));
  }
  assert.equal(checkLocalOnly({}).ok, false);
  assert.equal(checkLocalOnly(undefined).ok, false);
});

test('refuses unparseable values', () => {
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'not a url' })).ok, false);
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: '   ' })).ok, false);
});

test('refuses a remote IP and a remote name', () => {
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'postgresql://u:p@10.0.0.5:54329/db' })).ok, false);
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'postgresql://u:p@192.168.1.150:54329/db' })).ok, false);
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'postgresql://u:p@db.example.com:54329/db' })).ok, false);
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'postgresql://u:p@127.0.0.1.evil.test:54329/db' })).ok, false);
});

test('refuses a local host on the wrong or missing port', () => {
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db' })).ok, false);
  assert.equal(checkLocalOnly(withEnv({ DATABASE_URL: 'postgresql://u:p@127.0.0.1/db' })).ok, false);
  assert.equal(checkLocalOnly(GOOD, { ports: { db: 54999 } }).ok, false);
  const moved = 'postgresql://u:p@127.0.0.1:54999/db';
  assert.equal(
    checkLocalOnly({ ...GOOD, DATABASE_URL: moved, POSTGRES_PRISMA_URL: moved, POSTGRES_URL_NON_POOLING: moved }, { ports: { db: 54999 } }).ok,
    true,
  );
});

test('refuses production flags', () => {
  for (const patch of [{ VERCEL: '1' }, { VERCEL_ENV: 'production' }, { VERCEL_ENV: 'preview' }, { NODE_ENV: 'production' }, { NODE_ENV: ' Production ' }]) {
    assert.equal(checkLocalOnly(withEnv(patch)).ok, false, JSON.stringify(patch));
  }
  assert.equal(checkLocalOnly(withEnv({ NODE_ENV: 'development' })).ok, true);
});

test('strict mode refuses a blocked ref hiding in an unrelated variable', () => {
  assert.equal(checkLocalOnly(withEnv({ SOMETHING_ELSE: `https://${PROD}.supabase.co` })).ok, false);
});

test('deny mode skips unset variables but still refuses blocked refs and production flags', () => {
  assert.equal(checkLocalOnly({}, { strict: false }).ok, true);
  assert.equal(checkLocalOnly({ DATABASE_URL: `postgresql://x@db.${DEMO}.supabase.co/p` }, { strict: false }).ok, false);
  assert.equal(checkLocalOnly({ VERCEL_ENV: 'production' }, { strict: false }).ok, false);
});

test('messages name the variable and never print the value', () => {
  const secret = `postgresql://postgres.${PROD}:s3cr3t-pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  assert.throws(
    () => assertLocalOnly(withEnv({ DATABASE_URL: secret })),
    (error) => {
      assert.ok(error instanceof LocalOnlyGuardError);
      assert.match(error.message, /DATABASE_URL/);
      for (const leak of [PROD, 's3cr3t-pass', 'pooler.supabase.com', '6543']) assert.ok(!error.message.includes(leak), leak);
      return true;
    },
  );
});

test('CLI: exits non-zero without opening a connection, exits 0 for the preview env', async (t) => {
  // A listener on the DB port proves "no connection attempt": the guard never dials it.
  let connections = 0;
  const server = net.createServer((socket) => { connections += 1; socket.destroy(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const cli = path.join(__dirname, 'local-only-guard.cjs');
  const run = (env) => spawnSync(process.execPath, [cli, '--strict'], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  const url = `postgresql://u:p@127.0.0.1:${port}/db`;
  const local = (extra) => ({
    PREVIEW_DB_PORT: String(port),
    PREVIEW_SUPABASE_PORT: '54331',
    DATABASE_URL: url,
    POSTGRES_PRISMA_URL: url,
    POSTGRES_URL_NON_POOLING: url,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
    ...extra,
  });
  const ok = run(local({}));
  assert.equal(ok.status, 0, ok.stderr);
  const pooler = 'postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?options=reference%3D';
  const bad = [
    local({ DATABASE_URL: `postgresql://postgres.${PROD}:pw@db.${PROD}.supabase.co:5432/postgres` }),
    local({ DATABASE_URL: `postgresql://postgres.${DEMO}:pw@db.${DEMO}.supabase.co:5432/postgres` }),
    local({ POSTGRES_PRISMA_URL: pooler + PROD }),
    local({ POSTGRES_PRISMA_URL: pooler + DEMO }),
    local({ NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghij.supabase.co' }),
    local({ DATABASE_URL: '' }),
    local({ DATABASE_URL: `postgresql://u:p@203.0.113.9:${port}/db` }),
    local({ VERCEL_ENV: 'production' }),
  ];
  for (const env of bad) {
    const r = run(env);
    assert.notEqual(r.status, 0);
    assert.ok(!r.stderr.includes(PROD) && !r.stderr.includes(DEMO));
  }
  assert.equal(connections, 0, 'the guard must not connect to anything');
});
