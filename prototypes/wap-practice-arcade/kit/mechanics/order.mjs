// Mechanic 'order' (label "Order"): put the steps of a process in order.
// Each round shows 4-6 scrambled step tiles. The player picks the step that comes next; a right pick snaps the tile
// into a numbered rail, a wrong pick costs a heart (the step does not move). When only one step is left it is placed
// automatically, so every decision is a real choice between at least two steps.
//
// Level payload: rounds: [{prompt, steps: [..] listed in the CORRECT order, why}] (2-3 rounds).
// rules are PURE (no DOM, no three) and deterministic for a given seed; state is plain JSON.
// Events add optional fields beyond the contract, used by the 3D view:
//   right:   {id, slot}                         the step id that was placed and its rail slot (0-based)
//   wrong:   {choice, correct}                  picked step id, the step id that should have come next
//   timeout: {id, slot, correct}                the correct step was placed for the player
//   round:   {round, auto, slot}                a round was completed; auto is a step id placed automatically (or null)

export const SECONDS_PER_STEP = 12;

function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// A shuffle that is never already in the correct order.
function scramble(ids, rnd) {
  let out = shuffle(ids, rnd);
  for (let k = 0; k < 8 && out.every((id, i) => id === ids[i]); k++) out = shuffle(ids, rnd);
  if (out.every((id, i) => id === ids[i]) && out.length > 1) out = out.slice(1).concat(out[0]);
  return out;
}

const roundTime = (steps) => SECONDS_PER_STEP * steps;
const textOf = (round, id) => (round.steps.find((s) => s.id === id) || {text: String(id)}).text;
const nextId = (s) => { const r = s.rounds[s.r]; return r ? r.steps[s.placed.length].id : null; };

// After a placement: auto-place a lone last step, and roll over to the next round when this one is full.
function settle(s, events) {
  const round = s.rounds[s.r];
  let remaining = round.order.filter((id) => !s.placed.includes(id));
  let auto = null;
  if (remaining.length === 1) { auto = remaining[0]; s.placed = s.placed.concat(auto); remaining = []; }
  if (remaining.length === 0) {
    events.push({type: 'round', round: s.r, auto, slot: auto ? s.placed.length - 1 : null});
    s.r += 1; s.placed = [];
    if (s.r >= s.rounds.length) { s.left = 0; s.total = 0; events.push({type: 'done'}); }
    else { s.total = roundTime(s.rounds[s.r].steps.length); s.left = s.total; }
  }
  return s;
}

export const rules = {
  init(level, {seed = 1, timed = false} = {}) {
    const rnd = rng(seed);
    const rounds = level.rounds.map((r, ri) => {
      const steps = r.steps.map((text, i) => ({id: `r${ri}s${i}`, text}));
      return {prompt: r.prompt, why: r.why, steps, order: scramble(steps.map((x) => x.id), rnd)};
    });
    const total = roundTime(rounds[0].steps.length);
    return {mechanic: 'order', timed: !!timed, rounds, r: 0, placed: [], left: total, total};
  },
  view(state) {
    const round = state.rounds[state.r];
    // One numbering per place: with several rounds the top bar counts rounds ("2 of 3", one sequence each) and the
    // card kicker counts steps inside the round ("Step 3 of 4"). A single-round level counts steps in both, so the
    // two always agree. Never a total across rounds, which the player cannot match to anything on screen.
    const multi = state.rounds.length > 1;
    const total = multi ? state.rounds.length : (state.rounds[0] ? state.rounds[0].steps.length : 0);
    if (!round) return {card: null, prompt: '', choices: [], progress: {done: total, total}, timer: null};
    const n = state.placed.length, m = round.steps.length;
    // The kicker carries the step; the one card line (hidden by the compact sheet) recalls the last step placed.
    const kicker = `Step ${n + 1} of ${m}`;
    const lines = n > 0 ? [`Last placed: ${textOf(round, state.placed[n - 1])}`] : [];
    return {
      card: {kicker, title: round.prompt, lines},
      prompt: n === 0 ? 'Which step comes first?' : 'Which step comes next?',
      choices: round.order.filter((id) => !state.placed.includes(id)).map((id) => ({id, label: textOf(round, id), done: false})),
      progress: multi ? {done: state.r, total} : {done: n, total},
      timer: state.timed ? {left: Math.max(0, state.left), total: state.total} : null
    };
  },
  act(state, choiceId) {
    const round = state.rounds[state.r];
    if (!round || state.placed.includes(choiceId) || !round.steps.some((x) => x.id === choiceId)) return {state, events: []};
    const want = nextId(state);
    const events = [];
    if (choiceId !== want) {
      const n = state.placed.length;
      events.push({
        type: 'wrong', correctLabel: textOf(round, want), why: round.why,
        review: {title: `Step ${n + 1} of ${round.steps.length}: ${round.prompt}`, correct: textOf(round, want)},
        choice: choiceId, correct: want
      });
      return {state, events};
    }
    const s = {...state, placed: state.placed.concat(choiceId)};
    events.push({type: 'right', why: round.why, id: choiceId, slot: s.placed.length - 1});
    settle(s, events);
    return {state: s, events};
  },
  tick(state, dt) {
    const round = state.rounds[state.r];
    if (!state.timed || !round || !(dt > 0)) return {state, events: []};
    const left = state.left - dt;
    if (left > 0) return {state: {...state, left}, events: []};
    const want = nextId(state), n = state.placed.length;
    const events = [{
      type: 'timeout', correctLabel: textOf(round, want), why: round.why,
      review: {title: `Step ${n + 1} of ${round.steps.length}: ${round.prompt}`, correct: textOf(round, want)},
      id: want, slot: n, correct: want
    }];
    const s = {...state, placed: state.placed.concat(want)};
    settle(s, events);
    if (s.r === state.r) { const remaining = round.steps.length - s.placed.length; s.total = roundTime(Math.max(2, remaining)); s.left = s.total; }
    return {state: s, events};
  },
  hint(state) { return nextId(state); },
  done(state) { return state.r >= state.rounds.length; }
};

function howTo() {
  return [
    'The steps are scrambled. Work out which one happens first.',
    'Tap the step that comes next, on a tile or on a button.',
    'Right picks snap into the numbered rail. A wrong pick costs a heart.'
  ];
}

// ---------------------------------------------------------------------------------------------
// 3D view. ctx = {THREE, engine, look, world, theme, level, props, reduced, accent}
//
// Two small bleachers stand side by side on the stage, built so every row sits at the same distance from the camera
// (each row is higher and further back by rise / depth = 1 / tan(pitch)), and every tile leans back to face the camera:
// all text is the same size on screen, whatever row it is on.
//   left:  the RAIL. Numbered slots, 1 at the top, filled in order. A placed slot ticks its number badge and lights its
//          edge strip; nothing is ever drawn over a tile's text.
//   right: the PILE. The steps still to place, in the same order as the buttons, gathered at the bottom rows.
// A right pick lifts the tile, flies it across toward the camera and snaps it into the next slot (squash, flash,
// particles, a ring; more with the streak). A wrong pick shakes and reddens the tile and shows the right one in green,
// and holds that until the shell sends {type: 'resume'}. A full rail lights up slot by slot, then clears for the next
// round. Under reduced motion: no flight, shake, particles, bob or camera glide; colours change instead.
export const LAYOUT = Object.freeze({PITCH: 38, TW: 2.85, TH: .9, TD: .16, GAP: .22, STEP_H: .14, Z_FRONT: 1.05, RISE: .84});

export function layoutFor(n, L = LAYOUT) {
  const p = L.PITCH * Math.PI / 180, sinP = Math.sin(p), cosP = Math.cos(p);
  const D = L.RISE * Math.tan(p);                     // row depth so that every row is the same view distance away
  const shift = .28;
  const railX = -(L.GAP / 2 + L.TW / 2) + shift, pileX = (L.GAP / 2 + L.TW / 2) + shift, badgeX = railX - L.TW / 2 - .28;
  const rowY = (k) => (n - 1 - k) * L.RISE, rowZ = (k) => L.Z_FRONT - (n - 1 - k) * D;
  const top = (k) => rowY(k) + L.STEP_H;
  // centre of a tile (body) leaning back on row k, its bottom edge just behind the front lip of the step
  const tileAt = (x, k) => {
    const zEdge = rowZ(k) + D / 2 - .05, h = L.TH / 2 + .04;
    return {x, y: top(k) + h * cosP + L.TD / 2 * sinP, z: zEdge - h * sinP + L.TD / 2 * cosP};
  };
  const box = {
    x0: badgeX - .3, x1: pileX + L.TW / 2 + .08,
    z0: rowZ(0) - D / 2 - .05, z1: L.Z_FRONT + D / 2 + .05,
    y0: 0, y1: top(0) + (L.TH + .1) * cosP + .05
  };
  return {n, p, sinP, cosP, D, railX, pileX, badgeX, rowY, rowZ, top, tileAt, box};
}

function createView(ctx) {
  const {THREE, engine, look, theme} = ctx;
  const kit = engine.kit;
  const reduced = () => !!(ctx.reduced || engine.reduced);
  const acc = ctx.accent || engine.accent || look.accentSet(theme.accent || '#ad2c4d');
  const mood = engine.mood || look.moodOf(theme.mood);
  const glowK = typeof mood.glow === 'number' ? mood.glow : .45;
  const moodId = mood.id || 'day';
  const L = LAYOUT, P = L.PITCH, P_RAD = P * Math.PI / 180;
  const root = new THREE.Group(); root.name = 'order-view'; engine.scene.add(root);

  // ---------- colours (allocated once) ----------
  const C = {
    green: new THREE.Color(0x3fbf5a), red: new THREE.Color(0xe0414b), amber: new THREE.Color(0xf0a830),
    black: new THREE.Color(0), white: new THREE.Color(0xffffff), tint: new THREE.Color(0xffb8b8), hintTint: new THREE.Color(0xc8f5c8)
  };
  const STAIR = {day: [0x3e4b69, 0x5a6681], dusk: [0x3a3358, 0x4b4469], night: [0x202c52, 0x2a3862]}[moodId] || [0x3e4b69, 0x5a6681];
  const tmpC = new THREE.Color();

  // ---------- view-lifetime resources (disposed in dispose()) ----------
  const ownTex = [], ownMat = [];
  const keepTex = (t) => { t.userData.cached = true; ownTex.push(t); return t; };
  const keepMat = (m) => { m.userData.cached = true; ownMat.push(m); return m; };
  const STAIR_GLOW = {dusk: 0x140f2a, night: 0x0f1a3c}[moodId] || 0x000000;
  const railMat = keepMat(new THREE.MeshStandardMaterial({color: STAIR[0], emissive: STAIR_GLOW, roughness: .62, metalness: .05}));
  const pileMat = keepMat(new THREE.MeshStandardMaterial({color: STAIR[1], emissive: STAIR_GLOW, roughness: .66, metalness: .04}));
  const pileStripMat = keepMat(new THREE.MeshStandardMaterial({color: acc.dark, emissive: acc.bright, emissiveIntensity: .35 * glowK + .1, roughness: .5}));
  const ghostTex = keepTex(look.canvasTexture(512, 160, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 26); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 7; g.setLineDash([26, 18]);
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 24); g.stroke();
  }, {aniso: 4}));
  const ghostMat = keepMat(new THREE.MeshBasicMaterial({map: ghostTex, color: acc.soft, transparent: true, opacity: moodId === 'day' ? .5 : .35, depthWrite: false, toneMapped: false, fog: false}));
  const ghostNextMat = keepMat(new THREE.MeshBasicMaterial({map: ghostTex, color: 0xffffff, transparent: true, opacity: .8, depthWrite: false, toneMapped: false, fog: false}));
  const dotTex = keepTex(look.canvasTexture(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.55, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, {aniso: 1}));
  const ghostGeo = kit.geo(`o-ghost|${L.TW}|${L.TH}`, () => new THREE.PlaneGeometry(L.TW + .1, L.TH + .1));
  const badgeGeo = kit.geo('o-badge-face', () => new THREE.CircleGeometry(.235, 40));
  // the snap pulse: a rounded outline the shape of a tile, expanding and fading
  const outlineTex = keepTex(look.canvasTexture(512, 192, (g, w, h) => {
    g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 34); g.stroke();
  }, {aniso: 4}));
  const ringGeo = kit.geo(`o-outline|${L.TW}|${L.TH}`, () => new THREE.PlaneGeometry(L.TW + .3, (L.TW + .3) * 192 / 512));

  // Number badge textures, made on demand: state x number.
  const badgeTex = new Map();
  const BADGE_FILL = {empty: '#262d3d', next: acc.hex, done: '#2f9e48', given: '#d88b16', miss: '#d33842'};
  function badgeTexture(n, st) {
    const key = st + n;
    let t = badgeTex.get(key);
    if (t) return t;
    t = keepTex(look.canvasTexture(256, 256, (g, w) => {
      const c = w / 2;
      g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(c, c, 124, 0, Math.PI * 2); g.fill();
      g.fillStyle = BADGE_FILL[st] || BADGE_FILL.empty; g.beginPath(); g.arc(c, c, 112, 0, Math.PI * 2); g.fill();
      if (st === 'empty') { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 8; g.setLineDash([18, 14]); g.beginPath(); g.arc(c, c, 92, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
      g.fillStyle = st === 'empty' ? 'rgba(255,255,255,.75)' : '#ffffff';
      const done = st === 'done' || st === 'given';
      g.font = `800 ${done ? 112 : 132}px system-ui, "Segoe UI", Roboto, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), done ? c - 22 : c, done ? c - 4 : c + 8);
      if (done) { // the tick sits on the badge, below and right of the number, never on the tile
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(178, 176, 52, 0, Math.PI * 2); g.fill();
        g.strokeStyle = BADGE_FILL[st]; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(152, 178); g.lineTo(171, 197); g.lineTo(204, 158); g.stroke();
      }
    }, {aniso: 4}));
    badgeTex.set(key, t);
    return t;
  }

  // ---------- particles: one pooled Points object ----------
  const PCAP = 220;
  const pPos = new Float32Array(PCAP * 3), pCol = new Float32Array(PCAP * 3), pVel = new Float32Array(PCAP * 3), pLife = new Float32Array(PCAP), pAge = new Float32Array(PCAP);
  for (let i = 0; i < PCAP; i++) pPos[i * 3 + 1] = -99;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = keepMat(new THREE.PointsMaterial({size: .16, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false}));
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 5; root.add(points);
  let pNext = 0, pAlive = 0;
  function spawn(x, y, z, vx, vy, vz, col, life) {
    const i = pNext; pNext = (pNext + 1) % PCAP;
    if (pLife[i] <= 0) pAlive++;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pCol[i * 3] = col.r; pCol[i * 3 + 1] = col.g; pCol[i * 3 + 2] = col.b;
    pLife[i] = life; pAge[i] = 0;
  }
  function burst(x, y, z, col, count, power = 1) {
    if (reduced()) return;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * .4, s = (1.2 + Math.random() * 1.4) * power;
      const c = k % 3 === 0 ? C.white : k % 3 === 1 ? col : acc.bright;
      spawn(x + Math.cos(a) * .4, y, z + .1, Math.cos(a) * s, 1.6 + Math.random() * 2.2 * power, Math.sin(a) * s * .5 + .6, c, .7 + Math.random() * .35);
    }
  }
  function confetti(x0, x1, y, z, count) {
    if (reduced()) return;
    const cols = [acc.bright, C.green, C.amber, C.white, acc.soft];
    for (let k = 0; k < count; k++) {
      const x = x0 + Math.random() * (x1 - x0);
      const s = 3.4 + Math.random() * 2.6; // up along the tile plane, so it stays behind the tiles
      spawn(x, y + Math.random() * .3, z, (Math.random() - .5) * 2.4, s * Math.cos(P_RAD), -s * Math.sin(P_RAD), cols[k % cols.length], 1.2 + Math.random() * .5);
    }
  }
  function stepParticles(dt) {
    if (!pAlive) return;
    for (let i = 0; i < PCAP; i++) {
      if (pLife[i] <= 0) continue;
      pAge[i] += dt;
      if (pAge[i] >= pLife[i]) { pLife[i] = 0; pPos[i * 3 + 1] = -99; pAlive--; continue; }
      pVel[i * 3 + 1] -= 6.5 * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      const fade = 1 - pAge[i] / pLife[i];
      if (fade < .3) { const k = fade / .3; pCol[i * 3] *= .9 + .1 * k; pCol[i * 3 + 1] *= .9 + .1 * k; pCol[i * 3 + 2] *= .9 + .1 * k; }
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- rings: a small pool of expanding outlines that face the camera ----------
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const m = keepMat(new THREE.MeshBasicMaterial({map: outlineTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false}));
    const mesh = new THREE.Mesh(ringGeo, m); mesh.visible = false; mesh.rotation.x = -P_RAD; mesh.renderOrder = 4; root.add(mesh);
    rings.push({mesh, t: 1, life: .5, grow: 1});
  }
  let ringNext = 0;
  function ring(x, y, z, col, grow = 1) {
    if (reduced()) return;
    const r = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
    const bk = L.TD / 2 + .03; // behind the tile: the pulse shows only around it, never over text
    r.mesh.position.set(x, y - Math.sin(P_RAD) * bk, z - Math.cos(P_RAD) * bk); r.mesh.material.color.copy(col); r.t = 0; r.grow = grow; r.mesh.visible = true;
  }
  function stepRings(dt) {
    for (const r of rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / r.life);
      const e = 1 - Math.pow(1 - r.t, 3), s = 1 + e * .28 * r.grow;
      r.mesh.scale.set(s, 1 + (s - 1) * 1.6, 1);
      r.mesh.material.opacity = .9 * (1 - r.t);
      if (r.t >= 1) r.mesh.visible = false;
    }
  }

  // ---------- round state ----------
  let state = null, shownRound = -1, lay = null, roundGroup = null, time = 0, firstFocus = true;
  let slots = [];                 // {k, badge, badgeMat, puckMat, strip, stripMat, ghost, filled, given, st, pop, flash}
  const tiles = new Map();        // id -> tile
  let pileOrder = [];             // ids still in the pile, in button order
  let seq = null;                 // round-end sequence {phase, t, n, done}
  let hold = null;                // {kind: 'wrong'|'given', id, correct, slot}
  let streak = 0;

  function makeStair(n, x0, x1, mat) {
    const key = `o-stair|${n}|${(x1 - x0).toFixed(3)}`;
    const geo = kit.geo(key, () => {
      const sh = new THREE.Shape();
      // side profile in (u = -z, v = y); extruded along x
      const zBack = lay.rowZ(0) - lay.D / 2, zFront = lay.rowZ(n - 1) + lay.D / 2;
      sh.moveTo(-zBack, 0); sh.lineTo(-zBack, lay.top(0));
      for (let k = 0; k < n; k++) {
        const zf = lay.rowZ(k) + lay.D / 2;
        sh.lineTo(-zf, lay.top(k));
        if (k < n - 1) sh.lineTo(-zf, lay.top(k + 1));
      }
      sh.lineTo(-zFront, 0); sh.lineTo(-zBack, 0);
      const w = x1 - x0;
      const g = new THREE.ExtrudeGeometry(sh, {depth: w - .08, bevelEnabled: true, bevelThickness: .04, bevelSize: .035, bevelSegments: 2, curveSegments: 1, steps: 1});
      g.rotateY(Math.PI / 2); g.translate(-(w - .08) / 2, 0, 0); g.computeVertexNormals();
      return g;
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = (x0 + x1) / 2; mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  function makeLabel(text, maxFont, minFont = Math.min(maxFont, .15)) {
    return kit.label(text, {w: L.TW, h: L.TH, maxLines: 3, depth: 0, accent: acc.hex, bg: '#fffaf1', fg: '#141c29', align: 'left', maxFont, minFont: Math.min(maxFont, minFont), res: 380});
  }
  // One text size for the whole round: the largest size at which every step fits whole (up to 3 lines). kit.label
  // prefers fewer lines and will take a one-line fit at ~82% of the best size, so probe with min = max to find the
  // true largest size, then give every tile that size as its floor (short steps may still go up to 15% bigger).
  function roundFont(texts) {
    const fitsAt = (x) => texts.every((tx) => { const p = makeLabel(tx, x, x); const ok = p.fontSize >= x * .97; p.dispose(); return ok; });
    let lo = .3;
    for (const tx of texts) { const p = makeLabel(tx, .3); lo = Math.min(lo, p.fontSize); p.dispose(); }
    let hi = Math.min(.3, lo / .8);
    if (fitsAt(hi)) return hi;
    for (let i = 0; i < 5; i++) { const mid = (lo + hi) / 2; if (fitsAt(mid)) lo = mid; else hi = mid; }
    return lo;
  }
  // Frame the bleachers. On a canvas taller than they need, add headroom above them so they sit lower and closer to
  // the sheet (the shell's toast floats over the top of the canvas), instead of leaving empty floor at the bottom.
  let framedAspect = 0;
  function frame(ease) {
    if (!lay || !engine.setFocus) return;
    const sz = engine.size || {w: 1, h: 1};
    framedAspect = sz.w / Math.max(1, sz.h);
    const b = lay.box, opts = {pitch: P, yaw: 0, margin: .03, ease};
    // Headroom = the box reaches further back (far points project higher but no wider, so width stays the same).
    const withHead = (h) => ({...b, z0: b.z0 - h});
    // engine.view reports the solved target without moving the camera (a running glide restarts from where it is),
    // so probe the solver for the most headroom that does not make the bleachers smaller.
    // How far back the camera sits along its view axis (dist alone moves with the box centre).
    const back = () => { const v = engine.view; return (v.ty + lay.sinP * v.dist) * lay.sinP + (v.tz + lay.cosP * v.dist) * lay.cosP; };
    const view = engine.view;
    if (view && typeof view.dist === 'number') {
      engine.setFocus(b, opts);
      const d0 = back();
      let lo = 0, hi = 5;
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; engine.setFocus(withHead(mid), opts); if (back() <= d0 + .01) lo = mid; else hi = mid; }
      engine.setFocus(withHead(lo * .85), opts);
    } else engine.setFocus(b, opts);
  }
  function buildRound(r, placedCount) {
    const round = state.rounds[r], n = round.steps.length;
    shownRound = r; lay = layoutFor(n);
    roundGroup = new THREE.Group(); roundGroup.name = 'order-round'; root.add(roundGroup);
    // rail and pile bleachers
    const railX0 = lay.badgeX - .36, railX1 = lay.railX + L.TW / 2 + .08;
    const pileX0 = lay.pileX - L.TW / 2 - .08, pileX1 = lay.pileX + L.TW / 2 + .08;
    roundGroup.add(makeStair(n, railX0, railX1, railMat), makeStair(n, pileX0, pileX1, pileMat));
    const depth = lay.rowZ(n - 1) - lay.rowZ(0) + lay.D;
    for (const [a, b] of [[railX0, railX1], [pileX0, pileX1]]) {
      const blob = look.makeBlob((b - a) * 1.12, depth * 1.15, .45); blob.position.set((a + b) / 2, .012, (lay.rowZ(0) + lay.rowZ(n - 1)) / 2 + .1); roundGroup.add(blob);
    }
    // the pile's accent edge along its front (one shared material)
    {
      const s = kit.box(pileX1 - pileX0 - .1, .06, .06, pileStripMat, (pileX0 + pileX1) / 2, 0, lay.rowZ(n - 1) + lay.D / 2 + .04, .02);
      s.castShadow = false; roundGroup.add(s);
    }
    // rail slots: a backplate (its rim around a placed tile is the slot edge that lights up), a dashed ghost while
    // empty, and a number badge
    slots = [];
    const nY = lay.sinP, nZ = lay.cosP; // tile normal
    for (let k = 0; k < n; k++) {
      const tp = lay.tileAt(lay.railX, k);
      const stripMat = kit.own({color: STAIR[0], emissive: acc.bright.clone(), emissiveIntensity: .1, roughness: .45});
      const strip = new THREE.Mesh(kit.bevel(L.TW + .34, L.TH + .2, .05, .05), stripMat);
      const back = L.TD / 2 + .035;
      strip.position.set(tp.x, tp.y - nY * back, tp.z - nZ * back); strip.rotation.x = -P_RAD; strip.receiveShadow = true;
      roundGroup.add(strip);
      const ghost = new THREE.Mesh(ghostGeo, ghostMat);
      ghost.position.set(tp.x, tp.y - nY * (back - .03), tp.z - nZ * (back - .03)); ghost.rotation.x = -P_RAD; ghost.renderOrder = 1;
      roundGroup.add(ghost);
      // badge: a chunky puck facing the camera, with the number (and later the tick) on its face
      const bp = lay.tileAt(lay.badgeX, k);
      const badge = new THREE.Group(); badge.position.set(bp.x, bp.y - .12, bp.z + .02); badge.rotation.x = -P_RAD;
      const puckMat = kit.own({color: acc.dark, emissive: acc.bright.clone(), emissiveIntensity: 0, roughness: .4, metalness: .1});
      const puck = new THREE.Mesh(kit.cylGeo(.27, .27, .12, 28), puckMat); puck.rotation.x = Math.PI / 2; puck.castShadow = true;
      const badgeMat = kit.basic({map: badgeTexture(k + 1, 'empty'), transparent: true, toneMapped: false, fog: false});
      const face = new THREE.Mesh(badgeGeo, badgeMat); face.position.z = .065; face.renderOrder = 3;
      badge.add(puck, face); roundGroup.add(badge);
      slots.push({k, badge, badgeMat, puckMat, strip, stripMat, ghost, filled: false, given: false, st: 'empty', pop: 1, flash: 0, flashCol: new THREE.Color()});
    }
    // tiles: the pile holds the steps in button order
    tiles.clear();
    pileOrder = round.order.slice();
    // One text size for the whole round (a tile may go a little bigger, never smaller than the longest step needs).
    const fmin = roundFont(round.steps.map((st) => st.text));
    const maxFont = Math.min(.3, fmin * 1.15), minFont = fmin * .98;
    round.order.forEach((id, idx) => {
      const step = round.steps.find((x) => x.id === id);
      const g = new THREE.Group(); g.name = 'order-tile'; g.userData.choiceId = id;
      const inner = new THREE.Group(); inner.rotation.x = -P_RAD; g.add(inner);
      const bodyM = kit.own({color: acc.base.clone(), emissive: new THREE.Color(0), emissiveIntensity: 1, roughness: .48, metalness: .04});
      const body = kit.box(L.TW + .1, L.TH + .1, L.TD, bodyM, 0, -(L.TH + .1) / 2, 0, .06);
      inner.add(body);
      const label = makeLabel(step.text, maxFont, minFont);
      label.position.z = L.TD / 2 + .006; inner.add(label);
      roundGroup.add(g);
      const t = {
        id, idx, text: step.text, g, inner, body, bodyM, label, labelMat: label.children[0].material,
        mode: 'pile', pos: new THREE.Vector3(), home: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
        t: 0, dur: .5, slot: -1, age: -idx * .07 - .12, phase: idx * 1.7, jx: ((idx * 37) % 7 - 3) * .025, rz: ((idx * 29) % 9 - 4) * .006,
        wob: 0, sq: 0, sqT: 9, flash: 0, flashCol: new THREE.Color(), good: true, lift: 0
      };
      tiles.set(id, t);
    });
    // already placed (the view was made mid-round, or a fast pick ended the celebration early)
    const placed = state.r === r ? state.placed.slice(0, placedCount) : [];
    placed.forEach((id, i) => { const t = tiles.get(id); if (t) placeNow(t, i, false); });
    layoutPile(true);
    if (reduced()) for (const t of tiles.values()) t.age = 1;
    frame(firstFocus ? 0 : .7);
    firstFocus = false;
  }
  function clearRound() {
    if (roundGroup) { root.remove(roundGroup); kit.disposeTree(roundGroup); roundGroup = null; }
    tiles.clear(); slots = []; pileOrder = []; seq = null; hold = null;
  }
  // Remaining pile tiles take the bottom rows, in button order (nearest the next slot and biggest on a tall phone).
  function layoutPile(snap = false) {
    const n = lay.n, m = pileOrder.length;
    pileOrder.forEach((id, j) => {
      const t = tiles.get(id); if (!t) return;
      const p = lay.tileAt(lay.pileX + t.jx, n - m + j);
      t.home.set(p.x, p.y, p.z);
      if (snap) t.pos.copy(t.home);
    });
  }
  function slotPos(i, out) { const p = lay.tileAt(lay.railX, i); return out.set(p.x, p.y, p.z); }
  function setBadge(sl, st) { if (sl.st === st) return; sl.st = st; sl.badgeMat.map = badgeTexture(sl.k + 1, st); sl.badgeMat.needsUpdate = true; }
  function placeNow(t, slot, given) {
    t.mode = 'placed'; t.slot = slot; delete t.g.userData.choiceId;
    slotPos(slot, t.pos); t.sq = 0; t.lift = 0;
    const sl = slots[slot]; if (sl) { sl.filled = true; sl.given = !!given; sl.ghost.visible = false; setBadge(sl, given ? 'given' : 'done'); }
    pileOrder = pileOrder.filter((x) => x !== t.id);
  }

  // ---------- moves ----------
  function fly(id, slot, good, delay = 0) {
    const t = tiles.get(id);
    if (!t || t.mode !== 'pile' || !slots[slot]) return;
    delete t.g.userData.choiceId;
    pileOrder = pileOrder.filter((x) => x !== id); layoutPile();
    t.slot = slot; t.good = good;
    if (reduced()) { land(t); return; }
    t.mode = 'antic'; t.t = -delay; t.from.copy(t.pos); slotPos(slot, t.to);
  }
  function land(t) {
    t.mode = 'placed'; t.pos.copy(slotPos(t.slot, t.to)); t.lift = 0;
    const sl = slots[t.slot];
    const s = Math.max(1, Math.min(streak, 8));
    if (sl) {
      sl.filled = true; sl.given = !t.good; sl.ghost.visible = false;
      setBadge(sl, t.good ? 'done' : 'given');
      sl.pop = 0; sl.flash = 1; sl.flashCol.copy(t.good ? C.green : C.amber);
    }
    t.flash = 1; t.flashCol.copy(t.good ? C.green : C.amber);
    if (!reduced()) {
      t.sq = .16 + .015 * s; t.sqT = 0;
      const col = t.good ? C.green : C.amber;
      burst(t.pos.x, t.pos.y, t.pos.z, col, 14 + 5 * s, 1 + .06 * s);
      ring(t.pos.x, t.pos.y, t.pos.z, t.good ? acc.bright : C.amber, 1 + .12 * s);
      if (s >= 3) ring(t.pos.x, t.pos.y, t.pos.z, C.white, .6 + .1 * s);
    }
  }
  function wrong(ev) {
    const t = tiles.get(ev.choice), c = tiles.get(ev.correct), sl = slots[state && state.r === shownRound ? state.placed.length : -1];
    hold = {kind: 'wrong', id: ev.choice, correct: ev.correct, slot: sl ? sl.k : -1};
    if (t) {
      t.flash = 1; t.flashCol.copy(C.red);
      if (!reduced()) { t.wob = 1; burst(t.pos.x, t.pos.y + .2, t.pos.z, C.red, 10, .6); }
    }
    if (c) { c.flash = 1; c.flashCol.copy(C.green); }
    if (sl) { setBadge(sl, 'miss'); sl.flash = 1; sl.flashCol.copy(C.red); }
    engine.shake && engine.shake(.7);
  }
  function resume() {
    if (!hold) return;
    const sl = slots[hold.slot];
    if (hold.kind === 'wrong' && sl && !sl.filled) setBadge(sl, 'empty');
    hold = null;
  }
  // Round end: let flights land, light the rail slot by slot, then clear and build the next round.
  function startSeq(n) { seq = {phase: 'land', t: 0, n, waved: false}; }
  function endSeqNow() {
    seq = null;
    if (state && state.r < state.rounds.length && state.r !== shownRound) { clearRound(); buildRound(state.r, state.placed.length); }
  }
  function stepSeq(dt) {
    if (!seq) return;
    seq.t += dt;
    const red = reduced();
    if (seq.phase === 'land') {
      let flying = false; for (const t of tiles.values()) if (t.mode === 'antic' || t.mode === 'fly') flying = true;
      if (!flying && seq.t > .12) { seq.phase = 'wave'; seq.t = 0; }
      return;
    }
    if (seq.phase === 'wave') {
      if (!seq.waved) {
        seq.waved = true;
        slots.forEach((sl, i) => { sl.waveAt = red ? 0 : i * .06; });
        const mid = lay.tileAt(lay.railX, Math.floor((seq.n - 1) / 2));
        // from behind the rail: the confetti rises over the top and through the gaps, but never over a tile's text
        confetti(lay.badgeX, lay.railX + L.TW / 2 + .3, mid.y - lay.sinP * .5, mid.z - lay.cosP * .5, 60);
      }
      for (const sl of slots) if (sl.waveAt !== undefined && seq.t >= sl.waveAt) {
        sl.waveAt = undefined; sl.flash = 1; sl.flashCol.copy(C.green); sl.pop = 0;
        const t = [...tiles.values()].find((x) => x.slot === sl.k && x.mode === 'placed');
        if (t) { t.flash = .8; t.flashCol.copy(C.green); if (!red) t.hop = 0; }
      }
      const waveDur = red ? .7 : .3 + seq.n * .06;
      if (seq.t >= waveDur) {
        if (!state || state.r >= state.rounds.length) { seq = null; return; } // last round: the rail stays lit for the results
        seq.phase = 'exit'; seq.t = 0;
        for (const t of tiles.values()) { t.mode = 'exit'; t.t = -t.slot * .04; t.from.copy(t.pos); }
      }
      return;
    }
    if (seq.phase === 'exit' && seq.t >= (red ? 0 : .42)) endSeqNow();
  }

  // ---------- view contract ----------
  function sync(s) {
    state = s;
    if (!s || s.r >= s.rounds.length) return;
    if (shownRound === -1) { buildRound(s.r, s.placed.length); return; }
    if (s.r !== shownRound) { if (!seq) endSeqNow(); return; }
    if (seq) return;
    // reconcile: anything placed that the view has not shown yet
    for (let i = 0; i < s.placed.length; i++) {
      const sl = slots[i], t = tiles.get(s.placed[i]);
      if (sl && !sl.filled && t && t.mode === 'pile') { placeNow(t, i, false); layoutPile(); }
    }
  }
  function event(ev) {
    if (!state || !ev) return;
    // A pick for the next round while the old rail is still celebrating: finish the celebration first.
    const ref = ev.type === 'right' || ev.type === 'timeout' ? ev.id : ev.type === 'wrong' ? ev.choice : null;
    if (ref && seq && !tiles.has(ref)) endSeqNow();
    if (ev.type === 'right') { streak = ev.streak || streak + 1; fly(ev.id, ev.slot, true); }
    else if (ev.type === 'wrong') { streak = 0; wrong(ev); }
    else if (ev.type === 'timeout') {
      streak = 0;
      hold = {kind: 'given', id: ev.id, slot: ev.slot};
      fly(ev.id, ev.slot, false);
      engine.shake && engine.shake(.5);
    } else if (ev.type === 'round') {
      if (ev.auto) fly(ev.auto, ev.slot, true, .12);
      startSeq(slots.length);
    } else if (ev.type === 'resume') resume();
  }

  const tmpV = new THREE.Vector3();
  function update(dt) {
    if (!(dt > 0)) return;
    time += dt;
    const red = reduced();
    stepSeq(dt);
    if (lay && engine.size) { const a = engine.size.w / Math.max(1, engine.size.h); if (Math.abs(a - framedAspect) > .02) frame(.45); }
    const nextSlot = state && state.r === shownRound && !seq ? state.placed.length : -1;
    // ---- tiles ----
    for (const t of tiles.values()) {
      let sx = 1, sy = 1, rz = t.rz, ox = 0, oy = 0, oz = 0, scale = 1;
      if (t.age < 1) { t.age = Math.min(1, t.age + dt / .38); const a = Math.max(0, t.age); scale = a <= 0 ? .001 : a * (1.18 - .18 * a) + .001 * (1 - a); }
      if (t.mode === 'pile') {
        const k = red ? 1 : 1 - Math.exp(-dt * 11);
        t.pos.lerp(t.home, k);
        if (!red) oy += Math.sin(time * 1.7 + t.phase) * .022;
        if (hold && hold.kind === 'wrong' && hold.id === t.id) { oy -= .07; oz += .03; rz += red ? 0 : -.07; }
        if (hold && hold.kind === 'wrong' && hold.correct === t.id) { oz += red ? .12 : .14 + .05 * Math.sin(time * 5); }
      } else if (t.mode === 'antic') {
        t.t += dt;
        const a = Math.max(0, Math.min(1, t.t / .09));
        sy = 1 - .12 * a; sx = 1 + .07 * a; oy -= .03 * a;
        if (t.t >= .09) { t.mode = 'fly'; t.t = 0; t.dur = .42; t.from.copy(t.pos); }
      } else if (t.mode === 'fly') {
        t.t += dt;
        const k = Math.min(1, t.t / t.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, arc = Math.sin(Math.PI * k);
        t.pos.lerpVectors(t.from, t.to, e);
        oy += arc * .85; oz += arc * .9;                      // up and toward the player
        scale *= 1 + arc * .12; sx = 1 - arc * .05; sy = 1 + arc * .08;
        rz = t.rz * (1 - e) + arc * .06;
        if (k >= 1) land(t);
      } else if (t.mode === 'placed') {
        rz = 0;
        if (t.sq > 0) { t.sqT += dt; const s = t.sq * Math.exp(-t.sqT * 8) * Math.cos(t.sqT * 24); sx = 1 + s * .7; sy = 1 - s; if (t.sqT > .7) t.sq = 0; }
        if (t.hop !== undefined) { t.hop += dt; const h = Math.min(1, t.hop / .32); oy += Math.sin(Math.PI * h) * .14; if (h >= 1) t.hop = undefined; }
      } else if (t.mode === 'exit') {
        t.t += dt;
        const k = Math.max(0, Math.min(1, t.t / .38)), e = k * k;
        oy += e * 1.2; oz += e * .4; scale *= Math.max(.001, 1 - e);
      }
      if (t.wob > 0) { t.wob = Math.max(0, t.wob - dt * 1.7); rz += Math.sin(t.wob * 30) * .13 * t.wob; ox += Math.sin(t.wob * 41) * .06 * t.wob; }
      t.g.position.set(t.pos.x + ox, t.pos.y + oy, t.pos.z + oz);
      t.g.rotation.z = rz;
      t.g.scale.setScalar(scale);
      t.inner.scale.set(sx, sy, 1);
      // colour: base glow (night), a decaying flash, and the held wrong / right / given states
      tmpC.copy(acc.base).multiplyScalar(.12 * glowK);
      let tint = 0, tintCol = C.tint;
      if (t.flash > 0) {
        t.flash = Math.max(0, t.flash - dt / (red ? 1.2 : .7));
        const f = red ? Math.min(1, t.flash * 1.6) : t.flash;
        tmpC.lerp(t.flashCol, Math.min(1, f * .85));
      }
      let bodyCol = null, bodyAmt = 0;
      if (hold) {
        const pulse = red ? 1 : .75 + .25 * Math.sin(time * 5);
        if (hold.kind === 'wrong' && hold.id === t.id) { tmpC.lerp(C.red, .45); tint = .6; bodyCol = C.red; bodyAmt = 1; }
        else if (hold.kind === 'wrong' && hold.correct === t.id) { tmpC.lerp(C.green, .45 * pulse); tint = .55 * pulse; tintCol = C.hintTint; bodyCol = C.green; bodyAmt = 1; }
        else if (hold.kind === 'given' && hold.id === t.id && t.mode === 'placed') { tmpC.lerp(C.amber, .4 * pulse); bodyCol = C.amber; bodyAmt = 1; }
      }
      t.bodyM.color.copy(acc.base); if (bodyCol) t.bodyM.color.lerp(bodyCol, bodyAmt);
      t.bodyM.emissive.copy(tmpC);
      t.labelMat.color.copy(C.white).lerp(tintCol, tint);
    }
    stepParticles(dt);
    stepRings(dt);
    // ---- slots: badges, strips, ghosts ----
    const pulse = red ? 1 : .5 + .5 * Math.sin(time * 3.4);
    slots.forEach((sl, i) => {
      if (!sl.filled && sl.st !== 'miss') setBadge(sl, i === nextSlot ? 'next' : 'empty');
      let bs = 1;
      if (sl.pop < 1) { sl.pop = Math.min(1, sl.pop + dt / .45); bs = red ? 1 : 1 + .45 * Math.exp(-sl.pop * 6) * Math.cos(sl.pop * 14); }
      else if (i === nextSlot && !red) bs = 1 + .07 * pulse;
      sl.badge.scale.setScalar(bs);
      let ei = sl.filled ? .75 + .8 * glowK : i === nextSlot ? .1 + (.25 + .25 * glowK) * pulse : .02 + .04 * glowK;
      tmpC.copy(sl.filled ? (sl.given ? C.amber : acc.bright) : acc.bright);
      if (sl.flash > 0) { sl.flash = Math.max(0, sl.flash - dt / (red ? 1.2 : .8)); tmpC.lerp(sl.flashCol, sl.flash); ei += 2.2 * sl.flash; }
      sl.stripMat.emissive.copy(tmpC); sl.stripMat.emissiveIntensity = ei;
      sl.puckMat.emissive.copy(tmpC); sl.puckMat.emissiveIntensity = (sl.filled ? .25 : i === nextSlot ? .35 * pulse : 0) * glowK + sl.flash * .8;
      sl.ghost.material = i === nextSlot ? ghostNextMat : ghostMat;
    });
    ghostNextMat.opacity = red ? .85 : .55 + .35 * pulse;
  }
  function dispose() {
    engine.scene.remove(root);
    kit.disposeTree(root);
    pGeo.dispose();
    for (const m of ownMat) { m.dispose(); kit.tracked && kit.tracked.delete(m); }
    for (const t of ownTex) t.dispose();
    ownMat.length = 0; ownTex.length = 0; badgeTex.clear(); tiles.clear(); slots = [];
  }
  const api = {
    sync, event, update, dispose,
    get tiles() { return tiles; }, get slots() { return slots; }, get layout() { return lay; },
    // debug / tools: on-screen font size of every visible tile label in CSS px
    labelPx() {
      const out = [];
      for (const t of tiles.values()) { t.label.getWorldPosition(tmpV); out.push({id: t.id, mode: t.mode, text: t.text, lines: t.label.lines, px: +(t.label.fontSize * engine.pxPerUnit(tmpV)).toFixed(1)}); }
      return out;
    }
  };
  root.userData.view = api;
  return api;
}

export default {id: 'order', label: 'Order', howTo, rules, createView};
