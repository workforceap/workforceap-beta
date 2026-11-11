#!/usr/bin/env node
/**
 * One-command LOCAL preview with fake data.
 *   npm run preview:local        up: Postgres container, schema, seed, auth shim, next dev
 *   npm run preview:local:down   stop everything this script started
 *   npm run preview:local:down -- --purge   also delete the named volume
 *
 * The environment is built in-process from .env.preview.local.example. This script never
 * reads .env, .env.local or the shell's DB/Supabase variables: child processes receive a small
 * allowlist of OS variables plus the fake preview values. The local-only guard runs first.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { checkLocalOnly, LocalOnlyGuardError } = require('./lib/local-only-guard.cjs');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(ROOT, '.local-preview');
const STATE_FILE = join(STATE_DIR, 'state.json');
const CONTAINER = 'wap-preview-pg';
const VOLUME = 'wap-preview-pgdata';
const IMAGE = 'postgres:17-alpine3.23';
const isWin = process.platform === 'win32';
const OS_VARS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'USERNAME', 'LANG', 'DOCKER_HOST', 'DOCKER_CONFIG', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'];

export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function buildPreviewEnv(osEnv = process.env, file = join(ROOT, '.env.preview.local.example')) {
  const base = {};
  for (const key of OS_VARS) if (osEnv[key] !== undefined) base[key] = osEnv[key];
  return { ...base, ...parseEnvFile(readFileSync(file, 'utf8')) };
}

const log = (msg) => console.log('[preview] ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function run(cmd, args, env, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, env, encoding: 'utf8', ...opts });
}
function must(label, r) {
  if (r.status !== 0) {
    console.error('[preview] ' + label + ' failed (exit ' + r.status + ')\n' + (r.stdout || '').slice(-1500) + '\n' + (r.stderr || '').slice(-1500));
    process.exit(1);
  }
}
const readState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { pids: {} });
const writeState = (s) => { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); };

function killTree(pid) {
  if (!pid) return;
  if (isWin) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } } }
}

function startDetached(name, cmd, args, env) {
  mkdirSync(STATE_DIR, { recursive: true });
  const out = openSync(join(STATE_DIR, name + '.log'), 'w');
  const child = spawn(cmd, args, { cwd: ROOT, env, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  return child.pid;
}

async function waitFor(label, probe, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await probe()) return; } catch { /* retry */ }
    await sleep(1000);
  }
  console.error('[preview] timed out waiting for ' + label);
  process.exit(1);
}

function killListener(port) {
  if (!isWin) { spawnSync('sh', ['-c', 'fuser -k ' + port + '/tcp'], { stdio: 'ignore' }); return; }
  const r = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
  const re = new RegExp('\\s(?:127\\.0\\.0\\.1|\\[::1\\]|\\[::\\]|0\\.0\\.0\\.0):' + port + '\\s+\\S+\\s+LISTENING\\s+(\\d+)');
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const m = line.match(re);
    if (m) killTree(Number(m[1]));
  }
}

// Belt and braces: next dev spawns workers, so also stop any node process whose command line points into this checkout's preview.
function killByCommandLine() {
  if (!isWin) return;
  const root = ROOT.replace(/'/g, "''");
  const ps = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*" + root + "*' -and ($_.CommandLine -like '*next*' -or $_.CommandLine -like '*preview-auth-shim*') -and $_.ProcessId -ne " + process.pid + " } | ForEach-Object { $_.ProcessId }";
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  for (const line of (r.stdout || '').split(String.fromCharCode(10))) { const pid = Number(line.trim()); if (pid) killTree(pid); }
}

async function down({ purge } = {}) {
  const state = readState();
  for (const [name, pid] of Object.entries(state.pids || {})) { log('stopping ' + name + ' (pid ' + pid + ')'); killTree(pid); }
  const env = buildPreviewEnv();
  // Leave nothing behind: anything still listening on the preview's own ports is ours.
  for (const port of [Number(env.PREVIEW_WEB_PORT), Number(env.PREVIEW_AUTH_PORT)]) killListener(port);
  killByCommandLine();
  run('docker', ['rm', '-f', CONTAINER], process.env, { stdio: 'ignore' });
  if (purge) run('docker', ['volume', 'rm', '-f', VOLUME], process.env, { stdio: 'ignore' });
  rmSync(STATE_FILE, { force: true });
  log('down complete' + (purge ? ' (volume purged)' : ' (volume ' + VOLUME + ' kept; add --purge to delete)'));
}

async function up() {
  const t0 = Date.now();
  // 1. Guard FIRST, on the environment we are about to hand to children.
  const env = buildPreviewEnv();
  const ports = { db: Number(env.PREVIEW_DB_PORT), auth: Number(env.PREVIEW_AUTH_PORT) };
  const verdict = checkLocalOnly(env, { ports });
  if (!verdict.ok) { console.error(new LocalOnlyGuardError(verdict).message); process.exit(2); }
  const shellVars = ['DATABASE_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'NEXT_PUBLIC_SUPABASE_URL', 'VERCEL', 'VERCEL_ENV'].filter((k) => process.env[k]);
  log('guard OK. ' + (shellVars.length ? 'IGNORING shell vars (names only): ' + shellVars.join(', ') : 'No shell DB vars set') + '. Using the local preview database.');

  // 2. Docker must be running.
  if (run('docker', ['info', '--format', '{{.ServerVersion}}'], process.env).status !== 0) {
    console.error('[preview] Docker is not running. Start Docker Desktop and retry.');
    process.exit(1);
  }
  await down();

  // 3. Throwaway Postgres on loopback with a named volume.
  log('starting Postgres (' + IMAGE + ') on 127.0.0.1:' + ports.db);
  must('docker run', run('docker', ['run', '-d', '--name', CONTAINER, '-p', '127.0.0.1:' + ports.db + ':5432', '-v', VOLUME + ':/var/lib/postgresql/data',
    '-e', 'POSTGRES_PASSWORD=preview_local_only', '-e', 'POSTGRES_DB=wap_preview', '--memory', '768m', IMAGE], process.env));
  const state = { pids: {}, startedAt: new Date().toISOString() };
  writeState(state);
  await waitFor('postgres', () => run('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-d', 'wap_preview'], process.env).status === 0, 60000);
  await sleep(1500); // pg_isready can pass during the init restart

  // 4. Schema. The migration history cannot replay on an empty database (docs/DATABASE-RECOVERY.md:
  //    P3018 on duplicate partner_users, then 42P01 on subgroups), so the local-only bootstrap is
  //    `prisma db push` of schema.prisma, the same baseline the CI database-contract lane uses.
  //    No production migration file is touched. `db push` omits Supabase-only RLS/storage DDL;
  //    the preview connects as the local superuser, so nothing depends on it.
  log('applying schema (prisma db push; migrate deploy cannot replay on an empty DB, see docs/DATABASE-RECOVERY.md)');
  const prisma = join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  must('prisma db push', run(process.execPath, [prisma, 'db', 'push', '--skip-generate', '--accept-data-loss'], env));
  must('prisma generate', run(process.execPath, [prisma, 'generate'], env));

  // 5. Seed (the seed runs the guard again before any write).
  log('seeding fake data');
  const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  must('seed', run(process.execPath, [tsx, 'prisma/seed-demo.ts'], env));

  // 6. Auth shim, then next dev, both on loopback only.
  state.pids.authShim = startDetached('auth-shim', process.execPath, ['scripts/lib/preview-auth-shim.cjs'], env);
  writeState(state);
  await waitFor('auth shim', async () => (await fetch('http://127.0.0.1:' + ports.auth + '/auth/v1/health')).ok, 20000);
  state.pids.web = startDetached('web', process.execPath, [join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-H', 'localhost', '-p', env.PREVIEW_WEB_PORT], env);
  writeState(state);
  // Next 15 dev answers a 308 loop on /en/login when bound to 127.0.0.1, so bind the loopback name `localhost`.
  const web = 'http://localhost:' + env.PREVIEW_WEB_PORT;
  log('waiting for next dev (first compile can take a minute)');
  await waitFor('next dev', async () => (await fetch(web + '/api/health', { redirect: 'manual' })).status === 200, 240000);

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log([
    '',
    '=========================================================',
    ' LOCAL PREVIEW READY in ' + secs + 's  (fake data only)',
    ' ' + web + '/login',
    '   admin    ' + env.PREVIEW_ADMIN_EMAIL + '  /  ' + env.PREVIEW_ADMIN_PASSWORD,
    '   student  ' + env.PREVIEW_STUDENT_EMAIL + '  /  ' + env.PREVIEW_STUDENT_PASSWORD,
    ' Admin attendance: ' + web + '/admin/attendance/draft',
    ' Enrollment ids to paste: see prisma/fixtures/preview-attendance.ts',
    ' Stop: npm run preview:local:down',
    '=========================================================',
  ].join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'down') await down({ purge: process.argv.includes('--purge') });
  else await up();
}
