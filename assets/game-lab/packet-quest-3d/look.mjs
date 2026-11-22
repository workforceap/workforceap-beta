// Shared procedural "semi-real" look kit. Identical copy lives in both prototype folders (not imported across folders).
// Everything is generated in code: PBR materials, canvas textures, a PMREM environment built from a tiny procedural room.
// No external models, textures, HDRs, CDN or network.
import * as THREE from './vendor/three.module.min.js';

export const LEVELS = ['low', 'medium', 'high'];
export const QUALITY = Object.freeze({
  low: {label: 'Low', shadows: false, shadowMap: 0, glow: false, blob: true, prCap: 1},
  medium: {label: 'Medium', shadows: true, shadowMap: 1024, glow: true, blob: true, prCap: 1.5},
  high: {label: 'High', shadows: true, shadowMap: 2048, glow: true, blob: true, prCap: 2}
});

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

// ---------- environment: a bright neutral-warm studio room, prefiltered once with PMREM ----------
export function makeEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const mk = (w, h, d, hex, k, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({color: new THREE.Color(hex).multiplyScalar(k)}));
    m.position.set(x, y, z); env.add(m);
  };
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 22, 40), new THREE.MeshBasicMaterial({color: 0x303744, side: THREE.BackSide}));
  env.add(room);
  mk(38, .3, 38, 0x5c6472, 1.2, 0, -10.8, 0);                                             // warm concrete floor bounce
  mk(28, .4, 4, 0xfff8ee, 8.2, 0, 10.6, -4); mk(28, .4, 4, 0xf2f6ff, 7.2, 0, 10.6, 6);    // bright studio ceiling banks
  mk(.4, 8, 18, 0xffebd2, 4.2, 19.6, 3, 2); mk(.4, 8, 18, 0xdceeff, 3.6, -19.6, 3, 2);    // warm right key wall, cool-neutral left fill
  mk(22, 7, .4, 0xe8f0ff, 2.4, 0, 3, 19.6); mk(20, 6, .4, 0x89b4ff, 1.5, 0, 3, -19.6);    // front & back bounce panels
  const rt = pm.fromScene(env, 0.035);
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  pm.dispose();
  return rt;
}

// ---------- kit: cached geometry / materials / textures with stage-scoped disposal ----------
const PALETTE = {
  steel: {color: 0xc6cfdd, metalness: .82, roughness: .28},
  steelDark: {color: 0x6e798c, metalness: .72, roughness: .36},
  graphite: {color: 0x465062, metalness: .42, roughness: .44},
  chassisLight: {color: 0x909cb0, metalness: .58, roughness: .34},
  plastic: {color: 0x2c3340, metalness: .08, roughness: .48},
  rubber: {color: 0x1d222b, metalness: .02, roughness: .86},
  blue: {color: 0x3b66b8, metalness: .45, roughness: .38},
  paperCream: {color: 0xf6eedc, metalness: 0, roughness: .64},
  brass: {color: 0xe2b857, metalness: .88, roughness: .26},
  tray: {color: 0x8893a6, metalness: .72, roughness: .42}
};
export function createKit(renderer) {
  const S = {geo: new Map(), mat: new Map(), tex: new Map()}, P = {geo: new Map(), mat: new Map(), tex: new Map()};
  const tracked = new Set(); const glows = []; let rtCount = 0; let glowTex = null; const glowMats = new Map();
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
  kit.disposeTree = (o) => o.traverse((c) => {
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
  kit.dispose = () => { dropAll(S); dropAll(P); for (const m of glowMats.values()) m.dispose(); glowMats.clear(); if (glowTex) { glowTex.dispose(); glowTex = null; } glows.length = 0; };
  kit.counts = (extra = 0) => ({geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, materials: tracked.size, programs: renderer.info.programs ? renderer.info.programs.length : 0, renderTargets: rtCount + extra});
  return kit;
}

// ---------- lights ----------
// key (soft shadows) + fill + rim + neutral hemisphere bounce.
export function createLights(scene, {bounds, keyPos = [8, 13, 8], target = [0, 0, 0]}) {
  const hemi = new THREE.HemisphereLight(0xf6f8ff, 0x5c6474, 1.05); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e2, 3.2); key.position.set(...keyPos); key.target.position.set(...target); scene.add(key, key.target);
  key.shadow.camera.left = -bounds.x; key.shadow.camera.right = bounds.x; key.shadow.camera.top = bounds.z; key.shadow.camera.bottom = -bounds.z;
  key.shadow.camera.near = 1; key.shadow.camera.far = 45; key.shadow.bias = -.0002; key.shadow.normalBias = .02; key.shadow.radius = 3.5; key.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0xdce8ff, 1.45); fill.position.set(-10, 9, 11); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9be4ff, 1.55); rim.position.set(-3, 9, -12); scene.add(rim);
  return {hemi, key, fill, rim};
}
