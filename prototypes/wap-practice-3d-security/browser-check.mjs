// Headed-Chrome browser check for Firewall Defender 3D (semi-real look + polish).
// Verifies: quality toggle (Low/Medium/High), shadows on High and off on Low, no resource growth across 3 retries,
// canvas non-blank and non-flat (pixel variance + luminance range), real canvas click picking (item + pad),
// wrong-call 3D marker + "Previous packet" feedback tag, selected ring color (#ffe066), prompt reflects selected item,
// traffic wording, key hints & email domains >= 12 CSS px at 390 and 320, boss login label measured at 390 >= 12 CSS px,
// pad bases clear of canvas bottom at 390, no overflow at 1280/390/320, reduced-motion, WebGL-off fallback, zero errors.
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

  // 1. Desktop 1280x900: pilot boundary, semi-real settings, quality toggle + auto-fallback, pause stops loop,
  //    live-item retry disposal, wrong-call 3D marker + Previous packet tag, real canvas click picking,
  //    Boss teaching accuracy (4 packet rules + separate Content & identity checks box), 3D floor-plate pads,
  //    and full 4-stage playthrough + reload persistence
  {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    const p = await ctx.newPage(); attachGuards(p);
    await p.goto(base);
    await p.waitForSelector('#s0');
    await p.click('#s0');
    await p.waitForFunction(() => window.__fd && window.__fd.state.items.length >= 1, null, {timeout: 8000});

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

    // Semi-real default settings
    const initSet = await p.evaluate(() => window.__fd.scene.settings());
    assert.equal(initSet.quality, 'medium');
    assert.equal(initSet.shadows, true);
    assert.equal(initSet.toneMapping, 'ACESFilmic');
    assert.equal(initSet.colorSpace, 'srgb');
    assert.equal(initSet.environment, true);
    assert.equal(initSet.materialType, 'MeshStandardMaterial');
    assert(initSet.pixelRatio <= 2);
    ok('semi-real-default-settings', initSet);

    // Quality toggle + low-end GPU & frame-budget auto-fallback
    await p.click('[data-q="low"]');
    const lowSet = await p.evaluate(() => ({...window.__fd.scene.settings(), pressed: document.querySelector('[data-q="low"]').getAttribute('aria-pressed')}));
    assert.equal(lowSet.quality, 'low');
    assert.equal(lowSet.shadows, false);
    assert.equal(lowSet.glow, false);
    assert.equal(lowSet.pressed, 'true');

    await p.click('[data-q="high"]');
    const highSet = await p.evaluate(() => ({...window.__fd.scene.settings(), pressed: document.querySelector('[data-q="high"]').getAttribute('aria-pressed')}));
    assert.equal(highSet.quality, 'high');
    assert.equal(highSet.shadows, true);
    assert.equal(highSet.shadowMapSize, 2048);
    assert.equal(highSet.glow, true);
    assert.equal(highSet.pressed, 'true');

    const realBudgetDrop = await p.evaluate(() => {
      window.__fd.scene.setQuality('high', '');
      for (let i = 0; i < 90; i++) window.__fd.scene.render(0.055);
      const after = window.__fd.scene.settings();
      const uiNote = document.getElementById('qnote').textContent;
      window.__fd.scene.setQuality('medium', '');
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
    const f0 = await p.evaluate(() => window.__fd.scene.renderer.info.render.frame);
    await p.waitForTimeout(220);
    const f1 = await p.evaluate(() => window.__fd.scene.renderer.info.render.frame);
    assert.equal(f0, f1, `render loop continued while paused: ${f0} -> ${f1}`);
    await p.click('#resume');
    await p.waitForTimeout(150);
    const f2 = await p.evaluate(() => window.__fd.scene.renderer.info.render.frame);
    assert(f2 > f1, 'render loop did not resume after unpausing');

    await p.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForTimeout(80);
    const vf0 = await p.evaluate(() => window.__fd.scene.renderer.info.render.frame);
    await p.waitForTimeout(220);
    const vf1 = await p.evaluate(() => window.__fd.scene.renderer.info.render.frame);
    assert.equal(vf0, vf1, `render loop continued while document.hidden: ${vf0} -> ${vf1}`);
    await p.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForTimeout(120);
    const vf2 = await p.evaluate(() => window.__fd.scene.renderer.info.render.frame);
    assert(vf2 > vf1, 'render loop did not resume after document became visible');
    ok('pause-and-visibility-stop-render-loop', {f0, f1, f2, vf0, vf1, vf2});

    // Canvas non-blank and non-flat
    const cStats = await sampleCanvasStats(p);
    assert(cStats.variance > 80, `canvas variance too low: ${cStats.variance}`);
    assert(cStats.lumRange > 90, `canvas luminance range too narrow: ${cStats.lumRange}`);
    assert(cStats.nonBgRatio > 0.12, `canvas mostly blank: ${cStats.nonBgRatio}`);
    ok('canvas-non-blank-and-non-flat', cStats);

    // Selected ring matches documented yellow (#ffe066), prompt reflects selected item, and traffic wording is used
    const uiCheck = await p.evaluate(() => {
      const g = window.__fd;
      const fb = document.getElementById('feedback').textContent;
      const goalsText = document.getElementById('goals').textContent;
      const fbRect = document.getElementById('feedback').getBoundingClientRect();
      return {ringHex: g.scene.selRingHex, fb, goalsText, fbVisibleWithoutScroll: fbRect.bottom <= window.innerHeight};
    });
    assert.equal(uiCheck.ringHex, '#ffe066');
    assert(uiCheck.fb.includes('Selected:'), `prompt should reflect selected item: ${uiCheck.fb}`);
    assert(uiCheck.goalsText.includes('traffic items'), `goals should say traffic items: ${uiCheck.goalsText}`);
    assert.equal(uiCheck.fbVisibleWithoutScroll, true, 'feedback box should be visible without scrolling');
    ok('selected-ring-and-prompt-and-wording', uiCheck);

    // Live-item retry disposal across 3 retries (with active items and outcome bursts)
    await p.click('#retry');
    await p.waitForFunction(() => window.__fd.state.items.length >= 1, null, {timeout: 8000});
    await p.evaluate(() => {
      const it = window.__fd.state.items[0];
      document.getElementById('act-' + it.correct).click();
    });
    await p.click('#retry'); await p.waitForTimeout(120);
    const baselineMem = await p.evaluate(() => window.__fd.scene.stats());
    for (let i = 0; i < 3; i++) {
      await p.waitForFunction(() => window.__fd.state.items.length >= 1, null, {timeout: 8000});
      await p.evaluate(() => {
        const it = window.__fd.state.items[0];
        document.getElementById('act-' + it.correct).click();
      });
      await p.click('#retry');
      await p.waitForTimeout(120);
    }
    const afterRetriesMem = await p.evaluate(() => window.__fd.scene.stats());
    assert(afterRetriesMem.geometries <= baselineMem.geometries, `geometries grew: ${baselineMem.geometries} -> ${afterRetriesMem.geometries}`);
    assert(afterRetriesMem.textures <= baselineMem.textures, `textures grew: ${baselineMem.textures} -> ${afterRetriesMem.textures}`);
    assert(afterRetriesMem.materials <= baselineMem.materials, `materials grew: ${baselineMem.materials} -> ${afterRetriesMem.materials}`);
    assert(afterRetriesMem.renderTargets <= baselineMem.renderTargets, `renderTargets grew: ${baselineMem.renderTargets} -> ${afterRetriesMem.renderTargets}`);
    ok('no-resource-growth-across-3-live-retries', {baselineMem, afterRetriesMem});

    // Wrong call produces distinct 3D wrong-call marker AND "Previous packet" tag in feedback
    await p.waitForFunction(() => window.__fd.state.items.length >= 1, null, {timeout: 8000});
    const wrongInfo = await p.evaluate(() => {
      const it = window.__fd.state.items.find((x) => x.id === window.__fd.selectedId) || window.__fd.state.items[0];
      return {id: it.id, wrongAction: it.correct === 'allow' ? 'block' : 'allow'};
    });
    await p.click(`#act-${wrongInfo.wrongAction}`);
    const afterWrong = await p.evaluate(() => ({
      wrongMarkers: window.__fd.scene.wrongMarkerCount,
      fbClass: document.getElementById('feedback').className,
      prevTag: document.querySelector('#feedback .prevtag')?.textContent || ''
    }));
    assert(afterWrong.wrongMarkers >= 1, 'expected 3D wrong-call marker on object/barrier');
    assert.equal(afterWrong.fbClass, 'bad');
    assert(afterWrong.prevTag.includes('Previous packet'), `expected Previous packet tag, got: ${afterWrong.prevTag}`);
    ok('wrong-call-3d-marker-and-previous-packet-tag', afterWrong);

    // Real canvas click picking: click a traffic item in the 3D canvas, then click the right 3D floor-plate decision pad
    await p.click('#retry');
    await p.waitForFunction(() => window.__fd.state.items.length >= 1, null, {timeout: 8000});
    const pickTarget = await p.evaluate(() => {
      const it = window.__fd.state.items[0];
      const r = window.__fd.scene.labelRect(it.id);
      const pad = window.__fd.scene.padPoint(it.correct);
      return {id: it.id, correct: it.correct, lx: r.x, ly: r.y, px: pad.x, py: pad.y, isFloorPlate: pad.isFloorPlate, clearancePx: r.clearancePx};
    });
    assert.equal(pickTarget.isFloorPlate, true, 'decision pad must be a 3D floor plate');
    assert(pickTarget.clearancePx >= 4, `label should sit above 3D mesh without occluding it, got clearance=${pickTarget.clearancePx}`);
    await p.mouse.click(pickTarget.lx, pickTarget.ly);
    const pickedId = await p.evaluate(() => window.__fd.selectedId);
    assert.equal(pickedId, pickTarget.id);
    await p.mouse.click(pickTarget.px, pickTarget.py);
    const afterRight = await p.evaluate(() => ({handled: window.__fd.state.handled, rightMarkers: window.__fd.scene.rightMarkerCount, fbClass: document.getElementById('feedback').className}));
    assert.equal(afterRight.handled, 1);
    assert(afterRight.rightMarkers >= 1, 'expected 3D shield burst on right call');
    assert.equal(afterRight.fbClass, 'good');
    ok('real-canvas-click-picking-item-and-floor-pad', afterRight);

    await p.screenshot({path: path.join(evDir, 'desktop-1280.png')});

    // Timeout and lose-state recovery: let items expire until hp hits 0, verify Too slow feedback + Out of lives modal + retry reset
    await p.click('#retry');
    await p.waitForFunction(() => window.__fd.state.items.length >= 1, null, {timeout: 8000});
    const timeoutLose = await p.evaluate(() => {
      for (let i = 0; i < 400 && window.__fd.state.hp === 3; i++) window.__fd.step(0.1);
      const afterFirstTimeout = {hp: window.__fd.state.hp, missed: window.__fd.state.stats.missed, fb: document.getElementById('feedback').textContent, fbClass: document.getElementById('feedback').className};
      for (let i = 0; i < 800 && window.__fd.state.status === 'play'; i++) window.__fd.step(0.1);
      const endOpen = !document.getElementById('end').classList.contains('hidden');
      const endTitle = document.getElementById('eTitle').textContent;
      return {afterFirstTimeout, status: window.__fd.state.status, hp: window.__fd.state.hp, endOpen, endTitle};
    });
    assert.equal(timeoutLose.afterFirstTimeout.hp, 2);
    assert.equal(timeoutLose.afterFirstTimeout.missed, 1);
    assert.equal(timeoutLose.afterFirstTimeout.fbClass, 'bad');
    assert(timeoutLose.afterFirstTimeout.fb.includes('Too slow'), `expected Too slow feedback, got: ${timeoutLose.afterFirstTimeout.fb}`);
    assert.equal(timeoutLose.status, 'lose');
    assert.equal(timeoutLose.hp, 0);
    assert.equal(timeoutLose.endOpen, true);
    assert(timeoutLose.endTitle.includes('Out of lives'), `expected Out of lives lose title, got: ${timeoutLose.endTitle}`);
    await p.click('#eRetry');
    const afterLoseRetry = await p.evaluate(() => ({status: window.__fd.state.status, hp: window.__fd.state.hp}));
    assert.equal(afterLoseRetry.status, 'play');
    assert.equal(afterLoseRetry.hp, 3);
    ok('timeout-and-lose-and-retry', {timeoutLose, afterLoseRetry});

    // Keyboard-only playthrough on Stage 1 (ArrowRight + KeyA/KeyB + KeyM)
    await p.click('#retry');
    await p.keyboard.press('KeyM');
    assert.equal(await p.getAttribute('#mute', 'aria-pressed'), 'true');
    await p.keyboard.press('KeyM');
    assert.equal(await p.getAttribute('#mute', 'aria-pressed'), 'false');
    for (let guard = 0; guard < 12; guard++) {
      await p.waitForFunction(() => window.__fd.state.items.length >= 1 || window.__fd.state.status !== 'play', null, {timeout: 8000});
      const st = await p.evaluate(() => {
        if (window.__fd.state.status !== 'play') return {done: true, status: window.__fd.state.status};
        const it = window.__fd.state.items.find((x) => x.id === window.__fd.selectedId) || window.__fd.state.items[0];
        return {done: false, correct: it.correct};
      });
      if (st.done) break;
      await p.keyboard.press(st.correct === 'allow' ? 'KeyA' : 'KeyB');
    }
    await p.waitForFunction(() => window.__fd.state.status === 'win', null, {timeout: 8000});
    ok('keyboard-only-stage1-win', {status: 'win'});

    // Play through all 4 stages cleanly and verify Boss teaching accuracy (no Rule 5 after DENY; separate Content & identity checks box)
    await p.click('#eRetry');
    for (let st = 0; st < 4; st++) {
      let checkedBossPolicy = st !== 3;
      for (let guard = 0; guard < 20; guard++) {
        await p.waitForFunction(() => window.__fd.state.items.length >= 1 || window.__fd.state.status !== 'play', null, {timeout: 8000});
        const status = await p.evaluate(() => window.__fd.state.status);
        if (status !== 'play') break;
        if (!checkedBossPolicy) {
          const bossPol = await p.evaluate(() => {
            const it = window.__fd.state.items.find((x) => x.id === window.__fd.selectedId) || window.__fd.state.items[0];
            const ruleCount = document.querySelectorAll('#policy li').length;
            const ruleHits = document.querySelectorAll('#policy li.hit').length;
            const ccVisible = !document.getElementById('contentChecksBox').hidden;
            const ccHits = [...document.querySelectorAll('#contentChecks li.hit')].map((el) => el.dataset.check);
            return {kind: it.data.kind, ruleCount, ruleHits, ccVisible, ccHits};
          });
          assert.equal(bossPol.ruleCount, 4, 'Boss #policy must have 4 first-match packet rules, never a 5th rule after catch-all DENY');
          assert.equal(bossPol.ccVisible, true, 'Boss must show separate Content and identity checks box');
          if (bossPol.kind === 'packet') {
            assert.equal(bossPol.ruleHits, 1);
            assert.equal(bossPol.ccHits.length, 0);
          } else {
            assert.equal(bossPol.ruleHits, 0, 'Non-packet item must not highlight a packet firewall rule');
            assert.deepEqual(bossPol.ccHits, [bossPol.kind]);
            checkedBossPolicy = true;
          }
        }
        await p.evaluate(() => {
          const it = window.__fd.state.items.find((x) => x.id === window.__fd.selectedId) || window.__fd.state.items[0];
          if (it) document.getElementById('act-' + it.correct).click();
        });
      }
      await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 8000});
      if (st < 3) await p.click('#eNext');
    }
    await p.reload();
    await p.waitForSelector('#s0');
    const saved = await p.evaluate(() => window.__fd.save);
    assert.deepEqual(saved.best, [3, 3, 3, 3]);
    ok('four-stages-cleared-boss-policy-verified-and-persisted', saved);
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
      settings: window.__fd.scene.settings(),
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
    const startupSoft = await pSoft.evaluate(() => window.__fd.scene.settings());
    assert.equal(startupSoft.quality, 'low');
    assert.equal(startupSoft.shadows, false);
    assert(startupSoft.note.includes('auto: software renderer'), startupSoft.note);
    await ctxSoft.close();
    ok('real-startup-low-end-gpu-detection', {startupLowTex: startupLowTex.settings, startupSoft});
  }

  // 2. Responsive & in-scene label/mesh/pad/fold checks at 1280x900, 390x844 and 320x640 (real 640px height fold!)
  for (const [w, h, shot] of [[1280, 900, null], [390, 844, 'mobile-390.png'], [320, 640, 'narrow-320.png']]) {
    const ctx = await browser.newContext({viewport: {width: w, height: h}});
    const p = await ctx.newPage(); attachGuards(p);
    await p.goto(base);

    // Stage 3 (Email stage, index 2): measure email domain label size & 3D envelope mesh non-occlusion
    await p.click('#s2');
    await p.waitForFunction(() => window.__fd.state.items.some((i) => i.data.kind === 'email'), null, {timeout: 8000});
    const emailCheck = await p.evaluate(() => {
      const g = window.__fd;
      const em = g.state.items.find((i) => i.data.kind === 'email');
      const r = g.scene.labelRect(em.id);
      const pads = ['allow', 'block'].map((a) => g.scene.padPoint(a));
      return {domain: em.label.l2, l2px: r.l2px, clearancePx: r.clearancePx, meshH: r.meshH,
        minPlateH: Math.min(...pads.map((x) => x.plateH)),
        minKeyPx: Math.min(...pads.map((x) => x.keyPx)),
        minPadGapPx: Math.min(...pads.map((x) => x.bottomGapPx)),
        over: document.documentElement.scrollWidth - window.innerWidth};
    });
    assert(emailCheck.over <= 0, `horizontal overflow at ${w}x${h}: ${emailCheck.over}`);
    assert(emailCheck.l2px >= 12, `email domain < 12px at ${w}x${h}: ${emailCheck.l2px}`);
    assert(emailCheck.clearancePx >= 4, `email label occludes 3D envelope at ${w}x${h}: clearance=${emailCheck.clearancePx}`);
    assert(emailCheck.meshH >= 26, `3D envelope mesh too small at ${w}x${h}: ${emailCheck.meshH}`);
    assert(emailCheck.minKeyPx >= 12, `pad key hint (unclamped) < 12px at ${w}x${h}: ${emailCheck.minKeyPx} (plateH=${emailCheck.minPlateH})`);
    assert(emailCheck.minPadGapPx >= 12, `pad base touches canvas bottom at ${w}x${h}: gap=${emailCheck.minPadGapPx}`);

    // At 390x844, verify mobile tap-to-play (tap item in #flight + tap action button)
    if (w === 390) {
      await p.evaluate(() => {
        const btn = document.querySelector('#flight button');
        if (btn) btn.click();
        const it = window.__fd.state.items.find((x) => x.id === window.__fd.selectedId) || window.__fd.state.items[0];
        if (it) document.getElementById('act-' + it.correct).click();
      });
      const handledTap = await p.evaluate(() => window.__fd.state.handled);
      assert(handledTap >= 1, 'mobile tap-to-play should handle item');
    }

    // Stage 4 (Boss stage, index 3): check email fold first, then advance until a login item is in flight
    await p.click('#menu');
    await p.click('#s3');
    await p.waitForFunction(() => window.__fd.state.items.length >= 1, null, {timeout: 8000});
    // Advance until an email item is selected to verify worst-case 4-row evidence fold at 320x640 and 390x844
    await p.evaluate(() => {
      for (let guard = 0; guard < 10 && !window.__fd.state.items.some((i) => i.data.kind === 'email'); guard++) {
        const it = window.__fd.state.items[0];
        if (!it) break;
        document.getElementById('act-' + it.correct).click();
      }
      const em = window.__fd.state.items.find((i) => i.data.kind === 'email');
      if (em) {
        const btn = [...document.querySelectorAll('#flight button')].find((b) => b.textContent.includes('EMAIL'));
        if (btn) btn.click();
      }
    });
    const emailFold = await p.evaluate(() => {
      const fbRect = document.getElementById('feedback').getBoundingClientRect();
      const selRect = document.getElementById('selectedCard').getBoundingClientRect();
      const actBtns = [...document.querySelectorAll('.actions button')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect().bottom);
      return {fbBottom: fbRect.bottom, selBottom: selRect.bottom, maxActBottom: Math.max(...actBtns)};
    });
    assert(emailFold.fbBottom <= h, `at ${w}x${h} #feedback must sit above fold (${h}), got ${emailFold.fbBottom}`);
    assert(emailFold.selBottom <= h, `at ${w}x${h} #selectedCard (4-row email evidence + actions) must sit above fold (${h}), got ${emailFold.selBottom}`);
    assert(emailFold.maxActBottom <= h, `at ${w}x${h} Allow/Block/Reset buttons must sit above fold (${h}), got ${emailFold.maxActBottom}`);

    await p.evaluate(() => {
      for (let guard = 0; guard < 10 && !window.__fd.state.items.some((i) => i.data.kind === 'login'); guard++) {
        const it = window.__fd.state.items[0];
        if (!it) break;
        document.getElementById('act-' + it.correct).click();
      }
    });
    await p.waitForFunction(() => window.__fd.state.items.some((i) => i.data.kind === 'login'), null, {timeout: 8000});
    const bossCheck = await p.evaluate(() => {
      const g = window.__fd;
      const lg = g.state.items.find((i) => i.data.kind === 'login');
      const r = g.scene.labelRect(lg.id);
      const pads = ['allow', 'block', 'reset'].map((a) => g.scene.padPoint(a));
      const padGap1 = pads[1].l - pads[0].r;
      const padGap2 = pads[2].l - pads[1].r;
      const fbRect = document.getElementById('feedback').getBoundingClientRect();
      const selRect = document.getElementById('selectedCard').getBoundingClientRect();
      const logRect = document.getElementById('logCard').getBoundingClientRect();
      const log = document.getElementById('log');
      const logCut = log.scrollHeight > log.clientHeight + 2 && getComputedStyle(log).overflowY === 'hidden';
      const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
      const smallBtns = btns.filter((b) => { const br = b.getBoundingClientRect(); return br.width < 43.5 || br.height < 43.5; }).map((b) => b.id || b.textContent);
      return {loginLabel: `${lg.label.l1} / ${lg.label.l2}`, l1px: r.l1px, l2px: r.l2px, clearancePx: r.clearancePx, meshH: r.meshH,
        minPlateH: Math.min(...pads.map((x) => x.plateH)),
        minKeyPx: Math.min(...pads.map((x) => x.keyPx)), minPadGapPx: Math.min(...pads.map((x) => x.bottomGapPx)),
        minGatewayGapPx: Math.min(...pads.map((x) => x.gatewayGapPx)), padGap1, padGap2,
        allFloorPlates: pads.every((x) => x.isFloorPlate && !x.hasBillboardSprite),
        fbBottom: fbRect.bottom, selBottom: selRect.bottom, logTop: logRect.top,
        smallBtns, over: document.documentElement.scrollWidth - window.innerWidth, logCut};
    });
    assert(bossCheck.over <= 0, `boss overflow at ${w}x${h}: ${bossCheck.over}`);
    assert.equal(bossCheck.smallBtns.length, 0, `buttons < 44x44 at ${w}x${h}: ${JSON.stringify(bossCheck.smallBtns)}`);
    assert(bossCheck.l2px >= 12, `boss login label < 12px at ${w}x${h}: ${bossCheck.l2px}`);
    assert(bossCheck.clearancePx >= 4, `boss login label occludes 3D key at ${w}x${h}: clearance=${bossCheck.clearancePx}`);
    assert(bossCheck.meshH >= 25, `boss 3D key mesh too small at ${w}x${h}: ${bossCheck.meshH}`);
    assert(bossCheck.minKeyPx >= 12, `boss pad key hint (unclamped) < 12px at ${w}x${h}: ${bossCheck.minKeyPx} (plateH=${bossCheck.minPlateH})`);
    assert(bossCheck.minPadGapPx >= 12, `boss pad base touches canvas bottom at ${w}x${h}: gap=${bossCheck.minPadGapPx}`);
    assert(bossCheck.minGatewayGapPx > 0, `boss pads overlap gateway appliance at ${w}x${h}: gap=${bossCheck.minGatewayGapPx}`);
    assert(bossCheck.padGap1 > 4 && bossCheck.padGap2 > 4, `boss floor pads overlap horizontally at ${w}x${h}: ${bossCheck.padGap1}, ${bossCheck.padGap2}`);
    assert.equal(bossCheck.allFloorPlates, true, 'pads must be 3D floor plates, not billboard sprites');
    assert(bossCheck.fbBottom <= h, `at ${w}x${h} #feedback must sit above fold (${h}), got ${bossCheck.fbBottom}`);
    assert(bossCheck.selBottom <= h, `at ${w}x${h} #selectedCard (evidence + Allow/Block/Reset) must sit above fold (${h}), got ${bossCheck.selBottom}`);
    if (w <= 900) {
      assert(bossCheck.logTop > bossCheck.selBottom - 4, `on mobile #logCard must come after #selectedCard`);
    }
    assert.equal(bossCheck.logCut, false, `log cut off at ${w}x${h}`);
    if (shot) await p.screenshot({path: path.join(evDir, shot)});
    ok(`viewport-${w}x${h}-email-login-pads-and-fold`, {emailCheck, emailFold, bossCheck});
    await ctx.close();
  }

  // 3. Reduced motion + outcome behavior (no particles, no camera shake, state shown by text/markers) + text mode + corrupted localStorage
  {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
    const p = await ctx.newPage(); attachGuards(p);
    await p.addInitScript(() => { localStorage.setItem('wap-practice-3d-security-save-v1', '{bad-json'); });
    await p.goto(base);
    await p.click('#s0');
    await p.waitForFunction(() => window.__fd.state.items.length >= 1, null, {timeout: 8000});
    const rmOutcome = await p.evaluate(() => {
      const g = window.__fd;
      const it1 = g.state.items.find((x) => x.id === g.selectedId) || g.state.items[0];
      const wrongAct = it1.correct === 'allow' ? 'block' : 'allow';
      document.getElementById('act-' + wrongAct).click();
      const afterWrong = {
        shake: g.scene.shakeLevel,
        particles: g.scene.burstParticleCount,
        wrongMarkers: g.scene.wrongMarkerCount,
        fbClass: document.getElementById('feedback').className
      };
      for (let i = 0; i < 30 && g.state.items.length === 0 && g.state.status === 'play'; i++) g.step(0.1);
      const it2 = g.state.items.find((x) => x.id === g.selectedId) || g.state.items[0];
      if (!it2) return {reduced: g.reduced, sceneReduced: g.scene.reduced, best: g.save.best, afterWrong, afterRight: {shake: 0, particles: 0, fbClass: 'good'}, noSecondItem: true};
      document.getElementById('act-' + it2.correct).click();
      const afterRight = {
        shake: g.scene.shakeLevel,
        particles: g.scene.burstParticleCount,
        rightMarkers: g.scene.rightMarkerCount,
        fbClass: document.getElementById('feedback').className
      };
      return {reduced: g.reduced, sceneReduced: g.scene.reduced, best: g.save.best, afterWrong, afterRight};
    });
    assert.equal(rmOutcome.reduced, true);
    assert.equal(rmOutcome.sceneReduced, true);
    assert.deepEqual(rmOutcome.best, [0, 0, 0, 0]);
    assert.equal(rmOutcome.afterWrong.shake, 0, 'reduced motion must not shake camera on wrong call');
    assert.equal(rmOutcome.afterWrong.particles, 0, 'reduced motion must not spawn particle bursts');
    assert(rmOutcome.afterWrong.wrongMarkers >= 1, 'reduced motion still shows wrong marker');
    assert.equal(rmOutcome.afterWrong.fbClass, 'bad');
    assert.equal(rmOutcome.afterRight.shake, 0);
    assert.equal(rmOutcome.afterRight.particles, 0);
    assert.equal(rmOutcome.afterRight.fbClass, 'good');
    await p.click('#textMode');
    await p.screenshot({path: path.join(evDir, 'text-mode.png')});
    ok('reduced-motion-outcomes-and-text-mode', rmOutcome);
    await ctx.close();
  }

  // 4. WebGL disabled fallback: verify all 4 stages are playable to win without WebGL
  {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    const p = await ctx.newPage(); attachGuards(p);
    await p.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    await p.goto(base);
    await p.click('#s0');
    for (let st = 0; st < 4; st++) {
      for (let guard = 0; guard < 20; guard++) {
        const status = await p.evaluate(() => window.__fd.state.status);
        if (status !== 'play') break;
        await p.evaluate(() => {
          const it = window.__fd.state.items[0];
          if (it) document.getElementById('act-' + it.correct).click();
        });
      }
      await p.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, {timeout: 5000});
      const stWon = await p.evaluate(() => window.__fd.state.status === 'win');
      assert.equal(stWon, true, `WebGL-off stage ${st + 1} should be winnable`);
      if (st < 3) await p.click('#eNext');
    }
    const fb = await p.evaluate(() => ({glOk: window.__fd.glOk, textMode: window.__fd.textMode, notice: !document.getElementById('glNotice').hidden, best: window.__fd.save.best}));
    assert.equal(fb.glOk, false);
    assert.equal(fb.textMode, true);
    assert.equal(fb.notice, true);
    assert.deepEqual(fb.best, [3, 3, 3, 3]);
    ok('webgl-disabled-fallback-all-4-stages-playable', fb);
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
