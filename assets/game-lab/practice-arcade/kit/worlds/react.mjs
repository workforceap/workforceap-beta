// World reactions: every world answers play events with its accent lights.
// index.mjs wraps each world's build() with withReactions(), so a world file needs nothing extra and the returned world
// gains event(ev) (the shell calls it next to view.event) while update(dt) keeps its own idle motion.
//   right   -> the accent strips, rims and glows flash green and settle back (about 0.45 s); from a streak of 2 up they
//              stay a little brighter, growing with ev.streak (capped at 6), until the next wrong answer.
//   wrong / timeout -> a red flash; the streak glow drops back to normal.
// Reduced motion: the same short colour change (no motion is involved), slightly softer.
// The accent parts are found once after build by colour: materials whose emissive or basic colour has the accent's hue,
// plain accent body materials, and per-instance accent colours of instanced meshes. Textured materials (screens, signs,
// labels) and sprites are left alone. No per-frame allocations; nothing GPU-side is created, so dispose only drops refs.

const FLASH = {right: 0x3ee08a, wrong: 0xff4a4a, timeout: 0xff4a4a};
const PULSE = .45, STREAK_CAP = 6;

// hue/saturation/lightness of a linear colour, scale-invariant (night glows are multiplied above 1)
function hsl(THREE, c, out, tmp) {
  const m = Math.max(c.r, c.g, c.b);
  if (!(m > 1e-4)) { out.h = 0; out.s = 0; out.l = 0; return out; }
  tmp.setRGB(c.r / m, c.g / m, c.b / m); tmp.getHSL(out);
  out.l *= Math.min(1, m); return out;
}
const hueGap = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

export function createReactor(THREE, group, accent, opts = {}) {
  const tmp = new THREE.Color(), H = {h: 0, s: 0, l: 0};
  const refs = [accent && accent.base, accent && accent.bright, accent && accent.dark].filter((c) => c && c.isColor)
    .map((c) => ({...hsl(THREE, c, {h: 0, s: 0, l: 0}, tmp)}));
  const isAccent = (c) => {
    if (!c || !refs.length) return false;
    hsl(THREE, c, H, tmp);
    if (H.s < .28 || H.l < .04) return false;
    return refs.some((r) => r.s >= .28 && hueGap(H.h, r.h) < .035);
  };
  const glows = [], basics = [], bodies = [], cells = [], seen = new Set();
  group.traverse((o) => {
    if (o.isSprite || o.userData.blob || o.userData.noReact) return;
    if (o.isInstancedMesh && o.instanceColor) {
      for (let i = 0; i < o.count; i++) {
        const c = new THREE.Color(); o.getColorAt(i, c);
        if (isAccent(c)) cells.push({mesh: o, i, base: c, glow: !!o.material && !!o.material.isMeshBasicMaterial});
      }
    }
    for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
      if (seen.has(m) || m.map || m.userData.cached) continue; seen.add(m);
      if (m.isMeshBasicMaterial) { if (isAccent(m.color)) basics.push({m, base: m.color.clone()}); continue; }
      if (!m.isMeshStandardMaterial) continue;
      const lit = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > .02 && m.emissiveIntensity > 0;
      if (lit && isAccent(m.emissive)) glows.push({m, base: m.emissive.clone(), k: m.emissiveIntensity});
      else if (!lit && isAccent(m.color)) bodies.push({m, base: m.emissive.clone(), k: m.emissiveIntensity});
    }
  });
  const meshes = [...new Set(cells.map((c) => c.mesh))];
  const flash = new THREE.Color(), want = new THREE.Color();
  let age = PULSE, boost = 0, boostTo = 0, dirty = false;
  const soft = () => (typeof opts.reduced === 'function' ? opts.reduced() : !!opts.reduced);

  function apply(k) { // k: pulse strength 0..1; boost: sustained streak glow 0..1
    const b = 1 + boost * .45;
    for (const g of glows) { g.m.emissive.copy(g.base).lerp(flash, k * .8); g.m.emissiveIntensity = g.k * b + k * Math.max(g.k, .5) * 1.2; }
    for (const g of basics) { want.copy(flash).multiplyScalar(Math.max(1, Math.max(g.base.r, g.base.g, g.base.b))); g.m.color.copy(g.base).multiplyScalar(b).lerp(want, k * .8); }
    for (const g of bodies) {
      if (k > 0) { g.m.emissive.copy(flash); g.m.emissiveIntensity = k * .55; } else { g.m.emissive.copy(g.base); g.m.emissiveIntensity = g.k; }
    }
    for (const c of cells) { want.copy(c.base).multiplyScalar(c.glow ? b : 1).lerp(flash, k * (c.glow ? .8 : .55)); c.mesh.setColorAt(c.i, want); }
    for (const m of meshes) m.instanceColor.needsUpdate = true;
  }

  return {
    count: glows.length + basics.length + bodies.length + cells.length,
    event(ev) {
      if (!ev || !ev.type) return;
      const hex = FLASH[ev.type];
      if (hex === undefined) return;
      flash.setHex(hex);
      age = 0; dirty = true;
      if (ev.type === 'right') { const s = Math.max(0, Math.min(STREAK_CAP, (ev.streak | 0) - 1)); boostTo = s / (STREAK_CAP - 1); }
      else boostTo = 0;
      if (soft()) boost = boostTo;
    },
    update(dt) {
      if (!dirty) return;
      if (!(dt > 0) || !Number.isFinite(dt)) dt = 1 / 60;
      age += dt;
      boost += (boostTo - boost) * Math.min(1, dt * 4);
      if (Math.abs(boostTo - boost) < .004) boost = boostTo;
      const x = Math.min(1, age / PULSE);
      // quick rise (first 15%), smooth fall; reduced motion gets a softer flat-topped tint
      let k = x < .15 ? x / .15 : 1 - (x - .15) / .85;
      k = k * k * (3 - 2 * k);
      if (soft()) k = x < 1 ? .7 : 0;
      apply(k);
      if (x >= 1 && boost === boostTo) dirty = false;
    },
    state() { return {age, boost, boostTo, dirty}; },
    dispose() { glows.length = basics.length = bodies.length = cells.length = meshes.length = 0; }
  };
}

// Wrap a world definition so the built world gets event(ev) and its accent reactions. A world that already defines
// event() keeps it and is still given the shared reactions.
export function withReactions(W) {
  if (!W || typeof W.build !== 'function' || W.__reacts) return W;
  const build = W.build.bind(W);
  return {
    ...W,
    __reacts: true,
    build(ctx) {
      const world = build(ctx);
      if (!world || !world.group) return world;
      let r = null;
      try {
        const acc = ctx.accent && ctx.accent.base ? ctx.accent : (ctx.look && ctx.look.accentSet ? ctx.look.accentSet((ctx.theme && ctx.theme.accent) || '#2b7bb9') : null);
        const mq = () => { try { return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };
        r = createReactor(ctx.THREE, world.group, acc, {reduced: () => !!ctx.reduced || mq()});
      } catch (e) { r = null; }
      const ownUpdate = world.update, ownEvent = world.event, ownDispose = world.dispose;
      world.update = function (dt) { if (ownUpdate) ownUpdate.call(world, dt); if (r) r.update(dt); };
      world.event = function (ev) { if (ownEvent) { try { ownEvent.call(world, ev); } catch (e) { /* a world's own hook never breaks play */ } } if (r) r.event(ev); };
      world.dispose = function () { if (r) r.dispose(); r = null; if (ownDispose) ownDispose.call(world); };
      world.reactor = r;
      return world;
    }
  };
}
