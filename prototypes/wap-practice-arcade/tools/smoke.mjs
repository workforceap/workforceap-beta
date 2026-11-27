// Browser smoke test for arcade games. Drives play.html ONLY through window.__arcade.
// Usage: node tools/smoke.mjs <game-id ... | --all> [--levels a,b] [--no-shots] [--quick] [--jobs N]
//        node tools/smoke.mjs --self-test [--keep]
// Env:   ARCADE_EVIDENCE=<dir>  write evidence/ somewhere else (screenshots go to <dir>/<game-id>/)
//        ARCADE_SOFTWARE_GL=1   force the slow software renderer (see tools/browser.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';
import { launch, glRenderer, isSoftwareRenderer } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = path.join(ROOT, 'games');
// ARCADE_EVIDENCE=<dir> sends screenshots somewhere else, so two runs of the same game do not overwrite each other.
const EVIDENCE = process.env.ARCADE_EVIDENCE ? path.resolve(process.env.ARCADE_EVIDENCE) : path.join(ROOT, 'evidence');
const DEFAULT_JOBS = 3;
const READY_MS = 60000; // window.__arcade.ready timeout
const STEP_CAP = 400; // choose() calls per level pass
const LEVEL_MS = 90000; // wall-clock cap per level pass
const MIN_CANVAS_PX = 150; // 3D canvas height at 390x844 and 360x640 during play
const SELFTEST_PATH = '__selftest__/index.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => Math.round(n * 10) / 10;

class Fail extends Error {}

// ---------------------------------------------------------------------------
// In-page measurement (runs in the game page; must be self-contained)
// Returns {problems: string[], canvasH: number|null}
// ---------------------------------------------------------------------------
function inPageScan(opts) {
  const round1 = (n) => Math.round(n * 10) / 10;
  const problems = [];
  let canvasH = null;
  const de = document.scrollingElement;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (de.scrollWidth > de.clientWidth) problems.push(`sideways scroll: scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}`);
  if (opts.play && de.scrollHeight > vh + 1) problems.push(`page needs vertical scroll during play: scrollHeight ${de.scrollHeight} > innerHeight ${vh}`);
  const desc = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const txt = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return `<${el.tagName.toLowerCase()}${cls}> "${txt}"`;
  };
  const visibleCss = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) return true;
      if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const isVisible = (el) => {
    if (!visibleCss(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const onScreen = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
    return onScreen || inScroller(el);
  };
  const seen = new Set();
  for (const el of document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')) {
    if (!isVisible(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) problems.push(`button smaller than 44x44 (${round1(r.width)}x${round1(r.height)}): ${desc(el)}`);
  }
  const clipTargets = new Set([...seen, ...document.querySelectorAll('[class*="card"], [class*="Card"]')]);
  for (const el of clipTargets) {
    if (!seen.has(el) && !isVisible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || el.clientWidth === 0) continue;
    const scrollX = /(auto|scroll)/.test(cs.overflowX);
    const scrollY = /(auto|scroll)/.test(cs.overflowY);
    if (!scrollX && el.scrollWidth > el.clientWidth + 1) problems.push(`text clipped horizontally (scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}): ${desc(el)}`);
    if (!scrollY && el.scrollHeight > el.clientHeight + 1) problems.push(`text clipped vertically (scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}): ${desc(el)}`);
  }

  if (opts.play) {
    // C4a: the 3D canvas keeps a usable height (only when it is on screen, so text mode and no-WebGL are fine).
    const cv = document.querySelector('#play canvas') || document.querySelector('canvas');
    if (cv && visibleCss(cv)) {
      const r = cv.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) {
        canvasH = round1(r.height);
        if (r.height < opts.minCanvas) problems.push(`3D canvas is only ${Math.round(r.height)} CSS px tall at ${vw}x${vh} (need ${opts.minCanvas}+)`);
      }
    }

    // C4b: nothing on the play screen reaches outside the viewport (bounding boxes, not scroll sizes).
    const roots = [document.querySelector('#play') || document.body];
    if (opts.feedback) { const o = document.querySelector('#overlay'); if (o) roots.push(o); }
    const TOL = 2;
    let outside = 0;
    for (const root of roots) {
      if (!root || !visibleCss(root)) continue;
      for (const el of root.querySelectorAll('*')) {
        if (el instanceof SVGElement && el.ownerSVGElement) continue; // parts of an inline svg
        if (!visibleCss(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 && r.height < 2) continue; // sr-only and zero-size helpers
        if (inScroller(el)) continue;
        if (r.left < -TOL || r.top < -TOL || r.right > vw + TOL || r.bottom > vh + TOL) {
          if (++outside <= 2) problems.push(`element reaches outside the ${vw}x${vh} viewport (l ${Math.round(r.left)}, t ${Math.round(r.top)}, r ${Math.round(r.right)}, b ${Math.round(r.bottom)}): ${desc(el)}`);
        }
      }
    }

    // C4c: choice buttons are not clipped by an ancestor and do not overlap each other.
    const choiceBtns = [...document.querySelectorAll('#choices button, .choices button, button.choice')].filter(visibleCss);
    const boxes = choiceBtns.map((b) => ({ b, r: b.getBoundingClientRect() })).filter((x) => x.r.width >= 1 && x.r.height >= 1);
    for (const { b, r } of boxes) {
      if (r.left < -TOL || r.top < -TOL || r.right > vw + TOL || r.bottom > vh + TOL) { problems.push(`choice button outside the viewport: ${desc(b)}`); continue; }
      for (let p = b.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const pr = p.getBoundingClientRect();
        if (r.left < pr.left - TOL || r.right > pr.right + TOL || r.top < pr.top - TOL || r.bottom > pr.bottom + TOL) {
          problems.push(`choice button clipped by <${p.tagName.toLowerCase()}${p.id ? '#' + p.id : ''}>: ${desc(b)}`);
          break;
        }
      }
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const c = boxes[j].r;
        const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (ox > 1.5 && oy > 1.5) problems.push(`choice buttons overlap (${round1(ox)}x${round1(oy)} px): ${desc(boxes[i].b)} and ${desc(boxes[j].b)}`);
      }
    }
  }
  return { problems, canvasH };
}

function inPageSheetText() {
  let best = '';
  for (const el of document.querySelectorAll('[role="dialog"], [class*="sheet"], [class*="Sheet"], [class*="feedback"], [class*="Feedback"]')) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const t = (el.innerText || '').trim();
    if (t.length > best.length) best = t;
  }
  return best;
}

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => {
    const t = (r.failure() && r.failure().errorText) || '';
    if (!/ERR_ABORTED/.test(t)) errs.push(`request failed: ${r.url()} ${t}`);
  });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico/.test(r.url())) errs.push(`HTTP ${r.status()}: ${r.url()}`); });
  return errs;
}

const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const MOBILE_360 = { width: 360, height: 640 };
const MOBILE_390 = { width: 390, height: 844 };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

// level id -> mechanic, read from the game data file (the page hook does not expose it).
async function readMechanics(id, job) {
  if (job.mechanics) return job.mechanics;
  try {
    const mod = await import(pathToFileURL(path.join(GAMES, id, 'game.mjs')).href + `?t=${Date.now()}`);
    const g = mod.default || mod.game;
    const map = {};
    for (const l of (g && g.levels) || []) map[l.id] = l.mechanic;
    return map;
  } catch { return {}; }
}

async function runGame(browser, base, id, opts, job = {}) {
  const pagePath = job.pagePath || 'play.html';
  const dir = path.join(EVIDENCE, id);
  const shots = !opts.noShots;
  const quick = !!opts.quick;
  const t0 = Date.now();
  if (shots) {
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(path.join(dir, 'fail.png'), { force: true });
    // names from older smoke versions
    for (const old of ['play-1280.png', 'wrong-390.png']) fs.rmSync(path.join(dir, old), { force: true });
  }
  const contexts = [];
  let current = null; // { page, errs }
  const info = { levels: 0 };
  const shotDone = new Set();
  const report = {
    game: id,
    renderer: opts.renderer || null,
    softwareGl: opts.renderer ? isSoftwareRenderer(opts.renderer) : null,
    quick,
    startedAt: new Date(t0).toISOString(),
    ok: false,
    error: null,
    totalMs: 0,
    levels: [],
    extraPasses: [],
    screenshots: [],
  };

  const A = (page, fn, arg) => page.evaluate(([f, a]) => {
    const h = window.__arcade;
    if (!h || !(f in h)) throw new Error(`window.__arcade.${f} is not available`);
    if (typeof h[f] !== 'function') return h[f];
    return a === undefined ? h[f]() : h[f](a);
  }, [fn, arg]);

  async function newPage(ctxOpts, query = '', init) {
    const ctx = await browser.newContext(ctxOpts);
    contexts.push(ctx);
    if (init) await ctx.addInitScript(init);
    if (job.html) await ctx.route(`${base}/${pagePath}*`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: job.html }));
    const page = await ctx.newPage();
    const errs = watch(page);
    current = { page, errs };
    await page.goto(`${base}/${pagePath}?game=${encodeURIComponent(id)}${query}`, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__arcade && (window.__arcade.ready || window.__arcade.error), null, { timeout: READY_MS });
    } catch {
      throw new Fail(`window.__arcade never became ready within ${READY_MS / 1000}s${errs.length ? ' (' + errs[0] + ')' : ''}`);
    }
    const e = await A(page, 'error');
    if (e) throw new Fail(`game failed to load: ${e}`);
    return { page, errs, ctx };
  }

  // Returns the measured canvas height (or null when no 3D canvas is showing).
  async function check(p, label, { play = false, feedback = false } = {}) {
    await sleep(300);
    if (p.errs.length) throw new Fail(`${label}: ${p.errs[0]}`);
    // Let the sheet settle first: two frames, and any finite CSS transition or animation finished (capped at 1.5 s).
    const settle = () => p.page.evaluate(async () => {
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await frames();
      const t0 = performance.now();
      while (performance.now() - t0 < 1500) {
        const running = document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect && a.effect.getComputedTiming().endTime));
        if (!running.length) break;
        await Promise.race([Promise.allSettled(running.map((a) => a.finished)), new Promise((r) => setTimeout(r, 300))]);
        await frames();
      }
    }).catch(() => {});
    await settle();
    let { problems, canvasH } = await p.page.evaluate(inPageScan, { play, feedback, minCanvas: MIN_CANVAS_PX });
    if (problems.length) {
      // A transient mid-transition box must not fail the run: only problems that persist after a second settle count.
      await sleep(250);
      await settle();
      ({ problems, canvasH } = await p.page.evaluate(inPageScan, { play, feedback, minCanvas: MIN_CANVAS_PX }));
    }
    if (problems.length) throw new Fail(`${label}: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`);
    return canvasH;
  }

  async function checkCanvas(p, label) {
    if (!(await A(p.page, 'glOk'))) return;
    if (await A(p.page, 'textMode')) return;
    const loc = p.page.locator('canvas:visible').first();
    if ((await loc.count()) === 0) throw new Fail(`${label}: glOk() is true but there is no visible canvas`);
    const buf = await loc.screenshot();
    const analysis = await p.page.context().newPage();
    await analysis.setContent('<!doctype html><html><body></body></html>');
    const st = await analysis.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const set = new Set();
      let min = 255, max = 0;
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
          const d = g.getImageData(Math.floor(((x + 0.5) * img.width) / 24), Math.floor(((y + 0.5) * img.height) / 24), 1, 1).data;
          set.add((d[0] >> 4) + ',' + (d[1] >> 4) + ',' + (d[2] >> 4));
          const l = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
          if (l < min) min = l;
          if (l > max) max = l;
        }
      }
      return { colors: set.size, range: max - min, w: img.width, h: img.height };
    }, buf.toString('base64')).finally(() => analysis.close());
    if (st.w < 20 || st.h < 20) throw new Fail(`${label}: canvas is tiny (${st.w}x${st.h})`);
    if (st.colors < 3 || st.range < 10) throw new Fail(`${label}: canvas looks blank (${st.colors} colors, luminance range ${Math.round(st.range)})`);
  }

  async function shot(p, name, once = true) {
    if (!shots) return;
    if (once && shotDone.has(name)) return;
    shotDone.add(name);
    await p.page.screenshot({ path: path.join(dir, name) });
    report.screenshots.push(name);
  }

  async function waitScreen(p, want, ms, label) {
    const end = Date.now() + ms;
    let s;
    while (Date.now() < end) {
      s = await A(p.page, 'screen');
      if (s === want) return;
      await sleep(40);
    }
    throw new Fail(`${label}: expected screen "${want}" but it is "${s}"${p.errs.length ? ' (' + p.errs[0] + ')' : ''}`);
  }

  async function openLevel(p, levelId, label) {
    await A(p.page, 'startLevel', levelId);
    await waitScreen(p, 'coach', 3000, `${label} startLevel`);
  }

  async function begin(p, label) {
    await A(p.page, 'begin');
    await waitScreen(p, 'play', 3000, `${label} begin`);
  }

  // Choose hints until the results screen. onMid runs once, around half way.
  async function playToEnd(p, label, onMid) {
    let midDone = !onMid;
    let steps = 0;
    let waits = 0;
    let doneWaits = 0;
    const deadline = Date.now() + LEVEL_MS;
    for (;;) {
      if (Date.now() > deadline) throw new Fail(`${label}: level did not finish within ${LEVEL_MS / 1000}s`);
      const s = await A(p.page, 'screen');
      if (s === 'results') return;
      if (s === 'play') {
        waits = 0;
        const v = await A(p.page, 'view');
        if (!midDone && v && v.progress && v.progress.done >= Math.floor(v.progress.total / 2)) {
          midDone = true;
          await onMid(v);
        }
        const h = await A(p.page, 'hint');
        if (h === null || h === undefined) {
          // the last answer was accepted and the shell is about to show results
          if (v && v.progress && v.progress.done >= v.progress.total && ++doneWaits <= 100) { await sleep(50); continue; }
          throw new Fail(`${label}: hint() returned nothing during play (view: ${JSON.stringify(v)})`);
        }
        await A(p.page, 'choose', h);
        if (++steps > STEP_CAP) throw new Fail(`${label}: more than ${STEP_CAP} steps without reaching results (stuck?)`);
        await sleep(30);
      } else if (s === 'feedback') {
        // A right-answer confirmation clears by itself; a blocking sheet in a no-mistake run means an unexpected miss.
        if (++waits > 40) { await A(p.page, 'dismiss'); waits = 0; } else await sleep(50);
      } else if (s === 'paused' || s === 'map' || s === 'coach') {
        throw new Fail(`${label}: unexpected screen "${s}" while playing`);
      } else {
        if (++waits > 100) throw new Fail(`${label}: stuck on screen "${s}"`);
        await sleep(50);
      }
    }
  }

  async function expectResult(p, label, stars) {
    const r = await A(p.page, 'result');
    const text = JSON.stringify(r);
    if (!r || r.won !== true || r.stars !== stars || (stars === 3 && r.mistakes !== 0)) {
      throw new Fail(`${label}: expected won=true stars=${stars}${stars === 3 ? ' mistakes=0' : ''} but result() is ${text}`);
    }
    return r;
  }

  async function runLevelPasses(p, levelId, mechanic, firstOfGame) {
    const label = `level ${levelId}`;
    const rec = { id: levelId, mechanic: mechanic || null, perfect: null, wrong: null, canvasPx: {} };
    report.levels.push(rec);

    // pass 1: all hints, expect a perfect run (3 stars)
    const tPerfect = Date.now();
    await openLevel(p, levelId, label);
    if (firstOfGame) { await check(p, `${label} coach`); await shot(p, 'coach-390.png'); }
    await begin(p, label);
    await playToEnd(p, label, async () => {
      rec.canvasPx['390'] = await check(p, `${label} play 390x844`, { play: true });
      await checkCanvas(p, `${label} play 390x844`);
      await shot(p, `play-${levelId}-390.png`);
      if (quick) return;
      await p.page.setViewportSize(MOBILE_360);
      try {
        await sleep(350); // let the shell and engine relayout
        rec.canvasPx['360'] = await check(p, `${label} play 360x640`, { play: true });
        await checkCanvas(p, `${label} play 360x640`);
        await shot(p, `play-${levelId}-360.png`);
      } finally {
        await p.page.setViewportSize(MOBILE_390);
        await sleep(300);
      }
    });
    await check(p, `${label} results`);
    const r1 = await expectResult(p, `${label} perfect run`, 3);
    rec.perfect = { stars: r1.stars, mistakes: r1.mistakes, ms: Date.now() - tPerfect };
    if (firstOfGame) await shot(p, 'results-390.png');

    // pass 2: replay, one deliberate wrong choice first (costs a heart, so 2 stars)
    const tWrong = Date.now();
    const rl = `${label} replay`;
    await openLevel(p, levelId, rl);
    await begin(p, rl);
    let reached = false;
    for (let attempt = 0; attempt < 3 && !reached; attempt++) {
      const v = await A(p.page, 'view');
      const hint = await A(p.page, 'hint');
      const wrong = ((v && v.choices) || []).find((c) => c.id !== hint && !c.done && c.kind !== 'secondary');
      if (!wrong) throw new Fail(`${rl}: no wrong choice available (choices: ${JSON.stringify(v && v.choices)})`);
      await A(p.page, 'choose', wrong.id);
      const end = Date.now() + 2500;
      while (Date.now() < end) {
        if ((await A(p.page, 'screen')) === 'feedback') { reached = true; break; }
        await sleep(40);
      }
    }
    if (!reached) throw new Fail(`${rl}: screen() never became "feedback" after a wrong choice`);
    const sheet = await p.page.evaluate(inPageSheetText);
    if (!sheet || !sheet.trim()) throw new Fail(`${rl}: feedback sheet has no visible text`);
    await check(p, `${rl} feedback`);
    await shot(p, `wrong-${levelId}-390.png`);
    await A(p.page, 'dismiss');
    await waitScreen(p, 'play', 3000, `${rl} dismiss`).catch(async (e) => {
      // a single-step level could end right after the miss
      if ((await A(p.page, 'screen')) !== 'results') throw e;
    });
    await playToEnd(p, rl);
    const r2 = await expectResult(p, `${rl} after one miss`, 2);
    rec.wrong = { stars: r2.stars, mistakes: r2.mistakes, ms: Date.now() - tWrong };
  }

  const extra = async (name, fn) => {
    const t = Date.now();
    const rec = { name, ok: false, ms: 0 };
    report.extraPasses.push(rec);
    try { await fn(); rec.ok = true; } finally { rec.ms = Date.now() - t; }
  };

  try {
    const mechOf = await readMechanics(id, job);

    // ---- mobile pass over every level ---------------------------------------
    const m = await newPage(MOBILE);
    await check(m, 'map');
    if ((await A(m.page, 'screen')) !== 'map') throw new Fail(`map: screen() is "${await A(m.page, 'screen')}" after ready`);
    const allIds = await A(m.page, 'levelIds');
    if (!Array.isArray(allIds) || !allIds.length) throw new Fail('map: levelIds() is empty');
    await shot(m, 'map-390.png');
    let ids = allIds;
    if (opts.levels) {
      const missing = opts.levels.filter((l) => !allIds.includes(l));
      if (missing.length) throw new Fail(`--levels: unknown level id(s) ${missing.join(', ')} (have ${allIds.join(', ')})`);
      ids = allIds.filter((l) => opts.levels.includes(l));
    }
    info.levels = ids.length;
    for (let i = 0; i < ids.length; i++) await runLevelPasses(m, ids[i], mechOf[ids[i]], i === 0);
    await m.ctx.close();

    if (!quick) {
      // ---- desktop pass: one level per mechanic the game uses --------------------
      const firstOfMech = new Map(); // mechanic -> level id
      for (const lid of ids) { const k = mechOf[lid] || 'level'; if (!firstOfMech.has(k)) firstOfMech.set(k, lid); }
      const d = await newPage(DESKTOP);
      for (const [mech, lid] of firstOfMech) {
        await extra(`desktop-${mech}`, async () => {
          const label = `desktop ${mech} (${lid})`;
          await openLevel(d, lid, label);
          await begin(d, label);
          await playToEnd(d, label, async () => {
            await check(d, `${label} play 1280x800`, { play: true });
            await checkCanvas(d, `${label} play 1280x800`);
            await shot(d, `play-${mech}-1280.png`);
          });
          await expectResult(d, `${label} perfect run`, 3);
        });
      }
      await d.ctx.close();

      const first = ids[0];
      // ---- text mode forced on, first level --------------------------------------
      await extra('text-mode', async () => {
        const t = await newPage(MOBILE, '&text=1');
        if (!(await A(t.page, 'textMode'))) throw new Fail('text mode: textMode() is false with ?text=1');
        await openLevel(t, first, 'text mode');
        await begin(t, 'text mode');
        await playToEnd(t, 'text mode', async () => {
          await check(t, 'text mode play 390x844', { play: true });
          await shot(t, 'text-390.png');
        });
        await expectResult(t, 'text mode perfect run', 3);
        await t.ctx.close();
      });

      // ---- WebGL unavailable: shell must fall back to text mode by itself -------
      await extra('webgl-blocked', async () => {
        const noGl = () => {
          const orig = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
            if (typeof type === 'string' && /webgl/i.test(type)) return null;
            return orig.call(this, type, ...rest);
          };
        };
        const n = await newPage(MOBILE, '', noGl);
        if (await A(n.page, 'glOk')) throw new Fail('no-WebGL pass: glOk() is true although WebGL was blocked');
        if (!(await A(n.page, 'textMode'))) throw new Fail('no-WebGL pass: shell did not switch to text mode automatically');
        await openLevel(n, first, 'no-WebGL');
        await begin(n, 'no-WebGL');
        await playToEnd(n, 'no-WebGL', async () => { await check(n, 'no-WebGL play 390x844', { play: true }); });
        await expectResult(n, 'no-WebGL perfect run', 3);
        await n.ctx.close();
      });
    }

    report.ok = true;
    return { id, ok: true, levels: info.levels, ms: Date.now() - t0, note: `${info.levels} level(s)` };
  } catch (e) {
    if (current && shots) {
      try { await current.page.screenshot({ path: path.join(dir, 'fail.png') }); report.screenshots.push('fail.png'); } catch { /* page may be gone */ }
    }
    const msg = e instanceof Fail ? e.message : `unexpected error: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e}`;
    report.error = msg;
    return { id, ok: false, levels: info.levels, ms: Date.now() - t0, note: msg };
  } finally {
    report.totalMs = Date.now() - t0;
    if (shots) {
      try { fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); } catch { /* ignore */ }
    }
    for (const c of contexts) { try { await c.close(); } catch { /* already closed */ } }
  }
}

// ---------------------------------------------------------------------------
// Self-test: a fake __arcade page with a real WebGL canvas
// ---------------------------------------------------------------------------
const SELFTEST_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>smoke self-test</title>
<style>
  html, body { margin: 0; height: 100%; font: 16px system-ui, sans-serif; background: #1a1a1a; color: #fff; }
  #app { display: flex; flex-direction: column; height: 100vh; height: 100dvh; box-sizing: border-box; padding: 12px; gap: 10px; }
  button { min-height: 52px; min-width: 52px; padding: 8px 14px; font: inherit; border-radius: 8px; border: 0; background: #ad2c4d; color: #fff; }
  .list { overflow: auto; display: flex; flex-direction: column; gap: 10px; }
  .level-card { text-align: left; display: block; width: 100%; }
  canvas { flex: 1; min-height: 0; width: 100%; background: #000; }
  .sheet { background: #fff; color: #1a1a1a; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .sheet.feedback { position: fixed; left: 12px; right: 12px; bottom: 12px; }
  .bar { display: flex; justify-content: space-between; align-items: center; }
</style></head>
<body><div id="app"></div>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var levels = [
    { id: 'l1', title: 'Level one', qs: [['Alpha', 'Beta', 'Gamma'], ['Delta', 'Eps', 'Zeta'], ['Eta', 'Theta', 'Iota']], ans: [0, 2, 1] },
    { id: 'l2', title: 'Level two', qs: [['Red', 'Green', 'Blue'], ['Cat', 'Dog', 'Cow'], ['One', 'Two', 'Six']], ans: [1, 0, 2] }
  ];
  var app = document.getElementById('app');
  var screen = 'map', lvl = null, q = 0, mistakes = 0, res = null, raf = 0, gl = null, text = params.get('text') === '1';
  var probe = document.createElement('canvas');
  var glOk = false;
  try { glOk = !!(probe.getContext('webgl2') || probe.getContext('webgl')); } catch (e) {}
  if (!glOk) text = true;
  function esc(s) { return String(s).replace(/</g, '&lt;'); }
  function stopGl() { cancelAnimationFrame(raf); gl = null; }
  function startGl() {
    var c = document.getElementById('c');
    if (!c || text) return;
    gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return;
    function frame(t) {
      var w = c.clientWidth * (window.devicePixelRatio || 1), h = c.clientHeight * (window.devicePixelRatio || 1);
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      gl.viewport(0, 0, c.width, c.height);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, c.width, c.height); gl.clearColor(0.1, 0.2, 0.35, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      var cols = [[0.9, 0.2, 0.3], [0.9, 0.8, 0.2], [0.2, 0.8, 0.4]];
      for (var i = 0; i < 3; i++) {
        gl.scissor(Math.floor(c.width * (0.1 + i * 0.3)), Math.floor(c.height * 0.3), Math.floor(c.width * 0.2), Math.floor(c.height * 0.4));
        gl.clearColor(cols[i][0], cols[i][1], cols[i][2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
  function render() {
    stopGl();
    if (screen === 'map') {
      app.innerHTML = '<h1>Self-test game</h1><div class="list">' + levels.map(function (l, i) { return '<button class="level-card" data-l="' + l.id + '">After course ' + (i + 1) + ': ' + l.title + '</button>'; }).join('') + '</div>';
    } else if (screen === 'coach') {
      app.innerHTML = '<div class="sheet"><h2>' + esc(lvl.title) + '</h2><p>You will practice: picking answers.</p><button id="start">Start</button></div>';
      document.getElementById('start').onclick = function () { api.begin(); };
    } else if (screen === 'play' || screen === 'feedback') {
      var o = lvl.qs[q];
      app.innerHTML = '<div class="bar"><button id="x" aria-label="Close">X</button><span>' + q + ' of ' + lvl.qs.length + '</span></div>' +
        (text ? '' : '<canvas id="c"></canvas>') +
        '<div class="sheet"><p>Question ' + (q + 1) + '?</p>' + o.map(function (t, i) { return '<button class="choice" data-c="' + i + '">' + esc(t) + '</button>'; }).join('') + '</div>' +
        (screen === 'feedback' ? '<div class="sheet feedback" role="dialog"><h2>Not quite</h2><p>The answer is ' + esc(o[lvl.ans[q]]) + ' because the test says so.</p><button id="got">Got it</button></div>' : '');
      Array.prototype.forEach.call(app.querySelectorAll('.choice'), function (b) { b.onclick = function () { api.choose(b.getAttribute('data-c')); }; });
      var g = document.getElementById('got'); if (g) g.onclick = function () { api.dismiss(); };
      startGl();
    } else if (screen === 'results') {
      app.innerHTML = '<div class="sheet"><h2>' + (res.won ? 'Done' : 'Out of hearts') + '</h2><p>Stars: ' + res.stars + '</p><button id="again">Replay</button></div>';
    }
    Array.prototype.forEach.call(app.querySelectorAll('[data-l]'), function (b) { b.onclick = function () { api.startLevel(b.getAttribute('data-l')); }; });
  }
  var api = {
    ready: true, error: null,
    screen: function () { return screen; },
    levelIds: function () { return levels.map(function (l) { return l.id; }); },
    startLevel: function (id) { lvl = levels.filter(function (l) { return l.id === id; })[0]; q = 0; mistakes = 0; res = null; screen = 'coach'; render(); },
    begin: function () { screen = 'play'; render(); },
    view: function () {
      return { card: null, prompt: 'Question ' + (q + 1) + '?', progress: { done: q, total: lvl.qs.length }, timer: null,
        choices: lvl.qs[q].map(function (t, i) { return { id: String(i), label: t, done: false }; }) };
    },
    hint: function () { return String(lvl.ans[q]); },
    choose: function (id) {
      if (screen !== 'play') return;
      if (Number(id) === lvl.ans[q]) {
        q++;
        if (q >= lvl.qs.length) { res = { won: true, stars: Math.max(1, 3 - mistakes), mistakes: mistakes }; screen = 'results'; }
      } else { mistakes++; screen = 'feedback'; }
      render();
    },
    dismiss: function () { if (screen === 'feedback') { screen = 'play'; render(); } },
    result: function () { return screen === 'results' ? res : null; },
    textMode: function () { return text; },
    glOk: function () { return glOk; }
  };
  window.__arcade = api;
  render();
})();
</script></body></html>
`;

// Negative self-test: deliberately broken play-screen layouts. Each one must make
// inPageScan report the named problem, and the clean layout must report nothing,
// so the layout assertions are proven to fire (and not to fire falsely).
const LAYOUT_BASE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; font: 16px system-ui, sans-serif; }
  #play { display: flex; flex-direction: column; height: 100%; gap: 8px; padding: 8px; box-sizing: border-box; }
  canvas { width: 100%; height: 240px; display: block; background: #123; }
  .choices { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .choice { min-height: 48px; font: inherit; }
</style></head><body><div id="play"><canvas></canvas>__BODY__</div></body></html>`;
const LAYOUT_CASES = [
  { name: 'clean layout', expect: null,
    body: '<ul class="choices"><li><button class="choice">One</button></li><li><button class="choice">Two</button></li></ul>' },
  { name: 'oversized element', expect: 'element reaches outside',
    body: '<ul class="choices"><li><button class="choice">One</button></li></ul><div style="position:fixed;left:300px;top:400px;width:260px;height:40px;background:#c33"></div>' },
  { name: 'clipped choice', expect: 'choice button clipped by',
    body: '<div style="overflow:hidden;height:40px"><ul class="choices" style="padding-top:20px"><li><button class="choice">One</button></li></ul></div>' },
  { name: 'overlapping choices', expect: 'choice buttons overlap',
    body: '<ul class="choices" style="position:relative;height:60px"><li><button class="choice" style="position:absolute;left:0;top:0;width:160px">One</button></li><li><button class="choice" style="position:absolute;left:80px;top:6px;width:160px">Two</button></li></ul>' },
  { name: 'short canvas', expect: '3D canvas is only',
    body: '<style>canvas{height:90px}</style><ul class="choices"><li><button class="choice">One</button></li></ul>' },
];
async function layoutSelfTest(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const out = [];
  try {
    const page = await ctx.newPage();
    for (const c of LAYOUT_CASES) {
      await page.setContent(LAYOUT_BASE.replace('__BODY__', c.body));
      const { problems } = await page.evaluate(inPageScan, { play: true, feedback: false, minCanvas: MIN_CANVAS_PX });
      const ok = c.expect ? problems.some((p) => p.includes(c.expect)) : problems.length === 0;
      out.push({ name: c.name, ok, detail: ok ? '' : (c.expect ? `expected "${c.expect}", got ${problems.length ? problems.join(' | ') : 'no problems'}` : `expected no problems, got ${problems.join(' | ')}`) });
    }
  } finally { await ctx.close(); }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const o = { ids: [], all: false, levels: null, noShots: false, selfTest: false, keep: false, quick: false, jobs: DEFAULT_JOBS };
  const num = (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 16) throw new Error(`--jobs needs a whole number from 1 to 16 (got "${v}")`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') o.all = true;
    else if (a === '--no-shots') o.noShots = true;
    else if (a === '--self-test') o.selfTest = true;
    else if (a === '--keep') o.keep = true;
    else if (a === '--quick') o.quick = true;
    else if (a === '--jobs') o.jobs = num(argv[++i]);
    else if (a.startsWith('--jobs=')) o.jobs = num(a.slice(7));
    else if (a === '--levels') o.levels = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--levels=')) o.levels = a.slice(9).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.ids.push(a);
  }
  return o;
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }

  let jobs; // [{id, pagePath?, html?, mechanics?}]
  let selfDir = null;
  if (opts.selfTest) {
    selfDir = path.join(EVIDENCE, '_selftest');
    fs.mkdirSync(selfDir, { recursive: true });
    if (opts.keep) fs.writeFileSync(path.join(selfDir, 'index.html'), SELFTEST_HTML);
    // The fake page is served by a route inside the browser, so it works wherever ARCADE_EVIDENCE points.
    jobs = [{ id: '_selftest', pagePath: SELFTEST_PATH, html: SELFTEST_HTML, mechanics: { l1: 'gate', l2: 'sort' } }];
    opts.levels = null;
  } else {
    let ids = opts.ids;
    if (opts.all) {
      ids = fs.existsSync(GAMES)
        ? fs.readdirSync(GAMES, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(GAMES, d.name, 'game.mjs'))).map((d) => d.name).sort()
        : [];
    }
    if (!ids.length) {
      console.error(opts.all ? 'No games found under games/*/game.mjs' : 'Usage: node tools/smoke.mjs <game-id ... | --all> [--levels a,b] [--no-shots] [--quick] [--jobs N] | --self-test');
      return 2;
    }
    if (!fs.existsSync(path.join(ROOT, 'play.html'))) {
      console.error('play.html does not exist yet; nothing to smoke-test.');
      return 2;
    }
    jobs = ids.map((id) => ({ id }));
  }

  const started = Date.now();
  let server = null;
  let browser = null;
  const results = [];
  try {
    server = await startServer({ port: 0 });
    browser = await launch();
    // Which WebGL renderer do the screenshots come from? Printed once per run.
    let renderer = null;
    try {
      const ctx = await browser.newContext();
      const pg = await ctx.newPage();
      renderer = await glRenderer(pg);
      await ctx.close();
    } catch { /* leave null */ }
    opts.renderer = renderer;
    console.log(`WebGL renderer: ${renderer || 'none (WebGL unavailable)'}`);
    if (renderer && isSoftwareRenderer(renderer)) console.log('Note: this is a software renderer; use a GPU run to judge looks and frame rate.');
    console.log(`Mode: ${opts.quick ? 'quick (390x844 only)' : 'full'}, ${Math.min(opts.jobs, jobs.length)} parallel job(s)`);

    const queue = [...jobs];
    const worker = async () => {
      while (queue.length) {
        const job = queue.shift();
        const r = await runGame(browser, server.url, job.id, opts, job);
        results.push(r);
        console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} (${(r.ms / 1000).toFixed(1)}s)${r.ok ? '' : ': ' + r.note}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.jobs, jobs.length) }, worker));
    if (opts.selfTest) {
      const t1 = Date.now();
      const cases = await layoutSelfTest(browser);
      const bad = cases.filter((c) => !c.ok);
      for (const c of cases) console.log(`${c.ok ? 'PASS' : 'FAIL'} layout check: ${c.name}${c.ok ? '' : ': ' + c.detail}`);
      results.push({ id: '_layout-checks', ok: !bad.length, levels: cases.length, ms: Date.now() - t1, note: bad.length ? bad.map((c) => `${c.name}: ${c.detail}`).join('; ') : `${cases.length} case(s)` });
    }
  } catch (e) {
    console.error(`smoke aborted: ${e.message}`);
    return 2;
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
    if (server) { try { await server.close(); } catch { /* ignore */ } }
    if (selfDir && !opts.keep) { try { fs.rmSync(selfDir, { recursive: true, force: true }); } catch { /* ignore */ } }
  }

  results.sort((a, b) => a.id.localeCompare(b.id));
  const w = Math.max(4, ...results.map((r) => r.id.length));
  console.log(`\n${'GAME'.padEnd(w)}  RESULT  LEVELS  TIME    DETAIL`);
  for (const r of results) console.log(`${r.id.padEnd(w)}  ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)}  ${String(r.levels).padEnd(6)}  ${((r.ms / 1000).toFixed(1) + 's').padEnd(6)}  ${r.ok ? '' : r.note}`);
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} passed in ${((Date.now() - started) / 1000).toFixed(1)}s wall time`);
  return bad ? 1 : 0;
}

main().then((code) => process.exit(code));
