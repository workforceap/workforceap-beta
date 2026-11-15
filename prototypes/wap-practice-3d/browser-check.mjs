// Headed-Chrome browser check for Packet Quest 3D (semi-real look + polish).
// Verifies: quality toggle (Low/Medium/High), shadows on High and off on Low, real startup low-end GPU detection
// (WebGL MAX_TEXTURE_SIZE < 8192 and software renderer) + real render(dt) frame-budget downgrade, pause & document.hidden
// loop stop, no resource growth across 3 retries, canvas non-blank and non-flat (pixel variance + luminance range),
// real canvas click picking (body + label), wrong-call marker, hop badges, boss glitch effect, DNS side path with leader stem,
// ping-does-not-win, lose-on-3-mistakes + retry, keyboard-only stage 1 playthrough, mobile tap-to-play, label readability >= 12 CSS px
// at 1280/390x844/320x640, zero label overlap, reduced-motion (camera stationary + instant launch settle), full 3-stage WebGL-off fallback,
// localStorage corruption recovery, and zero console/page/network errors.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const evDir = path.join(dir, 'evidence');
fs.mkdirSync(evDir, {recursive: true});

const pwPath = process.env.PLAYWRIGHT_MODULE_PATH || 'C:/Users/mabro/.claude/skills/gstack/node_modules/playwright';
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const {chromium} = createRequire(import.meta.url)(pwPath);

const mime = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8'};
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  const f = path.join(dir, u === '/' ? 'index.html' : u);
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, {'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const consoleErrors = [], pageErrors = [], externalRequests = [];
function attachGuards(page) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) externalRequests.push(r.url()); });
}

async function sampleCanvasStats(page) {
  const b64 = (await page.locator('#gl').screenshot()).toString('base64');
  return page.evaluate(async (src) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 96; c.height = 60;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const n = c.width * c.height;
    let sum = 0, sum2 = 0, minL = 255, maxL = 0, nonBg = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += lum; sum2 += lum * lum;
      if (lum < minL) minL = lum;
      if (lum > maxL) maxL = lum;
      if (Math.abs(d[i] - 42) > 12 || Math.abs(d[i + 1] - 49) > 12 || Math.abs(d[i + 2] - 64) > 12) nonBg++;
    }
    const mean = sum / n, variance = sum2 / n - mean * mean;
    return {mean, variance, std: Math.sqrt(Math.max(0, variance)), lumRange: maxL - minL, nonBgRatio: nonBg / n};
  }, b64);
}

let browser;
const report = {url: base, checks: []};
const ok = (name, detail = {}) => { report.checks.push({name, ok: true, ...detail}); console.log('PASS', name, JSON.stringify(detail)); };

try {
  browser = await chromium.launch({executablePath: chromePath, headless: false, args: ['--window-size=1360,960']});

  // 1. Desktop 1280x900: pilot boundary, semi-real settings, quality toggle + real frame-budget downgrade,
  //    pause & document.hidden loop stop, attached labels + matching names, active-only cable glow, tool wording + legend above fold,
  //    no resource growth across 3 retries, real canvas click picking, wrong-call marker, hop badges, ping-not-win, lose-on-mistakes,
  //    keyboard-only stage 1 playthrough, boss glitch, full 3-stage playthrough + reload save
  {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    const p = await ctx.newPage(); attachGuards(p);
    await p.goto(base);
    await p.waitForSelector('#s0');
    await p.click('#s0');
    await p.waitForTimeout(350);

    // Pilot boundary + sound default off + 44x44 buttons
    const boundary = await p.evaluate(async () => {
      const {META} = await import('./rules.mjs');
      const mutePressed = document.getElementById('mute').getAttribute('aria-pressed');
      const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
      const smallBtns = btns.filter((b) => { const r = b.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map((b) => b.id || b.textContent);
      return {META, mutePressed, smallBtns};
    });
    assert.equal(boundary.META.providerLessonId, null);
    assert.equal(boundary.META.credit, false);
    assert.equal(boundary.META.reviewed, false);
    assert.equal(boundary.mutePressed, 'false');
    assert.equal(boundary.smallBtns.length, 0, `buttons < 44x44: ${JSON.stringify(boundary.smallBtns)}`);
    ok('pilot-boundary-and-button-targets', boundary);

    // Default quality = Medium, PBR + ACES + sRGB + env map
    const initSet = await p.evaluate(() => window.__pq.scene.settings());
    assert.equal(initSet.quality, 'medium');
    assert.equal(initSet.shadows, true);
    assert.equal(initSet.toneMapping, 'ACESFilmic');
    assert.equal(initSet.colorSpace, 'srgb');
    assert.equal(initSet.environment, true);
    assert.equal(initSet.materialType, 'MeshStandardMaterial');
    assert(initSet.pixelRatio <= 2);
    ok('semi-real-default-settings', initSet);

    // Quality toggle + real render(dt) frame-budget downgrade
    await p.click('[data-q="low"]');
    const lowSet = await p.evaluate(() => ({...window.__pq.scene.settings(), pressed: document.querySelector('[data-q="low"]').getAttribute('aria-pressed')}));
    assert.equal(lowSet.quality, 'low');
    assert.equal(lowSet.shadows, false);
    assert.equal(lowSet.glow, false);
    assert.equal(lowSet.pressed, 'true');

    await p.click('[data-q="high"]');
    const highSet = await p.evaluate(() => ({...window.__pq.scene.settings(), pressed: document.querySelector('[data-q="high"]').getAttribute('aria-pressed')}));
    assert.equal(highSet.quality, 'high');
    assert.equal(highSet.shadows, true);
    assert.equal(highSet.shadowMapSize, 2048);
    assert.equal(highSet.glow, true);
    assert.equal(highSet.pressed, 'true');

    const realBudgetDrop = await p.evaluate(() => {
      window.__pq.scene.setQuality('high', '');
      for (let i = 0; i < 90; i++) window.__pq.scene.render(0.055);
      const after = window.__pq.scene.settings();
      const uiNote = document.getElementById('qnote').textContent;
      window.__pq.scene.setQuality('medium', '');
      return {after, uiNote};
    });
    assert.equal(realBudgetDrop.after.quality, 'low');
    assert.equal(realBudgetDrop.after.shadows, false);
    assert(realBudgetDrop.after.note.includes('auto: median frame 55 ms over budget'), realBudgetDrop.after.note);
    assert(realBudgetDrop.uiNote.includes('auto: median frame 55 ms over budget'), realBudgetDrop.uiNote);
    ok('quality-toggle-and-real-budget-downgrade', {low: lowSet.quality, high: highSet.shadowMapSize, realBudgetDrop});

    // Pause AND document.hidden visibilitychange both stop the render loop
    await p.click('#pause');
    await p.waitForTimeout(80);
    const f0 = await p.evaluate(() => window.__pq.scene.renderer.info.render.frame);
    await p.waitForTimeout(220);
    const f1 = await p.evaluate(() => window.__pq.scene.renderer.info.render.frame);
    assert.equal(f0, f1, `render loop continued while paused: ${f0} -> ${f1}`);
    await p.click('#resume');
    await p.waitForTimeout(120);
    const f2 = await p.evaluate(() => window.__pq.scene.renderer.info.render.frame);
    assert(f2 > f1, 'render loop did not resume after unpausing');

    await p.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForTimeout(80);
    const vf0 = await p.evaluate(() => window.__pq.scene.renderer.info.render.frame);
    await p.waitForTimeout(220);
    const vf1 = await p.evaluate(() => window.__pq.scene.renderer.info.render.frame);
    assert.equal(vf0, vf1, `render loop continued while document.hidden: ${vf0} -> ${vf1}`);
    await p.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForTimeout(120);
    const vf2 = await p.evaluate(() => window.__pq.scene.renderer.info.render.frame);
    assert(vf2 > vf1, 'render loop did not resume after document became visible');
    ok('pause-and-visibility-stop-render-loop', {f0, f1, f2, vf0, vf1, vf2});

    // Tool wording consistency, attached labels with 3D leader stems, DNS side path leader stem, matching device names, and cable key above the fold
    const uiAndLabels = await p.evaluate(() => {
      const toolText = document.getElementById('tool').textContent;
      const repText = document.getElementById('repair').textContent;
      const legRect = document.getElementById('legend').closest('.card').getBoundingClientRect();
      const lm = window.__pq.scene.labelMetrics().filter((x) => !x.node.startsWith('hop') && x.node !== 'dns-sign');
      const panelBtns = [...document.querySelectorAll('button.dev')].map((b) => b.textContent);
      return {toolText, repText, legBottom: legRect.bottom, leaders: window.__pq.scene.leaderCount, dnsSignHasLeader: window.__pq.scene.dnsSignHasLeader, lm, panelBtns};
    });
    assert(uiAndLabels.toolText.includes('Active tool: ROUTE'), uiAndLabels.toolText);
    assert(uiAndLabels.repText.includes('Switch to Repair tool'), uiAndLabels.repText);
    assert(uiAndLabels.legBottom <= 800, `cable key should sit above the 800px desktop fold, got bottom=${uiAndLabels.legBottom}`);
    assert.equal(uiAndLabels.leaders, 5);
    assert.equal(uiAndLabels.dnsSignHasLeader, true, 'DNS side path sign must attach to the violet DNS cable with a leader stem');
    for (const item of uiAndLabels.lm) {
      assert.equal(item.hasLeader, true, `missing leader on ${item.node}`);
      assert(item.anchorDistPx <= 52, `label too far from ${item.node}: ${item.anchorDistPx}`);
      assert(uiAndLabels.panelBtns.some((t) => t.includes(item.title)), `label title ${item.title} does not match panel buttons`);
    }
    ok('attached-labels-tool-copy-and-legend-fold', {toolText: uiAndLabels.toolText, repText: uiAndLabels.repText, legBottom: uiAndLabels.legBottom, leaders: uiAndLabels.leaders, dnsSignHasLeader: uiAndLabels.dnsSignHasLeader});

    // Distinct link colours + shapes AND active-only cable glow
    const linksBefore = await p.evaluate(() => window.__pq.scene.linkInfo());
    assert.equal(Object.keys(linksBefore).length, 5);
    assert.equal(new Set(Object.values(linksBefore).map((l) => l.hex)).size, 5);
    assert.equal(new Set(Object.values(linksBefore).map((l) => l.pat)).size, 5);
    assert(Object.values(linksBefore).every((l) => l.activeGlow === 0), 'unrouted links must not glow');
    await p.click('[data-node="client"]');
    await p.click('[data-node="switch"]');
    await p.waitForTimeout(260);
    const linksRouted = await p.evaluate(() => window.__pq.scene.linkInfo());
    assert(linksRouted['client|switch'].activeGlow > 0.3, 'active route hop should glow');
    assert.equal(linksRouted['switch|router'].activeGlow, 0, 'inactive hop must not glow');
    assert.equal(linksRouted['switch|dns'].activeGlow, 0, 'inactive DNS hop must not glow');
    ok('distinct-link-lanes-and-active-only-glow', {before: linksBefore, afterClientSwitch: linksRouted});

    // Canvas is non-blank and not trivially flat (pixel variance + luminance range)
    const cStats = await sampleCanvasStats(p);
    assert(cStats.variance > 80, `canvas variance too low: ${cStats.variance}`);
    assert(cStats.lumRange > 90, `canvas luminance range too narrow: ${cStats.lumRange}`);
    assert(cStats.nonBgRatio > 0.12, `canvas mostly blank: ${cStats.nonBgRatio}`);
    ok('canvas-non-blank-and-non-flat', cStats);

    // Resource counts do not grow across 3 stage retries with active route & impact markers
    await p.click('#retry');
    await p.click('[data-node="client"]');
    await p.click('[data-node="server"]'); // triggers wrong-hop impact
    await p.click('#retry'); await p.waitForTimeout(150);
    const baselineMem = await p.evaluate(() => window.__pq.scene.stats());
    for (let i = 0; i < 3; i++) {
      await p.click('[data-node="client"]');
      await p.click('[data-node="server"]');
      await p.click('#retry');
      await p.waitForTimeout(150);
    }
    const afterRetriesMem = await p.evaluate(() => window.__pq.scene.stats());
    assert(afterRetriesMem.geometries <= baselineMem.geometries, `geometries grew: ${baselineMem.geometries} -> ${afterRetriesMem.geometries}`);
    assert(afterRetriesMem.textures <= baselineMem.textures, `textures grew: ${baselineMem.textures} -> ${afterRetriesMem.textures}`);
    assert(afterRetriesMem.materials <= baselineMem.materials, `materials grew: ${baselineMem.materials} -> ${afterRetriesMem.materials}`);
    assert(afterRetriesMem.renderTargets <= baselineMem.renderTargets, `renderTargets grew: ${baselineMem.renderTargets} -> ${afterRetriesMem.renderTargets}`);
    ok('no-resource-growth-across-3-retries', {baselineMem, afterRetriesMem});

    // Wrong-call marker in 3D scene when adding an invalid hop, AND lose-state after 3 mistakes + retry recovery
    await p.click('[data-node="client"]');
    await p.click('[data-node="server"]');
    const wrongHop = await p.evaluate(() => ({impacts: window.__pq.scene.impactCount, hp: window.__pq.state.hp, fbText: document.getElementById('log').textContent}));
    assert(wrongHop.impacts >= 1, 'expected 3D red impact marker on wrong hop');
    assert.equal(wrongHop.hp, 2);
    assert(wrongHop.fbText.toLowerCase().includes('wrong hop') || wrongHop.fbText.toLowerCase().includes('not wired'), wrongHop.fbText);
    // Make 2 more mistakes to trigger lose state
    await p.click('[data-node="server"]');
    await p.click('[data-node="server"]');
    await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 5000});
    const loseState = await p.evaluate(() => ({status: window.__pq.state.status, hp: window.__pq.state.hp, title: document.getElementById('eTitle').textContent}));
    assert.equal(loseState.status, 'lose');
    assert.equal(loseState.hp, 0);
    await p.click('#eRetry');
    assert.equal(await p.evaluate(() => window.__pq.state.hp), 3);
    ok('wrong-call-3d-impact-marker-and-lose-recovery', {wrongHop, loseState});

    // Ping reachability test: Ping succeeds without completing the stage or opening the win modal
    await p.click('#repair');
    await p.click('[data-node="switch"]');
    await p.click('#repair');
    await p.click('[data-purpose="ping"]');
    for (const n of ['client', 'switch', 'server']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForFunction(() => !window.__pq.busy, null, {timeout: 15000});
    const afterPing = await p.evaluate(() => ({
      status: window.__pq.state.status,
      endHidden: document.getElementById('end').classList.contains('hidden'),
      logText: document.getElementById('log').textContent
    }));
    assert.equal(afterPing.status, 'play', 'ping must not win the stage');
    assert.equal(afterPing.endHidden, true, 'end modal must remain hidden after ping');
    assert(afterPing.logText.toLowerCase().includes('ping'), afterPing.logText);
    ok('ping-succeeds-without-winning-stage', afterPing);

    // Keyboard-only stage 1 win (KeyW, ArrowRight/ArrowLeft, Enter, KeyL, KeyM)
    await p.click('#retry'); await p.waitForTimeout(150);
    await p.keyboard.press('KeyM');
    assert.equal(await p.getAttribute('#mute', 'aria-pressed'), 'true');
    await p.keyboard.press('KeyM');
    assert.equal(await p.getAttribute('#mute', 'aria-pressed'), 'false');
    // Focus starts on client (index 0); move right to switch (index 1), press W to repair, Enter to repair switch, W back to route
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('KeyW');
    await p.keyboard.press('Enter');
    await p.keyboard.press('KeyW');
    // Move left to client, Enter, right to switch, Enter, right to router, right to dns, right to server (index 4), Enter, KeyL to launch
    await p.keyboard.press('ArrowLeft');
    await p.keyboard.press('Enter');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Enter');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Enter');
    await p.keyboard.press('KeyL');
    await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 15000});
    assert.equal(await p.evaluate(() => window.__pq.state.status), 'win');
    ok('keyboard-only-stage1-win', {status: 'win'});

    // Real canvas click picking: repair switch via 3D body click, then build route via 3D label + body clicks, verify hop badges
    await p.click('#eRetry'); await p.waitForTimeout(150);
    await p.click('#repair');
    const swPt = await p.evaluate(() => window.__pq.scene.deviceClientPoint('switch', 'body'));
    await p.mouse.click(swPt.x, swPt.y);
    await p.click('#repair');
    for (const [node, part] of [['client', 'body'], ['switch', 'label'], ['server', 'body']]) {
      const pt = await p.evaluate(([n, pr]) => window.__pq.scene.deviceClientPoint(n, pr), [node, part]);
      await p.mouse.click(pt.x, pt.y);
    }
    const hopCheck = await p.evaluate(() => ({route: window.__pq.state.route, hops: window.__pq.scene.hopCount}));
    assert.deepEqual(hopCheck.route, ['client', 'switch', 'server']);
    assert.equal(hopCheck.hops, 2);
    ok('real-canvas-click-picking-and-hop-badges', hopCheck);

    await p.click('#launch');
    await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 15000});

    // Stage 2: DNS + gateway
    await p.click('#eNext');
    await p.waitForTimeout(250);
    await p.click('#repair');
    await p.click('[data-node="dns"]');
    await p.click('#repair');
    await p.click('[data-purpose="dns"]');
    for (const n of ['client', 'switch', 'dns']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForFunction(() => window.__pq.state.resolved === true && !window.__pq.busy, null, {timeout: 15000});
    await p.click('[data-purpose="page"]');
    for (const n of ['client', 'switch', 'router', 'server']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 15000});

    // Stage 3 (Boss): verify boss glitch effect is active on faulted devices before repair
    await p.click('#eNext');
    await p.waitForTimeout(350);
    const bossGlitch = await p.evaluate(() => ({glitchActive: window.__pq.scene.glitchActive, routerDown: !window.__pq.state.gateway, serverDown: !window.__pq.state.web}));
    assert.equal(bossGlitch.glitchActive, true);
    assert.equal(bossGlitch.routerDown, true);
    assert.equal(bossGlitch.serverDown, true);
    await p.screenshot({path: path.join(evDir, 'desktop-1280.png')});
    ok('boss-glitch-active', bossGlitch);

    // Complete boss stage and verify save persists across reload
    await p.click('#repair');
    await p.click('[data-node="router"]');
    await p.click('[data-node="server"]');
    await p.click('#repair');
    await p.click('[data-purpose="page"]');
    for (const n of ['client', 'switch', 'router', 'server']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 15000});
    await p.reload();
    await p.waitForSelector('#s0');
    const finalSave = await p.evaluate(() => window.__pq.save);
    assert.deepEqual(finalSave.best, [3, 3, 3]);
    ok('three-stages-cleared-and-persisted', finalSave);
    await ctx.close();
  }

  // 1b. Real startup low-end GPU detection via WebGL getParameter override (MAX_TEXTURE_SIZE < 8192 and software renderer)
  {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    const p = await ctx.newPage(); attachGuards(p);
    await p.addInitScript(() => {
      for (const Ctx of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!Ctx) continue;
        const orig = Ctx.prototype.getParameter;
        Ctx.prototype.getParameter = function (param) {
          if (param === 0x0D33) return 4096; // MAX_TEXTURE_SIZE
          return orig.call(this, param);
        };
      }
    });
    await p.goto(base);
    await p.click('#s0');
    const startupLowTex = await p.evaluate(() => ({
      settings: window.__pq.scene.settings(),
      qnote: document.getElementById('qnote').textContent,
      lowPressed: document.querySelector('[data-q="low"]').getAttribute('aria-pressed')
    }));
    assert.equal(startupLowTex.settings.quality, 'low');
    assert.equal(startupLowTex.settings.shadows, false);
    assert(startupLowTex.settings.note.includes('auto: small max texture (4096)'), startupLowTex.settings.note);
    assert(startupLowTex.qnote.includes('auto: small max texture (4096)'), startupLowTex.qnote);
    assert.equal(startupLowTex.lowPressed, 'true');
    await ctx.close();

    const ctxSoft = await browser.newContext({viewport: {width: 1280, height: 900}});
    const pSoft = await ctxSoft.newPage(); attachGuards(pSoft);
    await pSoft.addInitScript(() => {
      for (const Ctx of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!Ctx) continue;
        const orig = Ctx.prototype.getParameter;
        Ctx.prototype.getParameter = function (param) {
          if (param === 0x9246) return 'Google SwiftShader'; // UNMASKED_RENDERER_WEBGL
          return orig.call(this, param);
        };
      }
    });
    await pSoft.goto(base);
    await pSoft.click('#s0');
    const startupSoft = await pSoft.evaluate(() => window.__pq.scene.settings());
    assert.equal(startupSoft.quality, 'low');
    assert.equal(startupSoft.shadows, false);
    assert(startupSoft.note.includes('auto: software renderer'), startupSoft.note);
    await ctxSoft.close();
    ok('real-startup-low-end-gpu-detection', {startupLowTex: startupLowTex.settings, startupSoft});
  }

  // 2. Responsive & label readability >= 12 CSS px, zero label overlap, no horizontal overflow at 1280x900, 390x844 and 320x640 (real 640px fold!)
  for (const [w, h, shot] of [[1280, 900, null], [390, 844, 'mobile-390.png'], [320, 640, 'narrow-320.png']]) {
    const ctx = await browser.newContext({viewport: {width: w, height: h}});
    const p = await ctx.newPage(); attachGuards(p);
    await p.goto(base);
    await p.click('#s2'); // boss stage has the longest fault labels
    await p.waitForTimeout(350);
    const check = await p.evaluate(() => {
      const over = document.documentElement.scrollWidth - window.innerWidth;
      const m = window.__pq.scene.labelMetrics();
      const overlaps = [];
      for (let i = 0; i < m.length; i++) for (let k = i + 1; k < m.length; k++) {
        const a = m[i], b = m[k];
        const ox = Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l));
        const oy = Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
        if (ox > 2 && oy > 2) overlaps.push([a.node, b.node, ox, oy]);
      }
      const log = document.getElementById('log');
      const logCut = log.scrollHeight > log.clientHeight + 2 && getComputedStyle(log).overflowY === 'hidden';
      const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
      const smallBtns = btns.filter((b) => { const br = b.getBoundingClientRect(); return br.width < 43.5 || br.height < 43.5; }).map((b) => b.id || b.textContent);
      return {over, minPx: Math.min(...m.map((x) => Math.min(x.namePx, x.statusPx))), allInside: m.every((x) => x.inside), overlaps, logCut, smallBtns};
    });
    assert(check.over <= 0, `horizontal overflow at ${w}x${h}: ${check.over}`);
    assert.equal(check.smallBtns.length, 0, `buttons < 44x44 at ${w}x${h}: ${JSON.stringify(check.smallBtns)}`);
    assert(check.minPx >= 12, `label text < 12px at ${w}x${h}: ${check.minPx}`);
    assert.equal(check.allInside, true, `label outside canvas at ${w}x${h}`);
    assert.equal(check.overlaps.length, 0, `label overlap at ${w}x${h}: ${JSON.stringify(check.overlaps)}`);
    assert.equal(check.logCut, false, `log cut off at ${w}x${h}`);
    // Actual screenshot pixels along the projected tube: metadata alone cannot pass this.
    const metrics=await p.evaluate(()=>window.__pq.scene.linkMetrics('switch|dns'));
    assert(metrics.projectedDiameterPx>=5,'DNS tube must project to >=5 CSS px');
    assert(metrics.collarCount>=6,'physical dash collars required');
    const image=(await p.locator('#gl').screenshot()).toString('base64');
    const visible=await p.evaluate(async ({image,points})=>{
      const im=new Image();im.src='data:image/png;base64,'+image;await im.decode();
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
      const rect=document.getElementById('gl').getBoundingClientRect(),data=g.getImageData(0,0,c.width,c.height).data;
      return points.slice(5,19).map(p=>{let count=0;const x=Math.round((p.x-rect.left)*c.width/rect.width),y=Math.round((p.y-rect.top)*c.height/rect.height);
        for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const i=((y+dy)*c.width+x+dx)*4,r=data[i],gr=data[i+1],b=data[i+2];if(b>gr*1.08 && r>gr*1.05 && b>r*1.03)count++;}return count;});
    },{image,points:metrics.points});
    assert(visible.filter(n=>n>=2).length >= (w === 320 ? 7 : 10),'DNS branch needs violet pixels at 10/14 samples (7/14 at 320 where device labels cover the termination): '+JSON.stringify(visible));
    check.dnsTube={projectedDiameterPx:metrics.projectedDiameterPx,visibleSamples:visible};
    if (shot) await p.screenshot({path: path.join(evDir, shot)});
    // At 390x844, verify mobile tap-to-play works end-to-end on Stage 1
    if (w === 390) {
      await p.click('#menu');
      await p.click('#s0');
      await p.click('#repair');
      await p.click('[data-node="switch"]');
      await p.click('#repair');
      for (const n of ['client', 'switch', 'server']) await p.click(`[data-node="${n}"]`);
      await p.click('#launch');
      await p.waitForFunction(() => window.__pq.state.status === 'win', null, {timeout: 15000});
    }
    ok(`viewport-${w}x${h}-labels-and-overflow`, check);
    await ctx.close();
  }

  // 3. Reduced motion + camera stationary + instant launch settle + text mode + corrupted localStorage recovery
  {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
    const p = await ctx.newPage(); attachGuards(p);
    await p.addInitScript(() => { localStorage.setItem('wap-practice-3d-save-v1', '{corrupt-json'); });
    await p.goto(base);
    await p.click('#s0');
    await p.waitForTimeout(120);
    const cam0 = await p.evaluate(() => window.__pq.scene.cameraPos());
    await p.waitForTimeout(260);
    const cam1 = await p.evaluate(() => window.__pq.scene.cameraPos());
    const camDelta = Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1], cam1[2] - cam0[2]);
    assert(camDelta < 1e-4, `camera moved under reduced motion: delta=${camDelta}`);
    await p.click('#repair');
    await p.click('[data-node="switch"]');
    await p.click('#repair');
    for (const n of ['client', 'switch', 'server']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForTimeout(80);
    const rm = await p.evaluate(() => ({
      sparks: window.__pq.scene.sparksVisible,
      trail: window.__pq.scene.trailVisible,
      animating: window.__pq.scene.animating,
      best: window.__pq.save.best
    }));
    assert.equal(rm.sparks, false);
    assert.equal(rm.trail, false);
    assert.equal(rm.animating, false, 'reduced motion should settle packet launch immediately');
    await p.waitForFunction(() => window.__pq.state.status === 'win', null, {timeout: 5000});
    await p.keyboard.press('KeyT');
    await p.screenshot({path: path.join(evDir, 'text-mode.png')});
    ok('reduced-motion-stationary-instant-launch-and-text-mode', {...rm, camDelta});
    await ctx.close();
  }

  // 4. WebGL disabled fallback: verify all 3 stages are playable to win without WebGL
  {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    const p = await ctx.newPage(); attachGuards(p);
    await p.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    await p.goto(base);
    // Stage 1
    await p.click('#s0');
    await p.click('#repair');
    await p.click('[data-node="switch"]');
    await p.click('#repair');
    for (const n of ['client', 'switch', 'server']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 5000});
    // Stage 2
    await p.click('#eNext');
    await p.click('#repair');
    await p.click('[data-node="dns"]');
    await p.click('#repair');
    await p.click('[data-purpose="dns"]');
    for (const n of ['client', 'switch', 'dns']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForFunction(() => window.__pq.state.resolved === true, null, {timeout: 5000});
    await p.click('[data-purpose="page"]');
    for (const n of ['client', 'switch', 'router', 'server']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 5000});
    // Stage 3 (Boss)
    await p.click('#eNext');
    await p.click('#repair');
    await p.click('[data-node="router"]');
    await p.click('[data-node="server"]');
    await p.click('#repair');
    await p.click('[data-purpose="page"]');
    for (const n of ['client', 'switch', 'router', 'server']) await p.click(`[data-node="${n}"]`);
    await p.click('#launch');
    await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 5000});
    const fb = await p.evaluate(() => ({glOk: window.__pq.glOk, textMode: window.__pq.textMode, notice: !document.getElementById('glNotice').hidden, best: window.__pq.save.best}));
    assert.equal(fb.glOk, false);
    assert.equal(fb.textMode, true);
    assert.equal(fb.notice, true);
    assert.deepEqual(fb.best, [3, 3, 3]);
    ok('webgl-disabled-fallback-all-3-stages-playable', fb);
    await ctx.close();
  }

  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join('; ')}`);
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
  assert.equal(externalRequests.length, 0, `external requests: ${externalRequests.join('; ')}`);
  ok('zero-console-page-network-errors');
  fs.writeFileSync(path.join(evDir, 'browser-results.json'), JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
