// Mechanic 'match' (label "Connect"): each round shows two columns of 4-5 plates. The player picks a left plate
// (an unscored 'step'), then the right plate that pairs with it. A right pair snaps a cable between them.
//
// Level payload: rounds: [{prompt, pairs: [[left, right], ...] (4-5), why}] (2-3 rounds).
// rules are PURE (no DOM, no three) and deterministic for a given seed; state is plain JSON.
//
// Choice ids: left plate k of round r is `l<r>-<k>`, right plate is `r<r>-<k>` (k = index of the pair in the level
// data). While a left plate is selected the choices also include {id: 'back', kind: 'secondary'}, which deselects it
// at no cost (hint() never returns it).
// Events beyond the contract fields (used by the 3D view): step carries leftId (and cleared: true when deselected);
// right/wrong carry leftId, rightId (and correctId on wrong); right also carries pair ("CPU: runs the instructions")
// and has an empty why except on the last pair of a round (the round's why); timeout carries reveal: [{leftId, rightId}] for the pairs
// it connected for the player.
// Timer: per round, PER_PAIR seconds for each pair. A timeout costs one mistake, shows the remaining pairs and
// moves on to the next round.

export const PER_PAIR = 10;
export const BACK_ID = 'back';

function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const lid = (r, k) => `l${r}-${k}`;
const rid = (r, k) => `r${r}-${k}`;
const roundTotal = (rd) => rd.pairs.length * PER_PAIR;

// Wording. A meaning that follows a colon starts in lower case ("Bandwidth: how much data can move at once."), unless
// its first word is an acronym, a name with inner capitals or hyphens, or "I" ("IP address", "Wi-Fi", "MFA").
export function lowerFirst(text) {
  const s = String(text).trim();
  const m = /^([A-Z])([a-z']*)(?=[\s,.;:!?]|$)/.exec(s);
  if (!m || (m[1] === 'I' && !m[2])) return s;
  return m[1].toLowerCase() + s.slice(1);
}
const noStop = (s) => String(s).trim().replace(/[.!?]+$/, '');
// "Bandwidth: how much data can move at once" (no closing stop).
export const pairLine = (p) => `${noStop(p.left)}: ${noStop(lowerFirst(p.right))}`;

function advance(state, events) {
  const round = state.round + 1;
  const next = {...state, round, sel: null};
  if (round >= state.rounds.length) { next.left = 0; next.total = 0; events.push({type: 'done'}); }
  else { next.total = roundTotal(state.rounds[round]); next.left = next.total; events.push({type: 'round'}); }
  return next;
}
function withRound(state, r, patch) {
  const rounds = state.rounds.slice();
  rounds[r] = {...rounds[r], ...patch};
  return {...state, rounds};
}

export const rules = {
  init(level, {seed = 1, timed = false} = {}) {
    const rnd = rng(seed);
    const rounds = (level.rounds || []).map((rd) => {
      const idx = rd.pairs.map((_, i) => i);
      const leftOrder = shuffle(idx, rnd);
      let rightOrder = shuffle(idx, rnd);
      if (idx.length > 1 && rightOrder.every((k, i) => k === leftOrder[i])) rightOrder = rightOrder.slice(1).concat(rightOrder[0]);
      return {
        prompt: rd.prompt, why: rd.why,
        pairs: rd.pairs.map((p) => ({left: String(p[0]), right: String(p[1])})),
        leftOrder, rightOrder,
        matched: idx.map(() => false),
        revealed: idx.map(() => false)
      };
    });
    const total = rounds.length ? roundTotal(rounds[0]) : 0;
    return {mechanic: 'match', timed: !!timed, round: 0, sel: null, total, left: total, rounds};
  },
  view(state) {
    const totalPairs = state.rounds.reduce((n, r) => n + r.pairs.length, 0);
    const donePairs = state.rounds.reduce((n, r) => n + r.matched.filter(Boolean).length, 0);
    const rd = state.rounds[state.round];
    if (!rd) return {card: null, prompt: '', choices: [], progress: {done: donePairs, total: totalPairs}, timer: null};
    const r = state.round;
    const picking = state.sel === null;
    const order = picking ? rd.leftOrder : rd.rightOrder;
    const make = picking ? lid : rid;
    const side = picking ? 'left' : 'right';
    const choices = order.filter((k) => !rd.matched[k]).map((k) => ({id: make(r, k), label: rd.pairs[k][side], done: false}));
    if (!picking) choices.push({id: BACK_ID, label: 'Pick a different one', kind: 'secondary', done: false});
    const kicker = `Round ${r + 1} of ${state.rounds.length}`;
    const card = picking
      ? {kicker, title: 'Pick one on the left', lines: ['Then pick its partner on the right.']}
      : {kicker, title: `${rd.pairs[state.sel].left} →`, lines: ['Now pick the one it goes with.']};
    return {
      card, prompt: rd.prompt, choices,
      progress: {done: donePairs, total: totalPairs},
      timer: state.timed ? {left: Math.max(0, state.left), total: state.total} : null
    };
  },
  act(state, choiceId) {
    const rd = state.rounds[state.round];
    if (!rd) return {state, events: []};
    const r = state.round;
    const id = String(choiceId);
    if (id === BACK_ID) {
      if (state.sel === null) return {state, events: []};
      return {state: {...state, sel: null}, events: [{type: 'step', leftId: lid(r, state.sel), cleared: true}]};
    }
    const k = rd.pairs.findIndex((_, i) => id === lid(r, i) || id === rid(r, i));
    if (k < 0 || rd.matched[k]) return {state, events: []};
    const events = [];
    if (id === lid(r, k)) {
      if (state.sel === k) { events.push({type: 'step', leftId: id, cleared: true}); return {state: {...state, sel: null}, events}; }
      events.push({type: 'step', leftId: id});
      return {state: {...state, sel: k}, events};
    }
    if (state.sel === null) return {state, events: []};
    const sel = state.sel, pair = rd.pairs[sel];
    if (k === sel) {
      const matched = rd.matched.slice(); matched[sel] = true;
      let next = withRound({...state, sel: null}, r, {matched});
      const complete = matched.every(Boolean);
      // The shell's note already names the picked meaning ("Right: Runs the instructions") and the board shows the
      // pair, so a pair note would only repeat it. The last pair of a round carries the round's why instead.
      events.push({type: 'right', why: complete ? rd.why : '', pair: pairLine(pair), leftId: lid(r, sel), rightId: rid(r, k)});
      if (complete) next = advance(next, events);
      return {state: next, events};
    }
    events.push({
      type: 'wrong', correctLabel: pairLine(pair), why: rd.why,
      review: {title: pair.left, correct: pair.right},
      leftId: lid(r, sel), rightId: id, correctId: rid(r, sel)
    });
    return {state: {...state, sel: null}, events};
  },
  tick(state, dt) {
    const rd = state.rounds[state.round];
    if (!state.timed || !rd || !(dt > 0)) return {state, events: []};
    const left = state.left - dt;
    if (left > 0) return {state: {...state, left}, events: []};
    const r = state.round;
    const open = rd.leftOrder.filter((k) => !rd.matched[k]);
    const list = open.map((k) => pairLine(rd.pairs[k])).join('; ');
    const events = [{
      type: 'timeout', correctLabel: list, why: rd.why,
      review: {title: rd.prompt, correct: list},
      reveal: open.map((k) => ({leftId: lid(r, k), rightId: rid(r, k)}))
    }];
    const matched = rd.matched.map(() => true);
    const revealed = rd.revealed.map((v, k) => v || !rd.matched[k]);
    const next = advance(withRound({...state, sel: null}, r, {matched, revealed}), events);
    return {state: next, events};
  },
  hint(state) {
    const rd = state.rounds[state.round];
    if (!rd) return null;
    if (state.sel === null) {
      const k = rd.leftOrder.find((j) => !rd.matched[j]);
      return k === undefined ? null : lid(state.round, k);
    }
    return rid(state.round, state.sel);
  },
  done(state) { return state.round >= state.rounds.length; }
};

function howTo() {
  return [
    'Tap one on the left to pick it up. A cable comes out of it.',
    'Then tap its partner on the right to snap the cable across.',
    'Changed your mind? Tap "Pick a different one". A wrong link costs a heart.'
  ];
}

// ---------------------------------------------------------------------------------------------
// 3D view: a patch board. Two columns of large plates (kit.label) stand on a low board, tilted to face the camera.
// Terms on the left, wider meaning plates on the right, a cable channel between them.
// ctx = {THREE, engine, look, world, theme, level, props, reduced, accent}
const PITCH = 60;                 // camera pitch for the board (degrees); short, wide canvases look down a little more
const PITCH_WIDE = 65;            // (less perspective between the far and near rows, so the far row's type stays larger)
const BASE_Y = .12;               // plate bottom (top of its foot)
const ZC = -1.7;                  // board centre along z
const LIFT = .34;                 // selected plate lift
const LEAN = 14;                  // plate lean = board pitch - LEAN (degrees back from upright), so plate edges show
const GREEN_HEX = 0x3f9d55, RED_HEX = 0xd2394a, AMBER_HEX = 0xe5a23a;

// Plate layout for a round with n pairs at a canvas aspect (w / h). The meaning column is almost twice as wide as the
// term column. Tall canvases (phones, desktop side panels) bind on width, so the plates grow deeper to use the spare
// height (bigger type). Short, wide canvases bind on height: the rows pack tighter and the plates keep a depth that
// still fits two lines of large type (measured: shallower plates only made the type smaller).
// longWord: letters in the longest single word of the round's terms. A long word cannot wrap, so it would shrink to
// fit the term plate ("Motherboard"); the term column then gets a little wider (the meanings keep their width).
// Short, wide canvases (a phone at 360 x 640 with the sheet open) bind on height, so the type size is set by how many
// rows must stack. There they also: let the plate frames overlap a little (rowGap < 0), widen both columns into the
// spare width at the sides (wider meaning plates keep long meanings on two lines at full size), and compensate the
// perspective: far rows get deeper plates and near rows shallower ones (hOf), so every row's type shows at about the
// same on-screen size instead of the far row being a fifth smaller. H stays the mean plate depth.
export const PERSPECTIVE_K = .11;
export function boardLayout(n, aspect = 1, longWord = 0) {
  const wide = aspect >= 1.3;
  const extra = Math.min(.35, Math.max(0, (longWord - 8) * .1));
  let LW = 2.2 + extra, RW = 3.6;
  const GAP = .56;
  const rowGap = wide ? -.07 : .16;
  const pitch = wide ? PITCH_WIDE : PITCH, tilt = (pitch - LEAN) * Math.PI / 180;
  // on screen the plate block is about n * .82 * (H + .16 + rowGap) + .4 tall for a width of total + .3 (perspective
  // and the plates' lean shrink the rows; calibrated from screenshots at 390 x 844)
  const fit = ((LW + GAP + RW + .3) / Math.max(.3, aspect) - .4) / (n * .82) - .16 - rowGap;
  const H = Math.round(Math.min(n >= 5 ? 1.05 : 1.3, Math.max(.95, fit)) * 20) / 20; // capped so the board stays inside the stage
  if (wide) {
    const spare = aspect * (n * .82 * (H + .16 + rowGap) + .4) - .3 - (LW + GAP + RW);
    const widen = Math.min(1, Math.max(0, spare * .6));
    RW += widen * .7; LW += widen * .3;
  }
  const total = LW + GAP + RW;
  const k = wide && n > 1 ? PERSPECTIVE_K : 0;
  const hOf = (i) => H * (1 + k * (1 - 2 * i / Math.max(1, n - 1)));
  const sinP = Math.sin(pitch * Math.PI / 180);
  const zs = [0];
  for (let i = 1; i < n; i++) zs.push(zs[i - 1] + ((hOf(i - 1) + hOf(i)) / 2 + .16 + rowGap) / sinP);
  const mid = (zs[0] + zs[n - 1]) / 2;
  const dz = n > 1 ? (zs[n - 1] - zs[0]) / (n - 1) : (H + .16 + rowGap) / sinP;
  return {
    n, wide, aspect, LW, RW, GAP, H, total, dz, sinP, longWord, pitch, tilt, sinT: Math.sin(tilt), cosT: Math.cos(tilt), rowGap,
    xl: -total / 2 + LW / 2, xr: total / 2 - RW / 2, gapL: -total / 2 + LW, gapR: -total / 2 + LW + GAP,
    hOf, zOf: (i) => ZC + (zs[Math.max(0, Math.min(n - 1, i))] - mid)
  };
}

function createView(ctx) {
  const {THREE, engine, look, theme, level, props} = ctx;
  const kit = engine.kit;
  const tmpBox = new THREE.Box3();
  const reduced = () => !!(ctx.reduced || engine.reduced);
  const root = new THREE.Group(); root.name = 'match-view'; engine.scene.add(root);
  const acc = ctx.accent && ctx.accent.bright ? ctx.accent
    : (engine.accent && engine.accent.bright ? engine.accent : look.accentSet(/^#[0-9a-f]{6}$/i.test(theme.accent || '') ? theme.accent : '#ad2c4d'));
  const ACC = acc.base.clone(), ACC_BRIGHT = acc.bright.clone(), ACC_DARK = acc.dark.clone();
  const GREEN = new THREE.Color(GREEN_HEX), RED = new THREE.Color(RED_HEX), AMBER = new THREE.Color(AMBER_HEX);
  const BLACK = new THREE.Color(0), WHITE = new THREE.Color(0xffffff);
  const LEFT_BODY = ACC_DARK.clone().lerp(ACC, .35), RIGHT_BODY = new THREE.Color(0x34425e);
  const TINT_MATCH = new THREE.Color(0xd6f0db), TINT_DIM = new THREE.Color(0xc9ced8), TINT_AMBER = new THREE.Color(0xfbe6c2), TINT_RED = new THREE.Color(0xf6d3d6);
  const tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
  const glow = () => (engine.mood && engine.mood.glow) || .6;

  // ---------- shared resources ----------
  const pedMat = kit.cmat('mt2-ped', {color: 0x232a38, roughness: .55, metalness: .15});
  const boardMat = kit.cmat('mt2-board', {color: 0x2b3345, roughness: .62, metalness: .08});
  const channelMat = kit.cmat('mt2-channel', {color: 0x1b2130, roughness: .7, metalness: .05});
  const plugMat = kit.cmat('mt2-plug', {color: 0xe8ecf2, roughness: .35, metalness: .3});
  const plugGlowMat = kit.own({color: 0xffffff, emissive: ACC_BRIGHT.clone(), emissiveIntensity: 1.2, roughness: .3, metalness: .1});
  const edgeMat = kit.own({color: ACC_DARK, emissive: ACC_BRIGHT.clone(), emissiveIntensity: 1, roughness: .4, metalness: 0});
  const softTex = look.canvasTexture(128, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, {aniso: 1});
  const dotTex = look.canvasTexture(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, {aniso: 1});
  const markTex = {
    right: look.canvasTexture(128, 128, (g, w) => { g.fillStyle = '#3f9d55'; g.beginPath(); g.arc(w / 2, w / 2, 58, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(36, 66); g.lineTo(56, 86); g.lineTo(92, 44); g.stroke(); }, {aniso: 1}),
    wrong: look.canvasTexture(128, 128, (g, w) => { g.fillStyle = '#d2394a'; g.beginPath(); g.arc(w / 2, w / 2, 58, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(42, 42); g.lineTo(86, 86); g.moveTo(86, 42); g.lineTo(42, 86); g.stroke(); }, {aniso: 1})
  };
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const ringGeo = new THREE.RingGeometry(.42, .56, 40);
  const plugGeo = new THREE.BoxGeometry(.16, .12, .12);
  const ownGeos = [haloGeo, ringGeo, plugGeo];
  // Shared for the view's lifetime: kit.disposeTree (run on every retired board) must leave these alone; dispose() frees them.
  [haloGeo, ringGeo, plugGeo].forEach((g) => { g.userData.cached = true; });
  [softTex, dotTex, markTex.right, markTex.wrong].forEach((t) => { t.userData.cached = true; });
  edgeMat.userData.cached = true; plugGlowMat.userData.cached = true;

  // marks (pooled sprites)
  const marks = {};
  for (const kind of ['right', 'wrong']) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: markTex[kind], transparent: true, depthTest: false, toneMapped: false}));
    s.visible = false; s.renderOrder = 20; root.add(s);
    marks[kind] = {s, t: 0, life: 0, base: new THREE.Vector3()};
  }
  // rings (pooled)
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false}));
    m.visible = false; m.renderOrder = 6; root.add(m);
    return {m, t: 0, life: 0, grow: 1};
  });
  let ringNext = 0;
  // glow on the plug of the live cable (one sprite, moved between cables)
  const stubGlow = new THREE.Sprite(new THREE.SpriteMaterial({map: dotTex, color: ACC_BRIGHT.clone(), transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false}));
  stubGlow.scale.setScalar(.9); stubGlow.renderOrder = 7; stubGlow.userData.keepMat = true; stubGlow.userData.glow = true;
  // particles (one pooled Points object, preallocated)
  const PN = 120;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
  for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -50;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({size: .2, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false});
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 8; root.add(points);
  let pNext = 0, pAlive = 0;

  // ---------- state ----------
  let state = null, cur = null, shownRound = -2, time = 0;
  let pendingSwitch = null;      // {at} time to retire the finished board and build the next one
  let holdForResume = false;     // a wrong / timeout sheet is open: keep its cables until 'resume'
  let wrongHold = null;          // {cable, leftId, rightId, correctId}
  let focusKey = '', lastPlan = -1, planAspect = 0, focusSize = '';
  const sizeKey = () => { const s = engine.size || {w: 0, h: 0}; return s.w + 'x' + s.h; };
  const leaving = [];

  // The canvas gets shorter while the longer meaning buttons are listed, so plan the board for the shortest canvas seen.
  let minH = Infinity;
  const aspectNow = () => { const s = engine.size || {w: 1, h: 1}; return s.w / Math.max(1, Math.min(s.h, minH)); };

  // ---------- board ----------
  function plate(L, side, k, i, text, r, bg) {
    const SINP = L.sinT, COSP = L.cosT;                                                // plate lean
    const w = side === 'L' ? L.LW : L.RW, h = L.hOf(i), sx = side === 'L' ? 1 : -1;
    const x = side === 'L' ? L.xl : L.xr, z = L.zOf(i);
    const id = side === 'L' ? lid(r, k) : rid(r, k);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.userData.choiceId = null; g.name = 'plate-' + id;
    g.add(kit.box(w * .86, BASE_Y, .4, pedMat, 0, 0, -.04, .03));
    const tilt = new THREE.Group(); tilt.position.y = BASE_Y; tilt.rotation.x = -L.tilt; g.add(tilt);
    const bodyM = kit.own({color: side === 'L' ? LEFT_BODY.clone() : RIGHT_BODY.clone(), roughness: .48, metalness: .06, emissive: new THREE.Color(0), emissiveIntensity: 1});
    tilt.add(kit.box(w + .18, h + .18, .2, bodyM, 0, -.04, -.1, .07));
    const label = kit.label(text, {
      w, h, maxLines: 3, depth: 0, align: side === 'L' ? 'center' : 'left', accent: side === 'L' ? ACC : null,
      bg: side === 'L' ? '#fff8ec' : '#f6f8fc', fg: '#141c29', maxFont: side === 'L' ? Math.min(.44, h * .4) : Math.min(.4, h * .35), minFont: h * .16
    });
    label.position.set(0, (h + .1) / 2, .006); tilt.add(label);
    const labelMat = label.children[0].material;
    // number badge (matches the button number while this column is the one being picked from)
    const badge = kit.label('1', {w: .34, h: .34, depth: 0, bg: '#' + ACC_DARK.getHexString(), fg: '#ffffff', maxFont: .22, minFont: .12});
    badge.position.set(-sx * (w / 2 + .01), h + .06, .03); badge.visible = false; tilt.add(badge);
    // port on the inner edge, standing a little proud of the face so the connector plugged into it shows
    const portM = kit.own({color: 0x8a93a6, roughness: .3, metalness: .45, emissive: new THREE.Color(0), emissiveIntensity: 1.6});
    const port = new THREE.Mesh(kit.cylGeo(.15, .15, .14, 20), portM); port.rotation.z = Math.PI / 2;
    const py = (h + .1) / 2;
    port.position.set(sx * (w / 2 + .14), py, -.03); tilt.add(port);
    // floor halo + contact shadow
    const haloM = new THREE.MeshBasicMaterial({map: softTex, color: ACC_BRIGHT.clone(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending});
    // aura: a soft additive glow card behind the plate (shows as a glowing edge); rim: a crisp outline
    const halo = new THREE.Mesh(haloGeo, haloM); halo.scale.set(w + 1.3, h + 1.1, 1); halo.position.set(0, (h + .1) / 2, -.26); halo.renderOrder = 3; tilt.add(halo);
    const rimM = new THREE.MeshBasicMaterial({color: ACC_BRIGHT.clone(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false});
    const rim = new THREE.Mesh(kit.bevel(w + .5, h + .5, .08, .14), rimM); rim.position.set(0, (h + .1) / 2 - .04, -.14); rim.visible = false; tilt.add(rim);
    const blob = look.makeBlob(w * 1.08, .9, .4); blob.position.set(0, .09, -.25); g.add(blob);
    g.visible = false; g.scale.setScalar(.01);
    // port in world space (unlifted): the front of the socket, where a connector plugs in
    const PZ = .1;
    const portWorld = new THREE.Vector3(x + sx * (w / 2 + .16), BASE_Y + py * COSP + PZ * SINP, z - py * SINP + PZ * COSP);
    return {id, side, k, i, g, tilt, bodyM, labelMat, label, badge, portM, haloM, rimM, rim, x, z, w, h, portWorld,
      bodyBase: side === 'L' ? LEFT_BODY : RIGHT_BODY, bg, age: 0, appear: 0, sel: 0, settle: 0, fx: null, num: 0, mv: null, squash: 0};
  }

  // The level's prop (ctx.props, level.prop) as a small mascot on a glowing puck, in the room the camera leaves spare
  // around the board, so it never covers a label or costs the plates any size. Once the camera target for the board is
  // known, decoSpot picks a spot that is fully in frame (behind the far row, else beside the near rows) or none.
  function levelProp() {
    if (!props || !props.make || !level || !level.prop) return null;
    let body;
    try { body = props.make(level.prop, {accent: ACC}); } catch (e) { return null; }
    if (!body) return null;
    const g = new THREE.Group(); g.name = 'match-prop'; g.visible = false;
    const spin = new THREE.Group(); g.add(spin); spin.add(body);
    tmpBox.setFromObject(body); tmpBox.getSize(tmpV);
    return {g, spin, body, dims: tmpV.clone(), minY: tmpBox.min.y, hop: 0, base: 0, placed: false};
  }
  const SIDE_SIZE = 1, BACK_SIZE = .85, PLINTH = .66;
  // Is the world point inside the camera's target frame? view = engine.view {tx, ty, tz, dist, pitch, fov, aspect}
  // (yaw 0). k < 1 keeps a border for the idle drift and the bob.
  function inFrame(view, x, y, z, k = .96) {
    const p = view.pitch * Math.PI / 180, fy = -Math.sin(p), fz = -Math.cos(p), uy = Math.cos(p), uz = -Math.sin(p);
    const cx = view.tx, cy = view.ty - fy * view.dist, cz = view.tz - fz * view.dist;
    const dx = x - cx, dy = y - cy, dz = z - cz, depth = dy * fy + dz * fz;
    if (!(depth > .1)) return false;
    const t = Math.tan(view.fov * Math.PI / 360);
    return Math.abs(dx / depth) <= t * (view.aspect || 1) * k && Math.abs((dy * uy + dz * uz) / depth) <= t * k;
  }
  // Where the prop goes, against the board's camera frame: 'back' (on a plinth behind the far row, over the cable
  // channel: there is room above the board), 'side' (on the floor left of the near rows: room at the sides) or null.
  function decoSpot(L, box, view) {
    if (!view || !(view.dist > 0) || !(view.fov > 0)) return null;
    const bx = (L.gapL + L.gapR) / 2, bz = (box.back ?? box.z0) - .3, top = PLINTH + BACK_SIZE * .95 + .1, h = BACK_SIZE / 2;
    if (inFrame(view, bx - h, top, bz - h) && inFrame(view, bx + h, top, bz - h)) return 'back';
    const sx = box.x0 - .3 - SIDE_SIZE / 2, sz = L.zOf(Math.max(0, L.n - 2)), s = SIDE_SIZE / 2;
    if (inFrame(view, sx - s, 0, sz + s) && inFrame(view, sx - s, SIDE_SIZE + .1, sz - s) && inFrame(view, sx - s, 0, sz - s)) return 'side';
    return null;
  }
  function placeDeco(board, spot) {
    const d = board.deco, L = board.L, box = board.box;
    d.placed = true;
    if (!spot) return;
    const side = spot === 'side', size = side ? SIDE_SIZE : BACK_SIZE, plinth = side ? 0 : PLINTH;
    const sc = Math.min(size / Math.max(.05, d.dims.x, d.dims.z), (size * .95) / Math.max(.05, d.dims.y));
    d.body.scale.setScalar(sc); d.body.position.y = .05 - d.minY * sc;
    d.base = plinth; d.spin.position.y = plinth;
    if (plinth) d.g.add(kit.box(size * .7, plinth, size * .7, pedMat, 0, 0, 0, .08));
    const puck = new THREE.Mesh(kit.cylGeo(size * .55, size * .6, .05, 28), edgeMat); puck.position.y = plinth + .025; d.g.add(puck);
    if (side) d.g.position.set(box.x0 - .3 - size / 2, 0, L.zOf(Math.max(0, L.n - 2)));
    else d.g.position.set((L.gapL + L.gapR) / 2, 0, (box.back ?? box.z0) - .3);
    d.g.visible = true;
  }
  function stepDeco(d, dt) {
    if (!d) return;
    const rm = reduced();
    if (d.hop > 0) d.hop = Math.max(0, d.hop - dt / .6);
    const h = rm ? 0 : Math.sin((1 - d.hop) * Math.PI) * (d.hop > 0 ? .35 : 0);
    d.spin.position.y = d.base + h + (rm ? 0 : Math.sin(time * 1.7) * .025);
    d.spin.rotation.y = rm ? -.35 : -.35 + Math.sin(time * .6) * .35 + (d.hop > 0 ? (1 - d.hop) * Math.PI * 2 : 0);
    const sq = rm || d.hop <= 0 ? 0 : Math.sin((1 - d.hop) * Math.PI * 2) * .08;
    d.spin.scale.set(1 + sq, 1 - sq, 1 + sq);
  }

  function buildRound(s, r, delay) {
    const rd = s.rounds[r], n = rd.pairs.length;
    lastPlan = time; planAspect = aspectNow();
    const longWord = Math.max(0, ...rd.pairs.flatMap((p) => String(p.left).split(/\s+/).map((w) => w.length)));
    const L = boardLayout(n, aspectNow(), longWord), SINP = L.sinT, COSP = L.cosT;
    const g = new THREE.Group(); g.name = 'round-' + r; root.add(g);
    // board slab, cable channel and the glowing accent edge
    const H0 = L.hOf(0);
    const z0 = L.zOf(0) - (H0 + .2) * SINP - .4, z1 = L.zOf(n - 1) + .42;
    const bw = L.total + .7, bd = z1 - z0, bz = (z0 + z1) / 2;
    g.add(kit.box(bw, .09, bd, boardMat, 0, 0, bz, .08));
    g.add(kit.box(L.GAP - .06, .02, bd - .3, channelMat, (L.gapL + L.gapR) / 2, .09, bz, .01));
    const e = .07;
    [[bw + e, e, 0, z1 + e / 2 - .01], [bw + e, e, 0, z0 - e / 2 + .01]].forEach(([w, d, x, z]) => g.add(kit.box(w, .1, d, edgeMat, x, 0, z, .02)));
    [[-1], [1]].forEach(([sx]) => g.add(kit.box(e, .1, bd, edgeMat, sx * (bw / 2 + e / 2 - .01), 0, bz, .02)));
    const nodes = new Map();
    rd.leftOrder.forEach((k, i) => { const p = plate(L, 'L', k, i, rd.pairs[k].left, r); p.appear = delay + i * .06; nodes.set(p.id, p); g.add(p.g); });
    rd.rightOrder.forEach((k, i) => { const p = plate(L, 'R', k, i, rd.pairs[k].right, r); p.appear = delay + .12 + i * .06; nodes.set(p.id, p); g.add(p.g); });
    // camera box: the plates (and the lift of a selected one), not the whole slab. Its front is the front edge of the
    // near row's foot, so the frame ends at the board instead of showing floor in front of it.
    const board = {g, nodes, round: r, L, cables: [], stub: null, deco: null,
      box: {x0: -L.total / 2 - .12, x1: L.total / 2 + .12, z0: L.zOf(0) - (H0 + .2) * SINP, z1: L.zOf(n - 1) + .12, y0: 0, y1: BASE_Y + (H0 + .18) * COSP + (L.wide ? .12 : .2)}};
    board.backZ = board.box.z0;
    board.deco = levelProp();
    if (board.deco) g.add(board.deco.g);
    // pairs already connected (a view created mid-round): draw their cables at once
    rd.matched.forEach((m, k) => {
      if (!m) return;
      const a = nodes.get(lid(r, k)), b = nodes.get(rid(r, k));
      if (a && b) board.cables.push(cable(board, a, b, rd.revealed[k] ? 'reveal' : 'connect', 0, true));
    });
    return board;
  }

  function retire(board, delay) {
    if (board.stub) dropStub(board);
    const list = [...board.nodes.values()];
    leaving.push({board, t: -delay, update(dt) {
      this.t += dt;
      if (this.t < 0) return false;
      const rm = reduced(), dur = rm ? .35 : .55;
      list.forEach((p, i) => {
        const k = Math.min(1, Math.max(0, (this.t - (rm ? 0 : i * .025)) / dur));
        if (rm) { p.g.visible = k < 1; return; }
        const e = k * k;
        p.g.position.y = p.settle - e * 1.2;
        p.g.scale.setScalar(Math.max(.01, 1 - e * .7));
      });
      board.cables.forEach((c) => { c.mesh.visible = this.t < dur * .5 || !rm && this.t < dur; if (!rm) c.mesh.position.y = -this.t * this.t * 3; });
      if (!rm) board.g.position.y = -Math.max(0, this.t - dur * .6) * 1.5;
      return this.t >= dur + (rm ? 0 : .4);
    }});
  }

  // ---------- cables ----------
  // A connector runs from socket front to socket front and bows toward the camera (along the plates' face normal), so it
  // lies over the cable channel in plain view instead of behind the plates.
  function curveFor(board, a, b) {
    const p0 = a.portWorld, p1 = b.portWorld, L = board.L;
    const bow = .16 + Math.min(.22, Math.abs(p1.z - p0.z) * .05);
    const ny = L.sinT * bow, nz = L.cosT * bow;
    const at = (t, out) => out.set(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, p0.z + (p1.z - p0.z) * t);
    const q1 = at(.25, new THREE.Vector3()), q2 = at(.5, new THREE.Vector3()), q3 = at(.75, new THREE.Vector3());
    q1.y += ny * .75; q1.z += nz * .75; q2.y += ny; q2.z += nz; q3.y += ny * .75; q3.z += nz * .75;
    return new THREE.CatmullRomCurve3([p0.clone(), q1, q2, q3, p1.clone()], false, 'centripetal');
  }
  const SEG = 48, RAD = 8, CABLE_R = .1;
  const SNAP_T = .2;               // right pair: seconds from the pick to the snap (anticipation, then the slide in)
  const DRAW_T = .15;              // right pair: seconds to draw the connector in
  // mode: 'connect' (accent, stays), 'reveal' (amber, stays), 'wrong' (red, reaches, sparks, held, then falls away)
  function cable(board, a, b, mode, delay = 0, instant = false) {
    const curve = curveFor(board, a, b);
    const geo = new THREE.TubeGeometry(curve, SEG, mode === 'wrong' ? .07 : CABLE_R, RAD, false);
    const total = geo.index.count, perSeg = RAD * 6;
    const col = mode === 'wrong' ? RED : mode === 'reveal' ? AMBER : ACC_BRIGHT;
    const mat = kit.own({color: col.clone().multiplyScalar(.7), emissive: col.clone(), emissiveIntensity: 1.4, roughness: .35, metalness: 0, transparent: mode === 'wrong', opacity: 1});
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.castShadow = true;
    board.g.add(mesh);
    const plug = new THREE.Mesh(plugGeo, plugMat); plug.visible = false; board.g.add(plug);
    const c = {mesh, mat, geo, curve, mode, col, plug, total, perSeg, t: -delay, grow: instant ? 1 : 0, reach: mode === 'wrong' ? .93 : 1,
      peaked: instant, pulse: 0, falling: -1, a, b, onPeak: null};
    if (instant) { geo.setDrawRange(0, total); mat.emissiveIntensity = baseCableGlow(c); }
    else geo.setDrawRange(0, 0);
    return c;
  }
  function baseCableGlow(c) { return (c.mode === 'connect' ? 1.25 : .8) * (.7 + glow() * .5); }
  function stepCable(c, dt) {
    c.t += dt;
    if (c.t < 0) return true;
    const rm = reduced();
    if (c.grow < c.reach) {
      c.grow = rm ? c.reach : Math.min(c.reach, c.grow + dt / (c.mode === 'wrong' ? .3 : c.mode === 'connect' ? DRAW_T : .24));
      const segs = Math.max(1, Math.ceil(SEG * c.grow));
      c.geo.setDrawRange(0, Math.min(c.total, segs * c.perSeg));
      if (!rm && c.grow < c.reach) { c.curve.getPointAt(Math.min(1, c.grow), tmpV); c.plug.position.copy(tmpV); c.plug.visible = true; }
      else c.plug.visible = false;
      c.mat.emissiveIntensity = 2.6;
    } else if (!c.peaked) {
      c.peaked = true; c.plug.visible = false;
      if (c.onPeak) c.onPeak();
    }
    if (c.peaked) {
      if (c.mode === 'wrong' && c.falling < 0) c.mat.emissiveIntensity = rm ? 1.6 : 1.2 + Math.abs(Math.sin(time * 23)) * 1.6;
      else if (c.falling < 0) {
        c.pulse = Math.max(0, c.pulse - dt * 2.2);
        const settle = Math.max(0, c.mat.emissiveIntensity - dt * 6);
        c.mat.emissiveIntensity = Math.max(baseCableGlow(c) + c.pulse * 2.4, Math.min(settle, 2.6));
      }
    }
    if (c.falling >= 0) {
      c.falling += dt;
      const k = Math.min(1, c.falling / (rm ? .25 : .55));
      if (!rm) { c.mesh.position.y = -k * k * 1.4; c.mesh.position.z = k * .3; }
      c.mat.opacity = 1 - k;
      if (k >= 1) return false;
    }
    return true;
  }
  function removeCable(board, c) {
    const i = board.cables.indexOf(c); if (i >= 0) board.cables.splice(i, 1);
    board.g.remove(c.mesh); board.g.remove(c.plug);
    c.geo.dispose(); c.mat.dispose(); kit.tracked.delete(c.mat);
  }
  // the short live cable that hangs from a selected plate
  function makeStub(board, a) {
    dropStub(board);
    const p0 = a.portWorld, gx = board.L.gapL + .2;
    const curve = new THREE.CatmullRomCurve3([p0.clone(), new THREE.Vector3(gx, p0.y + .05, p0.z + .05), new THREE.Vector3(gx + .16, p0.y + .32, p0.z + .3), new THREE.Vector3(gx + .3, p0.y + .52, p0.z + .42)], false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, 16, .075, RAD, false);
    const mat = kit.own({color: ACC.clone(), emissive: ACC_BRIGHT.clone(), emissiveIntensity: 2, roughness: .35, metalness: 0});
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    const holder = new THREE.Group(); holder.add(mesh);
    const plug = new THREE.Mesh(plugGeo, plugGlowMat); curve.getPointAt(1, plug.position); plug.scale.setScalar(1.7); holder.add(plug);
    stubGlow.position.copy(plug.position); holder.add(stubGlow);
    board.g.add(holder);
    board.stub = {holder, geo, mat, node: a, t: 0};
  }
  function dropStub(board) {
    const s = board.stub; if (!s) return;
    s.holder.remove(stubGlow);
    board.g.remove(s.holder); s.geo.dispose(); s.mat.dispose(); kit.tracked.delete(s.mat);
    board.stub = null;
  }

  // ---------- effects ----------
  function emit(pos, color, count, speed = 2.2, up = 2.4) {
    if (reduced()) return;
    for (let n = 0; n < count; n++) {
      const i = pNext; pNext = (pNext + 1) % PN;
      const a = Math.random() * Math.PI * 2, s = speed * (.4 + Math.random() * .8);
      pPos[i * 3] = pos.x; pPos[i * 3 + 1] = pos.y; pPos[i * 3 + 2] = pos.z;
      pVel[i * 3] = Math.cos(a) * s; pVel[i * 3 + 1] = up * (.5 + Math.random()); pVel[i * 3 + 2] = Math.sin(a) * s * .7;
      pCol[i * 3] = color.r; pCol[i * 3 + 1] = color.g; pCol[i * 3 + 2] = color.b;
      pMax[i] = pLife[i] = .55 + Math.random() * .45;
    }
    pAlive = PN;
    pGeo.attributes.color.needsUpdate = true;
  }
  function stepParticles(dt) {
    if (!pAlive) return;
    let alive = 0;
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) { pPos[i * 3 + 1] = -50; continue; }
      alive++;
      pVel[i * 3 + 1] -= 7.5 * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      const f = pLife[i] / pMax[i];
      if (f < .35) { const k = f / .35; pCol[i * 3] *= .9 + .1 * k; pCol[i * 3 + 1] *= .9 + .1 * k; pCol[i * 3 + 2] *= .9 + .1 * k; }
    }
    pAlive = alive;
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }
  function ring(pos, color, grow = 1.6, life = .7) {
    const r = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
    r.m.material.color.copy(color); r.m.position.set(pos.x, .13, pos.z); r.m.rotation.x = -Math.PI / 2;
    r.t = 0; r.life = reduced() ? .9 : life; r.grow = grow; r.m.visible = true; r.m.scale.setScalar(1);
  }
  function stepRings(dt) {
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.t += dt; const k = Math.min(1, r.t / r.life);
      if (!reduced()) r.m.scale.setScalar(1 + k * r.grow);
      r.m.material.opacity = .9 * (1 - k);
      if (k >= 1) r.m.visible = false;
    }
  }
  function mark(kind, pos, size = .8) {
    const m = marks[kind]; m.base.copy(pos); m.t = 0; m.life = reduced() ? 1.3 : 1.1; m.size = size;
    m.s.position.copy(pos); m.s.visible = true; m.s.scale.setScalar(.01);
  }
  function stepMarks(dt) {
    for (const kind in marks) {
      const m = marks[kind]; if (!m.s.visible) continue;
      m.t += dt; const k = Math.min(1, m.t / m.life), rm = reduced();
      const pop = rm ? 1 : Math.min(1, k * 6) * (1 + .18 * Math.sin(Math.min(1, k * 6) * Math.PI));
      m.s.scale.setScalar(m.size * Math.max(.01, pop));
      if (!rm) m.s.position.y = m.base.y + k * .3;
      m.s.material.opacity = k > .75 ? 1 - (k - .75) / .25 : 1;
      if (k >= 1) m.s.visible = false;
    }
  }
  function flash(node, color, delay = 0, strength = 1, life = 1.1) {
    if (node) node.fx = {color: color.clone(), t: -delay, life: reduced() ? Math.max(1.2, life) : life, strength};
  }
  function centreOf(node) { return tmpV.set(node.x, BASE_Y + .5, node.z - .25); }
  // marks float over the cable channel next to the plate, so they never cover its text
  function markPos(node) { return tmpV.set((cur.L.gapL + cur.L.gapR) / 2, node.portWorld.y + .75, node.portWorld.z); }

  // ---------- camera ----------
  // Normalised screen position of a world point for a target view (x, y in -1..1 at the frame edges; yaw 0).
  function projectN(view, x, y, z, out) {
    const p = view.pitch * Math.PI / 180, fy = -Math.sin(p), fz = -Math.cos(p), uy = Math.cos(p), uz = -Math.sin(p);
    const cx = view.tx, cy = view.ty - fy * view.dist, cz = view.tz - fz * view.dist;
    const dx = x - cx, dy = y - cy, dz = z - cz, depth = Math.max(.05, dy * fy + dz * fz), t = Math.tan(view.fov * Math.PI / 360);
    out.x = dx / depth / (t * (view.aspect || 1)); out.y = (dy * uy + dz * uz) / depth / t;
    return out;
  }
  // A tall canvas binds on width and leaves spare height. Centred, that spare shows as bare floor in front of the
  // board. Measured against the solved view, this returns how far to reach the camera box back so most of the spare
  // goes behind the board instead (the room and the level prop) and the board sits at the bottom, next to the sheet.
  const PJ = {x: 0, y: 0};
  function backReach(b, view, margin) {
    if (!view || !(view.dist > 0) || !(view.fov > 0)) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) {
      projectN(view, x, y, z, PJ); lo = Math.min(lo, PJ.y); hi = Math.max(hi, PJ.y);
    }
    const spare = 2 * (1 - 2 * margin) - (hi - lo);
    if (!(spare > .06)) return 0;
    const v0 = projectN(view, 0, b.y1, b.z0, PJ).y, v1 = projectN(view, 0, b.y1, b.z0 - .5, PJ).y;
    const per = (v1 - v0) / .5;
    return per > .01 ? Math.min(3, spare * .7 / per) : 0;
  }
  function updateFocus(force = false, ease = null) {
    if (!cur || !engine.setFocus) return;
    const b = cur.box, key = [b.x0, b.x1, b.z0, b.z1, b.y1].map((v) => v.toFixed(2)).join('|');
    if (!force && key === focusKey) return;
    const first = !focusKey;
    const opts = {pitch: cur.L.pitch, yaw: 0, margin: cur.L.wide ? .025 : .035, ease: ease !== null ? ease : first ? 0 : .6};
    engine.setFocus(b, opts);
    if (!cur.L.wide) {
      const ext = backReach(b, engine.view, opts.margin);
      if (ext > .05) engine.setFocus({...b, z0: Math.max(-6.4, b.z0 - ext)}, opts);
    }
    focusSize = sizeKey();
    // place the level prop in the spare room of this target frame (it never changes the frame)
    if (cur.deco && !cur.deco.placed) placeDeco(cur, decoSpot(cur.L, {...b, back: cur.backZ}, engine.view));
    focusKey = [b.x0, b.x1, b.z0, b.z1, b.y1].map((v) => v.toFixed(2)).join('|');
  }

  // ---------- sync / events ----------
  function numberPlates() {
    if (!cur || !state) return;
    const rd = state.rounds[cur.round];
    if (!rd) return;
    const live = state.round === cur.round && !pendingSwitch && !holdForResume;
    const picking = state.sel === null;
    let n = 0;
    const order = picking ? rd.leftOrder : rd.rightOrder;
    for (const p of cur.nodes.values()) { p.num = 0; p.g.userData.choiceId = null; }
    if (!live) return;
    for (const k of order) {
      if (rd.matched[k]) continue;
      const p = cur.nodes.get(picking ? lid(cur.round, k) : rid(cur.round, k));
      if (p) { p.num = ++n; p.g.userData.choiceId = p.id; p.badge.setText(String(n)); }
    }
    if (!picking) { const a = cur.nodes.get(lid(cur.round, state.sel)); if (a) a.g.userData.choiceId = BACK_ID; } // tap the lifted plate to put it down
  }
  function sync(s) {
    state = s;
    const r = s.round < s.rounds.length ? s.round : -1;
    if (shownRound === -2) {
      shownRound = r;
      if (r >= 0) { cur = buildRound(s, r, 0); updateFocus(); }
    } else if (r !== shownRound && !pendingSwitch) {
      pendingSwitch = {at: time + (reduced() ? .6 : .85)};
    }
    if (cur && state.round === cur.round) {
      const sel = state.sel !== null ? cur.nodes.get(lid(cur.round, state.sel)) : null;
      if (sel && (!cur.stub || cur.stub.node !== sel)) makeStub(cur, sel);
      else if (!sel && cur.stub) dropStub(cur);
    } else if (cur && cur.stub) dropStub(cur);
    numberPlates();
  }
  function switchBoard() {
    const r = state.round < state.rounds.length ? state.round : -1;
    pendingSwitch = null;
    if (cur) retire(cur, 0);
    cur = null; shownRound = r;
    if (r >= 0) { cur = buildRound(state, r, reduced() ? .1 : .45); updateFocus(); }
    numberPlates();
  }
  function event(ev) {
    if (ev.type === 'resume') {
      holdForResume = false;
      if (wrongHold && cur) {
        const c = wrongHold.cable;
        if (c && c.falling < 0) c.falling = 0;
        wrongHold = null;
      }
      if (pendingSwitch) pendingSwitch.at = Math.max(pendingSwitch.at, time + (reduced() ? .5 : .75));
      numberPlates();
      return;
    }
    if (ev.type === 'round' || ev.type === 'done') {
      if (cur) cur.cables.forEach((c, i) => { c.pulse = 1 + i * .001; });
      if (cur && cur.deco) cur.deco.hop = 1;
      if (cur && !reduced()) cur.cables.forEach((c) => emit(c.curve.getPointAt(.5, tmpV), c.col, 4, 1.2, 1.6));
      return;
    }
    if (!cur) return;
    const L = ev.leftId && cur.nodes.get(ev.leftId), R = ev.rightId && cur.nodes.get(ev.rightId);
    const streak = ev.streak || 0, big = streak >= 3;
    if (ev.type === 'step') {
      if (L && !ev.cleared) { ring(centreOf(L), ACC_BRIGHT, 1.1, .5); emit(L.portWorld, ACC_BRIGHT, 8, 1.1, 1.6); }
    } else if (ev.type === 'right' && L && R) {
      // The reward beat: the meaning plate gathers itself (anticipation), slides toward its term, and at the snap both
      // plates squash, turn green and an accent burst (bigger with the streak) flies from the joint while the glowing
      // connector draws in between the sockets. Reduced motion: the colour change and the connector only.
      const rm = reduced(), heat = Math.min(5, Math.max(0, streak - 1));
      const c = cable(cur, L, R, 'connect', rm ? 0 : SNAP_T);
      if (!rm) {
        const reach = .2 * (1 + heat * .08);
        R.mv = {t: 0, dir: Math.sign(L.x - R.x) || -1, reach, dz: (L.z - R.z) * .22, snapped: false, onSnap: () => {
          const joint = tmpV.copy(L.portWorld).add(R.portWorld).multiplyScalar(.5);
          emit(joint, ACC_BRIGHT, 14 + heat * 6, 1.8 + heat * .25, 2.2 + heat * .15);
          emit(joint, GREEN, 6 + heat * 3, 1.4, 2.6);
          ring(centreOf(R), ACC_BRIGHT, 1.3 + heat * .2, .6); if (big) ring(centreOf(L), GREEN, 1.5);
          flash(L, GREEN, 0, 1); flash(R, GREEN, 0, 1);
          if (big && cur && cur.deco && !cur.deco.hop) cur.deco.hop = 1;
        }};
        L.mv = {t: 0, dir: Math.sign(R.x - L.x) || 1, reach: reach * .4, dz: (R.z - L.z) * .08, snapped: false, onSnap: null};
      } else { flash(L, GREEN, 0, 1); flash(R, GREEN, 0, 1); }
      c.onPeak = () => {
        c.pulse = big ? 1 : .6;
        mark('right', markPos(R), big ? .95 : .78);
      };
      cur.cables.push(c);
    } else if (ev.type === 'wrong' && L && R) {
      holdForResume = true;
      const c = cable(cur, L, R, 'wrong');
      const good = cur.nodes.get(ev.correctId);
      c.onPeak = () => {
        emit(R.portWorld, RED, 20, 2.4, 2.6); emit(R.portWorld, AMBER, 8, 1.6, 2);
        ring(centreOf(R), RED, 1.3);
        flash(R, RED, 0, 1, 1.6); flash(L, RED, 0, .7, 1.6);
        R.squash = -1;
        mark('wrong', markPos(R), .75);
        engine.shake(.8);
      };
      cur.cables.push(c);
      wrongHold = {cable: c, leftId: L.id, rightId: R.id, correctId: ev.correctId, good};
    } else if (ev.type === 'timeout') {
      holdForResume = true;
      engine.shake(.6);
      (ev.reveal || []).forEach((p, i) => {
        const a = cur.nodes.get(p.leftId), b = cur.nodes.get(p.rightId);
        if (a && b) { cur.cables.push(cable(cur, a, b, 'reveal', .2 + i * .22)); flash(a, AMBER, .2 + i * .22, .8); flash(b, AMBER, .2 + i * .22, .8); }
      });
    }
    numberPlates();
  }

  // ---------- frame ----------
  // Right-pair motion of one plate (p.mv): offsets toward its partner and a squash / stretch, written into MO (no
  // allocation). d is the displacement toward the partner: a small pull back (anticipation), a quick slide in to the
  // snap at SNAP_T, then a damped spring back to rest; the squash peaks at the snap.
  const MO = {ox: 0, oz: 0, sx: 1, sy: 1};
  function stepMotion(p, dt) {
    MO.ox = 0; MO.oz = 0; MO.sx = 1; MO.sy = 1;
    const m = p.mv;
    if (!m) return MO;
    if (reduced()) { p.mv = null; return MO; }
    m.t += dt;
    const t = m.t, A = .07;
    let d, sq = 0, st = 0;
    if (t < A) { const e = Math.sin(t / A * Math.PI / 2); d = -.25 * e; sq = .1 * e; }
    else if (t < SNAP_T) { const k = (t - A) / (SNAP_T - A), e = k * k; d = -.25 + 1.25 * e; sq = .1 * (1 - k); st = .09 * k; }
    else {
      if (!m.snapped) { m.snapped = true; if (m.onSnap) m.onSnap(); }
      const u = t - SNAP_T;
      d = Math.exp(-u * 9) * Math.cos(u * 15);
      sq = .17 * Math.exp(-u * 7) * Math.cos(u * 30);
      if (u > .8) p.mv = null;
    }
    MO.ox = m.dir * m.reach * d; MO.oz = m.dz * Math.max(0, d);
    MO.sy = 1 - sq + st * -.35; MO.sx = 1 + sq * .7 + st;
    return MO;
  }
  function plateLook(p, dt) {
    const rd = state.rounds[cur.round];
    const live = state.round === cur.round;
    // a right pair keeps its unmatched look until the snap
    const matched = !!rd.matched[p.k] && !(p.mv && !p.mv.snapped);
    const revealed = !!rd.revealed[p.k];
    const rm = reduced();
    const selected = live && p.side === 'L' && state.sel === p.k;
    const heldL = wrongHold && wrongHold.leftId === p.id;
    const heldR = wrongHold && wrongHold.rightId === p.id;
    const hintGood = wrongHold && wrongHold.correctId === p.id;
    const picking = live && state.sel === null && !holdForResume;
    const open = live && !holdForResume && !matched && (picking ? p.side === 'L' : p.side === 'R' && state.sel !== null);
    const dimmed = live && !holdForResume && state.sel !== null && p.side === 'L' && !selected && !matched;
    // lift / settle
    const sv = selected ? 1 : 0;
    p.sel += (sv - p.sel) * Math.min(1, dt * 12);
    const bob = rm || !selected ? 0 : Math.sin(time * 3.6) * .035;
    const target = (matched ? -.02 : 0) + p.sel * LIFT + bob;
    p.settle += (target - p.settle) * Math.min(1, dt * (rm ? 30 : 13));
    let sq = 0;
    if (p.squash && !rm) { p.squash *= Math.pow(.02, dt); if (Math.abs(p.squash) < .01) p.squash = 0; sq = p.squash; }
    const mo = stepMotion(p, dt);
    p.g.position.x = p.x + mo.ox;
    p.g.position.y = p.settle;
    p.g.position.z = p.z + p.sel * .22 + mo.oz;
    const grow = 1 + p.sel * .05;
    // squash and stretch: the right-pair snap (mo), or the jolt of a wrong pick (a quick wobble)
    const wob = sq ? Math.sin(time * 26) * sq * .07 : 0;
    p.tilt.scale.set((grow + wob) * mo.sx, (grow - wob) * mo.sy, grow);
    // body colour and emissive
    p.bodyM.color.copy(matched ? (revealed ? AMBER : GREEN) : p.bodyBase);
    tmpC.copy(BLACK);
    const gl = glow();
    if (selected) tmpC.copy(ACC_BRIGHT).multiplyScalar(.85 + (rm ? 0 : .2 * Math.sin(time * 5)));
    else if (heldR || heldL) tmpC.copy(RED).multiplyScalar(.6);
    else if (hintGood) tmpC.copy(GREEN).multiplyScalar(.5 + (rm ? 0 : .3 * Math.sin(time * 6)));
    else if (open && !picking) tmpC.copy(ACC_BRIGHT).multiplyScalar((.1 + (rm ? .05 : .08 * (1 + Math.sin(time * 3.4 - p.i * .7)))) * (.6 + gl * .5));
    else if (matched) tmpC.copy(revealed ? AMBER : GREEN).multiplyScalar(.18 * gl);
    if (p.fx && p.fx.t >= 0) {
      const f = p.fx, k = Math.min(1, f.t / f.life), a = (rm ? (k < .6 ? 1 : 1 - (k - .6) / .4) : 1 - k) * f.strength;
      tmpC.lerp(f.color, Math.min(1, a * .9));
    }
    p.bodyM.emissive.copy(tmpC);
    // label tint
    const tint = matched ? (revealed ? TINT_AMBER : TINT_MATCH) : (heldR ? TINT_RED : dimmed ? TINT_DIM : WHITE);
    p.labelMat.color.lerp(tint, Math.min(1, dt * 10));
    // port
    if (matched) { p.portM.emissive.copy(revealed ? AMBER : ACC_BRIGHT); p.portM.emissiveIntensity = 1.2 + gl * .4; }
    else if (selected) { p.portM.emissive.copy(ACC_BRIGHT); p.portM.emissiveIntensity = 2 + (rm ? 0 : Math.sin(time * 7)); }
    else if (heldR) { p.portM.emissive.copy(RED); p.portM.emissiveIntensity = 2; }
    else if (open && !picking) { p.portM.emissive.copy(ACC_BRIGHT); p.portM.emissiveIntensity = .5 + gl * .4; }
    else { p.portM.emissive.setRGB(0, 0, 0); }
    // floor halo
    let hv = 0, hc = ACC_BRIGHT;
    if (selected) hv = .75 + (rm ? 0 : .15 * Math.sin(time * 5));
    else if (hintGood) { hv = .6 + (rm ? 0 : .2 * Math.sin(time * 6)); hc = GREEN; }
    else if (heldR) { hv = .55; hc = RED; }
    else if (open && !picking) hv = .18 + (rm ? 0 : .08 * Math.sin(time * 3.4 - p.i * .7));
    else if (p.fx && p.fx.t >= 0) { hv = .6 * (1 - Math.min(1, p.fx.t / p.fx.life)); hc = p.fx.color; }
    p.haloM.opacity += (hv * (.55 + gl * .45) - p.haloM.opacity) * Math.min(1, dt * 10);
    p.haloM.color.copy(hc);
    const rv = selected ? .95 : (heldR ? .9 : hintGood ? .55 + (rm ? 0 : .35 * Math.sin(time * 6)) : 0);
    p.rimM.opacity += (rv - p.rimM.opacity) * Math.min(1, dt * 14);
    p.rimM.color.copy(selected ? ACC_BRIGHT : heldR ? RED : hintGood ? GREEN : p.rimM.color);
    p.rim.visible = p.rimM.opacity > .02;
    // number badge
    p.badge.visible = p.num > 0 && !selected;
  }
  function update(dt) {
    if (!(dt > 0)) dt = 1 / 60;
    time += dt;
    const sz = engine.size;
    if (sz && sz.h >= 120 && sz.h < minH) minH = sz.h;
    // A new board (next round) is planned for the shortest canvas seen so far. Until the first pair of the current
    // board is connected, re-plan it too when the canvas has settled to a different shape: the sheet appears after the
    // build, and on short phones the canvas shrinks again when the first term is picked (the longer meaning buttons
    // are listed). The rebuilt plates appear at once and a picked term stays lifted, so the swap reads as a re-frame.
    if (cur && state && state.round === cur.round && !pendingSwitch && !holdForResume && !cur.cables.length &&
        time - lastPlan > .4 && aspectNow() !== planAspect && !state.rounds[cur.round].matched.some(Boolean) &&
        ((L2) => Math.abs(L2.H - cur.L.H) >= .1 || L2.wide !== cur.L.wide)(boardLayout(cur.L.n, (planAspect = aspectNow()), cur.L.longWord))) {
      const old = cur;
      if (old.stub) dropStub(old);
      root.remove(old.g); kit.disposeTree(old.g);
      cur = buildRound(state, old.round, 0);
      for (const p of cur.nodes.values()) {
        const o = old.nodes.get(p.id);
        p.age = p.appear + 1; p.g.visible = true; p.g.scale.setScalar(1);
        if (o) { p.sel = o.sel; p.settle = o.settle; p.fx = o.fx; }
      }
      if (old.deco && cur.deco) cur.deco.hop = old.deco.hop;
      const sel = state.sel !== null ? cur.nodes.get(lid(cur.round, state.sel)) : null;
      if (sel) makeStub(cur, sel);
      updateFocus();
      numberPlates();
    }
    if (pendingSwitch && !holdForResume && time >= pendingSwitch.at) switchBoard();
    // the canvas changed size: measure the spare room again (the engine has already re-solved the plain box)
    else if (cur && focusSize && sizeKey() !== focusSize && !(cur.L.wide)) updateFocus(true, 0);
    const gl = glow();
    edgeMat.emissiveIntensity = (.5 + gl * .9) * (reduced() ? 1 : .9 + .1 * Math.sin(time * 1.6));
    if (cur && state) {
      for (const p of cur.nodes.values()) {
        p.age += dt;
        const a = p.age - p.appear;
        if (a < 0) { p.g.visible = false; continue; }
        p.g.visible = true;
        if (reduced()) p.g.scale.setScalar(1);
        else { const sc = Math.min(1, a / .32); p.g.scale.setScalar(Math.max(.01, sc < 1 ? sc * (1.15 - .15 * sc) + Math.sin(sc * Math.PI) * .06 : 1)); }
        if (p.fx) { p.fx.t += dt; if (p.fx.t >= p.fx.life) p.fx = null; }
        plateLook(p, dt);
      }
      for (let i = cur.cables.length - 1; i >= 0; i--) { const c = cur.cables[i]; if (!stepCable(c, dt)) removeCable(cur, c); }
      stepDeco(cur.deco, dt);
      if (cur.stub) {
        const s = cur.stub, n = s.node;
        s.holder.position.set(0, n.settle, n.g.position.z - n.z);
        s.mat.emissiveIntensity = 1.6 + (reduced() ? 0 : .8 * Math.sin(time * 6));
      }
    }
    for (let i = leaving.length - 1; i >= 0; i--) {
      const l = leaving[i];
      l.board.cables.forEach((c) => stepCable(c, dt));
      if (l.update(dt)) { root.remove(l.board.g); kit.disposeTree(l.board.g); leaving.splice(i, 1); }
    }
    stepParticles(dt); stepRings(dt); stepMarks(dt);
  }
  function dispose() {
    engine.scene.remove(root);
    if (cur && cur.stub) dropStub(cur);
    leaving.forEach((l) => kit.disposeTree(l.board.g)); leaving.length = 0;
    kit.disposeTree(root);
    edgeMat.dispose(); kit.tracked.delete(edgeMat); plugGlowMat.dispose(); kit.tracked.delete(plugGlowMat);
    for (const k in marks) marks[k].s.material.dispose();
    stubGlow.material.dispose();
    rings.forEach((r) => r.m.material.dispose());
    pGeo.dispose(); pMat.dispose();
    ownGeos.forEach((g) => g.dispose());
    softTex.dispose(); dotTex.dispose(); markTex.right.dispose(); markTex.wrong.dispose();
    cur = null;
  }
  root.userData.layout = () => (cur ? {H: cur.L.H, wide: cur.L.wide, n: cur.L.n} : null);
  // Debug helper for tools: on-screen text height (CSS px) of every plate's label.
  root.userData.labelPx = () => {
    if (!cur) return [];
    const out = [];
    for (const p of cur.nodes.values()) { p.label.getWorldPosition(tmpV); out.push({id: p.id, side: p.side, lines: p.label.lines, px: +(p.label.fontSize * engine.pxPerUnit(tmpV)).toFixed(1)}); }
    return out;
  };
  return {sync, event, update, dispose, get nodes() { return cur ? cur.nodes : new Map(); }};
}

export default {id: 'match', label: 'Connect', howTo, rules, createView};
