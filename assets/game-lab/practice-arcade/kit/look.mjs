// WAP Practice Arcade look kit ("toy diorama"; started from the Firewall Defender 3D prototype's look.mjs).
// Everything is generated in code: PBR materials, canvas textures, a PMREM environment built from a tiny procedural room.
// No external models, textures, HDRs, fonts, CDN or network.
//
// Public API (v1.1):
//   LEVELS, QUALITY, lowerQuality(level)             quality ladder (low / medium / high)
//   MOODS, moodOf(id)                                mood presets (day / dusk / night), see the field list below
//   accentSet(hex) -> {hex, base, bright, dark, soft} THREE.Color values derived from a game accent
//   textTexture(text, opts)                          legacy canvas text texture (now wraps, never cuts)
//   canvasTexture, rng, worldPerPx, projectToClient, blobTexture, makeBlob, skyTexture
//   createKit(renderer) -> kit                       cached geometry / materials / textures + kit.label(text, opts)
//   createLights(scene, opts), applyMood(renderer, scene, lights, mood, accent)
import * as THREE from './vendor/three.module.min.js';

export const LEVELS = ['low', 'medium', 'high'];
export const QUALITY = Object.freeze({
  low: {label: 'Low', shadows: false, shadowMap: 0, glow: false, blob: true, prCap: 1},
  medium: {label: 'Medium', shadows: true, shadowMap: 1024, glow: true, blob: true, prCap: 1.5},
  high: {label: 'High', shadows: true, shadowMap: 2048, glow: true, blob: true, prCap: 2}
});
export const lowerQuality = (level) => LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)];

// Mood presets. Colours are sRGB hex.
//   id           'day' | 'dusk' | 'night'
//   bg           horizon / fog colour (the floor fades into it; also the CSS --scene colour)
//   sky          [top, horizon] colours of the vertical background gradient
//   fog          [near, far] fog distances added to the camera's distance from its focus
//   exposure     tone-mapping exposure (Neutral tone mapping keeps colours saturated)
//   hemi         [sky, ground, intensity]; key / fill / rim: [colour, intensity]; keyPos: key light position
//   accentLight  intensity of the accent-coloured pool light over the stage (0 by day)
//   rimAccent    how far the rim light is tinted toward the accent (0..1)
//   shadow       shadow strength (0..1)
//   env          environment-map intensity
//   window       window-pane colour for worlds; windowGlow: its emissive strength
//   lamp         emissive strength for lamps, screens and LED strips in worlds
//   glow         suggested multiplier for accent emissive strips / rims (day low, night high)
export const MOODS = Object.freeze({
  day: {
    id: 'day', bg: 0xeee3d2, sky: [0x7fb6ec, 0xeee3d2], fog: [9, 38], exposure: 1.0,
    hemi: [0xe4eeff, 0x9a8366, .95], key: [0xfff0d6, 3.3], keyPos: [5, 12, 7], fill: [0xc2d6ff, .6], rim: [0xfff4e6, 1.0],
    accentLight: 0, rimAccent: 0, shadow: .82, env: .42,
    window: 0xcfe8ff, windowGlow: 1.25, lamp: .45, glow: .45
  },
  dusk: {
    id: 'dusk', bg: 0xd98f7e, sky: [0x403a80, 0xf0a07a], fog: [7, 32], exposure: 1.12,
    hemi: [0x9a8cf0, 0x4a2a3a, .9], key: [0xffa15e, 3.4], keyPos: [9, 5.5, 3.5], fill: [0x7b86ff, .6], rim: [0xff905a, 1.9],
    accentLight: 6, rimAccent: .25, shadow: .78, env: .34,
    window: 0xffa877, windowGlow: 1.35, lamp: 1.1, glow: .9
  },
  night: {
    id: 'night', bg: 0x131d38, sky: [0x050a18, 0x18264a], fog: [5, 28], exposure: 1.0,
    hemi: [0x5a72c4, 0x080b16, .42], key: [0xa4bcff, .95], keyPos: [-6, 12, 5], fill: [0x4b62d6, .3], rim: [0x7fb0ff, 1.8],
    accentLight: 18, rimAccent: .6, shadow: .65, env: .14,
    window: 0x1b2850, windowGlow: .8, lamp: 1.6, glow: 1.5
  }
});
export const moodOf = (m) => (m && typeof m === 'object' && m.id && MOODS[m.id] ? MOODS[m.id] : MOODS[m] || MOODS.day);

// ---------- accent colours ----------
// accentSet('#ad2c4d') -> {hex: '#ad2c4d', base, bright, dark, soft} (THREE.Color, sRGB-correct).
//   bright: reads as a glow on a night scene; dark: a body colour on a day scene; soft: a pale tint.
export function accentSet(hex) {
  let base;
  try { base = new THREE.Color(hex || '#2b7bb9'); } catch { base = new THREE.Color('#2b7bb9'); }
  const h = {}; base.getHSL(h);
  const s = h.s;
  const bright = new THREE.Color().setHSL(h.h, Math.min(1, s * 1.1 + .15), Math.min(.7, Math.max(.6, h.l + .22)));
  const dark = new THREE.Color().setHSL(h.h, Math.min(1, s + .05), Math.max(.16, Math.min(.3, h.l * .72)));
  const soft = new THREE.Color().setHSL(h.h, Math.min(.65, s * .6 + .12), .9);
  return {hex: '#' + base.getHexString(), base, bright, dark, soft};
}

// ---------- text fitting (shared by textTexture and kit.label) ----------
const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
// Greedy word wrap at the current g.font. Explicit \n is kept. Words longer than a line are split with a hyphen when
// split is true; otherwise the wrap fails (returns null).
function wrapLines(g, text, maxW, split = true) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (let w of words) {
      const cand = line ? line + ' ' + w : w;
      if (g.measureText(cand).width <= maxW) { line = cand; continue; }
      if (line) { out.push(line); line = ''; }
      if (!split && g.measureText(w).width > maxW) return null;
      while (g.measureText(w).width > maxW && w.length > 1) {
        let k = w.length - 1;
        while (k > 1 && g.measureText(w.slice(0, k) + '-').width > maxW) k--;
        out.push(w.slice(0, k) + '-'); w = w.slice(k);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}
// Font size (px) and lines for text in a maxW x maxH box. Never cuts text. Order of preference:
//   1. whole words only, between minPx and maxPx, at most maxLines; fewer lines win unless that costs over ~18% of size;
//   2. long words split with a hyphen, same limits;
//   3. keep shrinking (down to minPx * .5) and allow more lines.
export function fitText(g, text, maxW, maxH, {maxPx = 120, minPx = 24, maxLines = 3, weight = 700, lineHeight = 1.14, font = FONT} = {}) {
  const step = (px) => Math.max(1, px * .04);
  const tryPx = (px, limit, split) => {
    g.font = `${weight} ${Math.round(px)}px ${font}`;
    const lines = wrapLines(g, text, maxW, split);
    if (!lines || lines.length > limit || ((lines.length - 1) * lineHeight + 1) * px > maxH) return null;
    return {px: Math.round(px), lines};
  };
  const best = [];
  for (let n = 1; n <= maxLines; n++) {
    for (let px = maxPx; px >= minPx; px -= step(px)) { const r = tryPx(px, n, false); if (r) { best.push(r); break; } }
  }
  if (best.length) {
    const top = Math.max(...best.map((r) => r.px));
    const pick = best.find((r) => r.px >= top * .82);
    g.font = `${weight} ${pick.px}px ${font}`; // the font of the chosen fit, not of the last attempt
    return pick;
  }
  for (let px = maxPx; px >= minPx; px -= step(px)) { const r = tryPx(px, maxLines, true); if (r) return r; }
  for (let px = minPx; px >= minPx * .5; px -= step(px)) { const r = tryPx(px, 99, true); if (r) return r; }
  g.font = `${weight} ${Math.round(minPx * .5)}px ${font}`;
  return {px: Math.round(minPx * .5), lines: wrapLines(g, text, maxW, true)};
}
function drawLines(g, fit, x, cy, align, lineHeight = 1.14) {
  const lh = fit.px * lineHeight, y0 = cy - (fit.lines.length - 1) * lh / 2;
  g.textAlign = align; g.textBaseline = 'middle';
  fit.lines.forEach((ln, i) => g.fillText(ln, x, y0 + i * lh + fit.px * .04));
}

// Text on a canvas texture, fitted and wrapped (never cut). Kept for existing mechanics; new code uses kit.label.
export function textTexture(text, {w = 512, h = 256, bg = '#1a1a1a', fg = '#ffffff', border = null, radius = 28, weight = 700, max = 120, min = 40, font = FONT, maxLines = 3} = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, radius); g.fill();
    if (border) { g.lineWidth = 12; g.strokeStyle = border; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, Math.max(4, radius - 6)); g.stroke(); }
    g.fillStyle = fg;
    const fit = fitText(g, text, w - 56, h - 36, {maxPx: max, minPx: min, maxLines, weight, font});
    drawLines(g, fit, w / 2, h / 2, 'center');
  }, {aniso: 8});
}

// ---------- GPU detection ----------
export function gpuInfo(renderer) {
  const gl = renderer.getContext();
  let name = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch { /* blocked */ }
  return {name, maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE)};
}
export function detectQuality(renderer, overrideInfo = null) {
  const info = overrideInfo || gpuInfo(renderer);
  const soft = /swiftshader|llvmpipe|software|basic render/i.test(info.name);
  if (soft) return {level: 'low', reason: 'software renderer', info};
  if (info.maxTexture < 8192) return {level: 'low', reason: `small max texture (${info.maxTexture})`, info};
  return {level: 'medium', reason: 'default', info};
}
// Frame-time guard: call add(dtMs) from the loop. Returns median ms once when 90 frames exceed limitMs.
export function createBudget(limitMs = 40) {
  let samples = [], fired = false;
  return {
    add(dtMs) {
      if (fired || !(dtMs > 0) || dtMs > 250) return false; // ignore gaps (tab hidden, pause)
      samples.push(dtMs);
      if (samples.length < 90) return false;
      const s = samples.slice().sort((a, b) => a - b), med = s[s.length >> 1];
      samples = [];
      if (med > limitMs) { fired = true; return med; }
      return false;
    },
    reset() { samples = []; fired = false; },
    get fired() { return fired; }
  };
}

// ---------- small helpers ----------
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function canvasTexture(w, h, draw, {srgb = true, repeat = null, aniso = 4} = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
// World size that makes a sprite `px` CSS pixels wide on screen at its current distance.
export function worldPerPx(camera, pos, cssHeight) {
  const f = new THREE.Vector3(); camera.getWorldDirection(f);
  const d = Math.max(.01, pos.clone().sub(camera.position).dot(f));
  return 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, cssHeight);
}
export function projectToClient(camera, canvas, v) {
  const r = canvas.getBoundingClientRect(), q = v.clone().project(camera);
  return {x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height};
}
// Vertical background gradient (screen-space scene.background). Caller disposes.
export function skyTexture(top, horizon) {
  const a = new THREE.Color(top), b = new THREE.Color(horizon);
  const t = canvasTexture(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#' + a.getHexString());
    gr.addColorStop(.55, '#' + a.clone().lerp(b, .7).getHexString());
    gr.addColorStop(1, '#' + b.getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, {aniso: 1});
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return t;
}

// ---------- environment: a soft neutral-warm studio room, prefiltered once with PMREM ----------
export function makeEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const mk = (w, h, d, hex, k, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({color: new THREE.Color(hex).multiplyScalar(k)}));
    m.position.set(x, y, z); env.add(m);
  };
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 22, 40), new THREE.MeshBasicMaterial({color: 0x3a3f4c, side: THREE.BackSide}));
  env.add(room);
  mk(38, .3, 38, 0x6b6052, 1.2, 0, -10.8, 0);                                             // warm floor bounce
  mk(28, .4, 4, 0xfff6ea, 7.0, 0, 10.6, -4); mk(28, .4, 4, 0xeef4ff, 6.0, 0, 10.6, 6);    // soft ceiling banks
  mk(.4, 8, 18, 0xffe6c8, 4.2, 19.6, 3, 2); mk(.4, 8, 18, 0xcfe4ff, 3.2, -19.6, 3, 2);    // warm right key wall, cool left fill
  mk(22, 7, .4, 0xe8f0ff, 2.2, 0, 3, 19.6); mk(20, 6, .4, 0x89b4ff, 1.5, 0, 3, -19.6);    // front & back bounce panels
  const rt = pm.fromScene(env, 0.04);
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  pm.dispose();
  return rt;
}

// ---------- kit: cached geometry / materials / textures with stage-scoped disposal ----------
// Toy-diorama palette: low metalness, clear colour, soft roughness (reads well with a weak environment).
const PALETTE = {
  steel: {color: 0xc3ccda, metalness: .5, roughness: .34},
  steelDark: {color: 0x5b677c, metalness: .42, roughness: .42},
  graphite: {color: 0x3b4558, metalness: .18, roughness: .52},
  chassisLight: {color: 0xa2afc3, metalness: .32, roughness: .4},
  plastic: {color: 0x2d3748, metalness: .04, roughness: .5},
  rubber: {color: 0x1d222b, metalness: .02, roughness: .86},
  blue: {color: 0x2f6fd6, metalness: .12, roughness: .42},
  paperCream: {color: 0xf8efdc, metalness: 0, roughness: .66},
  brass: {color: 0xe8b84f, metalness: .6, roughness: .3},
  tray: {color: 0x7f8ba0, metalness: .4, roughness: .44}
};
const toColor = (c, fallback) => {
  if (c === undefined || c === null) return new THREE.Color(fallback);
  if (c && c.isColor) return c.clone();
  try { return new THREE.Color(c); } catch { return new THREE.Color(fallback); }
};
const css = (c) => '#' + c.getHexString();

export function createKit(renderer) {
  const S = {geo: new Map(), mat: new Map(), tex: new Map()}, P = {geo: new Map(), mat: new Map(), tex: new Map()};
  const tracked = new Set(); const glows = []; let rtCount = 0; let glowTex = null; const glowMats = new Map();
  const labelTex = new Map(); const billboards = new Set();
  const maxAniso = Math.min(8, renderer.capabilities && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
  const scope = (perm) => (perm ? P : S);
  const kit = {glows, tracked};
  kit.trackRT = (n) => { rtCount += n; };
  kit.geo = (key, make, perm = false) => { const m = scope(perm).geo; let g = m.get(key); if (!g) { g = make(); g.userData.cached = true; m.set(key, g); } return g; };
  kit.bevel = (w, h, d, r = .03) => kit.geo(`bv|${w}|${h}|${d}|${r}`, () => {
    r = Math.max(.002, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001));
    const sh = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
    sh.moveTo(-x, -y); sh.lineTo(x, -y); sh.lineTo(x, y); sh.lineTo(-x, y); sh.lineTo(-x, -y);
    const g = new THREE.ExtrudeGeometry(sh, {depth: Math.max(.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 1, steps: 1});
    g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals(); return g;
  });
  kit.cylGeo = (rt, rb, h, seg = 16) => kit.geo(`cy|${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  kit.sphereGeo = (r, seg = 16) => kit.geo(`sp|${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)));
  kit.mat = (name, perm = false) => {
    const m = scope(perm).mat; let x = m.get(name);
    if (!x) { x = new THREE.MeshStandardMaterial(PALETTE[name] || {color: 0xff00ff}); x.userData.cached = true; tracked.add(x); m.set(name, x); }
    return x;
  };
  kit.cmat = (key, params, physical = false, perm = false) => {
    const m = scope(perm).mat; let x = m.get(key);
    if (!x) { x = physical ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params); x.userData.cached = true; tracked.add(x); m.set(key, x); }
    return x;
  };
  kit.own = (params, physical = false) => { const x = physical ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params); tracked.add(x); return x; };
  kit.basic = (params) => { const x = new THREE.MeshBasicMaterial(params); tracked.add(x); return x; };
  kit.tex = (key, w, h, draw, opts = {}) => { const m = scope(opts.perm).tex; let t = m.get(key); if (!t) { t = canvasTexture(w, h, draw, opts); t.userData.cached = true; m.set(key, t); } return t; };
  const resolve = (m) => (typeof m === 'string' ? kit.mat(m) : m);
  kit.box = (w, h, d, mat, x = 0, y = 0, z = 0, r = .03) => {
    const mesh = new THREE.Mesh(kit.bevel(w, h, d, r), resolve(mat));
    mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  };
  kit.cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) => {
    const mesh = new THREE.Mesh(kit.cylGeo(rt, rb, h, seg), resolve(mat));
    mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  };
  // LED: own emissive material (so a fault can recolor one device) + optional additive glow sprite.
  kit.led = (parent, hex, x, y, z, size = .09, flat = false) => {
    const m = kit.own({color: 0x0b1410, emissive: new THREE.Color(hex), emissiveIntensity: 2.2, metalness: 0, roughness: .35});
    const mesh = new THREE.Mesh(flat ? kit.bevel(size, size, .03, .008) : kit.cylGeo(size / 2, size / 2, .04, 10), m);
    if (!flat) mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z); parent.add(mesh);
    const sprite = kit.glow(parent, hex, size * 4.2, x, y, z + .03);
    return {mat: m, sprite, mesh, hex};
  };
  const glowMap = () => glowTex || (glowTex = canvasTexture(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, {srgb: true, aniso: 1}));
  kit.glowMat = (hex) => { let m = glowMats.get(hex); if (!m) { m = new THREE.SpriteMaterial({map: glowMap(), color: hex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .8, toneMapped: false}); glowMats.set(hex, m); } return m; };
  kit.glow = (parent, hex, size, x, y, z) => {
    const s = new THREE.Sprite(kit.glowMat(hex)); s.scale.set(size, size, 1); s.position.set(x, y, z); s.userData.glow = true; s.userData.keepMat = true; parent.add(s); glows.push(s); return s;
  };
  kit.setGlowVisible = (on) => glows.forEach((g) => { g.visible = on; });

  // ---------- kit.label: the one shared way to draw a readable text sign in 3D ----------
  // kit.label(text, opts) -> THREE.Group (a rounded plate with fitted, wrapped text; front faces +z).
  // opts: w = 1.6, h = .5 (world units), maxLines = 3, billboard = false | true (faces the camera) | 'y' (upright, turns
  //   about y only), bg = '#fffaf1', fg = '#141c29', accent = null (colour of a left accent bar), align = 'center' | 'left',
  //   weight = 700, maxFont = h * .5, minFont = h * .2 (world units; shrinks further rather than cutting text),
  //   depth = .05 (backing slab thickness, 0 = flat), back = slab colour (default: dark accent or slate),
  //   lit = false (true: MeshStandardMaterial, reacts to light), res = 420 (texture pixels per world unit).
  // Returns the group with .setText(text), .dispose(), .fontSize (world units of the fitted font), .lines (line count).
  // Textures are cached by content, shared, reference-counted and released on dispose (or with the kit).
  const acquireLabelTex = (text, o) => {
    const key = [text, o.w, o.h, o.maxLines, o.bgCss, o.fgCss, o.accentCss, o.align, o.weight, o.minFont, o.maxFont, o.res].join('|');
    let e = labelTex.get(key);
    if (!e) {
      let ppu = o.res, W = Math.round(o.w * ppu), H = Math.round(o.h * ppu);
      const big = Math.max(W, H); if (big > 1024) { ppu *= 1024 / big; W = Math.round(o.w * ppu); H = Math.round(o.h * ppu); }
      W = Math.max(32, W); H = Math.max(16, H);
      let fit = null;
      const tex = canvasTexture(W, H, (g) => {
        const rad = Math.min(H, W) * .2;
        g.clearRect(0, 0, W, H);
        g.fillStyle = o.bgCss; g.beginPath(); g.roundRect(0, 0, W, H, rad); g.fill();
        let barW = 0;
        if (o.accentCss) {
          barW = Math.max(6, Math.min(W * .06, H * .14));
          g.save(); g.beginPath(); g.roundRect(0, 0, W, H, rad); g.clip();
          g.fillStyle = o.accentCss; g.fillRect(0, 0, barW, H); g.restore();
        }
        const padX = Math.min(H * .2, W * .07), padY = Math.min(H * .12, W * .06);
        const availW = W - 2 * padX - barW, availH = H - 2 * padY;
        g.fillStyle = o.fgCss;
        fit = fitText(g, text, availW, availH, {maxPx: o.maxFont * ppu, minPx: o.minFont * ppu, maxLines: o.maxLines, weight: o.weight});
        const x = o.align === 'left' ? barW + padX : barW + padX + availW / 2;
        drawLines(g, fit, x, H / 2, o.align === 'left' ? 'left' : 'center');
      }, {aniso: maxAniso});
      tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      tex.userData.cached = true;
      e = {key, tex, refs: 0, fontSize: fit.px / ppu, lines: fit.lines.length};
      labelTex.set(key, e);
    }
    e.refs++;
    return e;
  };
  const releaseLabelTex = (e) => { if (!e) return; e.refs--; if (e.refs <= 0 && labelTex.get(e.key) === e) { e.tex.dispose(); labelTex.delete(e.key); } };
  kit.label = (text, opts = {}) => {
    const w = opts.w || 1.6, h = opts.h || .5;
    const accentC = opts.accent !== undefined && opts.accent !== null ? toColor(opts.accent, '#2b7bb9') : null;
    const o = {
      w, h, maxLines: Math.max(1, opts.maxLines || 3), align: opts.align === 'left' ? 'left' : 'center',
      bgCss: css(toColor(opts.bg, '#fffaf1')), fgCss: css(toColor(opts.fg, '#141c29')), accentCss: accentC ? css(accentC) : '',
      weight: opts.weight || 700, maxFont: opts.maxFont || h * .5, minFont: opts.minFont || h * .2, res: opts.res || 420
    };
    o.minFont = Math.min(o.minFont, o.maxFont);
    const group = new THREE.Group(); group.name = 'label';
    const mat = opts.lit
      ? kit.own({map: null, transparent: true, roughness: .7, metalness: 0})
      : kit.basic({map: null, transparent: true, toneMapped: false, fog: false});
    const plane = new THREE.Mesh(kit.geo(`lbl|${w}|${h}`, () => new THREE.PlaneGeometry(w, h), true), mat);
    const depth = opts.depth === undefined ? .05 : opts.depth;
    plane.position.z = depth > 0 ? depth / 2 + .004 : 0;
    plane.renderOrder = 2;
    group.add(plane);
    if (depth > 0) {
      const backC = opts.back !== undefined ? toColor(opts.back, '#2b3445') : accentC ? accentSet(accentC).dark : new THREE.Color('#2b3445');
      const bm = kit.cmat(`lbl-back|${backC.getHexString()}`, {color: backC, roughness: .55, metalness: .05}, false, true);
      const pad = Math.min(w, h) * .05;
      const slab = new THREE.Mesh(kit.bevel(w + pad, h + pad, depth, Math.min(depth / 2 - .001, Math.min(w, h) * .08)), bm);
      slab.castShadow = true; slab.receiveShadow = true;
      group.add(slab);
    }
    let entry = null, current = null;
    group.setText = (t) => {
      t = String(t === undefined || t === null ? '' : t);
      if (t === current) return group;
      const next = acquireLabelTex(t, o);
      releaseLabelTex(entry); entry = next; current = t;
      mat.map = entry.tex; mat.needsUpdate = true;
      group.fontSize = entry.fontSize; group.lines = entry.lines;
      return group;
    };
    let disposed = false;
    const release = () => {
      if (disposed) return; disposed = true;
      billboards.delete(group);
      releaseLabelTex(entry); entry = null;
      mat.map = null; mat.dispose(); tracked.delete(mat);
    };
    group.dispose = () => { release(); if (group.parent) group.parent.remove(group); };
    group.userData.onDispose = release; // kit.disposeTree calls this (without detaching mid-traversal)
    plane.userData.keepMat = true; // disposeTree leaves the material to group.dispose
    if (opts.billboard) { group.userData.billboard = opts.billboard === 'y' ? 'y' : true; billboards.add(group); }
    group.setText(text);
    return group;
  };
  // Called by the engine before each render: turns billboard labels toward the camera.
  const _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  kit.updateBillboards = (camera) => {
    for (const b of billboards) {
      if (!b.parent) continue;
      b.parent.getWorldQuaternion(_qp).invert();
      if (b.userData.billboard === 'y') {
        b.getWorldPosition(_p);
        _qw.setFromAxisAngle(_up, Math.atan2(camera.position.x - _p.x, camera.position.z - _p.z));
      } else _qw.copy(camera.quaternion);
      b.quaternion.copy(_qp.multiply(_qw));
    }
  };

  kit.disposeTree = (o) => o.traverse((c) => {
    if (c.userData.onDispose) { const fn = c.userData.onDispose; c.userData.onDispose = null; try { fn(); } catch { /* already gone */ } }
    if (c.isSprite && c.userData.glow) { const i = glows.indexOf(c); if (i >= 0) glows.splice(i, 1); }
    if (c.geometry && !c.isSprite && !c.geometry.userData.cached) c.geometry.dispose();
    if (c.material && !c.userData.keepMat) {
      (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => {
        if (m.userData.cached) return;
        for (const k of ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'bumpMap']) if (m[k] && !m[k].userData.cached) m[k].dispose();
        m.dispose(); tracked.delete(m);
      });
    }
  });
  const dropAll = (set) => { for (const g of set.geo.values()) g.dispose(); for (const m of set.mat.values()) { m.dispose(); tracked.delete(m); } for (const t of set.tex.values()) t.dispose(); set.geo.clear(); set.mat.clear(); set.tex.clear(); };
  kit.clearStage = () => { dropAll(S); glows.length = 0; };
  kit.dispose = () => {
    dropAll(S); dropAll(P);
    for (const m of glowMats.values()) m.dispose(); glowMats.clear(); if (glowTex) { glowTex.dispose(); glowTex = null; } glows.length = 0;
    for (const e of labelTex.values()) e.tex.dispose(); labelTex.clear(); billboards.clear();
  };
  kit.counts = (extra = 0) => ({geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, materials: tracked.size, programs: renderer.info.programs ? renderer.info.programs.length : 0, renderTargets: rtCount + extra, labels: labelTex.size});
  return kit;
}

// ---------- lights ----------
// key (soft shadows) + fill + rim + hemisphere bounce + an accent pool light (dusk / night).
export function createLights(scene, {bounds, keyPos = [8, 13, 8], target = [0, 0, 0]}) {
  const hemi = new THREE.HemisphereLight(0xf6f8ff, 0x5c6474, 1.05); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e2, 3.2); key.position.set(...keyPos); key.target.position.set(...target); scene.add(key, key.target);
  key.shadow.camera.left = -bounds.x; key.shadow.camera.right = bounds.x; key.shadow.camera.top = bounds.z; key.shadow.camera.bottom = -bounds.z;
  key.shadow.camera.near = .5; key.shadow.camera.far = 50; key.shadow.bias = -.0003; key.shadow.normalBias = .025; key.shadow.radius = 4; key.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0xdce8ff, 1.45); fill.position.set(-10, 9, 11); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9be4ff, 1.55); rim.position.set(-3, 9, -12); scene.add(rim);
  const accent = new THREE.PointLight(0xffffff, 0, 13, 1.6); accent.position.set(0, 3.4, -1.6); scene.add(accent);
  return {hemi, key, fill, rim, accent, target: new THREE.Vector3(...target)};
}
// Apply a mood preset to the lights plus background gradient / fog / exposure. accent: an accentSet() result or a colour.
export function applyMood(renderer, scene, lights, mood, accent = null) {
  const m = moodOf(mood);
  const acc = accent ? (accent.bright ? accent : accentSet(accent)) : accentSet('#2b7bb9');
  if (scene.userData.skyTex) scene.userData.skyTex.dispose();
  scene.userData.skyTex = skyTexture(m.sky[0], m.sky[1]);
  scene.background = scene.userData.skyTex;
  if (scene.fog) scene.fog.color.setHex(m.bg); else scene.fog = new THREE.Fog(m.bg, 20, 60);
  renderer.toneMappingExposure = m.exposure;
  scene.environmentIntensity = m.env;
  lights.hemi.color.setHex(m.hemi[0]); lights.hemi.groundColor.setHex(m.hemi[1]); lights.hemi.intensity = m.hemi[2];
  lights.key.color.setHex(m.key[0]); lights.key.intensity = m.key[1];
  const t = lights.target || new THREE.Vector3();
  lights.key.position.set(t.x + m.keyPos[0], m.keyPos[1], t.z + m.keyPos[2]);
  lights.key.shadow.intensity = m.shadow;
  lights.fill.color.setHex(m.fill[0]); lights.fill.intensity = m.fill[1];
  lights.rim.color.setHex(m.rim[0]).lerp(acc.bright, m.rimAccent); lights.rim.intensity = m.rim[1];
  if (lights.accent) { lights.accent.color.copy(acc.bright); lights.accent.intensity = m.accentLight; }
  return m;
}
// A soft round contact shadow (cheap, works on every quality level; the only shadow at low quality).
let blobTexCache = null;
export function blobTexture() {
  if (!blobTexCache) {
    blobTexCache = canvasTexture(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(10,12,30,.72)'); gr.addColorStop(.45, 'rgba(10,12,30,.4)'); gr.addColorStop(.75, 'rgba(10,12,30,.12)'); gr.addColorStop(1, 'rgba(10,12,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, {aniso: 1});
    blobTexCache.userData.cached = true; // shared for the page lifetime; never disposed by disposeTree
  }
  return blobTexCache;
}
export function makeBlob(w = 1, d = 1, opacity = .5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({map: blobTexture(), transparent: true, opacity, depthWrite: false}));
  m.rotation.x = -Math.PI / 2; m.position.y = .012; m.renderOrder = 1; m.userData.blob = true;
  return m;
}
