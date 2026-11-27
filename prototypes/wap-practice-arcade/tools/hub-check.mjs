// Checks the hub page (index.html) headless at 390x844 and 1280x800, with empty and seeded storage.
// Usage: node tools/hub-check.mjs     Screenshots: ARCADE_EVIDENCE or ROOT/evidence, under _hub/.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser.mjs';
import { startServer, ROOT } from './serve.mjs';

const EVID = path.join(process.env.ARCADE_EVIDENCE ? path.resolve(process.env.ARCADE_EVIDENCE) : path.join(ROOT, 'evidence'), '_hub');
fs.mkdirSync(EVID, { recursive: true });
const FOOT = 'Practice only. Not graded, not course credit. Progress is saved on this device only.';
const DEMOS = ['help-desk-demo', 'demo-sort', 'demo-order', 'demo-lane', 'demo-match', 'demo-world-a', 'demo-world-b'];

const failures = [];
const notes = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

const registry = (await import(pathToFileURL(path.join(ROOT, 'games', 'registry.mjs')).href)).default;
const ids = registry.map((e) => e.id);

const server = await startServer({ port: 0 });
const browser = await launch();
try {
  for (const vp of [{ name: '390', width: 390, height: 844 }, { name: '1280', width: 1280, height: 800 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
    const open = async (query = '') => {
      await page.goto(`${server.url}/index.html${query}`, { waitUntil: 'load' });
      await page.waitForSelector('#games[aria-busy="false"]', { timeout: 15000 });
    };
    const overflow = async (label) => {
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      check(o.sw <= o.cw, `${vp.name} ${label}: sideways overflow (${o.sw} > ${o.cw})`);
    };

    // ---- empty storage
    await open();
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await open();
    const cards = await page.$$eval('.card', (els) => els.map((e) => e.dataset.id));
    for (const id of ids) check(cards.includes(id), `${vp.name}: no card for ${id}`);
    check(cards.length === ids.length, `${vp.name}: expected ${ids.length} cards, saw ${cards.length}`);
    check(await page.$('.cont') === null, `${vp.name}: Continue card shown with empty storage`);
    const foot = await page.$eval('.foot', (e) => e.textContent.trim());
    check(foot === FOOT, `${vp.name}: footer text differs`);
    check((await page.$$('h1')).length === 1, `${vp.name}: need exactly one h1`);
    const hrefs = await page.$$eval('.card a', (as) => as.map((a) => a.getAttribute('href')));
    for (const hr of hrefs) check(/^play\.html\?game=[a-z0-9-]+(&level=[a-z0-9-]+)?$/.test(hr), `${vp.name}: malformed link ${hr}`);
    const soon = await page.$$eval('.card.soon', (e) => e.length);
    const live = cards.length - soon;
    check((await page.$$eval('.card:not(.soon) .btn.primary', (e) => e.length)) === live, `${vp.name}: each live card needs a Start button`);
    notes.push(`${vp.name}: ${cards.length} cards, ${live} live, ${soon} coming soon`);
    await overflow('empty');
    await page.screenshot({ path: path.join(EVID, `hub-empty-${vp.name}.png`) });
    await page.screenshot({ path: path.join(EVID, `hub-empty-${vp.name}-full.png`), fullPage: true });

    // ---- filter
    const firstLive = await page.$eval('.card:not(.soon) .prog', (e) => e.textContent.trim());
    if (firstLive) {
      await page.fill('#q', firstLive.split(/\s+/)[0]);
      const vis = await page.$$eval('.card', (e) => e.filter((c) => !c.hidden && c.offsetParent !== null).length);
      check(vis >= 1 && vis < cards.length || cards.length === 1, `${vp.name}: filter did not narrow (${vis} of ${cards.length})`);
      await page.fill('#q', 'zzzzqqq');
      check(await page.$eval('#empty', (e) => !e.hidden), `${vp.name}: empty message not shown`);
      await page.fill('#q', '');
    }

    // ---- expand a live card
    const toggle = await page.$('.card:not(.soon) .toggle');
    if (toggle) {
      await toggle.click();
      const rows = await page.$$eval('.card:not(.soon) .rows:not([hidden]) a.row', (as) => as.map((a) => a.getAttribute('href')));
      check(rows.length > 0, `${vp.name}: expanding a card shows no level rows`);
      for (const hr of rows) check(/^play\.html\?game=[a-z0-9-]+&level=[a-z0-9-]+$/.test(hr), `${vp.name}: malformed level link ${hr}`);
      await overflow('expanded');
      await page.screenshot({ path: path.join(EVID, `hub-expanded-${vp.name}.png`) });
    }

    // ---- seeded progress (first live game: all levels but the last; second game: one level)
    const liveIds = await page.$$eval('.card:not(.soon)', (e) => e.map((c) => c.dataset.id));
    const seed = await page.evaluate(async (liveIds) => {
      const out = [];
      for (const id of liveIds.slice(0, 3)) {
        try { const g = (await import(`/games/${id}/game.mjs`)).default; out.push({ id, levels: g.levels.map((l) => l.id) }); } catch {}
      }
      return out;
    }, liveIds);
    await page.evaluate((seed) => {
      seed.forEach((g, i) => {
        const best = {};
        g.levels.forEach((l, k) => { if (i === 0 ? k < Math.max(1, g.levels.length - 1) : k < 1) best[l] = ((k + i) % 3) + 1; });
        localStorage.setItem(`wap-arcade-v1:${g.id}`, JSON.stringify({ best }));
      });
      if (seed[0]) localStorage.setItem('wap-arcade-v1:last', JSON.stringify({ game: seed[0].id, level: seed[0].levels[Math.min(1, seed[0].levels.length - 1)] }));
    }, seed);
    await open();
    const cont = await page.$('.cont a.btn');
    check(!!cont, `${vp.name}: no Continue card with seeded progress`);
    if (cont) check(/^play\.html\?game=[a-z0-9-]+&level=[a-z0-9-]+$/.test(await cont.getAttribute('href')), `${vp.name}: bad Continue link`);
    const earnedText = await page.$$eval('.card:not(.soon) .facts', (e) => e.map((x) => x.textContent));
    check(earnedText.some((t) => /[1-9]\d* of \d+ stars/.test(t)), `${vp.name}: seeded stars not shown`);
    await overflow('seeded');
    await page.screenshot({ path: path.join(EVID, `hub-seeded-${vp.name}.png`) });

    // ---- corrupt storage must not break the page
    await page.evaluate(() => { localStorage.setItem('wap-arcade-v1:last', '{nope'); localStorage.setItem('wap-arcade-v1:digital-literacy-empowerment-class', '[1,2'); });
    await open();
    check((await page.$$('.card')).length === ids.length, `${vp.name}: corrupt storage changed the card list`);

    // ---- demos
    await page.evaluate(() => localStorage.clear());
    await open('?demos=1');
    const demoCards = await page.$$eval('#cat-demos ~ .grid .card', (e) => e.map((c) => c.dataset.id));
    for (const d of DEMOS) check(demoCards.includes(d), `${vp.name}: ?demos=1 is missing ${d}`);
    await overflow('demos');
    await open();
    check((await page.$('#cat-demos')) === null, `${vp.name}: demos section shown without ?demos=1`);

    check(errors.length === 0, `${vp.name}: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }

  // ---- 360 wide, no sideways scroll
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const page = await ctx.newPage();
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForSelector('#games[aria-busy="false"]');
    const t = await page.$('.card:not(.soon) .toggle'); if (t) await t.click();
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check(o.sw <= o.cw, `360: sideways overflow (${o.sw} > ${o.cw})`);
    const small = await page.$$eval('.btn, .toggle, .row, .finder input', (els) => els.filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height < 44).length);
    check(small === 0, `360: ${small} tap targets under 44px`);
    await page.screenshot({ path: path.join(EVID, 'hub-empty-360.png') });
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}

for (const n of notes) console.log(n);
if (failures.length) {
  console.log(`FAIL (${failures.length})`);
  for (const f of failures) console.log(' - ' + f);
  process.exit(1);
}
console.log(`PASS hub-check. Screenshots in ${EVID}`);
