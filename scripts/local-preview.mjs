#!/usr/bin/env node
/**
 * One-command LOCAL preview with fake data.
 *
 *   npm run preview:local         start (idempotent) and print the fake logins
 *   npm run preview:local:down    stop everything this script started
 *
 * Safety model (see scripts/lib/local-only-guard.cjs):
 *   - The child environment is built IN-PROCESS from .env.preview.local.example plus a small
 *     allowlist of OS variables. Shell DB/Supabase variables are never read or forwarded.
 *   - .env and .env.local are never read here, and Next.js is told not to load them
 *     (__NEXT_PROCESSED_ENV) while Prisma/seed run with LOCAL_PREVIEW=1.
 *   - The guard runs first, again before the dev server starts, and inside prisma/seed-demo.ts
 *     before any write.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const require = createRequire(import.meta.url);
const guard = require('./lib/local-only-guard.cjs');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(homedir(), '.wap-preview-local');
const STATE_FILE = join(STATE_DIR, 'state.json');
const DEFAULT_OUT = join(STATE_DIR, 'out');
const NAMES = Object.freeze({ db: 'wap-preview-db', auth: 'wap-preview-auth', net: 'wap-preview-net', volume: 'wap-preview-pgdata' });
const DB_IMAGE = 'public.ecr.aws/supabase/postgres:17.11.0.018';
const AUTH_IMAGE = 'public.ecr.aws/supabase/gotrue:v2.197.0';
const IS_WIN = process.platform === 'win32';
const OS_ENV_ALLOWLIST = [
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'HOME', 'USERPROFILE', 'USERNAME', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'ProgramFiles',
  'ProgramFiles(x86)', 'ProgramData', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'LANG', 'TZ',
];

const log = (message) => process.stdout.write(`${message}\n`);
const fail = (message) => { process.stderr.write(`preview:local: ${message}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseExample() {
  const file = join(ROOT, '.env.preview.local.example');
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function b64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}
function signJwt(secret, claims) {
  const head = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url({ iss: 'local-preview', iat: 1700000000, exp: 4102444800, ...claims });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function settings() {
  const ex = parseExample();
  const n = (k) => Number(ex[k]);
  const s = {
    dbPort: n('PREVIEW_DB_PORT'), authPort: n('PREVIEW_AUTH_PORT'), supabasePort: n('PREVIEW_SUPABASE_PORT'), appPort: n('PREVIEW_APP_PORT'),
    dbPassword: ex.PREVIEW_DB_PASSWORD, jwtSecret: ex.PREVIEW_JWT_SECRET,
    admin: { email: ex.PREVIEW_ADMIN_EMAIL, password: ex.PREVIEW_ADMIN_PASSWORD },
    student: { email: ex.PREVIEW_STUDENT_EMAIL, password: ex.PREVIEW_STUDENT_PASSWORD },
  };
  for (const [k, v] of Object.entries(s)) if (typeof v === 'number' && !Number.isInteger(v)) fail(`.env.preview.local.example: ${k} is not a number`);
  if (!s.dbPassword || !s.jwtSecret || !s.admin.email || !s.student.email) fail('.env.preview.local.example is missing required keys');
  return s;
}

/** Child env: allowlisted OS vars + fake values only. process.env DB/Supabase vars are not copied. */
function buildEnv(s) {
  const env = {};
  for (const k of OS_ENV_ALLOWLIST) if (process.env[k] !== undefined) env[k] = process.env[k];
  const dbUrl = `postgresql://postgres:${s.dbPassword}@127.0.0.1:${s.dbPort}/postgres?connection_limit=5`;
  Object.assign(env, {
    LOCAL_PREVIEW: '1',
    PREVIEW_DB_PORT: String(s.dbPort), PREVIEW_SUPABASE_PORT: String(s.supabasePort),
    DATABASE_URL: dbUrl, POSTGRES_PRISMA_URL: dbUrl, POSTGRES_URL_NON_POOLING: dbUrl,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${s.supabasePort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: signJwt(s.jwtSecret, { role: 'anon' }),
    SUPABASE_SERVICE_ROLE_KEY: signJwt(s.jwtSecret, { role: 'service_role' }),
    NEXT_PUBLIC_SITE_URL: `http://localhost:${s.appPort}`,
    NODE_ENV: 'development',
    ATTENDANCE_SYNTHETIC_DEMO: 'local',
    SEED_DEMO: 'true', PREVIEW_ATTENDANCE_SEED: '1',
    // Next.js skips .env/.env.local loading when this is set, so a developer's own files are never read.
    __NEXT_PROCESSED_ENV: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: '--max-old-space-size=3072',
  });
  return env;
}

function shellIgnored() {
  return [...guard.URL_VARS, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DOCKER_HOST'].filter((k) => process.env[k]);
}

function shellProductionFlags() {
  const flags = [];
  if (process.env.VERCEL) flags.push('VERCEL');
  if (process.env.VERCEL_ENV) flags.push('VERCEL_ENV');
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') flags.push('NODE_ENV');
  return flags;
}

function runGuard(env, s) {
  guard.assertLocalOnly(env, { strict: true, ports: { db: s.dbPort, supabase: s.supabasePort } });
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, shell: false, ...opts });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}
const docker = (args, opts) => run('docker', args, opts);

function portBusy(port) {
  return new Promise((resolveBusy) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    sock.once('connect', () => { sock.destroy(); resolveBusy(true); });
    sock.once('error', () => resolveBusy(false));
  });
}

function readState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function writeState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function killTree(pid) {
  if (!pid) return;
  if (IS_WIN) run('taskkill', ['/pid', String(pid), '/T', '/F']);
  else { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } } }
}

function nodeBin(pkgBin) {
  // Direct file path: package `exports` maps hide some CLI entry points from require.resolve.
  const file = join(ROOT, 'node_modules', ...pkgBin.split('/'));
  return existsSync(file) ? file : null;
}

function runNode(script, args, env, label) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, env, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    const tail = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-12).join('\n');
    throw new Error(`${label} failed (exit ${r.status}):\n${tail}`);
  }
  return `${r.stdout || ''}${r.stderr || ''}`;
}

async function http(method, url, { headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(420000) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

async function waitFor(label, probe, timeoutMs, everyMs = 1000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try { const v = await probe(); if (v) return v; } catch (e) { last = e; }
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${label}${last ? `: ${last.message}` : ''}`);
}

async function ensureAuthUser(s, env, user, id, fullName) {
  const base = `http://127.0.0.1:${s.authPort}`;
  const headers = { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY };
  const body = { id, email: user.email, password: user.password, email_confirm: true, user_metadata: { full_name: fullName } };
  let res = await http('POST', `${base}/admin/users`, { headers, body });
  if (res.status === 422 || res.status === 409) res = await http('PUT', `${base}/admin/users/${id}`, { headers, body: { password: user.password, email_confirm: true } });
  if (res.status >= 300) throw new Error(`creating preview auth user failed (HTTP ${res.status})`);
}

async function up() {
  const started = Date.now();
  const s = settings();
  const env = buildEnv(s);

  // 1. Guard first: production flags in the shell refuse; DB vars in the shell are ignored (never copied).
  const shellFlags = shellProductionFlags();
  if (shellFlags.length) fail(`refusing to run: production environment flag set in the shell (${shellFlags.join(', ')}).`);
  runGuard(env, s);
  const ignored = shellIgnored();
  log('guard: ok (strict, built in-process from .env.preview.local.example)');
  log(ignored.length ? `ignored shell variables (names only, values never read): ${ignored.join(', ')}` : 'ignored shell variables: none set');

  // 2. Docker must be local and running.
  const ctx = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (ctx.code !== 0) fail('docker is not available. Start Docker Desktop and retry.');
  if (!/^(npipe|unix):/.test(ctx.out)) fail('the active docker context is not a local socket; refusing to run containers there.');
  if (docker(['info', '--format', '{{.ServerVersion}}']).code !== 0) fail('docker daemon is not running. Start Docker Desktop and retry.');
  if (!existsSync(join(ROOT, 'node_modules'))) fail('dependencies are not installed. Run: pnpm install --frozen-lockfile');

  const prior = readState();
  const state = { startedAt: new Date().toISOString(), root: ROOT, ports: { db: s.dbPort, auth: s.authPort, supabase: s.supabasePort, app: s.appPort }, containers: [], proxyPid: null, nextPid: null, outDir: prior.outDir || DEFAULT_OUT };
  mkdirSync(state.outDir, { recursive: true });
  const logs = join(state.outDir, 'logs');
  mkdirSync(logs, { recursive: true });

  // Free ports required (a leftover from an earlier run is torn down first).
  if (docker(['ps', '-aq', '--filter', `name=^${NAMES.db}$`]).out || prior.nextPid) await down({ quiet: true, keepData: true });
  for (const [label, port] of [['postgres', s.dbPort], ['auth', s.authPort], ['auth proxy', s.supabasePort], ['dev server', s.appPort]]) {
    if (await portBusy(port)) fail(`port ${port} (${label}) is already in use by something this script did not start.`);
  }

  try {
    // 3. Postgres (Supabase image so auth/storage schemas and roles exist), bound to loopback.
    docker(['network', 'create', NAMES.net]);
    docker(['volume', 'create', NAMES.volume]);
    let r = docker(['run', '-d', '--name', NAMES.db, '--network', NAMES.net, '--network-alias', 'db', '-p', `127.0.0.1:${s.dbPort}:5432`,
      '-v', `${NAMES.volume}:/var/lib/postgresql/data`, '-e', `POSTGRES_PASSWORD=${s.dbPassword}`, '--memory', '768m', DB_IMAGE]);
    if (r.code !== 0) throw new Error(`postgres container failed to start: ${r.out.split('\n').pop()}`);
    state.containers.push(NAMES.db);
    writeState(state);
    await waitFor('postgres', () => docker(['exec', NAMES.db, 'pg_isready', '-U', 'supabase_admin', '-h', '127.0.0.1']).code === 0, 90000);
    await sleep(2000);
    const sql = `ALTER ROLE postgres PASSWORD '${s.dbPassword}'; ALTER ROLE supabase_auth_admin PASSWORD '${s.dbPassword}';`;
    r = docker(['exec', NAMES.db, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
    if (r.code !== 0) throw new Error(`database role bootstrap failed: ${r.out}`);
    log(`postgres: up on 127.0.0.1:${s.dbPort} (${((Date.now() - started) / 1000).toFixed(0)}s)`);

    // 4. Schema. Historical `prisma migrate deploy` cannot replay on an empty database (documented in
    //    docs/DATABASE-RECOVERY.md; first failure is 20260320000000_add_partner_users, relation already
    //    exists), so the local-only bootstrap applies schema.prisma with `db push`, exactly like the CI
    //    database-contract job. Production migrations are untouched.
    const prisma = nodeBin('prisma/build/index.js');
    if (!prisma) throw new Error('prisma CLI not found in node_modules');
    runGuard(env, s);
    runNode(prisma, ['db', 'push', '--skip-generate', '--accept-data-loss'], env, 'prisma db push');
    runNode(prisma, ['generate'], env, 'prisma generate');
    log('schema: applied from prisma/schema.prisma (local-only db push)');

    // 5. Seed (the seed runs the guard again before its first write).
    const tsx = nodeBin('tsx/dist/cli.mjs');
    if (!tsx) throw new Error('tsx not found in node_modules');
    const seedOut = runNode(tsx, ['prisma/seed-demo.ts'], env, 'seed');
    log(seedOut.split('\n').filter((l) => /Seeded preview|seed complete/i.test(l)).join('\n') || 'seed: done');
    const ids = docker(['exec', NAMES.db, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-tA', '-F', ',', '-c',
      "select e.id, u.email from course_enrollments e join users u on u.id = e.user_id where u.email like '%@example.test' order by u.email"]);
    state.enrollments = ids.out.split('\n').filter(Boolean).map((l) => { const [id, email] = l.split(','); return { id, email }; });
    if (!state.enrollments.length) throw new Error('seed produced no preview enrollments');
    writeState(state);

    // 6. Supabase Auth: real GoTrue container + loopback /auth/v1 proxy.
    r = docker(['run', '-d', '--name', NAMES.auth, '--network', NAMES.net, '-p', `127.0.0.1:${s.authPort}:9999`, '--memory', '256m',
      '-e', 'GOTRUE_API_HOST=0.0.0.0', '-e', 'GOTRUE_API_PORT=9999', '-e', `API_EXTERNAL_URL=http://127.0.0.1:${s.supabasePort}`,
      '-e', 'GOTRUE_DB_DRIVER=postgres',
      '-e', `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${s.dbPassword}@db:5432/postgres?search_path=auth`,
      '-e', `GOTRUE_SITE_URL=http://localhost:${s.appPort}`, '-e', `GOTRUE_JWT_SECRET=${s.jwtSecret}`, '-e', 'GOTRUE_JWT_EXP=3600',
      '-e', 'GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated', '-e', 'GOTRUE_DISABLE_SIGNUP=true', '-e', 'GOTRUE_MAILER_AUTOCONFIRM=true',
      '-e', 'GOTRUE_EXTERNAL_EMAIL_ENABLED=true', AUTH_IMAGE]);
    if (r.code !== 0) throw new Error(`auth container failed to start: ${r.out.split('\n').pop()}`);
    state.containers.push(NAMES.auth);
    writeState(state);
    await waitFor('gotrue', async () => (await http('GET', `http://127.0.0.1:${s.authPort}/health`)).status === 200, 60000);

    const fx = JSON.parse(readFileSync(join(ROOT, 'prisma', 'fixtures', 'preview-attendance.json'), 'utf8'));
    await ensureAuthUser(s, env, s.admin, fx.admin.id, fx.admin.fullName);
    const studentFx = fx.students.find((x) => x.login);
    await ensureAuthUser(s, env, s.student, studentFx.id, studentFx.fullName);
    log('auth: preview admin and student created in local Supabase Auth');

    const proxy = spawn(process.execPath, [join(ROOT, 'scripts', 'lib', 'preview-auth-proxy.cjs'), String(s.supabasePort), String(s.authPort)],
      { cwd: ROOT, env: { PATH: env.PATH || env.Path || '' }, detached: true, stdio: 'ignore', windowsHide: true });
    proxy.unref();
    state.proxyPid = proxy.pid;
    writeState(state);

    // 7. Dev server on loopback. The same guard the `dev` npm script runs.
    runNode(join(ROOT, 'scripts', 'lib', 'local-only-guard.cjs'), ['--strict'], env, 'dev guard');
    const next = nodeBin('next/dist/bin/next');
    if (!next) throw new Error('next not found in node_modules');
    const outFd = openSync(join(logs, 'next-dev.log'), 'w');
    const dev = spawn(process.execPath, [next, 'dev', '-H', 'localhost', '-p', String(s.appPort)],
      { cwd: ROOT, env, detached: true, stdio: ['ignore', outFd, outFd], windowsHide: true });
    dev.unref();
    state.nextPid = dev.pid;
    writeState(state);

    await waitFor('next dev', async () => (await http('GET', `http://localhost:${s.appPort}/en/login`)).status === 200, 240000, 2000);
    const app = `http://localhost:${s.appPort}`;

    // 8. Smoke: real login through Supabase Auth, then the admin attendance page.
    const login = await http('POST', `${app}/api/auth/login`, { body: { email: s.admin.email, password: s.admin.password, rememberMe: true } });
    if (![200, 302, 303, 307].includes(login.status) || !(login.headers.getSetCookie?.() || []).length) throw new Error(`admin login smoke test failed (HTTP ${login.status})`);
    const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    const page = await waitFor('admin attendance page', async () => {
      const p = await http('GET', `${app}/admin/attendance/draft`, { headers: { cookie } });
      return p.status === 200 ? p : null;
    }, 180000, 3000);
    if (!/Attendance draft PDF/.test(page.text)) throw new Error('admin attendance page rendered without its heading');

    state.readyAt = new Date().toISOString();
    state.startSeconds = Math.round((Date.now() - started) / 1000);
    writeState(state);
    log('');
    log(`LOCAL PREVIEW READY in ${state.startSeconds}s  (fake data, loopback only)`);
    log(`  app:      ${app}/login   (dev server bound to loopback only)`);
    log(`  admin:    ${s.admin.email}  /  ${s.admin.password}   -> ${app}/admin/attendance/draft`);
    log(`  student:  ${s.student.email}  /  ${s.student.password}`);
    log(`  enrollment id for ${state.enrollments[0].email}: ${state.enrollments[0].id}  (${state.enrollments.length} enrollments in total, see state file)`);
    log(`  logs:     ${logs}`);
    log('  stop:     npm run preview:local:down');
  } catch (error) {
    process.stderr.write(`preview:local: ${error.message}\n`);
    if (process.env.PREVIEW_KEEP_ON_FAIL === '1') { console.error('preview:local: PREVIEW_KEEP_ON_FAIL=1, stack left up; run preview:local:down.'); process.exit(1); }
    await down({ quiet: true });
    process.exit(1);
  }
}

async function down({ quiet = false, keepData = process.argv.includes('--keep-data') } = {}) {
  const say = quiet ? () => {} : log;
  const state = readState();
  killTree(state.nextPid);
  killTree(state.proxyPid);
  // Anything left listening on the preview's own ports from this script's node processes.
  const ports = state.ports || {};
  for (const name of [NAMES.auth, NAMES.db]) {
    if (docker(['ps', '-aq', '--filter', `name=^${name}$`]).out) docker(['rm', '-f', name]);
  }
  docker(['network', 'rm', NAMES.net]);
  if (!keepData) docker(['volume', 'rm', '-f', NAMES.volume]);
  rmSync(STATE_FILE, { force: true });
  await sleep(1500);
  const busy = [];
  for (const [label, port] of Object.entries(ports)) if (await portBusy(port)) busy.push(`${label}:${port}`);
  const leftovers = docker(['ps', '-a', '--filter', 'name=^wap-preview-', '--format', '{{.Names}}']).out;
  if (busy.length || leftovers) {
    process.stderr.write(`preview:local down: still present -> ports [${busy.join(', ')}] containers [${leftovers}]\n`);
    if (!quiet) process.exit(1);
    return;
  }
  say(`preview:local down: stopped dev server, auth proxy and containers; ${keepData ? 'kept' : 'removed'} the data volume; ports ${Object.values(ports).join(', ') || '(none)'} are free.`);
}

const cmd = process.argv[2] || 'up';
if (cmd === 'up') await up();
else if (cmd === 'down') await down();
else fail(`unknown command "${cmd}" (use up or down)`);
