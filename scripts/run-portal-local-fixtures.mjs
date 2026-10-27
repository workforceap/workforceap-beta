/** Trusted Ubuntu workflow companion. Starts and stops only its own disconnected dev server. */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { assertDispatchContext } from './lib/demo-acceptance-workflow.mjs';
import { identityFromEnvironment } from './lib/demo-acceptance-lifecycle.mjs';
import { canonical } from './lib/demo-acceptance-journal.mjs';
import { verifyLocalFixtureHealth } from './lib/portal-browser-targets.mjs';
import { localFixtureEnvironment, localReceiptDigest } from './lib/demo-acceptance-local.mjs';

const require = createRequire(import.meta.url);
const origin = 'http://127.0.0.1:3107';
const localContractOnly = process.argv.slice(2).length === 1 && process.argv[2] === '--local-contract-only';
const startedAt = new Date().toISOString();
let server, log, exitPromise;
let serverStopped = false;
let result = null;
const childExit = child => new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolveExit({ code, signal })); });
try {
  if (process.argv.length > 2 && !localContractOnly) throw new Error('Unknown local companion option.');
  assertDispatchContext(process.env);
  if (process.env.DEMO_QA_MODE !== 'acceptance' || process.platform !== 'linux') throw new Error('Use the trusted Ubuntu acceptance workflow.');
  const identity = identityFromEnvironment(process.env);
  const input = resolve(process.env.PORTAL_BROWSER_INPUT ?? '');
  const output = resolve(process.env.PORTAL_LOCAL_FIXTURE_OUTPUT ?? '');
  if (!process.env.PORTAL_BROWSER_INPUT || !process.env.PORTAL_LOCAL_FIXTURE_OUTPUT || canonical(JSON.parse(readFileSync(input, 'utf8')).identity) !== canonical(identity)) throw new Error('Exact browser plan and output are required.');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== identity.controlSha || head !== identity.deployedSha || execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim()) throw new Error('Local companion requires a clean exact-source checkout.');
  for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) if (existsSync(file)) throw new Error('Local environment files could introduce undeclared credentials.');
  const reservation = createServer();
  await new Promise((resolveListen, reject) => { reservation.once('error', reject); reservation.listen(3107, '127.0.0.1', resolveListen); });
  await new Promise((resolveClose, reject) => reservation.close(error => error ? reject(error) : resolveClose()));
  mkdirSync(dirname(output), { recursive: true });
  const token = randomBytes(32).toString('hex');
  const childEnv = localFixtureEnvironment(process.env, head, token);
  log = openSync(`${output}.server.log`, 'w', 0o600);
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3107'], { env: childEnv, detached: true, stdio: ['ignore', log, log] });
  exitPromise = childExit(server); void exitPromise.catch(() => {});
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5_000), redirect: 'error' });
      verifyLocalFixtureHealth(identity, origin, { status: response.status, body: await response.text() }); ready = true; break;
    } catch { await delay(500); }
  }
  if (!ready) throw new Error('Task-owned local fixture server did not prove readiness.');
  const browser = spawn(process.execPath, ['scripts/portal-browser-acceptance.mjs', '--local-fixtures-only', '--local-origin', origin, '--input', input, '--output', output], { env: childEnv, stdio: ['ignore', log, log] });
  const browserResult = await childExit(browser);
  result = { kind: 'portal-local-fixture-execution', command: 'node scripts/run-portal-local-fixtures.mjs', identity, controlSha: head,
    localContractOnly,
    sourceTreeClean: true, workflowRunId: process.env.GITHUB_RUN_ID, workflowAttempt: 1, startedAt,
    receiptDigest: localReceiptDigest(readFileSync(output)), browserExitCode: browserResult.code };
  if (browserResult.code !== 0) process.exitCode = 1;
} catch {
  console.error('Local fixture companion failed; no complete browser acceptance is established.');
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    await Promise.race([exitPromise, delay(10_000)]);
    if (server.exitCode === null && server.signalCode === null) { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* Already exited. */ } await exitPromise; }
    serverStopped = server.exitCode !== null || server.signalCode !== null;
  }
  if (log !== undefined) closeSync(log);
  if (result) writeFileSync(`${process.env.PORTAL_LOCAL_FIXTURE_OUTPUT}.execution.json`, `${JSON.stringify({ ...result, serverStopped, status: serverStopped ? 'completed' : 'error', completedAt: new Date().toISOString() }, null, 2)}\n`);
}
