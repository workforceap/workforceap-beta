#!/usr/bin/env node
// Game Lab verification on the GUARDED LOCAL PREVIEW only. Fails (exit 1) on any contract violation.
//
//   npm run preview:local                 # Postgres + auth shim + mail sink + next dev, fake data
//   npm run game-lab:verify               # this script
//   npm run preview:local:down
//
// Phases:
//   1. Setup (writes allowed): real logins, auth/flag matrix for every actor (flag created and removed
//      through the real admin API), effective-role check per role fixture, and a synthetic contact-form
//      send that must reach the local mail sink (proves the app is wired to it).
//   2. Gameplay window (no writes allowed): after the DB settles, both games through the real
//      /admin/game-lab/[game] page and its iframe at 1280x900, 390x844 and 320x640, then the window is
//      closed and judged: zero DB row changes, zero new mail, zero external requests, zero console errors.
//   Cleanup always runs: flag row removed, fixture role restored, browser closed.
//
// Evidence goes to GAME_LAB_EVIDENCE (default .local-preview/game-lab-evidence, gitignored).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { buildPreviewEnv } from '../local-preview.mjs';
import {
  GAME_SLUGS, MATRIX_TARGETS, judgeRow, judgeRole, judgeRequests, judgeConsole, judgeDb, judgeMail,
} from './verdicts.mjs';

const require = createRequire(import.meta.url);
const { assertLocalOnly } = require('../lib/local-only-guard.cjs');
const env = buildPreviewEnv();
assertLocalOnly(env, { ports: { db: Number(env.PREVIEW_DB_PORT), auth: Number(env.PREVIEW_AUTH_PORT), mail: Number(env.PREVIEW_MAIL_PORT) } });
const { chromium } = require('@playwright/test');

const BASE = `http://localhost:${env.PREVIEW_WEB_PORT}`;
const SINK = `http://127.0.0.1:${env.PREVIEW_MAIL_PORT}`;
const OUT = resolve(process.env.GAME_LAB_EVIDENCE || '.local-preview/game-lab-evidence');
mkdirSync(OUT, { recursive: true });
// One run at a time: overlapping runs share the preview DB and corrupt each other's fixtures.
const LOCK = resolve('.local-preview/game-lab-verify.lock');
mkdirSync(resolve('.local-preview'), { recursive: true });
try { writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); } catch { console.error(`another game-lab:verify run holds ${LOCK}; remove it if that run is gone`); process.exit(2); }
const ADMIN = { id: env.PREVIEW_ADMIN_ID, email: env.PREVIEW_ADMIN_EMAIL, password: env.PREVIEW_ADMIN_PASSWORD };
const STUDENT = { id: env.PREVIEW_STUDENT_ID, email: env.PREVIEW_STUDENT_EMAIL, password: env.PREVIEW_STUDENT_PASSWORD };
const OTHER_ROLES = ['counselor', 'employer', 'partner', 'case_manager', 'wap_staff', 'group_leader'];
const VIEWPORTS = [[1280, 900], [390, 844], [320, 640]];
const SAVE_KEYS = ['wap-practice-3d-save-v1', 'wap-practice-3d-security-save-v1', 'packet-quest-v1', 'wap-practice-local-network-v1', 'wap-arcade-v1:settings', 'wap-arcade-v1:last'];
const FLAG = { key: 'admin_game_lab', name: 'Admin Game Lab (local preview)', description: 'Local preview only', enabled: true, rolloutPercentage: 100, allowedRoles: ['admin', 'super_admin'] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function psql(sql) {
  try {
    return execFileSync('docker', ['exec', 'wap-preview-pg', 'psql', '-U', 'postgres', '-d', 'wap_preview', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    throw new Error(`psql failed (${String(error.stderr || error.message).trim().slice(0, 300)}): ${sql.slice(0, 120)}`);
  }
}
const quoteLiteral = (v) => `'${String(v).replace(/'/g, "''")}'`;
if (!/^[0-9a-f-]{36}$/i.test(STUDENT.id)) throw new Error('preview student id is not a uuid');

const report = { base: BASE, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), startedAt: new Date().toISOString(), matrix: [], checks: [], failures: [] };
const fail = (where, list) => { for (const f of list) report.failures.push(`${where}: ${f}`); };
const check = (name, ok, detail = {}) => { report.checks.push({ name, ok, ...detail }); if (!ok) report.failures.push(`${name}: ${JSON.stringify(detail)}`); console.log(ok ? 'PASS' : 'FAIL', name); };

/** Exact row count + newest-row-version watermark per public table (any insert or update moves xmin). */
function dbSnapshot() {
  const tables = psql("select string_agg(quote_ident(tablename), ',' order by tablename) from pg_tables where schemaname='public'").split(',').filter(Boolean);
  const parts = tables.map((t) => `select ${quoteLiteral(t)} as t, count(*) as n, coalesce(max(xmin::text::bigint), 0) as x from public.${t}`);
  const rows = psql(`select json_object_agg(t, json_build_object('rows', n, 'lastXmin', x::text)) from (${parts.join(' union all ')}) s`);
  return JSON.parse(rows);
}
async function settledDb() {
  let prev = dbSnapshot();
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const next = dbSnapshot();
    if (judgeDb(prev, next).length === 0) return next;
    prev = next;
  }
  throw new Error('database did not settle after setup');
}
async function sink(method = 'GET') {
  try {
    const r = await fetch(`${SINK}/__sink/messages`, { method });
    const j = await r.json();
    return { reachable: r.ok, total: j.total, unexpected: j.unexpected ?? [], subjects: (j.messages ?? []).map((m) => m.subject) };
  } catch {
    return { reachable: false };
  }
}

const external = [];
const consoleEvents = [];
let browser;
async function newContext(opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', ...opts });
  // Nothing leaves the machine: external requests are recorded (they fail the run) and aborted.
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (judgeRequests([url], BASE).length === 0) return route.continue();
    external.push({ url, frame: route.request().frame()?.url() ?? '' });
    return route.abort();
  });
  ctx.on('page', (p) => watch(p));
  return ctx;
}
function watch(p) {
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleEvents.push({ type: m.type(), text: m.text().slice(0, 300), page: p.url(), source: m.location()?.url ?? '' }); });
  p.on('pageerror', (e) => consoleEvents.push({ type: 'pageerror', text: String(e).slice(0, 300), page: p.url() }));
}
async function login(who, opts = {}) {
  const ctx = await newContext(opts);
  const p = await ctx.newPage();
  await p.goto('/login', { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: /decline/i }).click({ timeout: 3000 }).catch(() => {});
  await p.locator('#email').fill(who.email);
  await p.locator('#password').fill(who.password);
  await p.getByRole('button', { name: /sign in/i }).click();
  await p.waitForURL((u) => !/\/login([?#/]|$)/.test(u.pathname + u.search), { timeout: 180000 });
  await p.close();
  return ctx;
}
async function probe(request, target) {
  const res = await request.get(BASE + target.path, { maxRedirects: 0, failOnStatusCode: false });
  const h = res.headers();
  return { status: res.status(), location: h.location ?? '', contentType: h['content-type'] ?? '', cacheControl: h['cache-control'] ?? '', vary: h.vary ?? '', body: await res.text() };
}
async function matrix(actorLabel, actor, request) {
  for (const target of MATRIX_TARGETS) {
    const observed = await probe(request, target);
    const failures = judgeRow(actor, target, observed);
    const { body, ...row } = observed;
    report.matrix.push({ actor: actorLabel, target: target.name, ...row, bodyBytes: body.length, failures });
    fail(`matrix ${actorLabel} / ${target.name}`, failures);
  }
}
async function effectiveRole(ctx) {
  const r = await ctx.request.get(`${BASE}/api/auth/me`, { failOnStatusCode: false });
  return (await r.json().catch(() => ({}))).role;
}
const deleteFlag = () => psql("delete from feature_flags where key='admin_game_lab'");

// ---------- game drivers (ordinary clicks/keys only; no force, no dispatchEvent) ----------
const gameReq = (u) => /\/api\/admin\/game-lab\/|three\.module/.test(u);
let activePage = null;
async function launch(p, slug) {
  activePage = p;
  // next dev hydrates late: a click before hydration is a no-op, so retry the ordinary click until the dialog opens.
  for (let attempt = 0; attempt < 6; attempt++) {
    await p.getByTestId('game-lab-launch').click();
    if (await p.getByTestId('game-lab-frame').waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)) break;
  }
  await p.getByTestId('game-lab-frame').waitFor({ state: 'visible' });
  const deadline = Date.now() + 60000;
  for (;;) {
    const f = p.frames().find((fr) => fr.url().includes(`/api/admin/game-lab/${slug}/index.html`));
    if (f && (await f.evaluate((s) => {
      if (s.endsWith('-3d')) return !!window[s === 'packet-quest-3d' ? '__pq' : '__fd'];
      if (s === 'packet-quest') return !!document.getElementById('overlayTitle');
      if (s === 'network-path') return !!window.WapPractice;
      return !!document.getElementById('games');
    }, slug).catch(() => false))) return f;
    if (Date.now() > deadline) throw new Error(`${slug} frame did not become ready after Launch (frames: ${p.frames().map((fr) => fr.url()).join(', ')})`);
    await sleep(250);
  }
}
async function exit(p) {
  await p.getByTestId('game-lab-exit').click();
  await p.waitForURL('**/admin/game-lab');
  return p.locator('iframe').count();
}
async function pqStage(f, stage) {
  await f.locator('#repair').click();
  for (const n of stage === 0 ? ['switch'] : stage === 1 ? ['dns'] : ['router', 'server']) await f.locator(`[data-node="${n}"]`).click();
  await f.locator('#repair').click();
  if (stage === 1) {
    await f.locator('[data-purpose="dns"]').click();
    for (const n of ['client', 'switch', 'dns']) await f.locator(`[data-node="${n}"]`).click();
    await f.locator('#launch').click();
    await f.waitForFunction(() => window.__pq.state.resolved && !window.__pq.busy, null, { timeout: 120000 });
  }
  await f.locator('[data-purpose="page"]').click();
  for (const n of stage === 0 ? ['client', 'switch', 'server'] : ['client', 'switch', 'router', 'server']) await f.locator(`[data-node="${n}"]`).click();
  await f.locator('#launch').click();
  await f.waitForFunction(() => window.__pq.state.status === 'win', null, { timeout: 120000 });
}
async function fdStage(f, { keys = false } = {}) {
  for (let n = 0; n < 40; n++) {
    await f.waitForFunction(() => window.__fd.state.items.length > 0 || window.__fd.state.status !== 'play', null, { timeout: 120000 });
    const act = await f.evaluate(() => { const g = window.__fd; if (g.state.status !== 'play') return null; return (g.state.items.find((i) => i.id === g.selectedId) || g.state.items[0]).correct; });
    if (!act) break;
    if (keys) await f.locator('body').press(act === 'allow' ? 'KeyA' : act === 'block' ? 'KeyB' : 'KeyR');
    else await f.locator(`#act-${act}`).click();
  }
  await f.waitForFunction(() => window.__fd.state.status === 'win', null, { timeout: 120000 });
}
async function pq2dWin(f) {
  await f.locator('#s0').click();
  await f.locator('#repair').click();
  await f.locator('#switch').click();
  await f.locator('#repair').click();
  await f.locator('#client').click();
  await f.locator('#switch').click();
  await f.locator('#server').click();
  await f.locator('#launch').click();
  await f.waitForFunction(() => document.getElementById('overlayTitle').textContent === 'STAGE CLEAR', null, { timeout: 30000 });
}
async function networkWin(f) {
  const steps = await f.evaluate(() => {
    const P = window.WapPractice;
    const work = P.perfectWork('A');
    return {
      dns: work.dnsPath.map((id) => 'Add ' + P.NODES[id]),
      app: work.appPath.map((id) => 'Add ' + P.NODES[id]),
      roles: P.ROLE_SUBJECTS.map((s) => ({ select: 'role-' + s.id, value: work.roles[s.id] })),
      diagnosis: work.diagnosis,
      evidence: P.EVIDENCE.A.map((row) => row.id),
      actions: P.ACTIONS.filter((a) => work.actions[a.id]).map((a) => a.label),
      verifications: Object.keys(work.verifications).filter((k) => work.verifications[k]),
      prose: work.prose,
    };
  });
  for (const label of steps.dns) await f.getByRole('button', { name: label, exact: true }).nth(0).click();
  for (const label of steps.app) await f.getByRole('button', { name: label, exact: true }).nth(1).click();
  for (const role of steps.roles) await f.locator('#' + role.select).selectOption(role.value);
  await f.locator('#dns-separate').check();
  for (const id of steps.evidence) await f.getByRole('button', { name: new RegExp(id) }).click();
  await f.locator('#diagnosis').selectOption(steps.diagnosis);
  for (const label of steps.actions) await f.getByRole('button', { name: label, exact: true }).click();
  for (const id of steps.verifications) await f.locator('#verify-' + id).check();
  await f.locator('#prose-rationale').fill(steps.prose.rationale);
  await f.locator('#prose-limits').fill(steps.prose.limits);
  await f.locator('#prose-customer').fill(steps.prose.customer);
  await f.locator('#submit').click();
  await f.waitForFunction(() => /10 \/ 10/.test(document.getElementById('score').textContent) && /Automated checks passed/.test(document.getElementById('score').textContent), null, { timeout: 15000 });
}
async function arcadeLevelWin(f, gameId) {
  await f.goto('/api/admin/game-lab/practice-arcade/play.html?game=' + gameId);
  await f.waitForFunction(() => window.__arcade && (window.__arcade.ready || window.__arcade.error), null, { timeout: 60000 });
  const failed = await f.evaluate(() => window.__arcade.error);
  if (failed) throw new Error(gameId + ' failed to load: ' + failed);
  const levelId = await f.evaluate(() => window.__arcade.levelIds()[0]);
  await f.evaluate((id) => window.__arcade.startLevel(id), levelId);
  await f.waitForFunction(() => window.__arcade.screen() === 'coach', null, { timeout: 10000 });
  await f.evaluate(() => window.__arcade.begin());
  const deadline = Date.now() + 120000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(gameId + ' did not reach results');
    const screen = await f.evaluate(() => window.__arcade.screen());
    if (screen === 'results') break;
    if (screen === 'feedback') { await f.evaluate(() => window.__arcade.dismiss()); await sleep(50); continue; }
    const hint = await f.evaluate(() => window.__arcade.hint());
    if (hint == null) { await sleep(100); continue; }
    await f.evaluate((id) => window.__arcade.choose(id), hint);
    await sleep(30);
  }
  const result = await f.evaluate(() => window.__arcade.result());
  if (!result || result.won !== true) throw new Error(gameId + ' finished without a win: ' + JSON.stringify(result));
  return result;
}
async function pauseResume(f, label) {
  await f.locator('#pause').click();
  await f.locator('#pauseScreen').waitFor({ state: 'visible' });
  await f.locator('#resume').click({ timeout: 5000 });
  const hidden = await f.locator('#pauseScreen').isHidden();
  check(`${label}: pause -> resume with ordinary clicks`, hidden);
}

// ---------- run ----------
try {
  // Chrome's normal Windows WebGL backend (D3D11). Headless otherwise picks ANGLE's OpenGL backend, whose
  // driver debug callback logs host-GPU performance notes as console warnings. Override with GAME_LAB_ANGLE.
  const angle = process.env.GAME_LAB_ANGLE || (process.platform === 'win32' ? 'd3d11' : '');
  browser = await chromium.launch({ headless: true, args: angle ? [`--use-angle=${angle}`] : [], ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });

  // Phase 1: setup. Writes are expected here and are not judged.
  deleteFlag();
  const anon = await newContext();
  const admin = await login(ADMIN);
  const student = await login(STUDENT);
  check('admin fixture effective role is admin', (await effectiveRole(admin)) === 'admin');
  await matrix('anonymous', { kind: 'anonymous' }, anon.request);
  await matrix('student (flag absent)', { kind: 'non-admin' }, student.request);
  await matrix('admin (flag absent)', { kind: 'admin-off' }, admin.request);
  const created = await admin.request.post(`${BASE}/api/admin/feature-flags`, { data: { ...FLAG, enabled: false }, failOnStatusCode: false });
  check('flag row created OFF through the real admin API', created.ok(), { status: created.status() });
  await matrix('admin (flag row OFF)', { kind: 'admin-off' }, admin.request);
  psql("update feature_flags set enabled = true where key='admin_game_lab'");
  await matrix('admin (flag ON)', { kind: 'admin-on' }, admin.request);
  await matrix('anonymous after admin warm-up', { kind: 'anonymous' }, anon.request);
  await matrix('student (flag ON)', { kind: 'non-admin' }, student.request);
  const originalRole = psql(`select role from profiles where user_id=${quoteLiteral(STUDENT.id)}`);
  try {
    for (const role of OTHER_ROLES) {
      psql(`update profiles set role=${quoteLiteral(role)} where user_id=${quoteLiteral(STUDENT.id)}`);
      const ctx = await login(STUDENT);
      const reported = await effectiveRole(ctx);
      fail(`role fixture ${role}`, judgeRole(role, reported));
      report.matrix.push({ actor: `role=${role}`, target: '/api/auth/me', status: 200, effectiveRole: reported, failures: judgeRole(role, reported) });
      await matrix(`role=${role} (flag ON)`, { kind: 'non-admin' }, ctx.request);
      await ctx.close();
    }
  } finally {
    psql(`update profiles set role=${quoteLiteral(originalRole)} where user_id=${quoteLiteral(STUDENT.id)}`);
  }
  check('student fixture role restored', psql(`select role from profiles where user_id=${quoteLiteral(STUDENT.id)}`) === originalRole);

  // Mail wiring control: a real app send must land in the local sink.
  await sink('DELETE');
  const contact = await anon.request.post(`${BASE}/api/contact`, { data: { first_name: 'Preview', last_name: 'Control', email: 'preview-control@example.test', topic: 'Game Lab mail-sink control', message: 'Local preview control message.', submission_id: randomUUID() }, failOnStatusCode: false });
  let control = await sink();
  for (let i = 0; i < 10 && control.reachable && !(control.total >= 1); i++) { await sleep(1000); control = await sink(); }
  report.mailControl = { contactStatus: contact.status(), ...control };
  const studentState = await student.storageState();
  const adminState = await admin.storageState();
  await Promise.all([anon.close(), admin.close(), student.close()]);

  // Phase 2: gameplay window. From here on nothing may write, send or leave the machine.
  const dbBefore = await settledDb();
  const mailBefore = await sink();
  report.window = { openedAt: new Date().toISOString() };
  external.length = 0;
  consoleEvents.length = 0;

  for (const [width, height] of VIEWPORTS) {
    const label = `${width}x${height}`;
    const ctx = await newContext({ storageState: adminState, viewport: { width, height } });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    const requests = [];
    p.on('request', (r) => requests.push(r.url()));

    requests.length = 0;
    await p.goto('/admin/overview', { waitUntil: 'networkidle' });
    check(`${label}: normal admin page shows the nav item and loads no game or engine`, (await p.locator('a[href="/admin/game-lab"]').count()) >= 1 && !requests.some(gameReq));

    requests.length = 0;
    await p.goto('/admin/game-lab', { waitUntil: 'networkidle' });
    const launcherOk = (await p.getByTestId('game-lab-prerelease-badge').isVisible()) && (await p.getByTestId('game-lab-disclaimer').isVisible()) && (await p.locator('[data-testid^="game-card-"]').count()) === GAME_SLUGS.length;
    check(`${label}: launcher renders badge, disclaimer and five cards without loading a game`, launcherOk && !requests.some(gameReq));
    await p.screenshot({ path: join(OUT, `launcher-${width}.png`), fullPage: true });

    for (const slug of GAME_SLUGS) {
      requests.length = 0;
      await p.goto(`/admin/game-lab/${slug}`, { waitUntil: 'networkidle' });
      check(`${label}: ${slug} play page loads nothing before Launch`, (await p.locator('iframe').count()) === 0 && !requests.some(gameReq));
      const f = await launch(p, slug);
      check(`${label}: ${slug} engine loads only after Launch`, slug.endsWith('-3d') ? requests.filter((u) => /three\.module/.test(u)).length === 1 : !requests.some((u) => /three\.module/.test(u)));
      const geo = await p.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
        const d = document.querySelector('dialog[open]');
        const title = d?.querySelector('h2');
        const frame = d?.querySelector('iframe');
        const exitBtn = d?.querySelector('[data-testid="game-lab-exit"]');
        const top = exitBtn ? document.elementFromPoint((box(exitBtn).left + box(exitBtn).right) / 2, (box(exitBtn).top + box(exitBtn).bottom) / 2) : null;
        return { modal: !!d && d.matches(':modal'), title: title && box(title), titleClipped: title ? title.scrollHeight > title.clientHeight + 1 : true, frame: frame && box(frame), exitOnTop: !!top && exitBtn.contains(top), vw: innerWidth, vh: innerHeight };
      });
      check(`${label}: ${slug} player is a top-layer modal: title, Exit and frame inside the viewport, nothing on top`,
        geo.modal && geo.exitOnTop && !geo.titleClipped && geo.title.top >= 0 && geo.frame.top >= geo.title.bottom - 1 && geo.frame.left <= 1 && Math.abs(geo.frame.right - geo.vw) < 2 && Math.abs(geo.frame.bottom - geo.vh) < 2, geo);

      if (slug === 'packet-quest-3d') {
        await f.locator('#s0').click();
        await pauseResume(f, `${label} ${slug}`);
        await pqStage(f, 0);
        await f.locator('#eRetry').click();
        check(`${label}: ${slug} end-screen Retry restarts the stage`, (await f.evaluate(() => window.__pq.state.status)) === 'play');
        if (width === 390) {
          await f.locator('#menu').click();
          await f.locator('#s0').click();
          for (let st = 0; st < 3; st++) { await pqStage(f, st); if (st < 2) await f.locator('#eNext').click(); }
          check(`${label}: ${slug} all 3 stages completed in the integrated frame`, JSON.stringify(await f.evaluate(() => window.__pq.save.best)) === '[3,3,3]');
          await f.locator('#eMenu').click();
        }
        if (width === 1280) {
          await f.locator('#retry').click();
          for (const n of ['client', 'server', 'server', 'server']) await f.locator(`[data-node="${n}"]`).click();
          await f.locator('#end').waitFor({ state: 'visible' });
          const lost = await f.evaluate(() => window.__pq.state.status);
          await f.locator('#eRetry').click();
          check(`${label}: ${slug} wrong hops lose, Retry restores lives`, lost === 'lose' && (await f.evaluate(() => window.__pq.state.hp)) === 3);
          for (const k of ['ArrowRight', 'KeyW', 'Enter', 'KeyW', 'ArrowLeft', 'Enter', 'ArrowRight', 'Enter', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter', 'KeyL']) await f.locator('body').press(k);
          await f.waitForFunction(() => window.__pq.state.status === 'win', null, { timeout: 120000 });
          check(`${label}: ${slug} keyboard-only stage 1 win`, true);
          await f.locator('#eMenu').click();
        }
      } else if (slug === 'firewall-defender-3d') {
        await f.locator('#s2').click();
        await pauseResume(f, `${label} ${slug} (Phish Filter)`);
        await fdStage(f);
        await f.locator('#eRetry').click();
        check(`${label}: ${slug} end-screen Retry restarts the stage`, (await f.evaluate(() => window.__fd.state.status)) === 'play');
        if (width === 390) {
          await f.locator('#menu').click();
          await f.locator('#s0').click();
          for (let st = 0; st < 4; st++) { await fdStage(f); if (st < 3) await f.locator('#eNext').click(); }
          check(`${label}: ${slug} all 4 stages completed in the integrated frame`, JSON.stringify(await f.evaluate(() => window.__fd.save.best)) === '[3,3,3,3]');
          await f.locator('#eMenu').click();
        }
        if (width === 1280) {
          await f.locator('#retry').click();
          const lost = await f.evaluate(() => { for (let i = 0; i < 1500 && window.__fd.state.status === 'play'; i++) window.__fd.step(0.1); return window.__fd.state.status; });
          await f.locator('#eRetry').click();
          check(`${label}: ${slug} timeouts lose, Retry restores lives`, lost === 'lose' && (await f.evaluate(() => window.__fd.state.hp)) === 3);
          await f.locator('#menu').click();
          await f.locator('#s0').click();
          await fdStage(f, { keys: true });
          check(`${label}: ${slug} keyboard-only stage 1 win`, true);
          await f.locator('#eMenu').click();
        }
      } else if (slug === 'packet-quest') {
        await pq2dWin(f);
        check(`${label}: ${slug} stage 1 cleared`, true);
      } else if (slug === 'network-path') {
        await networkWin(f);
        check(`${label}: ${slug} submitted attempt passes 10/10`, true);
      } else if (slug === 'practice-arcade') {
        const hubGames = await f.locator('a[href*="play.html?game="]').count();
        check(`${label}: ${slug} hub lists the program games`, hubGames >= 20);
        const played = [];
        for (const gameId of ['digital-literacy-empowerment-class', 'comptia-security-professional-certificate', 'data-analytics-professional-certificate-google', 'demo-sort']) {
          const result = await arcadeLevelWin(f, gameId);
          played.push({ gameId, stars: result.stars });
        }
        check(`${label}: ${slug} one level of three program games and one demo won`, played.length === 4 && played.every((row) => row.stars >= 1), { played });
        await f.goto('/api/admin/game-lab/practice-arcade/index.html');
      }
      await p.screenshot({ path: join(OUT, `game-${slug}-${width}.png`) });
      check(`${label}: ${slug} Exit unmounts the frame`, (await exit(p)) === 0);
    }

    await p.evaluate((keys) => { for (const k of keys) localStorage.setItem(k, '{}'); localStorage.setItem('wap-arcade-v1:demo-sort', '{}'); localStorage.setItem('unrelated-key', 'keep'); }, SAVE_KEYS);
    await p.getByTestId('game-lab-reset').click();
    const ls = await p.evaluate((keys) => [...keys.map((k) => localStorage.getItem(k)), localStorage.getItem('wap-arcade-v1:demo-sort'), localStorage.getItem('unrelated-key')], SAVE_KEYS);
    check(`${label}: reset clears the game-lab save keys and leaves other keys`, JSON.stringify(ls) === '[null,null,null,null,null,null,null,"keep"]', { ls });
    await ctx.close();

    const sctx = await newContext({ storageState: studentState, viewport: { width, height } });
    const sp = await sctx.newPage();
    const sreq = [];
    sp.on('request', (r) => sreq.push(r.url()));
    await sp.goto('/admin/game-lab', { waitUntil: 'load' });
    const denied = !new URL(sp.url()).pathname.startsWith('/admin') && (await sp.getByTestId('game-lab-prerelease-badge').count()) === 0 && !sreq.some(gameReq);
    await sp.screenshot({ path: join(OUT, `denied-${width}.png`) });
    await sctx.close();
    check(`${label}: student is turned away with no game content or engine`, denied, { landed: sp.url() });
  }

  // Reduced motion and WebGL-off fallback, through the integrated page at 1280.
  {
    const ctx = await newContext({ storageState: adminState, viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto('/admin/game-lab/packet-quest-3d');
    let f = await launch(p, 'packet-quest-3d');
    await f.locator('#s0').click();
    const cam0 = await f.evaluate(() => window.__pq.scene.cameraPos());
    await sleep(300);
    const cam1 = await f.evaluate(() => window.__pq.scene.cameraPos());
    await f.locator('#repair').click(); await f.locator('[data-node="switch"]').click(); await f.locator('#repair').click();
    for (const n of ['client', 'switch', 'server']) await f.locator(`[data-node="${n}"]`).click();
    await f.locator('#launch').click();
    await sleep(80); // one frame, as in the source prototype's check: instant settle, not an animation
    const rm = await f.evaluate(() => ({ sparks: window.__pq.scene.sparksVisible, trail: window.__pq.scene.trailVisible, animating: window.__pq.scene.animating }));
    check('reduced motion: Packet Quest camera still and launch settles instantly', Math.hypot(...cam1.map((v, i) => v - cam0[i])) < 1e-4 && !rm.sparks && !rm.trail && !rm.animating, rm);
    await exit(p);
    await p.goto('/admin/game-lab/firewall-defender-3d');
    f = await launch(p, 'firewall-defender-3d');
    await f.locator('#s0').click();
    await f.waitForFunction(() => window.__fd.state.items.length >= 1, null, { timeout: 120000 });
    const wrong = await f.evaluate(() => { const g = window.__fd; const it = g.state.items.find((x) => x.id === g.selectedId) || g.state.items[0]; return it.correct === 'allow' ? 'block' : 'allow'; });
    await f.locator(`#act-${wrong}`).click();
    const fdRm = await f.evaluate(() => ({ reduced: window.__fd.reduced, shake: window.__fd.scene.shakeLevel, particles: window.__fd.scene.burstParticleCount, markers: window.__fd.scene.wrongMarkerCount }));
    check('reduced motion: Firewall Defender wrong call shows a marker with no shake or particles', fdRm.reduced && fdRm.shake === 0 && fdRm.particles === 0 && fdRm.markers >= 1, fdRm);
    await exit(p);
    await ctx.close();
  }
  {
    const ctx = await newContext({ storageState: adminState, viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const p = await ctx.newPage();
    await p.evaluate((keys) => { for (const k of keys) localStorage.removeItem(k); }, SAVE_KEYS).catch(() => {});
    await p.goto('/admin/game-lab/packet-quest-3d');
    let f = await launch(p, 'packet-quest-3d');
    await f.evaluate((k) => localStorage.removeItem(k), SAVE_KEYS[0]);
    await f.locator('#s0').click();
    for (let st = 0; st < 3; st++) { await pqStage(f, st); if (st < 2) await f.locator('#eNext').click(); }
    const pqFb = await f.evaluate(() => ({ glOk: window.__pq.glOk, textMode: window.__pq.textMode, notice: !document.getElementById('glNotice').hidden }));
    check('WebGL off: Packet Quest falls back to text mode and all 3 stages are winnable', !pqFb.glOk && pqFb.textMode && pqFb.notice, pqFb);
    await exit(p);
    await p.goto('/admin/game-lab/firewall-defender-3d');
    f = await launch(p, 'firewall-defender-3d');
    await f.locator('#s0').click();
    for (let st = 0; st < 4; st++) { await fdStage(f); if (st < 3) await f.locator('#eNext').click(); }
    const fdFb = await f.evaluate(() => ({ glOk: window.__fd.glOk, textMode: window.__fd.textMode, notice: !document.getElementById('glNotice').hidden }));
    check('WebGL off: Firewall Defender falls back to text mode and all 4 stages are winnable', !fdFb.glOk && fdFb.textMode && fdFb.notice, fdFb);
    await exit(p);
    await ctx.close();
  }

  // Close and judge the window.
  await sleep(3000);
  const dbAfter = dbSnapshot();
  const mailAfter = await sink();
  report.window.closedAt = new Date().toISOString();
  report.db = { tables: Object.keys(dbBefore).length, changes: judgeDb(dbBefore, dbAfter) };
  report.mail = { before: mailBefore, after: mailAfter };
  report.external = external;
  report.console = consoleEvents;
  check('gameplay window: zero DB row inserts, updates or deletes', report.db.changes.length === 0, { changes: report.db.changes });
  const mailFailures = judgeMail({ control: { reachable: control.reachable, captured: control.total }, before: mailBefore, after: mailAfter });
  check('mail: control send captured by the local sink, zero messages during gameplay', mailFailures.length === 0, { mailFailures, control: report.mailControl });
  check('zero external requests (any frame)', external.length === 0, { external: judgeRequests(external.map((e) => e.url), BASE) });
  check('zero console errors or warnings (any frame)', consoleEvents.length === 0, { console: judgeConsole(consoleEvents) });
} catch (error) {
  report.failures.push(`aborted: ${error?.stack ?? error}`);
  if (activePage) await activePage.screenshot({ path: join(OUT, 'aborted.png') }).catch(() => {});
} finally {
  try { deleteFlag(); report.cleanupFlagRows = psql("select count(*) from feature_flags where key='admin_game_lab'"); } catch (e) { report.failures.push(`cleanup: ${e.message}`); }
  if (browser) await browser.close();
  rmSync(LOCK, { force: true });
  report.finishedAt = new Date().toISOString();
  report.result = report.failures.length === 0 ? 'PASS' : 'FAIL';
  writeFileSync(join(OUT, 'verify-results.json'), JSON.stringify(report, null, 2));
  const md = ['| actor | target | status | location | cache-control | vary | failures |', '|---|---|---|---|---|---|---|'];
  for (const r of report.matrix) md.push(`| ${r.actor} | ${r.target} | ${r.status} | ${r.location ?? ''} | ${r.cacheControl ?? ''} | ${r.vary ?? ''} | ${(r.failures ?? []).join('; ')} |`);
  writeFileSync(join(OUT, 'auth-matrix.md'), md.join('\n'));
  console.log(`\n${report.result}: ${report.checks.filter((c) => c.ok).length}/${report.checks.length} checks, ${report.matrix.length} matrix rows, ${report.failures.length} failure(s). Evidence: ${OUT}`);
  for (const f of report.failures) console.log('  -', f.slice(0, 400));
  process.exitCode = report.failures.length === 0 ? 0 : 1;
}
