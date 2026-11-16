// Game Lab real-HTTP auth/flag matrix against the GUARDED LOCAL PREVIEW only.
// Usage: node scripts/game-lab/preview-matrix.mjs  (preview:local must be up on localhost:3100)
// Refuses any base URL that is not localhost:3100. Synthetic preview-*@example.test accounts only.
// Flag rows and temporary role changes are made in the local throwaway Postgres container only
// (docker exec wap-preview-pg) and restored before exit.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.GAME_LAB_BASE || 'http://localhost:3100';
if (new URL(BASE).host !== 'localhost:3100') throw new Error('refusing: not the guarded local preview');
const OUT = process.env.GAME_LAB_EVIDENCE || 'E:/Hermes/reports/wap-game-lab-integration/evidence';
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)('@playwright/test');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ADMIN = { id: '00000000-0000-4000-8000-0000000aa001', email: 'preview-admin@example.test', password: 'Preview-Admin-1!' };
const STUDENT = { id: '00000000-0000-4000-8000-0000000bb001', email: 'preview-student@example.test', password: 'Preview-Student-1!' };

const psql = (sql) => execFileSync('docker', ['exec', 'wap-preview-pg', 'psql', '-U', 'postgres', '-d', 'wap_preview', '-At', '-c', sql], { encoding: 'utf8' }).trim();

async function login(browser, who) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /decline/i }).click().catch(() => {});
  await page.locator('#email').fill(who.email);
  await page.locator('#password').fill(who.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !/\/login([?#]|$)/.test(u.pathname + u.search), { timeout: 60000 });
  await page.close();
  return context;
}

const TARGETS = [
  ['launcher', '/admin/game-lab'],
  ['play page', '/admin/game-lab/packet-quest-3d'],
  ['index.html', '/api/admin/game-lab/packet-quest-3d/index.html'],
  ['module game.mjs', '/api/admin/game-lab/packet-quest-3d/game.mjs'],
  ['vendor three', '/api/admin/game-lab/packet-quest-3d/vendor/three.module.min.js'],
  ['FD index.html', '/api/admin/game-lab/firewall-defender-3d/index.html'],
  ['unknown asset', '/api/admin/game-lab/packet-quest-3d/nope.mjs'],
  ['traversal', '/api/admin/game-lab/packet-quest-3d/..%2f..%2fpackage.json'],
  ['traversal raw', '/api/admin/game-lab/packet-quest-3d/../../../package.json'],
  ['unknown game', '/admin/game-lab/not-a-game'],
];

async function probe(request, path) {
  const res = await request.get(BASE + path, { maxRedirects: 0, failOnStatusCode: false });
  const h = res.headers();
  const body = await res.text();
  const hasGame = /game-lab-launch|game-card-|game-lab-prerelease-badge|Reset game progress|WebGLRenderer|from '\.\/rules\.mjs'/.test(body);
  const notFoundFallback = /NEXT_HTTP_ERROR_FALLBACK;404|This page could not be found/i.test(body);
  return {
    status: res.status(),
    location: h.location ? new URL(h.location, BASE).pathname : '',
    cache: h['cache-control'] || '',
    type: (h['content-type'] || '').split(';')[0],
    xfo: h['x-frame-options'] || '',
    content: hasGame ? 'GAME CONTENT' : notFoundFallback ? 'not-found fallback' : '',
    leaked: hasGame && res.status() !== 200,
  };
}

async function matrixFor(label, request, rows) {
  for (const [name, path] of TARGETS) rows.push({ actor: label, target: name, path, ...(await probe(request, path)) });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const rows = [];
const flagsCleanup = [];
try {
  const adminCtx = await login(browser, ADMIN);
  const studentCtx = await login(browser, STUDENT);
  const anon = await (await browser.newContext()).request;

  psql("delete from feature_flags where key='admin_game_lab'");
  await matrixFor('anonymous', anon, rows);
  await matrixFor('student (flag OFF)', studentCtx.request, rows);
  await matrixFor('admin, flag OFF (no row)', adminCtx.request, rows);

  // Create the flag through the REAL admin API (the same path /admin/feature-flags uses).
  const create = await adminCtx.request.post(BASE + '/api/admin/feature-flags', {
    data: { key: 'admin_game_lab', name: 'Admin Game Lab (local preview)', description: 'Local preview only', enabled: true, rolloutPercentage: 100, allowedRoles: ['admin', 'super_admin'] },
    failOnStatusCode: false,
  });
  rows.push({ actor: 'setup', target: 'POST /api/admin/feature-flags', status: create.status() });
  flagsCleanup.push(true);

  await matrixFor('admin, flag ON', adminCtx.request, rows);
  await matrixFor('anonymous after admin warm-up', anon, rows);
  await matrixFor('student, flag ON', studentCtx.request, rows);

  // Other roles: flip the synthetic student's profile role temporarily (local DB only), restore after.
  const roles = psql("select string_agg(name, ',') from roles").split(',');
  rows.push({ actor: 'setup', target: 'roles present in preview DB', status: roles.join('|') });
  const original = psql(`select role from profiles where user_id='${STUDENT.id}'`);
  const tryRoles = ['counselor', 'employer', 'partner', 'case_manager', 'wap_staff', 'group_leader'];
  try {
    for (const role of tryRoles) {
      try {
        psql(`update profiles set role='${role}' where user_id='${STUDENT.id}'`);
      } catch (e) {
        rows.push({ actor: `role ${role}`, target: 'unseedable', status: 'GAP: ' + String(e.message).split('\n')[0].slice(0, 80) });
        continue;
      }
      const ctx = await login(browser, STUDENT);
      await matrixFor(`role=${role} (flag ON)`, ctx.request, rows);
      await ctx.close();
    }
  } finally {
    psql(`update profiles set role='${original}' where user_id='${STUDENT.id}'`);
  }
} finally {
  psql("delete from feature_flags where key='admin_game_lab'");
  await browser.close();
}

writeFileSync(`${OUT}/auth-matrix.json`, JSON.stringify(rows, null, 2));
const md = ['| actor | target | status | location | cache-control | content-type | xfo | body |', '|---|---|---|---|---|---|---|---|'];
for (const r of rows) md.push(`| ${r.actor} | ${r.target} | ${r.status} | ${r.location ?? ''} | ${r.cache ?? ''} | ${r.type ?? ''} | ${r.xfo ?? ''} | ${r.content ?? ''} |`);
writeFileSync(`${OUT}/auth-matrix.md`, md.join('\n'));
console.log(md.join('\n'));
const bad = rows.filter((r) => r.content === 'GAME CONTENT' && !/admin, flag ON/.test(r.actor));
console.log('rows:', rows.length, '| game content served to anyone other than admin+flag ON:', bad.length, bad.map((r) => r.actor + '/' + r.target));
