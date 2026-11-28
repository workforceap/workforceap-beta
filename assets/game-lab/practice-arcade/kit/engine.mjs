// WAP Practice Arcade engine: renderer, camera (focus solver, glide, punch, shake, idle drift), resize, quality ladder,
// frame loop, tap picking. One engine per page. Worlds and mechanic views add their groups to engine.scene and remove
// them on dispose.
//
// Stage (the play volume every mechanic uses): floor y = 0, x -3..3, z -6 (far) .. 2 (near the camera, +z).
//
// Camera API (v1.1):
//   engine.setFocus(box, opts)  box = {x0, x1, z0, z1, y0 = 0, y1 = 1.2} world-space volume to frame;
//                               opts = {pitch = 40 (deg down from horizontal, 25..65), yaw = 0 (deg, -20..20),
//                                       margin = .06 (empty border, fraction of the canvas), ease = .6 (s; 0 snaps)}.
//                               The whole box is fitted as large as possible at the canvas aspect; re-solved on resize.
//   engine.setFocus(null)       back to the default view (the whole stage at pitch 40).
//   engine.punch(amount = 1)    quick push-in (~8% of the distance x amount plus a ~2.5 deg FOV kick, ~260 ms; the shell
//                               passes up to 1.75 at a long streak). No-op under reduced motion.
//   engine.shake(amount = 1)    short shake (about 0.4 world units at amount 1, quick decay). No-op under reduced motion.
//   engine.flash(color, s = 1)  short scene-light flash (hemisphere light + exposure) toward a colour, ~0.4 s. Under
//                               reduced motion a calm, softer tint instead.
//   engine.setInsets({top = 0, bottom = 0}, {ease = .35})  CSS px of the canvas covered by UI (for example the feedback
//                               sheet). The focus box is then fitted into the visible band between them (re-solved on
//                               resize); {} clears. The band never shrinks below about 30% of the canvas height.
//   engine.pxPerUnit(v3)        CSS pixels per world unit at a world point (for sizing labels).
//   Idle drift (about +-1.2 deg yaw and a tiny bob) runs while the loop runs; off under reduced motion.
import * as THREE from './vendor/three.module.min.js';
import {QUALITY, LEVELS, lowerQuality, createKit, createLights, makeEnvironment, detectQuality, createBudget, applyMood, accentSet} from './look.mjs';

export const STAGE = Object.freeze({x0: -3, x1: 3, z0: -6, z1: 2, top: 1.7});
export const DEFAULT_FOCUS = Object.freeze({x0: -3, x1: 3, z0: -6, z1: 2, y0: 0, y1: 1.3});
export const DEFAULT_VIEW = Object.freeze({pitch: 40, yaw: 0, margin: .035, ease: .6});

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Vertical field of view by canvas aspect: a touch wider on tall phone canvases (stronger, friendlier perspective).
export const fovFor = (aspect) => clamp(50 - (aspect - .7) * 11, 39, 50);

// Pure fit solver (exported for tests and tools). Returns {tx, ty, tz, dist, pitch, yaw} so that every corner of the
// box projects inside the canvas minus the margin, as large as possible, for a camera looking at (tx, ty, tz) from
// `dist` away with the given pitch / yaw (degrees), vertical fov (degrees) and aspect (w / h).
export function solveFocus(box, {pitch = 40, yaw = 0, margin = .06} = {}, fov = 45, aspect = 1) {
  const p = pitch * D2R, y = yaw * D2R;
  const fx = -Math.sin(y) * Math.cos(p), fy = -Math.sin(p), fz = -Math.cos(y) * Math.cos(p); // forward
  const rx = Math.cos(y), rz = -Math.sin(y);                                                  // right (ry = 0)
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                                  // up = right x forward
  const m = clamp(margin, 0, .35);
  const ty = Math.tan(fov * D2R / 2), ky = ty * (1 - 2 * m), kx = ty * aspect * (1 - 2 * m);
  let A = -Infinity, B = -Infinity, A2 = -Infinity, B2 = -Infinity;
  const xs = [box.x0, box.x1], ys = [num(box.y0, 0), num(box.y1, 1.2)], zs = [box.z0, box.z1];
  const PR = [], PU = [], PF = [];
  for (const X of xs) for (const Y of ys) for (const Z of zs) {
    const pr = X * rx + Z * rz, pu = X * ux + Y * uy + Z * uz, pf = X * fx + Y * fy + Z * fz;
    PR.push(pr); PU.push(pu); PF.push(pf);
    A = Math.max(A, pr - kx * pf); B = Math.max(B, -pr - kx * pf);
    A2 = Math.max(A2, pu - ky * pf); B2 = Math.max(B2, -pu - ky * pf);
  }
  const cf = Math.min(-(A + B) / (2 * kx), -(A2 + B2) / (2 * ky));
  // Centre the box on screen along each axis (projected extents symmetric); the binding axis is already exact.
  const centre = (P, lo, hi) => {
    const g = (c) => { let mx = -Infinity, mn = Infinity; for (let i = 0; i < P.length; i++) { const v = (P[i] - c) / (PF[i] - cf); mx = Math.max(mx, v); mn = Math.min(mn, v); } return mx + mn; };
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (g(mid) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const cr = centre(PR, A + kx * cf, -B - kx * cf), cu = centre(PU, A2 + ky * cf, -B2 - ky * cf);
  const cx = cr * rx + cu * ux + cf * fx, cy = cu * uy + cf * fy, cz = cr * rz + cu * uz + cf * fz; // camera position
  const mx = (box.x0 + box.x1) / 2, my = (ys[0] + ys[1]) / 2, mz = (box.z0 + box.z1) / 2;
  const dist = Math.max(.5, (mx - cx) * fx + (my - cy) * fy + (mz - cz) * fz);
  return {tx: cx + fx * dist, ty: cy + fy * dist, tz: cz + fz * dist, dist, pitch, yaw};
}

// Visible band for UI insets (pure, exported for tests): the canvas height ch minus the top / bottom insets (CSS px),
// with the insets scaled down together so the band keeps at least max(80 px, 30% of ch). Returns {t, b, h, fov, aspect}
// where fov / aspect describe the band for a camera whose full-canvas vertical fov is `fov` (degrees) and width is cw.
export function insetBand(cw, ch, top = 0, bottom = 0, fov = 45) {
  let t = Math.max(0, num(top, 0)), b = Math.max(0, num(bottom, 0));
  const minH = Math.min(ch, Math.max(80, ch * .3)), over = t + b - (ch - minH);
  if (over > 0 && t + b > 0) { const k = Math.max(0, t + b - over) / (t + b); t *= k; b *= k; }
  const h = Math.max(1, ch - t - b);
  return {t, b, h, fov: h >= ch ? fov : 2 * Math.atan(Math.tan(fov * D2R / 2) * h / ch) / D2R, aspect: cw / h};
}

// Throws if a WebGL renderer cannot be created; the shell catches that and switches to text mode.
export function createEngine(canvas, {reduced = false, quality = null, mood = 'day', accent = null, onLost = null, onQuality = null, onPick = null} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  let lost = false;
  const onLostEv = (e) => { e.preventDefault(); lost = true; stop(); onLost && onLost(); };
  canvas.addEventListener('webglcontextlost', onLostEv);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 140);
  const kit = createKit(renderer);
  const envRT = makeEnvironment(renderer); kit.trackRT(1);
  scene.environment = envRT.texture;
  const lights = createLights(scene, {bounds: {x: 10, z: 10}, keyPos: [5, 12, 5], target: [0, 0, -2]});
  let accentCols = accentSet(accent || '#2b7bb9');
  let moodPreset = applyMood(renderer, scene, lights, mood, accentCols);

  let reducedMotion = !!reduced, running = false, raf = 0, last = 0, firstFrame = true, cw = 1, ch = 1, level = 'medium', note = '';
  let shakeT = 0, shakeAmp = 0, punchT = 1, punchAmp = 0, clock = 0, baseFov = 45, fovKick = 0;
  const budget = createBudget(40);
  const frameFns = new Set();

  // ---------- scene flash (hemisphere light + exposure), restored exactly afterwards ----------
  const flashCol = new THREE.Color(), baseHemi = {color: new THREE.Color(), ground: new THREE.Color(), intensity: 1, exposure: 1};
  let flashT = 1, flashStr = 0, flashDur = .42, flashSoft = false;
  function captureBase() {
    baseHemi.color.copy(lights.hemi.color); baseHemi.ground.copy(lights.hemi.groundColor);
    baseHemi.intensity = lights.hemi.intensity; baseHemi.exposure = renderer.toneMappingExposure;
  }
  function restoreFlash() {
    lights.hemi.color.copy(baseHemi.color); lights.hemi.groundColor.copy(baseHemi.ground);
    lights.hemi.intensity = baseHemi.intensity; renderer.toneMappingExposure = baseHemi.exposure;
  }
  captureBase();
  function stepFlash(dt) {
    if (flashT >= 1) return;
    flashT = Math.min(1, flashT + dt / flashDur);
    // normal: quick rise (first 12%), smooth fall. Soft (reduced motion): a gentle swell with no sharp edge.
    let k = flashSoft ? Math.sin(flashT * Math.PI) * .45 : (flashT < .12 ? flashT / .12 : 1 - (flashT - .12) / .88);
    if (!flashSoft) k = k * k * (3 - 2 * k);
    const s = k * flashStr;
    if (flashT >= 1) { restoreFlash(); return; }
    lights.hemi.color.copy(baseHemi.color).lerp(flashCol, Math.min(1, .6 * s));
    lights.hemi.groundColor.copy(baseHemi.ground).lerp(flashCol, Math.min(1, .4 * s));
    lights.hemi.intensity = baseHemi.intensity * (1 + 1.1 * s) + .25 * s;
    renderer.toneMappingExposure = baseHemi.exposure * (1 + .1 * s);
  }

  // ---------- camera state ----------
  let focusBox = null, focusOpts = {...DEFAULT_VIEW};
  const cur = {tx: 0, ty: .5, tz: -2, dist: 14, pitch: 40, yaw: 0};
  const from = {...cur}, to = {...cur};
  let easeT = 1, easeDur = 0;
  const tgt = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  const KEYS = ['tx', 'ty', 'tz', 'dist', 'pitch', 'yaw'];
  // UI insets (CSS px): the focus box is fitted into the band between them. cur glides toward to.
  const insetTo = {top: 0, bottom: 0}, insetCur = {top: 0, bottom: 0};
  let insetRate = 9, insetAnim = false;
  const band = () => insetBand(cw, ch, insetCur.top, insetCur.bottom, baseFov);
  function applyProjection() {
    camera.aspect = cw / ch;
    camera.fov = baseFov - fovKick;
    const {t, b} = band(), off = (b - t) / 2;
    if (Math.abs(off) > .25) camera.setViewOffset(cw, ch, 0, off, cw, ch); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  function solveNow() {
    const box = focusBox || DEFAULT_FOCUS, o = focusBox ? focusOpts : DEFAULT_VIEW;
    const {fov, aspect} = band();
    return solveFocus(box, o, fov, aspect);
  }
  function settleTo(s) { if (easeT < 1) Object.assign(to, s); else { Object.assign(cur, s); Object.assign(to, s); } }
  // Place the camera from a state plus transient offsets (drift yaw, bob, punch, shake).
  function place(s, dyaw = 0, bob = 0, distMul = 1, sx = 0, sy = 0) {
    const p = s.pitch * D2R, y = (s.yaw + dyaw) * D2R, d = s.dist * distMul;
    tgt.set(s.tx + sx, s.ty + sy + bob, s.tz);
    camera.position.set(tgt.x + Math.sin(y) * Math.cos(p) * d, tgt.y + Math.sin(p) * d, tgt.z + Math.cos(y) * Math.cos(p) * d);
    camera.lookAt(tgt); camera.updateMatrixWorld();
  }
  function updateFog(d) {
    if (!scene.fog) return;
    scene.fog.near = d + moodPreset.fog[0];
    scene.fog.far = d + moodPreset.fog[1];
  }
  function fitCamera() {
    baseFov = fovFor(cw / ch);
    applyProjection();
    settleTo(solveNow());
    place(cur); updateFog(cur.dist);
  }
  function setInsets(ins, opts = {}) {
    const top = Math.max(0, num(ins && ins.top, 0)), bottom = Math.max(0, num(ins && ins.bottom, 0));
    insetTo.top = top; insetTo.bottom = bottom;
    const ease = Math.max(0, num(opts && opts.ease, .35));
    if (reducedMotion || !running || ease <= 0) {
      insetCur.top = top; insetCur.bottom = bottom; insetAnim = false;
      applyProjection(); settleTo(solveNow()); place(cur); updateFog(cur.dist);
      if (!running) renderOnce();
      return;
    }
    insetRate = 3 / ease; insetAnim = true;
  }
  function stepInsets(dt) {
    if (!insetAnim) return;
    const k = Math.min(1, dt * insetRate);
    insetCur.top += (insetTo.top - insetCur.top) * k; insetCur.bottom += (insetTo.bottom - insetCur.bottom) * k;
    if (Math.abs(insetTo.top - insetCur.top) < .5 && Math.abs(insetTo.bottom - insetCur.bottom) < .5) { insetCur.top = insetTo.top; insetCur.bottom = insetTo.bottom; insetAnim = false; }
    applyProjection(); settleTo(solveNow());
  }
  function setFocus(box, opts = {}) {
    if (box && [box.x0, box.x1, box.z0, box.z1].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      focusBox = {
        x0: Math.min(box.x0, box.x1), x1: Math.max(box.x0, box.x1), z0: Math.min(box.z0, box.z1), z1: Math.max(box.z0, box.z1),
        y0: num(box.y0, 0), y1: num(box.y1, 1.2)
      };
      if (focusBox.y1 < focusBox.y0) [focusBox.y0, focusBox.y1] = [focusBox.y1, focusBox.y0];
      focusOpts = {
        pitch: clamp(num(opts.pitch, 40), 25, 65), yaw: clamp(num(opts.yaw, 0), -20, 20),
        margin: clamp(num(opts.margin, .06), 0, .35), ease: Math.max(0, num(opts.ease, .6))
      };
    } else { focusBox = null; focusOpts = {...DEFAULT_VIEW, ease: Math.max(0, num(opts && opts.ease, DEFAULT_VIEW.ease))}; }
    const s = solveNow(), dur = reducedMotion ? 0 : focusOpts.ease;
    if (dur <= 0 || !running) { Object.assign(cur, s); Object.assign(to, s); easeT = 1; place(cur); updateFog(cur.dist); if (!running) renderOnce(); return; }
    Object.assign(from, cur); Object.assign(to, s); easeT = 0; easeDur = dur;
  }
  function stepCamera(dt) {
    stepInsets(dt);
    if (easeT < 1) {
      easeT = Math.min(1, easeT + dt / easeDur);
      const k = easeInOut(easeT);
      for (const key of KEYS) cur[key] = from[key] + (to[key] - from[key]) * k;
    }
    clock += dt;
    let dyaw = 0, bob = 0, distMul = 1, sx = 0, sy = 0;
    if (!reducedMotion) {
      dyaw = 1.2 * Math.sin(clock * 2 * Math.PI / 10.5);
      bob = .02 * Math.sin(clock * 2 * Math.PI / 8.4);
      if (punchT < 1) {
        punchT = Math.min(1, punchT + dt / .26);
        const e = punchT >= 1 ? 0 : punchT < .28 ? Math.sin(punchT / .28 * Math.PI / 2) : 1 - easeInOut((punchT - .28) / .72);
        distMul = 1 - .08 * punchAmp * e;
        const kick = 2.5 * Math.min(1.4, punchAmp) * e;
        if (kick !== fovKick) { fovKick = kick; applyProjection(); }
      }
      if (shakeT > 0) {
        const k = shakeT * shakeT * shakeAmp * cur.dist / 12;
        sx = (Math.random() - .5) * .8 * k; sy = (Math.random() - .5) * .5 * k;
      }
    }
    shakeT = Math.max(0, shakeT - dt * 3);
    stepFlash(dt);
    place(cur, dyaw, bob, distMul, sx, sy);
    updateFog(cur.dist);
  }

  // ---------- sizing / quality ----------
  function resize() {
    if (lost) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    cw = w; ch = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[level].prCap, 2));
    renderer.setSize(cw, ch, false);
    fitCamera();
    // Always draw right away: setSize clears the buffer, and a ResizeObserver callback runs before paint, so without
    // this the browser can show one blank frame while the loop is running.
    renderOnce();
  }
  function setQuality(lv, why = '') {
    if (!QUALITY[lv]) return;
    level = lv; note = why;
    const q = QUALITY[lv];
    renderer.shadowMap.enabled = q.shadows; lights.key.castShadow = q.shadows;
    if (lights.key.shadow.map) { lights.key.shadow.map.dispose(); lights.key.shadow.map = null; }
    lights.key.shadow.mapSize.set(q.shadowMap || 512, q.shadowMap || 512);
    lights.key.shadow.radius = lv === 'high' ? 5 : 3.5;
    kit.setGlowVisible(q.glow);
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    budget.reset();
    resize();
    onQuality && onQuality(lv, why);
  }

  // ---------- loop ----------
  function renderOnce() { if (lost) return; kit.updateBillboards(camera); renderer.render(scene, camera); }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const rawMs = now - last; last = now;
    let dt = firstFrame ? 1 / 60 : rawMs / 1000;
    firstFrame = false;
    if (!(dt >= 0)) dt = 0;          // negative (rAF timestamp before start()) or NaN
    dt = Math.min(.05, dt);
    for (const fn of frameFns) { try { fn(dt); } catch (e) { console.error(e); } }
    stepCamera(dt);
    renderOnce();
    if (level !== 'low') {
      const med = budget.add(rawMs);
      if (med) setQuality(lowerQuality(level), `auto: frames took about ${Math.round(med)} ms`);
    }
  }
  function start() { if (running || lost) return; running = true; firstFrame = true; last = performance.now(); budget.reset(); raf = requestAnimationFrame(frame); }
  function stop() {
    running = false; cancelAnimationFrame(raf);
    // transient effects never stay frozen on screen while the loop is stopped
    if (flashT < 1) { flashT = 1; restoreFlash(); }
    if (insetAnim) { insetCur.top = insetTo.top; insetCur.bottom = insetTo.bottom; insetAnim = false; settleTo(solveNow()); }
    punchT = 1; shakeT = 0; fovKick = 0;
    if (!lost) { applyProjection(); place(cur); }
  }

  // ---------- tap picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(scene.children, true);
    for (const h of hits) {
      let o = h.object, visible = true;
      for (let p = o; p; p = p.parent) if (!p.visible) { visible = false; break; }
      if (!visible || o.isSprite && o.userData.glow) continue;
      while (o && o.userData.choiceId === undefined) o = o.parent;
      if (o) return o.userData.choiceId;
    }
    return null;
  }
  let down = null;
  const onDown = (e) => { down = {x: e.clientX, y: e.clientY, t: performance.now()}; };
  const onUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), slow = performance.now() - down.t > 900;
    down = null;
    if (moved > 14 || slow) return;
    const id = pick(e.clientX, e.clientY);
    if (id !== null && id !== undefined && onPick) onPick(id);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas);

  const detected = detectQuality(renderer);
  setQuality(quality && QUALITY[quality] ? quality : detected.level, !quality && detected.level === 'low' ? `auto: ${detected.reason}` : '');

  const engine = {
    THREE, scene, camera, renderer, kit, lights, STAGE, detected,
    get quality() { return level; },
    get qualityNote() { return note; },
    get running() { return running; },
    get reduced() { return reducedMotion; },
    get mood() { return moodPreset; },
    get accent() { return accentCols; },
    get size() { return {w: cw, h: ch}; },
    get focus() { return focusBox ? {box: {...focusBox}, opts: {...focusOpts}} : null; },
    get view() { return {...to, fov: baseFov, aspect: cw / ch}; },
    get insets() { return {top: insetTo.top, bottom: insetTo.bottom}; },
    setReduced(r) {
      reducedMotion = !!r;
      if (reducedMotion) {
        shakeT = 0; punchT = 1; fovKick = 0;
        if (insetAnim) { insetCur.top = insetTo.top; insetCur.bottom = insetTo.bottom; insetAnim = false; }
        applyProjection();
        if (easeT < 1) { Object.assign(cur, to); easeT = 1; }
        settleTo(solveNow()); place(cur);
      }
    },
    setMood(m) { if (flashT < 1) { flashT = 1; restoreFlash(); } moodPreset = applyMood(renderer, scene, lights, m, accentCols); captureBase(); updateFog(cur.dist); if (!running) renderOnce(); },
    setAccent(hex) { if (flashT < 1) { flashT = 1; restoreFlash(); } accentCols = accentSet(hex); moodPreset = applyMood(renderer, scene, lights, moodPreset, accentCols); captureBase(); updateFog(cur.dist); if (!running) renderOnce(); },
    setFocus, setInsets, setQuality, resize, start, stop, pick, render: renderOnce,
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    shake(amount = 1) { if (!reducedMotion) { shakeT = 1; shakeAmp = clamp(num(amount, 1), 0, 3); } },
    punch(amount = 1) { if (!reducedMotion) { punchT = 0; punchAmp = clamp(num(amount, 1), 0, 4); } },
    flash(color = 0xffffff, strength = 1) {
      if (lost || !running) return;
      try { flashCol.set(color); } catch { return; }
      flashStr = clamp(num(strength, 1), 0, 2); flashSoft = reducedMotion; flashDur = flashSoft ? .8 : .42; flashT = 0;
    },
    pxPerUnit(v) {
      camera.getWorldDirection(fwd);
      const d = Math.max(.01, tmp.copy(v).sub(camera.position).dot(fwd));
      return ch / (2 * d * Math.tan(baseFov * D2R / 2));
    },
    worldToClient(v) { const r = canvas.getBoundingClientRect(), q = v.clone().project(camera); return {x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height}; },
    stats() { return kit.counts(); },
    dispose() {
      stop(); frameFns.clear();
      if (ro) ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('webglcontextlost', onLostEv);
      if (scene.userData.skyTex) { scene.userData.skyTex.dispose(); scene.userData.skyTex = null; }
      scene.background = null;
      envRT.dispose(); kit.dispose(); renderer.dispose();
    }
  };
  return engine;
}

export {LEVELS};
