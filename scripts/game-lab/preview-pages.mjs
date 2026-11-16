// Page-level Game Lab checks on the guarded local preview (localhost:3100): launcher, Launch/Exit, reset, nav,
// engine-not-loaded-on-normal-pages, console/external-request guards, screenshots, DB write delta, mail sink.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:3100';
const OUT = 'E:/Hermes/reports/wap-game-lab-integration/evidence/pages';
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)('@playwright/test');
const psql = (s) => execFileSync('docker', ['exec', 'wap-preview-pg', 'psql', '-U', 'postgres', '-d', 'wap_preview', '-At', '-c', s], { encoding: 'utf8' }).trim();
const snapshot = () => psql("select string_agg(relname||'='||n_tup_ins||'/'||n_tup_upd||'/'||n_tup_del, ';' order by relname) from pg_stat_user_tables");
const mail = async () => { try { return (await (await fetch('http://localhost:8025/api/v2/messages')).json()).total; } catch { return 'sink-unreachable'; } };
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const result = { checks: [] };
const ok = (n, d = {}) => { result.checks.push({ n, ...d }); console.log('PASS', n, JSON.stringify(d)); };
const errors = [], external = [], siteWide = [], reqs = [];
// Pre-existing root-layout third parties (analytics, speed insights) and a Next advisory; identical on /admin/overview.
const SITE_WIDE_NOISE = /google-analytics\.com|vercel-scripts\.com|ERR_NAME_NOT_RESOLVED|scroll-behavior: smooth/;
const guard = (p) => {
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`${new URL(p.url()).pathname} :: ${m.text().slice(0, 90)} :: ${m.location().url}`); });
  p.on('pageerror', (e) => errors.push(`${new URL(p.url()).pathname} :: ${String(e)}`));
  p.on('requestfailed', (r) => errors.push(`${new URL(p.url()).pathname} :: REQFAILED ${r.url()}`));
  p.on('request', (r) => {
    reqs.push(r.url());
    if (r.url().startsWith(BASE) || /^(data|blob):/.test(r.url())) return;
    const inGameFrame = r.frame()?.url().includes('/api/admin/game-lab/');
    (inGameFrame ? external : siteWide).push(r.url());
  });
};
async function login(ctx, email, pw) {
  const p = await ctx.newPage();
  await p.goto('/login');
  await p.getByRole('button', { name: /decline/i }).click().catch(() => {});
  await p.locator('#email').fill(email);
  await p.locator('#password').fill(pw);
  await p.getByRole('button', { name: /sign in/i }).click();
  await p.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 });
  await p.close();
}
const gameReq = (u) => /api\/admin\/game-lab|three\.module/.test(u);
const sizes = [['1280', { width: 1280, height: 900 }], ['390', { width: 390, height: 844 }], ['320', { width: 320, height: 640 }]];
try {
  psql("delete from feature_flags where key='admin_game_lab'");
  const adminCtx0 = await b.newContext({ baseURL: BASE });
  await login(adminCtx0, 'preview-admin@example.test', 'Preview-Admin-1!');
  const mk = await adminCtx0.request.post(BASE + '/api/admin/feature-flags', { data: { key: 'admin_game_lab', name: 'Admin Game Lab (local preview)', description: 'Local preview only', enabled: true, rolloutPercentage: 100, allowedRoles: ['admin', 'super_admin'] } });
  assert.equal(mk.status(), 200);
  const state = await adminCtx0.storageState();
  await adminCtx0.close();
  const cs = await b.newContext({ baseURL: BASE });
  await login(cs, 'preview-student@example.test', 'Preview-Student-1!');
  const studentState = await cs.storageState();
  await cs.close();
  const before = snapshot();
  const mailBefore = await mail();

  for (const [label, vp] of sizes) {
    const ctx = await b.newContext({ baseURL: BASE, viewport: vp, storageState: state });
    const p = await ctx.newPage();
    guard(p);
    reqs.length = 0;
    await p.goto('/admin/overview', { waitUntil: 'networkidle' });
    const navLink = await p.locator('a[href="/admin/game-lab"]').count();
    assert(navLink >= 1, 'nav item missing with flag ON');
    assert(!reqs.some(gameReq), 'engine/game asset loaded on normal page');
    ok(`${label}: normal admin page has nav item and loads no engine`, { navLink, gameRequests: 0 });

    reqs.length = 0;
    await p.goto('/admin/game-lab', { waitUntil: 'networkidle' });
    assert(await p.getByTestId('game-lab-prerelease-badge').isVisible());
    assert(await p.getByTestId('game-lab-disclaimer').isVisible());
    assert.equal(await p.locator('[data-testid^="game-card-"]').count(), 2);
    assert(!reqs.some(gameReq), 'launcher loaded engine');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await p.screenshot({ path: `${OUT}/launcher-${label}.png`, fullPage: true });
    ok(`${label}: launcher`, { cards: 2, horizontalOverflowPx: over, engineRequests: 0 });

    for (const slug of ['packet-quest-3d', 'firewall-defender-3d']) {
      reqs.length = 0;
      await p.goto(`/admin/game-lab/${slug}`, { waitUntil: 'networkidle' });
      assert(await p.getByTestId('game-lab-idle').isVisible());
      assert.equal(await p.locator('iframe').count(), 0);
      assert(!reqs.some(gameReq), 'play page loaded engine before Launch');
      await p.getByTestId('game-lab-launch').click();
      await p.frameLocator('[data-testid="game-lab-frame"]').locator('canvas').first().waitFor({ timeout: 30000 });
      await p.waitForTimeout(1500);
      const frame = p.frames().find((f) => f.url().includes('/api/admin/game-lab/'));
      assert(frame, 'iframe frame not found');
      const gl = await frame.evaluate(() => ({ pq: !!window.__pq, fd: !!window.__fd, glOk: (window.__pq || window.__fd).glOk }));
      await p.screenshot({ path: `${OUT}/game-${slug}-${label}.png` });
      const engine = reqs.filter((u) => /three\.module/.test(u)).length;
      await p.getByTestId('game-lab-exit').click();
      await p.waitForURL('**/admin/game-lab');
      assert.equal(await p.locator('iframe').count(), 0);
      ok(`${label}: ${slug} launch->play->exit`, { ...gl, engineRequestsAfterLaunch: engine });
    }

    await p.evaluate(() => {
      localStorage.setItem('wap-practice-3d-save-v1', '{}');
      localStorage.setItem('wap-practice-3d-security-save-v1', '{}');
      localStorage.setItem('unrelated-key', 'keep');
    });
    await p.reload({ waitUntil: 'networkidle' });
    await p.getByTestId('game-lab-reset').click();
    const ls = await p.evaluate(() => ({ a: localStorage.getItem('wap-practice-3d-save-v1'), b: localStorage.getItem('wap-practice-3d-security-save-v1'), c: localStorage.getItem('unrelated-key') }));
    assert.deepEqual(ls, { a: null, b: null, c: 'keep' });
    ok(`${label}: reset clears only the two save keys`, ls);

    const sctx = await b.newContext({ baseURL: BASE, viewport: vp, storageState: studentState });
    const sp = await sctx.newPage();
    guard(sp);
    const resp = await sp.goto('/admin/game-lab', { waitUntil: 'networkidle' });
    await sp.screenshot({ path: `${OUT}/denied-${label}.png` });
    const leak = await sp.getByTestId('game-lab-prerelease-badge').count();
    assert.equal(leak, 0);
    ok(`${label}: denied view (student)`, { status: resp.status(), leak });
    await sctx.close();
    await ctx.close();
  }
  const unexpected = errors.filter((e) => !SITE_WIDE_NOISE.test(e));
  const noise = errors.length - unexpected.length;
  assert.equal(unexpected.length, 0, 'unexpected console errors: ' + [...new Set(unexpected)].join(' | '));
  ok('zero unexpected console errors/warnings', { unexpected: 0, siteWideNoiseEvents: noise, noiseHosts: [...new Set(siteWide.map((u) => new URL(u).host))] });
  assert.equal(external.length, 0, 'external from game frame: ' + external.join(','));
  ok('zero external requests from the game frames', { external: 0 });
  const after = snapshot();
  const a = after.split(';');
  const delta = before.split(';').map((x, i) => (x !== a[i] ? `${x} -> ${a[i]}` : null)).filter(Boolean);
  ok('DB row-write delta (pg_stat ins/upd/del per table) during the flows', { changedTables: delta });
  ok('mail sink message count', { before: mailBefore, after: await mail() });
} catch (e) {
  console.log('FAIL', e.message);
  process.exitCode = 1;
} finally {
  psql("delete from feature_flags where key='admin_game_lab'");
  await b.close();
  fs.writeFileSync(`${OUT}/pages-results.json`, JSON.stringify(result, null, 2));
}
