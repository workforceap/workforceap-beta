// Mechanic 'gate' (label "Decide"): items roll toward a scanner arch one at a time; the player judges each one
// with one of 2-3 actions. Timed runs: about 20 seconds per item.
//
// Level payload: prompt, actions: [{id, label}] (2-3), items: [{title, facts: [..], answer: actionId, why, prop?}] (6-8).
// rules are PURE (no DOM, no three) and deterministic for a given seed; state is plain JSON.
// Events add two optional fields beyond the contract, used by the 3D view: choice (the picked action id) and
// correct (the right action id).

export const TRAVEL_SECONDS = 20;

function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const labelOf = (state, id) => (state.actions.find((a) => a.id === id) || {label: String(id)}).label;

function advance(state, events) {
  const next = {...state, i: state.i + 1, left: state.travel};
  if (next.i >= next.items.length) events.push({type: 'done'});
  return next;
}

export const rules = {
  init(level, {seed = 1, timed = false} = {}) {
    const rnd = rng(seed);
    const items = shuffle(level.items, rnd).map((it) => {
      const out = {title: it.title, facts: (it.facts || []).slice(0, 3), answer: it.answer, why: it.why};
      if (typeof it.prop === 'string' && it.prop) out.prop = it.prop;
      return out;
    });
    return {
      mechanic: 'gate',
      timed: !!timed,
      travel: TRAVEL_SECONDS,
      left: TRAVEL_SECONDS,
      prompt: level.prompt,
      actions: level.actions.map((a) => ({id: a.id, label: a.label})),
      items,
      i: 0
    };
  },
  view(state) {
    const it = state.items[state.i] || null;
    return {
      card: it ? {title: it.title, lines: it.facts.slice()} : null,
      prompt: it ? state.prompt : '',
      choices: state.actions.map((a) => ({id: a.id, label: a.label, done: false})),
      progress: {done: Math.min(state.i, state.items.length), total: state.items.length},
      timer: state.timed && it ? {left: Math.max(0, state.left), total: state.travel} : null
    };
  },
  act(state, choiceId) {
    const it = state.items[state.i];
    if (!it || !state.actions.some((a) => a.id === choiceId)) return {state, events: []};
    const events = [];
    if (choiceId === it.answer) events.push({type: 'right', why: it.why, choice: choiceId, correct: it.answer});
    else events.push({type: 'wrong', correctLabel: labelOf(state, it.answer), why: it.why, review: {title: it.title, correct: labelOf(state, it.answer)}, choice: choiceId, correct: it.answer});
    return {state: advance(state, events), events};
  },
  tick(state, dt) {
    const it = state.items[state.i];
    if (!state.timed || !it || !(dt > 0)) return {state, events: []};
    const left = state.left - dt;
    if (left > 0) return {state: {...state, left}, events: []};
    const events = [{type: 'timeout', correctLabel: labelOf(state, it.answer), why: it.why, review: {title: it.title, correct: labelOf(state, it.answer)}, correct: it.answer}];
    return {state: advance(state, events), events};
  },
  hint(state) {
    const it = state.items[state.i];
    return it ? it.answer : null;
  },
  done(state) { return state.i >= state.items.length; }
};

function howTo(level) {
  const labels = (level.actions || []).map((a) => a.label);
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}` : labels.join('');
  return [
    'Items arrive one at a time. Read the facts on each one.',
    `Decide what to do with it: ${list}.`,
    'Tap a button below, or tap a pad on the floor.'
  ];
}

// ---------------------------------------------------------------------------------------------
// Pure layout and feedback helpers (exported for tests; no three, no DOM).

// Stage layout (world units; +z is toward the camera). Conveyor from far away to the scanner arch, pads in a row nearest
// the camera.
export const GATE_LAYOUT = Object.freeze({zFar: -6.4, zArch: -.45, zPads: 1.2, padD: 1.2, archHalf: 1.27, archTop: 2.05, beltEnd: .2});

// Pad row for n actions: width, gap and x centres, inside the stage (x -3..3).
export function padLayout(n) {
  const k = Math.max(1, Math.min(3, n | 0));
  const padW = k >= 3 ? 1.8 : k === 2 ? 2.35 : 2.6, gap = k >= 3 ? .16 : .44;
  const xs = Array.from({length: k}, (_, i) => (i - (k - 1) / 2) * (padW + gap));
  return {padW, gap, xs, half: (k * padW + (k - 1) * gap) / 2};
}

// Pad sign plate for n actions (world units). Three narrow pads get a taller plate so two lines fit with room above
// and below; the font floor (minFont) keeps a wrapped label at about 11 CSS px or more on a 390 px phone (the pad row
// shows about 50 px per world unit there). The text is centred on the plate by kit.label.
export function padSign(n) {
  const {padW} = padLayout(n), k = Math.max(1, Math.min(3, n | 0));
  return {w: +(padW - .14).toFixed(2), h: k >= 3 ? .76 : .66, maxLines: 2, maxFont: k >= 3 ? .29 : .3, minFont: .22};
}

// Floating outcome tag over a pad: the chosen label on a right answer, 'Not quite' on a wrong one, "Time's up" on a
// timeout (shown over the arch, pad null). Pure; the view draws it with kit.label.
export function tagOf(ev, actions = []) {
  if (!ev) return null;
  const lab = (id) => (actions.find((a) => a.id === id) || {label: String(id)}).label;
  if (ev.type === 'right') return {kind: 'right', pad: ev.choice || null, text: lab(ev.choice)};
  if (ev.type === 'wrong') return {kind: 'wrong', pad: ev.choice || null, text: 'Not quite'};
  if (ev.type === 'timeout') return {kind: 'wrong', pad: null, text: "Time's up"};
  return null;
}

// Camera distance along its forward axis needed to fit a box (same maths as the engine's solveFocus, yaw 0). Larger
// (less negative) means closer. Pure; used only to choose how much conveyor a canvas shape can show for free.
// fitParts gives the across (h) and up-down (v) limits separately; the binding one is the smaller.
function fitCf(box, pitchDeg, fovDeg, aspect, margin) {
  const f = fitParts(box, pitchDeg, fovDeg, aspect, margin);
  return Math.min(f.h, f.v);
}
export function fitParts(box, pitchDeg, fovDeg, aspect, margin) {
  const p = pitchDeg * Math.PI / 180, fy = -Math.sin(p), fz = -Math.cos(p), uy = Math.cos(p), uz = -Math.sin(p);
  const ty = Math.tan(fovDeg * Math.PI / 360), ky = ty * (1 - 2 * margin), kx = ty * aspect * (1 - 2 * margin);
  let A = -Infinity, B = -Infinity, A2 = -Infinity, B2 = -Infinity;
  for (const X of [box.x0, box.x1]) for (const Y of [box.y0, box.y1]) for (const Z of [box.z0, box.z1]) {
    const pf = Y * fy + Z * fz, pu = Y * uy + Z * uz;
    A = Math.max(A, X - kx * pf); B = Math.max(B, -X - kx * pf); A2 = Math.max(A2, pu - ky * pf); B2 = Math.max(B2, -pu - ky * pf);
  }
  return {h: -(A + B) / (2 * kx), v: -(A2 + B2) / (2 * ky)};
}
export const fovGuess = (a) => Math.min(50, Math.max(39, 50 - (a - .7) * 11)); // the engine's fovFor (only steers the choice)

// The focus box and camera options for a canvas aspect (w / h). The pad row sets the width; the box then reaches as
// far up the conveyor as the canvas shape allows without moving the camera back, so a tall phone canvas is filled by
// the belt (the item travels toward the camera the whole way) and a short wide canvas keeps the arch and pads large.
export function gateFocus(n, aspect) {
  const {half} = padLayout(n), L = GATE_LAYOUT;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const wide = a > 1.45, z1 = L.zPads + L.padD / 2 + .05;
  // a very tall canvas (narrower than about 3:4) looks down a little more, so the floor, not the horizon, fills it
  const opts = {pitch: wide ? 36 : a < .78 ? +Math.min(54, 40 + (.78 - a) * 50).toFixed(1) : 40, yaw: 0, margin: wide ? .025 : .03};
  // y0 below the floor keeps a slim apron of floor under the pads on phone and desktop canvases: the shell's streak chip
  // pops at the bottom of the 3D view and should not sit on the pad signs. It costs no width.
  const make = (depth) => ({x0: -half - .06, x1: half + .06, z0: +(z1 - depth).toFixed(2), z1, y0: wide ? 0 : -.8, y1: wide ? 2.05 : 2.15});
  const minDepth = 3.4, maxDepth = z1 - (L.zFar + .4), fov = fovGuess(a);
  const best = fitCf(make(minDepth), opts.pitch, fov, a, opts.margin);
  let depth = minDepth;
  for (let d = maxDepth; d > minDepth; d -= .25) if (fitCf(make(d), opts.pitch, fov, a, opts.margin) >= best - 1e-3) { depth = d; break; }
  // A very tall canvas still has room above and below once the whole belt is in, and the solver centres the box, which
  // leaves an empty band of floor under the pads. Reach further back into the room instead (far corners never widen
  // the view): the pads then sit on the bottom margin and the back of the room fills the top. Same camera distance.
  if (depth >= maxDepth - 1e-6) {
    for (let d = BACK_REACH; d > maxDepth; d -= .1) if (fitCf(make(d), opts.pitch, fov, a, opts.margin) >= best - 1e-3) { depth = d; break; }
  }
  return {box: make(depth), opts};
}
const BACK_REACH = 20; // deepest box (world units from the pad front) gateFocus may use to fill a very tall canvas

// What the 3D view shows for an event. Every effect names the action it belongs to, so a quick answer can never show
// a check or a ring on another pad. hold: keep the state on screen until the shell sends {type: 'resume'}.
export function outcomeOf(ev) {
  if (!ev) return null;
  if (ev.type === 'right') {
    const streak = Math.max(1, ev.streak | 0);
    return {type: 'right', pad: ev.choice, mark: 'right', markPad: ev.choice, glow: null, hold: false, streak, big: streak >= 3};
  }
  if (ev.type === 'wrong') return {type: 'wrong', pad: ev.choice, mark: 'wrong', markPad: ev.choice, glow: ev.correct || null, hold: true, streak: 0, big: false};
  if (ev.type === 'timeout') return {type: 'timeout', pad: null, mark: 'wrong', markPad: null, glow: ev.correct || null, hold: true, streak: 0, big: false};
  return null;
}

// ---------------------------------------------------------------------------------------------
// 3D view. ctx = {THREE, engine, look, world, theme, level, props, reduced, accent}
function createView(ctx) {
  const {THREE, engine, look, theme, level, props} = ctx;
  const kit = engine.kit;
  const L = GATE_LAYOUT;
  const reduced = () => !!(ctx.reduced || engine.reduced);
  const A = ctx.accent || engine.accent || look.accentSet(theme.accent || '#ad2c4d');
  const root = new THREE.Group(); root.name = 'gate-view'; engine.scene.add(root);
  const GREEN = new THREE.Color(0x3fc46a), RED = new THREE.Color(0xff3b2f), AMBER = new THREE.Color(0xffb02e), GOLD = new THREE.Color(0xffd34d), WHITE = new THREE.Color(0xffffff), BLACK = new THREE.Color(0);
  const owned = []; // textures, geometries and materials this view made outside kit caches; disposed in dispose()
  const own = (x) => { owned.push(x); return x; };
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpBox = new THREE.Box3(), dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const acts = level.actions || [];
  const lay = padLayout(acts.length);
  let glow = (engine.mood && engine.mood.glow) || .45, moodId = engine.mood && engine.mood.id;

  // ---------- conveyor ----------
  const BELT_LEN = L.beltEnd - L.zFar, beltMid = (L.zFar + L.beltEnd) / 2;
  const chevron = (g, w, h, bg, fg) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(30, 44); g.lineTo(64, 80); g.lineTo(98, 44); g.stroke();
  };
  const beltMap = own(look.canvasTexture(128, 128, (g, w, h) => chevron(g, w, h, '#2b313c', 'rgba(255,255,255,.28)'), {repeat: [1, 6], aniso: 8}));
  const beltGlow = own(look.canvasTexture(128, 128, (g, w, h) => chevron(g, w, h, '#000000', '#ffffff'), {repeat: [1, 6], aniso: 8}));
  root.add(kit.box(1.86, .12, BELT_LEN, kit.cmat('g-trackbase', {color: 0x2a303b, roughness: .55, metalness: .2}), 0, 0, beltMid, .05));
  const beltM = own(new THREE.MeshStandardMaterial({map: beltMap, emissiveMap: beltGlow, emissive: A.bright.clone(), emissiveIntensity: .3, roughness: .82, metalness: .02}));
  const belt = new THREE.Mesh(own(new THREE.PlaneGeometry(1.44, BELT_LEN)), beltM);
  belt.rotation.x = -Math.PI / 2; belt.position.set(0, .126, beltMid); belt.receiveShadow = true; root.add(belt);
  const railM = kit.cmat('g-rail|' + A.hex, {color: A.base.clone(), roughness: .4, metalness: .1});
  [-.84, .84].forEach((x) => root.add(kit.box(.14, .12, BELT_LEN, railM, x, .07, beltMid, .05)));
  const roller = kit.cyl(.1, .1, 1.72, kit.cmat('g-roller', {color: 0xc5ccd8, roughness: .35, metalness: .5}), 0, 0, 0, 16);
  roller.rotation.z = Math.PI / 2; roller.position.set(0, .1, L.beltEnd); root.add(roller);

  // ---------- scanner arch ----------
  const archM = kit.cmat('g-arch2', {color: 0x2c3444, roughness: .45, metalness: .25});
  const IDLE = new THREE.Color();
  const lightM = own(new THREE.MeshStandardMaterial({color: 0x10141c, emissive: A.bright.clone(), emissiveIntensity: 1, roughness: .3, toneMapped: false}));
  const H = L.archTop, X = L.archHalf;
  [-X, X].forEach((x) => {
    root.add(kit.box(.26, H, .4, archM, x, 0, L.zArch, .07));
    root.add(kit.box(.06, H - .35, .24, lightM, x - Math.sign(x) * .145, .16, L.zArch, .02));
    root.add(kit.box(.46, .14, .62, archM, x, 0, L.zArch, .05)); // feet
  });
  root.add(kit.box(2 * X + .3, .32, .44, archM, 0, H - .04, L.zArch, .08));
  root.add(kit.box(2 * X - .3, .06, .26, lightM, 0, H - .1, L.zArch, .02));
  // scan beam: a bright bar plus a soft light sheet that sweeps over the item when it arrives
  const beamM = own(new THREE.MeshBasicMaterial({color: A.bright.clone(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false}));
  const sheetM = own(new THREE.MeshBasicMaterial({color: A.bright.clone(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending}));
  const beam = new THREE.Group(); beam.position.set(0, 1, L.zArch); root.add(beam);
  beam.add(new THREE.Mesh(own(new THREE.BoxGeometry(2 * X - .3, .035, .05)), beamM));
  const sheet = new THREE.Mesh(own(new THREE.PlaneGeometry(2 * X - .3, 1.1)), sheetM); sheet.rotation.x = -Math.PI / 2; beam.add(sheet);
  beam.visible = false;
  const scan = {t: 1, dur: .8};
  const archFx = {color: new THREE.Color(), t: 0, life: 1};

  // ---------- action pads ----------
  const pads = new Map();
  const PAD_TILT = .95; // sign tilt back from vertical (radians): faces a camera about 40 degrees above the floor
  const haloTex = own(look.canvasTexture(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, {aniso: 1}));
  const haloPadGeo = own(new THREE.PlaneGeometry(lay.padW * 1.7, L.padD * 2.1)); haloPadGeo.userData.cached = true;
  const baseM = kit.cmat('g-padbody', {color: 0x2a3140, roughness: .5, metalness: .12});
  const markTex = {
    right: own(look.canvasTexture(128, 128, (g, w) => { g.fillStyle = '#2fb35c'; g.beginPath(); g.arc(w / 2, w / 2, 60, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 15; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(36, 66); g.lineTo(56, 86); g.lineTo(93, 44); g.stroke(); }, {aniso: 1})),
    wrong: own(look.canvasTexture(128, 128, (g, w) => { g.fillStyle = '#e5484d'; g.beginPath(); g.arc(w / 2, w / 2, 60, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 15; g.lineCap = 'round'; g.beginPath(); g.moveTo(43, 43); g.lineTo(85, 85); g.moveTo(85, 43); g.lineTo(43, 85); g.stroke(); }, {aniso: 1}))
  };
  const stampGeo = own(new THREE.PlaneGeometry(.46, .46)); stampGeo.userData.cached = true;
  const stampM = {
    right: own(new THREE.MeshBasicMaterial({map: markTex.right, transparent: true, toneMapped: false, fog: false, depthWrite: false})),
    wrong: own(new THREE.MeshBasicMaterial({map: markTex.wrong, transparent: true, toneMapped: false, fog: false, depthWrite: false}))
  };
  stampM.right.userData.cached = stampM.wrong.userData.cached = true;
  const SIGN_DIM = new THREE.Color(.62, .6, .62);
  acts.forEach((a, i) => {
    const x = lay.xs[i], padW = lay.padW, D = L.padD;
    const g = new THREE.Group(); g.position.set(x, 0, L.zPads); g.userData.choiceId = a.id; g.name = 'pad-' + a.id;
    const body = new THREE.Group(); g.add(body);
    const rimM = kit.own({color: A.base.clone(), emissive: A.bright.clone(), emissiveIntensity: .4, roughness: .4, metalness: .05});
    body.add(kit.box(padW + .1, .08, D + .1, rimM, 0, 0, 0, .04));               // glowing skirt (pad rim)
    body.add(kit.box(padW, .2, D, baseM, 0, .03, 0, .07));                       // chunky body
    const plateM = kit.own({color: 0x3c4659, emissive: BLACK.clone(), emissiveIntensity: 1, roughness: .55, metalness: 0});
    const plate = kit.box(padW - .24, .04, D * .46, plateM, 0, .23, -D / 2 + .12 + D * .23, .02);  // landing plate (back half)
    body.add(plate);
    const ps = padSign(acts.length), hh = ps.h / 2;
    const sign = kit.label(a.label, {w: ps.w, h: ps.h, maxLines: ps.maxLines, bg: '#fffaf1', fg: '#141c29', depth: .07, back: A.dark, weight: 800, maxFont: ps.maxFont, minFont: ps.minFont});
    const sb = {y: .25, z: D / 2 - .06};
    sign.rotation.x = -PAD_TILT;
    sign.position.set(0, sb.y + hh * Math.cos(PAD_TILT), sb.z - hh * Math.sin(PAD_TILT));
    body.add(sign);
    // number badge hangs off the plate's top-left corner, clear of the text
    const badge = kit.label(String(i + 1), {w: .28, h: .28, maxLines: 1, bg: A.hex, fg: '#ffffff', depth: .04, back: A.dark, weight: 800, maxFont: .19, minFont: .12});
    badge.position.set(-ps.w / 2 + .06, hh + .02, .05); sign.add(badge);
    // result stamp on the sign's top-right corner (a cross on the wrong pick, a check on the right action). It does not
    // depend on the accent colour, so a red or pink accent cannot hide which pad was wrong.
    const stamp = new THREE.Mesh(stampGeo, stampM.wrong); stamp.position.set(ps.w / 2 - .03, hh + .02, .09); stamp.renderOrder = 4; stamp.visible = false; sign.add(stamp);
    const blob = look.makeBlob(padW * 1.25, D * 1.35, .4); blob.position.y = .005; g.add(blob);
    const haloPM = own(new THREE.MeshBasicMaterial({map: haloTex, color: WHITE.clone(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending}));
    const halo = new THREE.Mesh(haloPadGeo, haloPM); halo.rotation.x = -Math.PI / 2; halo.position.y = .02; halo.renderOrder = 3; halo.visible = false; g.add(halo);
    root.add(g);
    pads.set(a.id, {g, body, rimM, plateM, haloPM, halo, sign, signM: sign.children[0].material, stamp, stampT: 0, x, press: 1, fx: null, land: new THREE.Vector3(x, .3, L.zPads - D / 2 + .12 + D * .23)});
  });

  // ---------- reusable effects (one of each; every new event resets them, so nothing lingers) ----------
  const markM = own(new THREE.SpriteMaterial({map: markTex.right, transparent: true, depthTest: false, toneMapped: false}));
  const markS = new THREE.Sprite(markM); markS.renderOrder = 30; markS.visible = false; root.add(markS);
  const mark = {t: 0, base: new THREE.Vector3(), size: .8, on: false, owner: null};

  const shockM = own(new THREE.MeshBasicMaterial({color: GREEN.clone(), transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false}));
  const shockGeo = own(new THREE.RingGeometry(.55, .7, 48));
  const shocks = [0, 1].map(() => { const m = new THREE.Mesh(shockGeo, shockM.clone()); own(m.material); m.rotation.x = -Math.PI / 2; m.visible = false; root.add(m); return {m, t: 0, delay: 0, on: false, max: 2.4}; });

  const NP = 44;
  const partM = own(new THREE.MeshStandardMaterial({color: 0xffffff, roughness: .45, metalness: 0, emissive: 0x222222}));
  const parts = new THREE.InstancedMesh(kit.bevel(.12, .12, .12, .025), partM, NP);
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < NP; i++) parts.setColorAt(i, WHITE);
  parts.count = 0; parts.visible = false; parts.frustumCulled = false; root.add(parts);
  const pPos = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3), pRot = new Float32Array(NP * 2);
  let pLive = 0, pT = 0;

  // floating outcome tag (camera-facing kit.label): green with the chosen label, red 'Not quite'. One of each, reused.
  const tagW = Math.min(2.3, lay.padW + .4);
  const tagOpts = {w: tagW, h: .5, maxLines: 2, depth: 0, billboard: true, weight: 800, maxFont: .3, minFont: .2};
  const tags = {
    right: kit.label(' ', {...tagOpts, bg: '#1f9d4f', fg: '#ffffff'}),
    wrong: kit.label(' ', {...tagOpts, bg: '#d93636', fg: '#ffffff'})
  };
  for (const t of Object.values(tags)) { t.visible = false; t.children[0].renderOrder = 31; t.children[0].material.depthTest = false; root.add(t); }
  const tag = {t: 0, on: false, obj: null, base: new THREE.Vector3()};
  function showTag(info, pos) {
    hideTag();
    if (!info) return;
    const obj = tags[info.kind] || tags.wrong;
    obj.setText(info.text); obj.children[0].material.opacity = 1;
    tag.obj = obj; tag.on = true; tag.t = 0; tag.base.copy(pos);
    obj.position.copy(pos); obj.scale.setScalar(reduced() ? 1 : .01); obj.visible = true;
  }
  function hideTag() { for (const t of Object.values(tags)) t.visible = false; tag.on = false; tag.obj = null; }

  // short accent trail behind a flying item: a pool of additive dots that shrink away (one shared material)
  const NT = 8;
  const trailM = own(new THREE.SpriteMaterial({map: haloTex, color: A.bright.clone(), transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false}));
  const trail = Array.from({length: NT}, () => { const s = new THREE.Sprite(trailM); s.visible = false; s.renderOrder = 5; root.add(s); return {s, age: 9}; });
  let trailNext = 0, trailAcc = 0;
  function dropTrail(pos) {
    const d = trail[trailNext]; trailNext = (trailNext + 1) % NT;
    d.age = 0; d.s.position.copy(pos); d.s.visible = true;
  }
  function clearTrail() { for (const d of trail) { d.age = 9; d.s.visible = false; } }

  // ---------- item ----------
  const ringM = own(new THREE.MeshBasicMaterial({color: A.bright.clone(), transparent: true, opacity: .9, toneMapped: false, depthWrite: false}));
  const ringGeo = own(new THREE.TorusGeometry(.78, .045, 8, 48));
  const haloM = own(new THREE.MeshBasicMaterial({color: A.bright.clone(), transparent: true, opacity: .22, toneMapped: false, depthWrite: false, side: THREE.DoubleSide}));
  const haloGeo = own(new THREE.CircleGeometry(.76, 40));
  ringGeo.userData.cached = haloGeo.userData.cached = true; // shared by every item; disposed with the view
  ringM.userData.cached = haloM.userData.cached = true;
  const ITEM_W = 1.55, ITEM_H = 1.4, BELT_Y = .13, Z_SCAN = L.zArch;

  let state = null, shownIndex = -1, item = null, flying = null, spawnDelay = 0, time = 0, hold = false, epoch = 0, outcome = null;

  function spawn(data, index) {
    const g = new THREE.Group(); g.name = 'item-' + index;
    const spin = new THREE.Group(); g.add(spin);
    const body = props.make((data && data.prop) || level.prop || 'block', {accent: A.base});
    // normalise any prop to the same on-screen size (props are about 0.6 wide, origin at the bottom centre)
    tmpBox.setFromObject(body); tmpBox.getSize(tmpV);
    const s = Math.min(ITEM_W / Math.max(.05, tmpV.x, tmpV.z * .9), ITEM_H / Math.max(.05, tmpV.y));
    body.scale.setScalar(s); body.position.y = .1 - tmpBox.min.y * s;
    spin.add(body);
    const halo = new THREE.Mesh(haloGeo, haloM); halo.rotation.x = -Math.PI / 2; halo.position.y = .012; g.add(halo);
    const ring = new THREE.Mesh(ringGeo, ringM); ring.rotation.x = Math.PI / 2; ring.position.y = .05; g.add(ring);
    const startZ = reduced() ? Z_SCAN : L.zFar + .4;
    g.position.set(0, BELT_Y, startZ);
    root.add(g);
    item = {g, spin, body, ring, index, age: 0, z: startZ, arrived: reduced(), sq: 0};
    if (reduced()) { clearOutcome(); startScan(); }
  }
  function startScan() { scan.t = 0; scan.dur = reduced() ? .7 : .85; beam.visible = true; }
  function removeItem(it) { if (!it) return; root.remove(it.g); kit.disposeTree(it.g); }

  function clearOutcome() {
    outcome = null;
    markS.visible = false; mark.on = false; mark.owner = null;
    shocks.forEach((s) => { s.on = false; s.m.visible = false; });
    pLive = 0; parts.count = 0; parts.visible = false;
    hideTag(); clearTrail();
    for (const p of pads.values()) { p.fx = null; paintPad(p, 0, null); p.stamp.visible = false; p.stampT = 0; p.signM.color.copy(WHITE); p.halo.scale.setScalar(1); }
    archFx.t = 0;
    if (flying) { removeItem(flying.it); flying = null; }
  }
  function paintPad(p, amt, color) {
    const base = .25 + .45 * glow;
    if (!color || amt <= 0) { p.rimM.color.copy(A.base); p.rimM.emissive.copy(A.bright); p.rimM.emissiveIntensity = base; p.plateM.emissive.copy(BLACK); p.halo.visible = false; return; }
    p.rimM.emissive.copy(A.bright).lerp(color, Math.min(1, amt * 1.4)); p.rimM.color.copy(A.base).lerp(color, Math.min(1, amt * 1.4)); p.rimM.emissiveIntensity = base + 1.6 * amt;
    p.plateM.emissive.copy(color).multiplyScalar(.85 * amt);
    p.halo.visible = true; p.haloPM.color.copy(color); p.haloPM.opacity = Math.min(1, amt) * (moodId === 'day' ? .75 : .6);
  }
  function flashPad(id, color, {delay = 0, life = 1.1, strength = 1, hold: held = false} = {}) {
    const p = pads.get(id); if (!p) return;
    p.fx = {color: color.clone(), t: -delay, life: reduced() ? Math.max(life, 1.4) : life, strength, hold: held};
  }
  // Held result on a pad: a stamp on its sign; the wrong pick also dims its sign and gets a wider red halo.
  function stampPad(id, kind, delay = 0) {
    const p = pads.get(id); if (!p) return;
    p.stamp.material = stampM[kind]; p.stampT = reduced() ? 1 : -delay;
    p.stamp.scale.setScalar(reduced() ? 1 : .01); p.stamp.visible = !(p.stampT < 0);
    if (kind === 'wrong') { p.signM.color.copy(SIGN_DIM); p.halo.scale.setScalar(1.3); }
  }
  function showMark(kind, pos, owner, size = .8) {
    markM.map = kind === 'right' ? markTex.right : markTex.wrong; markM.needsUpdate = true;
    mark.base.copy(pos); mark.t = 0; mark.on = true; mark.owner = owner; mark.size = size;
    markS.position.copy(pos); markS.scale.setScalar(reduced() ? size : .01); markS.visible = true; markM.opacity = 1;
  }
  function shock(pos, color, big) {
    shocks.forEach((s, i) => {
      if (i === 1 && !big) return;
      s.m.material.color.copy(i === 1 ? GOLD : color);
      s.m.position.set(pos.x, .3, pos.z); s.t = 0; s.delay = i * .12; s.on = true; s.max = big ? 3.2 : 2.4; s.m.visible = false;
    });
  }
  function burst(pos, big) {
    if (reduced()) return;
    pLive = big ? NP : 26; pT = 0;
    for (let i = 0; i < pLive; i++) {
      const a = (i / pLive) * Math.PI * 2 + (i % 3) * .3, sp = 1.8 + (i % 5) * .45;
      pPos[i * 3] = pos.x; pPos[i * 3 + 1] = .45; pPos[i * 3 + 2] = pos.z;
      pVel[i * 3] = Math.cos(a) * sp; pVel[i * 3 + 1] = 3 + (i % 4) * .8; pVel[i * 3 + 2] = Math.sin(a) * sp * .8;
      pRot[i * 2] = i * .7; pRot[i * 2 + 1] = 4 + (i % 3) * 3;
      const c = big ? [GREEN, GOLD, A.bright, WHITE][i % 4] : [GREEN, A.bright, WHITE][i % 3];
      parts.setColorAt(i, c);
    }
    parts.instanceColor.needsUpdate = true;
    parts.count = pLive; parts.visible = true;
  }

  // An answer: every effect is reset and then started for this event only (epoch guards the delayed landing).
  function answer(ev) {
    const oc = outcomeOf(ev); if (!oc) return;
    epoch++;
    clearOutcome();
    outcome = {...oc, epoch, tag: tagOf(ev, acts)};
    let it = item; item = null;
    if (!it && shownIndex >= 0 && state && state.items[shownIndex]) { spawn(state.items[shownIndex], shownIndex); it = item; item = null; it.g.position.z = Z_SCAN; it.age = 1; }
    beam.visible = false; scan.t = 1;
    const p = oc.pad ? pads.get(oc.pad) : null;
    if (p) p.press = 0;
    if (oc.type === 'timeout') {
      archFx.color.copy(RED); archFx.t = archFx.life = 1.6;
      showTag(outcome.tag, tmpV.set(0, 1.78, Z_SCAN + .3));
      if (oc.glow) { flashPad(oc.glow, GREEN, {delay: .35, strength: .8, hold: true}); stampPad(oc.glow, 'right', .35); }
      engine.shake(.6);
    } else if (oc.type === 'right') {
      flashPad(oc.pad, WHITE, {life: .25, strength: .6});
    } else {
      flashPad(oc.pad, RED, {life: .3, strength: .5});
    }
    if (!it) { if (oc.type !== 'timeout') land(oc, p); spawnDelay = oc.hold ? 0 : (reduced() ? 1.1 : .8); hold = oc.hold; return; }
    it.ring.visible = false; it.g.children.forEach((c) => { if (c.geometry === haloGeo) c.visible = false; });
    const from = it.g.position.clone();
    const to = p ? p.land.clone() : from.clone();
    flying = {it, oc, p, from, to, t: 0, phase: oc.type === 'timeout' ? 'land' : 'fly', ep: epoch, dur: reduced() ? .22 : .4, lift: 0};
    trailAcc = 0;
    hold = oc.hold;
    spawnDelay = oc.hold ? 0 : (reduced() ? 1.1 : .8); // reduced motion: the next item appears in place, so hold the result a little longer
  }
  function land(oc, p) {
    if (!outcome || outcome.epoch !== epoch) return;
    if (oc.type === 'right') {
      const pos = p ? p.land : tmpV.set(0, .3, L.zPads);
      flashPad(oc.pad, GREEN, {life: oc.big ? 1.3 : 1.05, strength: oc.big ? 1.25 : 1});
      archFx.color.copy(GREEN); archFx.t = archFx.life = oc.big ? 1.1 : .8;
      shock(pos, GREEN, oc.big);
      burst(pos, oc.big);
      showMark('right', tmpV2.set(pos.x, 2.05, pos.z), oc.pad, oc.big ? .9 : .72);
      showTag(outcome.tag, tmpV2.set(pos.x, 1.35, pos.z));
    } else if (oc.type === 'wrong') {
      const pos = p ? p.land : tmpV.set(0, .3, L.zPads);
      flashPad(oc.pad, RED, {life: 1.2, strength: 1, hold: true});
      archFx.color.copy(RED); archFx.t = archFx.life = 1.4;
      // the cross floats clear above the tipped item, so the item stays visible under it
      showMark('wrong', tmpV2.set(pos.x, 2.32, pos.z), oc.pad, .66);
      showTag(outcome.tag, tmpV2.set(pos.x, 1.6, pos.z));
      stampPad(oc.pad, 'wrong');
      shock(pos, RED, false);
      engine.shake(.8);
      if (oc.glow) { flashPad(oc.glow, GREEN, {delay: .3, strength: .9, hold: true}); stampPad(oc.glow, 'right', .3); }
    }
  }

  function sync(s) {
    state = s;
    const idx = s.i < s.items.length ? s.i : -1;
    if (idx !== shownIndex) {
      if (item) { removeItem(item); item = null; }
      shownIndex = idx;
      if (idx >= 0 && !hold && spawnDelay <= 0) spawn(s.items[idx], idx);
    }
  }
  function event(ev) {
    if (!ev) return;
    if (ev.type === 'right' || ev.type === 'wrong' || ev.type === 'timeout') answer(ev);
    else if (ev.type === 'resume') {
      if (!hold) return;
      hold = false; clearOutcome(); spawnDelay = 0;
      if (!item && state && shownIndex >= 0) spawn(state.items[shownIndex], shownIndex);
    }
  }

  // ---------- mood / focus upkeep ----------
  function applyGlow() {
    glow = (engine.mood && engine.mood.glow) || .45; moodId = engine.mood && engine.mood.id;
    beltM.emissiveIntensity = moodId === 'day' ? .12 : .35 * glow;
    IDLE.copy(moodId === 'day' ? A.bright.clone().lerp(WHITE, .35) : A.bright);
    ringM.opacity = .9;
    for (const p of pads.values()) if (!p.fx) paintPad(p, 0, null);
  }
  applyGlow();
  let focusKey = '';
  function updateFocus(force = false) {
    if (!engine.setFocus) return;
    const sz = engine.size || {w: 1, h: 1}, aspect = sz.w / Math.max(1, sz.h);
    const f = gateFocus(acts.length, aspect), key = JSON.stringify(f);
    if (key === focusKey && !force) return;
    const first = !focusKey; focusKey = key;
    engine.setFocus(f.box, {...f.opts, ease: first ? .7 : 0});
  }
  updateFocus();

  // ---------- frame update ----------
  function update(dt) {
    time += dt;
    const rm = reduced();
    if (engine.mood && engine.mood.id !== moodId) applyGlow();
    updateFocus();
    if (spawnDelay > 0) {
      spawnDelay -= dt;
      if (spawnDelay <= 0 && !item && !hold && state && shownIndex >= 0) spawn(state.items[shownIndex], shownIndex);
    }
    let speed = 0;
    // live item: glide in, get scanned, bob and turn
    if (item) {
      item.age += dt;
      const pop = Math.min(1, item.age / .28);
      const sIn = rm ? 1 : Math.max(.01, pop < 1 ? pop * (1.15 - .15 * pop) : 1);
      let goal = Z_SCAN;
      if (state && state.timed && item.arrived) goal = Z_SCAN + .35 * Math.min(1, Math.max(0, 1 - state.left / state.travel));
      const prev = item.g.position.z;
      const z = rm ? goal : prev + (goal - prev) * Math.min(1, dt * (item.arrived ? 3 : 3.2));
      item.g.position.z = z; speed = (z - prev) / Math.max(dt, 1e-4);
      if (!item.arrived && Math.abs(goal - z) < .06) { item.arrived = true; item.sq = 1; if (!hold) clearOutcome(); startScan(); } // the last answer's effects end when the next item arrives
      item.sq = Math.max(0, item.sq - dt * 4);
      const sq = rm ? 0 : Math.sin(item.sq * Math.PI) * .12;
      item.spin.scale.set(sIn * (1 + sq * .6), sIn * (1 - sq), sIn * (1 + sq * .6));
      item.spin.position.y = rm ? 0 : .06 + Math.sin(time * 2.1) * .05;
      item.spin.rotation.y = rm ? 0 : Math.sin(time * .8) * .28;
      item.ring.scale.setScalar(rm ? 1 : 1 + .05 * Math.sin(time * 3.2));
      const urgent = state && state.timed && state.left < 5;
      ringM.color.copy(urgent ? AMBER : A.bright);
      ringM.opacity = rm ? .9 : .65 + .3 * Math.sin(time * (urgent ? 9 : 3.2));
    }
    beltM.map.offset.y -= speed * dt / (BELT_LEN / 6); beltGlow.offset.y = beltM.map.offset.y;
    // scan sweep
    if (scan.t < 1) {
      scan.t = Math.min(1, scan.t + dt / scan.dur);
      const k = scan.t;
      if (rm) { beam.position.y = 1.0; beamM.opacity = sheetM.opacity = 0; beamM.opacity = .9 * (1 - k); sheetM.opacity = .18 * (1 - k); }
      else {
        const sweep = k < .5 ? 1.85 - (k / .5) * 1.65 : .2 + ((k - .5) / .5) * .9; // down over the item, then back up
        beam.position.y = sweep;
        const fade = k < .15 ? k / .15 : k > .8 ? (1 - k) / .2 : 1;
        beamM.opacity = .95 * fade; sheetM.opacity = .22 * fade;
      }
      if (k >= 1) beam.visible = false;
    }
    // flying item (after an answer)
    if (flying) {
      const f = flying; f.t += dt;
      const g = f.it.g, sp = f.it.spin;
      if (f.phase === 'fly') {
        // wind-up: squash down, then a little hop up before the arc (anticipation)
        const ant = rm ? 0 : .09;
        if (f.t < ant) {
          const k = f.t / ant, dn = k < .55 ? k / .55 : 1 - (k - .55) / .45;
          sp.scale.set(1 + .18 * dn, 1 - .24 * dn, 1 + .18 * dn);
          f.lift = k < .55 ? 0 : .14 * (k - .55) / .45; g.position.y = f.from.y + f.lift;
        } else {
          const k = Math.min(1, (f.t - ant) / f.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          g.position.lerpVectors(f.from, f.to, e);
          g.position.y = f.from.y + f.lift * (1 - k) + (f.to.y - f.from.y) * e + Math.sin(k * Math.PI) * (rm ? 0 : 1.1);
          if (!rm) { trailAcc += dt; if (trailAcc >= .03) { trailAcc = 0; dropTrail(tmpV.set(g.position.x, g.position.y + .45, g.position.z)); } }
          const st = rm ? 0 : Math.sin(k * Math.PI) * .16;
          const sc = 1 - .3 * e;
          sp.scale.set(sc * (1 - st * .5), sc * (1 + st), sc * (1 - st * .5));
          if (!rm) sp.rotation.y += dt * 8;
          if (k >= 1) { f.phase = 'land'; f.t = 0; if (f.ep === epoch) land(f.oc, f.p); }
        }
      } else {
        const good = f.oc.type === 'right';
        if (good) {
          const k = Math.min(1, f.t / (rm ? .2 : .3));
          const sq = rm ? 0 : Math.sin(Math.min(1, k * 2) * Math.PI) * .25;
          const sc = .7 * (1 - k);
          sp.scale.set(sc * (1 + sq), Math.max(.001, sc * (1 - sq)), sc * (1 + sq));
          if (k >= 1) { removeItem(f.it); flying = null; }
        } else if (f.oc.type === 'wrong') {
          // bounce off the wrong pad, tip over and stay there until 'resume'
          const k = Math.min(1, f.t / .6);
          if (!rm) {
            g.position.y = f.to.y + Math.abs(Math.sin(k * Math.PI * 2)) * .25 * (1 - k);
            sp.rotation.z = -.5 * Math.min(1, k * 1.4);
          }
          sp.scale.setScalar(.7);
        } else {
          const k = Math.min(1, f.t / .8);
          if (!rm) { g.position.y = BELT_Y - .2 * k; sp.rotation.z = .45 * k; }
          sp.scale.setScalar(Math.max(.4, 1 - .5 * k));
        }
      }
    }
    // pads: press, flashes (held flashes pulse until resume)
    for (const p of pads.values()) {
      if (p.press < 1) {
        p.press = Math.min(1, p.press + dt / .22);
        const d = rm ? 0 : Math.sin(p.press * Math.PI);
        p.body.position.y = -.05 * d; p.body.scale.set(1 + .02 * d, 1 - .08 * d, 1 + .02 * d);
      }
      if (p.stampT < 1 && (p.stamp.visible || p.stampT < 0)) {
        p.stampT = Math.min(1, p.stampT + dt / .3);
        if (p.stampT >= 0) { p.stamp.visible = true; const k = p.stampT; p.stamp.scale.setScalar(rm ? 1 : Math.max(.01, k * (1 + .4 * Math.sin(k * Math.PI)))); }
      }
      const fx = p.fx;
      if (!fx) continue;
      fx.t += dt;
      if (fx.t < 0) continue;
      let amt;
      if (fx.hold) amt = (rm ? 1 : .75 + .25 * Math.sin(fx.t * 5)) * Math.min(1, fx.t * 6) * fx.strength;
      else {
        const k = Math.min(1, fx.t / fx.life);
        amt = (rm ? (k < .6 ? 1 : 1 - (k - .6) / .4) : (k < .08 ? k / .08 : 1 - (k - .08) / .92)) * fx.strength;
        if (k >= 1) { p.fx = null; paintPad(p, 0, null); continue; }
      }
      paintPad(p, amt, fx.color);
    }
    // trail dots shrink away
    for (const d of trail) {
      if (d.age >= .3) { if (d.s.visible) d.s.visible = false; continue; }
      d.age += dt; const k = Math.min(1, d.age / .3);
      d.s.scale.setScalar(Math.max(.01, .7 * (1 - k)));
    }
    // outcome tag: pop in, float, fade after about 0.9 s (kept while a wrong answer is held for the feedback sheet)
    if (tag.on && tag.obj) {
      tag.t += dt;
      const k = Math.min(1, tag.t / .25);
      tag.obj.scale.setScalar(rm ? 1 : Math.max(.01, k * (1 + .3 * Math.sin(k * Math.PI))));
      tag.obj.position.set(tag.base.x, tag.base.y + (rm ? 0 : Math.min(1, tag.t * 4) * .12 + Math.sin(time * 3) * .03), tag.base.z);
      if (!hold && tag.t > .9) { const o = Math.max(0, 1 - (tag.t - .9) / .3); tag.obj.children[0].material.opacity = o; if (o <= 0) hideTag(); }
    }
    // mark
    if (mark.on) {
      mark.t += dt;
      const k = Math.min(1, mark.t / .35);
      const popS = rm ? 1 : k * (1 + .35 * Math.sin(k * Math.PI));
      markS.scale.setScalar(mark.size * Math.max(.01, popS));
      markS.position.set(mark.base.x, mark.base.y + (rm ? 0 : Math.sin(time * 3) * .04 + Math.min(1, mark.t * 3) * .15), mark.base.z);
      if (!hold && mark.t > 1.25) { markM.opacity = Math.max(0, 1 - (mark.t - 1.25) / .3); if (markM.opacity <= 0) { mark.on = false; markS.visible = false; } }
    }
    // shock rings
    for (const s of shocks) {
      if (!s.on) continue;
      s.t += dt;
      const k = (s.t - s.delay) / .7;
      if (k < 0) continue;
      s.m.visible = true;
      if (k >= 1) { s.on = false; s.m.visible = false; continue; }
      s.m.scale.setScalar(rm ? 1.2 : 1 + k * s.max);
      s.m.material.opacity = .9 * (1 - k);
    }
    // particles
    if (pLive > 0) {
      pT += dt;
      for (let i = 0; i < pLive; i++) {
        pVel[i * 3 + 1] -= 9 * dt;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] = Math.max(.12, pPos[i * 3 + 1] + pVel[i * 3 + 1] * dt); pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        pRot[i * 2] += pRot[i * 2 + 1] * dt;
        dummy.position.set(pPos[i * 3], pPos[i * 3 + 1], pPos[i * 3 + 2]);
        dummy.rotation.set(pRot[i * 2], pRot[i * 2] * .7, 0);
        dummy.scale.setScalar(Math.max(.01, 1 - pT / 1.1));
        dummy.updateMatrix(); parts.setMatrixAt(i, dummy.matrix);
      }
      parts.instanceMatrix.needsUpdate = true;
      if (pT >= 1.1) { pLive = 0; parts.count = 0; parts.visible = false; }
    }
    // arch lights: outcome flash, amber in the last 5 seconds of a timed item, else idle accent
    if (archFx.t > 0) {
      archFx.t = Math.max(0, archFx.t - dt);
      const k = archFx.t / archFx.life;
      lightM.emissive.copy(IDLE).lerp(archFx.color, Math.min(1, k * 1.6)); lightM.emissiveIntensity = .8 + 1.4 * k;
    } else if (hold && outcome) { lightM.emissive.copy(RED); lightM.emissiveIntensity = rm ? 1 : .9 + .3 * Math.sin(time * 4); }
    else if (item && state && state.timed && state.left < 5) { lightM.emissive.copy(AMBER); lightM.emissiveIntensity = rm ? 1.2 : .9 + .6 * Math.max(0, Math.sin(time * 7)); }
    else if (scan.t < 1) { lightM.emissive.copy(IDLE).lerp(WHITE, .3); lightM.emissiveIntensity = 1.4; }
    else { lightM.emissive.copy(IDLE); lightM.emissiveIntensity = moodId === 'day' ? .85 : .7 + .25 * glow; }
  }

  // Debug read-out for tools (no effect on play): which pad each effect sits on, label sizes on screen.
  root.userData.debug = () => {
    const flashing = [...pads.entries()].filter(([, p]) => p.fx).map(([id, p]) => ({id, color: '#' + p.fx.color.getHexString(), hold: p.fx.hold}));
    const labelPx = {};
    for (const [id, p] of pads) { p.sign.getWorldPosition(tmpV); labelPx[id] = +(p.sign.fontSize * (engine.pxPerUnit ? engine.pxPerUnit(tmpV) : 0)).toFixed(1); }
    let itemFrac = null;
    const live = item || (flying && flying.it);
    if (live && engine.camera) {
      tmpBox.setFromObject(live.body); let mn = Infinity, mx = -Infinity;
      for (const x of [tmpBox.min.x, tmpBox.max.x]) for (const y of [tmpBox.min.y, tmpBox.max.y]) for (const z of [tmpBox.min.z, tmpBox.max.z]) { tmpV.set(x, y, z).project(engine.camera); mn = Math.min(mn, tmpV.x); mx = Math.max(mx, tmpV.x); }
      itemFrac = +((mx - mn) / 2).toFixed(3);
    }
    return {epoch, hold, shownIndex, item: item ? item.index : null, flying: flying ? {index: flying.it.index, to: flying.oc.pad, phase: flying.phase} : null,
      outcome: outcome && {type: outcome.type, pad: outcome.pad, glow: outcome.glow}, mark: mark.on ? {owner: mark.owner, x: +mark.base.x.toFixed(2)} : null,
      flashing, labelPx, itemFrac, tag: tag.on && tag.obj ? {kind: tag.obj === tags.right ? 'right' : 'wrong', x: +tag.base.x.toFixed(2)} : null,
      stamps: [...pads.entries()].filter(([, p]) => p.stamp.visible || p.stampT < 0).map(([id, p]) => ({id, kind: p.stamp.material === stampM.right ? 'right' : 'wrong'}))};
  };

  function dispose() {
    engine.scene.remove(root);
    if (flying) { removeItem(flying.it); flying = null; }
    if (item) { removeItem(item); item = null; }
    kit.disposeTree(root);
    parts.dispose();
    owned.forEach((x) => x && x.dispose && x.dispose());
    owned.length = 0;
  }
  return {sync, event, update, dispose, pads, get item() { return item; }};
}

export default {id: 'gate', label: 'Decide', howTo, rules, createView};
