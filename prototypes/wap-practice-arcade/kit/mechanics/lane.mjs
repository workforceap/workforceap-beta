// Mechanic 'lane' (label "Steer"): a small endless-runner on three lanes. A courier robot jogs forward while a gate with
// three numbered doors rises out of the floor ahead of it; the question is the card, each door is one answer. The player
// picks a door (tap the door, tap its lane, or use the buttons 1-3). Timed runs: the gate creeps toward the runner as the
// clock runs down, so the timer is felt in the scene.
//
// Level payload: questions: [{prompt, options: [3 strings], answer: 0-2, why}] (6-8).
// rules are PURE (no DOM, no three) and deterministic for a given seed; state is plain JSON.
// Choice ids are the lanes, left to right: 'left' | 'middle' | 'right'. Question order and the option order inside
// each question are shuffled from the seed (with a guard against the right answer sitting in the same lane three
// times in a row). Events add optional fields beyond the contract, used by the 3D view: index (question index),
// choice (picked lane id) and correct (the right lane id).

export const TRAVEL_SECONDS = 20;
export const LANES = ['left', 'middle', 'right'];
// The card carries the question; the prompt line under it stays the same short instruction every time.
export const STEER_PROMPT = 'Pick a door';
// A wrong pick holds the scene until the shell sends {type: 'resume'}; this is only a safety net if it never does.
export const HOLD_LIMIT = 45;

// ---------- pure helpers shared with the 3D view (and unit-tested) ----------
// How far the gate has crept toward the runner, 0 (just arrived) to 1 (touching), from the clock. Speeds up a little at
// the end so the last seconds feel tight.
export function approachProgress(left, travel) {
  const t = Number(travel) > 0 ? Number(travel) : TRAVEL_SECONDS;
  const raw = 1 - Math.min(t, Math.max(0, Number(left))) / t;
  const p = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  return .65 * p + .35 * p * p;
}
// How big the celebration is for the n-th right answer in a row (1, 2, 3 ...). Grows, then levels off at 6.
export function celebrate(streak) {
  const n = Math.max(1, Math.min(6, Math.floor(Number(streak)) || 1));
  return {level: n, chunks: 12 + 7 * n, flash: 1 + .25 * (n - 1), ring: 1 + .16 * (n - 1), aura: n >= 3 ? Math.min(1, (n - 2) * .3) : 0};
}
// How hard the camera shakes on a wrong pick: a little more when a streak was just lost.
export function lossShake(previousStreak) {
  const n = Math.max(0, Math.min(6, Math.floor(Number(previousStreak)) || 0));
  return .7 + .12 * n;
}
// Is a held (wrong) gate ready to leave? After the shell sent resume, but never before the right door has shown for a beat.
export function holdOver(heldSeconds, resumed, minShow = .5, limit = HOLD_LIMIT) {
  const h = Number(heldSeconds) || 0;
  return h > limit || (!!resumed && h >= minShow);
}

// Does one gate keep the next gate from rising? A held (wrong) gate always does. A resolving gate does too, except a
// right answer that has hit the runner and slid well past (t > .3 s, .5 s under reduced motion).
export function gateBlocksSpawn(mode, evType, impact, t, reducedMotion = false) {
  if (mode === 'held') return true;
  if (mode === 'resolve') return !(!!impact && evType === 'right' && Number(t) > (reducedMotion ? .5 : .3));
  return false;
}

// Door sign geometry (world units). The plate nearly fills the door leaf; SIGN_TEXT_W/H is the text area inside the
// label's own padding. SIGN_MIN_FONT is the floor: about 11 CSS px on a 390 px wide phone at the lane camera framing.
// The plate hangs from a pivot at its bottom edge and tilts its top toward the camera (tilt, radians) so the letters
// are not squashed by the downward view.
export const SIGN = {w: 1.61, h: 1.4, y: .96, tilt: .3, textW: 1.38, textH: 1.2, maxFont: .4, minFont: .19};
// Estimated letter size (world units) a set of sign lines gets on the plate (the same estimate signText optimises).
export function signFontEstimate(lines) {
  const ls = Array.isArray(lines) ? lines : String(lines).split('\n');
  return Math.min(SIGN.maxFont, SIGN.textW / Math.max(.01, ...ls.map(emWidth)), SIGN.textH / ((ls.length - 1) * 1.14 + 1));
}
// The three doors of one gate share one letter size (the smallest natural fit), so no answer looks louder than another.
export function evenSignFont(sizes, floor = 0) {
  let m = Infinity;
  for (const s of sizes || []) { const v = Number(s); if (v > 0 && v < m) m = v; }
  return m === Infinity ? 0 : Math.max(floor, m);
}

// Where a door sign breaks its text. The sign draws exactly these lines, so the choice decides how big the letters get.
//  - one long token (an address, a hyphenated code) cannot wrap by itself: break it after a hyphen, slash or dot;
//  - several words: pick the split into 1 to 3 lines that allows the biggest letters on the plate (SIGN.textW x
//    SIGN.textH), and prefer fewer lines unless more lines gain over 12%.
const EM = (ch) => ("il.,:;!|1 ".includes(ch) ? .3 : 'mwMW'.includes(ch) ? .86 : ch >= 'A' && ch <= 'Z' ? .68 : ch >= '0' && ch <= '9' ? .58 : .55);
const emWidth = (str) => { let w = 0; for (let i = 0; i < str.length; i++) w += EM(str[i]); return w; };
export function signText(text) {
  const t = String(text === undefined || text === null ? '' : text).trim();
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    if (t.length <= 11) return t;
    let best = -1;
    for (let i = 1; i < t.length - 2; i++) if ('-/.'.includes(t[i]) && (best < 0 || Math.abs(i + 1 - t.length / 2) < Math.abs(best + 1 - t.length / 2))) best = i;
    return best < 0 ? t : t.slice(0, best + 1) + '\n' + t.slice(best + 1);
  }
  if (t.length <= 8 || words.length > 12) return words.join(' ');
  const W = SIGN.textW, H = SIGN.textH, CAP = SIGN.maxFont;
  const score = (lines) => Math.min(CAP, W / Math.max(...lines.map(emWidth)), H / ((lines.length - 1) * 1.14 + 1)) * (lines.length > 1 && lines.some((l) => l.length < 3) ? .6 : 1) * (lines.length > 1 && lines[0].length < 4 ? .65 : 1) * (lines.length === 3 && lines[1].length < 4 ? .6 : 1); // a lone "A", "to" or "the" on a line looks wrong
  let best = {lines: [words.join(' ')], f: 0}; best.f = score(best.lines);
  const n = words.length;
  const consider = (lines) => { const f = score(lines); if (f > best.f * (lines.length > best.lines.length ? 1.12 : 1.0001)) best = {lines, f}; };
  for (let i = 1; i < n; i++) consider([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
  for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) consider([words.slice(0, i).join(' '), words.slice(i, j).join(' '), words.slice(j).join(' ')]);
  return best.lines.join('\n');
}

function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function current(state) { return state.questions[state.i] || null; }
function wrongEvent(type, state, q) {
  const label = q.options[q.answer];
  return {type, correctLabel: label, why: q.why, review: {title: q.prompt, correct: label}, index: state.i, correct: LANES[q.answer]};
}
function advance(state, events) {
  const next = {...state, i: state.i + 1, left: state.travel};
  if (next.i >= next.questions.length) events.push({type: 'done'});
  return next;
}

export const rules = {
  init(level, {seed = 1, timed = false} = {}) {
    const rnd = rng(seed);
    const order = shuffle(level.questions, rnd);
    const recent = [];
    const questions = order.map((q) => {
      let perm = shuffle([0, 1, 2], rnd);
      // keep the right lane from repeating three times running (still deterministic for the seed)
      if (recent.length >= 2 && recent[0] === recent[1] && perm.indexOf(q.answer) === recent[0]) perm = [perm[2], perm[0], perm[1]];
      const answer = perm.indexOf(q.answer);
      recent.unshift(answer); recent.length = Math.min(recent.length, 2);
      return {prompt: q.prompt, options: perm.map((k) => q.options[k]), answer, why: q.why};
    });
    return {
      mechanic: 'lane',
      timed: !!timed,
      travel: TRAVEL_SECONDS,
      left: TRAVEL_SECONDS,
      prompt: STEER_PROMPT,
      questions,
      i: 0
    };
  },
  view(state) {
    const q = current(state);
    const shown = q || state.questions[state.questions.length - 1];
    return {
      card: q ? {title: q.prompt, lines: []} : null,
      prompt: q ? state.prompt : '',
      choices: LANES.map((id, k) => ({id, label: shown ? shown.options[k] : '', done: false})),
      progress: {done: Math.min(state.i, state.questions.length), total: state.questions.length},
      timer: state.timed && q ? {left: Math.max(0, state.left), total: state.travel} : null
    };
  },
  act(state, choiceId) {
    const q = current(state);
    const k = LANES.indexOf(choiceId);
    if (!q || k < 0) return {state, events: []};
    const events = [];
    if (k === q.answer) events.push({type: 'right', why: q.why, index: state.i, choice: choiceId, correct: LANES[q.answer]});
    else events.push({...wrongEvent('wrong', state, q), choice: choiceId});
    return {state: advance(state, events), events};
  },
  tick(state, dt) {
    const q = current(state);
    if (!state.timed || !q || !(dt > 0)) return {state, events: []};
    const left = state.left - dt;
    if (left > 0) return {state: {...state, left}, events: []};
    const events = [wrongEvent('timeout', state, q)];
    return {state: advance(state, events), events};
  },
  hint(state) {
    const q = current(state);
    return q ? LANES[q.answer] : null;
  },
  done(state) { return state.i >= state.questions.length; }
};

function howTo() {
  return [
    'Read the question in the card below.',
    'A gate with three numbered doors rises ahead of your robot. Each door is one answer.',
    'Pick the right door: tap it, tap its lane, or press the matching button.'
  ];
}

// ---------------------------------------------------------------------------------------------
// 3D view. ctx = {THREE, engine, look, world, theme, level, props, reduced, accent}
//
// Scene (+z is toward the camera): a three-lane runway fading into the world at z -8.6, a courier robot at z 1.0, and a
// gate that rises out of the floor at z -7.6, glides in to a reading spot (untimed) or creeps toward the runner with the
// clock (timed). The camera sits behind and above the runner (pitch 32) and frames runner plus gate.
// Right: the runner dashes into the picked lane, the gate rushes in, that door swings open in a burst of light and the gate
// slides past the runner and sinks. Wrong: the door stays shut, the runner bumps and the right door glows until the shell
// sends {type: 'resume'}.
// Pooled objects only: two gates, one confetti mesh, two rings, two glow sprites, two marks. Nothing is allocated per frame.
function createView(ctx) {
  const {THREE, engine, look, theme} = ctx;
  const kit = engine.kit;
  const reduced = () => !!(ctx.reduced || engine.reduced);
  const root = new THREE.Group(); root.name = 'lane-view'; engine.scene.add(root);
  const C = (h) => new THREE.Color(h);
  const A = ctx.accent && ctx.accent.bright ? ctx.accent : (typeof look.accentSet === 'function' ? look.accentSet(theme.accent) : (() => {
    const base = C(theme.accent || '#2b7bb9');
    return {base, bright: base.clone().lerp(C(0xffffff), .3), dark: base.clone().multiplyScalar(.5), soft: base.clone().lerp(C(0xffffff), .85), hex: '#' + base.getHexString()};
  })());
  const hex = (c) => '#' + c.getHexString();
  const moodP = engine.mood || {id: theme.mood || 'day', glow: .6};
  const night = moodP.id === 'night', dusk = moodP.id === 'dusk';
  const glowK = moodP.glow || .6;

  // ---------- palette (mood aware) ----------
  const GREEN = C(0x37d06a), RED = C(0xff3a48), AMBER = C(0xffb02e), WHITE = C(0xffffff), CREAM = C(0xfff4dc);
  const floorA = night ? C(0x101a35) : dusk ? A.dark.clone().lerp(C(0x3a2f66), .55) : A.dark.clone().lerp(C(0x3c455a), .45);
  const floorB = floorA.clone().offsetHSL(0, 0, night ? .035 : .045);
  const frameCol = night ? C(0x141c38) : dusk ? A.dark.clone().lerp(C(0x2c2450), .4) : A.dark.clone().lerp(C(0x2b3448), .35);
  const leafCol = night ? C(0x1a2650).lerp(A.dark, .3) : dusk ? A.base.clone().lerp(C(0x6a3f8e), .25) : A.base.clone();
  const curbCol = night ? C(0x182142) : dusk ? C(0x3a3068) : A.dark.clone().lerp(C(0xdad2c4), .35);
  const idleGlow = .35 + .5 * glowK;

  // ---------- layout ----------
  const LANE_X = [-1.85, 0, 1.85], DOOR_W = 1.75, DOOR_H = 2.0, POST_H = 2.1, HW = (DOOR_W - .08) / 2, LEAN = .14;
  const RUN_W = 6.0, RUN_Z0 = -8.6, RUN_Z1 = 7, RUN_L = RUN_Z1 - RUN_Z0, RUN_MID = (RUN_Z0 + RUN_Z1) / 2, TILE = 3.0;
  const Z_FAR = -7.0, Z_READ = -2.7, Z_HOLD = -2.45, Z_NEAR = -1.5, Z_CONTACT = -.7, RUNNER_Z = .0, ARRIVE = 1.0, REACH = .3;
  const FOCUS = {x0: -2.9, x1: 2.9, z0: -2.9, z1: -2.1, y0: 0, y1: 2.45};
  const FOCUS_OPTS = {pitch: 28, yaw: 0, margin: .02, ease: .6};
  const textures = [], disposables = [];
  const ownTex = (t) => { textures.push(t); return t; };
  const ownGeo = (g) => { disposables.push(g); return g; };
  const ownMat = (m) => { disposables.push(m); return m; };
  const ease = {
    out3: (t) => 1 - Math.pow(1 - t, 3),
    back: (t) => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const tmpC = new THREE.Color(), dummy = new THREE.Object3D();

  engine.setFocus(FOCUS, FOCUS_OPTS);

  // ---------- runway ----------
  const PX = 1024 / RUN_W;
  const laneU = (x) => 512 + x * PX;
  const floorTex = ownTex(look.canvasTexture(1024, 512, (g, w, h) => {
    g.fillStyle = hex(floorA); g.fillRect(0, 0, w, h);
    LANE_X.forEach((x) => {
      const x0 = laneU(x - .9), x1 = laneU(x + .9);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hex(floorB)); gr.addColorStop(1, hex(floorB.clone().offsetHSL(0, 0, -.025)));
      g.fillStyle = gr; g.beginPath(); g.roundRect(x0, -20, x1 - x0, h + 40, 14); g.fill();
    });
    // dashed lane dividers and solid edge lines
    g.fillStyle = night ? 'rgba(180,205,255,.28)' : 'rgba(255,246,224,.9)';
    [-.925, .925].forEach((x) => { for (let k = 0; k < 2; k++) g.fillRect(laneU(x) - 5, k * h / 2 + h * .06, 10, h * .3); });
    g.fillStyle = night ? hex(A.bright.clone().multiplyScalar(.55)) : hex(CREAM);
    [-2.88, 2.88].forEach((x) => g.fillRect(laneU(x) - 6, 0, 12, h));
    // forward chevrons in every lane
    g.strokeStyle = hex(A.bright.clone().lerp(night ? A.bright : WHITE, night ? 0 : .12)); g.globalAlpha = night ? .5 : .55;
    g.lineWidth = 22; g.lineCap = 'round'; g.lineJoin = 'round';
    LANE_X.forEach((x) => { const cx = laneU(x); [h * .22, h * .74].forEach((y) => { g.beginPath(); g.moveTo(cx - 62, y + 38); g.lineTo(cx, y); g.lineTo(cx + 62, y + 38); g.stroke(); g.beginPath(); g.moveTo(cx - 62, y + 84); g.lineTo(cx, y + 46); g.lineTo(cx + 62, y + 84); g.stroke(); }); });
    g.globalAlpha = 1;
  }, {repeat: [1, RUN_L / TILE], aniso: 8}));
  const glowTex = ownTex(look.canvasTexture(1024, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = hex(A.bright.clone().multiplyScalar(.7));
    [-2.88, 2.88].forEach((x) => g.fillRect(laneU(x) - 6, 0, 12, h));
    g.strokeStyle = hex(A.bright); g.lineWidth = 22; g.lineCap = 'round'; g.lineJoin = 'round';
    LANE_X.forEach((x) => { const cx = laneU(x); [h * .22, h * .74].forEach((y) => { g.beginPath(); g.moveTo(cx - 62, y + 38); g.lineTo(cx, y); g.lineTo(cx + 62, y + 38); g.stroke(); g.beginPath(); g.moveTo(cx - 62, y + 84); g.lineTo(cx, y + 46); g.lineTo(cx + 62, y + 84); g.stroke(); }); });
  }, {repeat: [1, RUN_L / TILE], aniso: 4}));
  const fadeTex = ownTex(look.canvasTexture(4, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000'); gr.addColorStop(.28, '#fff'); gr.addColorStop(1, '#fff');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, {srgb: false, aniso: 1}));
  const runwayM = ownMat(new THREE.MeshStandardMaterial({map: floorTex, emissiveMap: glowTex, emissive: C(0xffffff), emissiveIntensity: night ? 1.15 : dusk ? .6 : .28, alphaMap: fadeTex, transparent: true, roughness: .62, metalness: 0}));
  const runway = new THREE.Mesh(ownGeo(new THREE.PlaneGeometry(RUN_W, RUN_L)), runwayM);
  runway.rotation.x = -Math.PI / 2; runway.position.set(0, .018, RUN_MID); runway.receiveShadow = true; root.add(runway);

  // curbs with a glowing accent strip, and a far finish arch
  const curbM = kit.own({color: curbCol, roughness: .55, metalness: .05});
  const stripM = ownMat(new THREE.MeshBasicMaterial({color: A.bright, toneMapped: false}));
  stripM.color.multiplyScalar(night ? 1.2 : dusk ? 1 : .85);
  [-1, 1].forEach((s) => {
    root.add(kit.box(.28, .2, RUN_L - 1.4, curbM, s * (RUN_W / 2 + .14), 0, RUN_MID + .5, .07));
    const st = new THREE.Mesh(ownGeo(new THREE.BoxGeometry(.07, .05, RUN_L - 1.6)), stripM);
    st.position.set(s * (RUN_W / 2 + .05), .215, RUN_MID + .5); root.add(st);
  });
  const arch = new THREE.Group(); arch.position.z = RUN_Z0 + .5; root.add(arch);
  [-1, 1].forEach((s) => arch.add(kit.box(.34, 2.3, .34, curbM, s * (RUN_W / 2 + .14), 0, 0, .1)));
  arch.add(kit.box(RUN_W + .8, .34, .36, curbM, 0, 2.2, 0, .1));
  const archGlow = new THREE.Mesh(ownGeo(new THREE.BoxGeometry(RUN_W - .4, .08, .05)), stripM); archGlow.position.set(0, 2.38, .2); arch.add(archGlow);

  // streaming lamp posts on the curbs: instanced, recycled, scaled in at the far end
  const POSTS_PER_SIDE = 8, POST_GAP = 1.95, LOOP = POSTS_PER_SIDE * POST_GAP, LOOP_Z0 = RUN_Z0 + .6;
  const postGeo = kit.cylGeo(.1, .13, .5, 10), lampGeo = kit.sphereGeo(.14, 10);
  const postMat = kit.own({color: frameCol.clone().lerp(WHITE, .1), roughness: .5, metalness: .1});
  const lampMat = ownMat(new THREE.MeshBasicMaterial({color: A.bright, toneMapped: false}));
  const posts = new THREE.InstancedMesh(postGeo, postMat, POSTS_PER_SIDE * 2), lamps = new THREE.InstancedMesh(lampGeo, lampMat, POSTS_PER_SIDE * 2);
  posts.frustumCulled = lamps.frustumCulled = false; posts.castShadow = true; root.add(posts, lamps);
  let scrollDist = 0;
  function placePosts() {
    let n = 0;
    for (let side = 0; side < 2; side++) for (let i = 0; i < POSTS_PER_SIDE; i++) {
      const along = ((i * POST_GAP + scrollDist) % LOOP + LOOP) % LOOP;
      const z = LOOP_Z0 + along, x = (side ? 1 : -1) * (RUN_W / 2 + .14);
      const sc = Math.min(1, Math.max(.001, (z - LOOP_Z0) / 1.6)) * (z > RUN_Z1 + 1.5 ? .001 : 1);
      dummy.position.set(x, .2 + .25 * sc, z); dummy.scale.setScalar(sc); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); posts.setMatrixAt(n, dummy.matrix);
      dummy.position.set(x, .2 + .6 * sc, z); dummy.updateMatrix(); lamps.setMatrixAt(n, dummy.matrix);
      n++;
    }
    posts.instanceMatrix.needsUpdate = true; lamps.instanceMatrix.needsUpdate = true;
  }
  placePosts();

  // tappable lane strips (a glow under the runner's lane)
  const laneStripGeo = ownGeo(new THREE.PlaneGeometry(DOOR_W + .12, RUN_L - 1));
  const laneStrips = LANE_X.map((x, k) => {
    const m = ownMat(new THREE.MeshBasicMaterial({color: A.bright, transparent: true, opacity: 0, depthWrite: false, toneMapped: false}));
    const p = new THREE.Mesh(laneStripGeo, m);
    p.rotation.x = -Math.PI / 2; p.position.set(x, .03, RUN_MID + .4); p.renderOrder = 2;
    p.userData.choiceId = LANES[k]; p.name = 'lane-' + LANES[k];
    root.add(p);
    return {p, m};
  });

  // ---------- runner: a small courier robot (faces -z, the parcel on its back toward the camera) ----------
  const markTex = {
    right: ownTex(look.canvasTexture(128, 128, (g, w) => { g.fillStyle = '#2fb85f'; g.beginPath(); g.arc(w / 2, w / 2, 58, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(36, 66); g.lineTo(56, 86); g.lineTo(92, 44); g.stroke(); }, {aniso: 1})),
    wrong: ownTex(look.canvasTexture(128, 128, (g, w) => { g.fillStyle = '#d6303c'; g.beginPath(); g.arc(w / 2, w / 2, 58, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(42, 42); g.lineTo(86, 86); g.moveTo(86, 42); g.lineTo(42, 86); g.stroke(); }, {aniso: 1}))
  };
  const runner = buildRobot();
  runner.g.position.set(LANE_X[1], 0, RUNNER_Z);
  root.add(runner.g);
  const rs = {lane: 1, x: LANE_X[1], bump: 0, hop: 0, look: 0, dash: 0, stopped: false, aura: 0, auraGoal: 0, reach: 0, reachGoal: 0};

  function buildRobot() {
    const g = new THREE.Group(); g.name = 'runner';
    const body = new THREE.Group(); g.add(body);
    const shell = kit.own({color: 0xf6f7fa, roughness: .34, metalness: .05});
    const dark = kit.own({color: 0x2a2f38, roughness: .42, metalness: .25});
    const acc = kit.own({color: A.base.clone(), roughness: .4, metalness: .08});
    const eyeM = kit.own({color: 0x0a0f14, emissive: C(0x8fe6ff), emissiveIntensity: 1.8, roughness: .3, toneMapped: false});
    const legs = [-.13, .13].map((x) => {
      const p = new THREE.Group(); p.position.set(x, .34, 0);
      p.add(kit.box(.13, .3, .15, dark, 0, -.3, 0, .045));
      p.add(kit.box(.17, .09, .26, acc, 0, -.34, -.03, .035));
      body.add(p); return p;
    });
    const torso = new THREE.Group(); torso.position.y = .34; body.add(torso);
    torso.add(kit.box(.52, .44, .38, shell, 0, 0, 0, .1));
    torso.add(kit.box(.55, .08, .41, acc, 0, .08, 0, .035));
    // parcel on the back (the side the camera sees) with tape and an accent label
    const parcel = new THREE.Group(); parcel.position.set(0, .05, .28); torso.add(parcel);
    parcel.add(kit.box(.42, .36, .22, kit.cmat('ln-parcel', {color: 0xd29a55, roughness: .72}), 0, 0, 0, .03));
    parcel.add(kit.box(.08, .365, .225, kit.cmat('ln-tape', {color: 0xf1e0b0, roughness: .6}), 0, 0, 0, .015));
    parcel.add(kit.box(.15, .1, .02, acc, .11, .2, .11, .01));
    // the level's own prop (chip, ticket, packet, envelope ...) rides on the back in place of the plain parcel
    const lp = ctx.props && ctx.props.make && ctx.level && ctx.level.prop;
    if (lp) {
      let body = null;
      try { body = ctx.props.make(lp, {accent: A.base}); } catch (e) { body = null; }
      if (body) {
        const bb = new THREE.Box3().setFromObject(body), sz = bb.getSize(new THREE.Vector3());
        const sc = Math.min(.62 / Math.max(.05, sz.x, sz.z), .5 / Math.max(.05, sz.y));
        body.scale.setScalar(sc); body.position.set(0, -.2 - bb.min.y * sc, 0.04);
        parcel.children.slice().forEach((c) => c.visible = false);
        parcel.add(body);
      }
    }
    const arms = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * .33, .38, 0);
      p.add(kit.box(.1, .27, .12, shell, 0, -.27, 0, .04));
      p.add(kit.cyl(.065, .065, .09, dark, 0, -.35, 0, 12));
      torso.add(p); return p;
    });
    const head = new THREE.Group(); head.position.y = .45; torso.add(head);
    head.add(kit.box(.5, .34, .39, shell, 0, 0, 0, .11));
    head.add(kit.box(.41, .2, .03, dark, 0, .08, -.2, .035));
    [-.09, .09].forEach((x) => { const e = kit.cyl(.045, .045, .02, eyeM, 0, 0, 0, 14); e.rotation.x = Math.PI / 2; e.position.set(x, .17, -.215); head.add(e); });
    [-1, 1].forEach((s) => { const ear = kit.cyl(.08, .08, .06, acc, 0, 0, 0, 16); ear.rotation.z = Math.PI / 2; ear.position.set(s * .265, .17, 0); head.add(ear); });
    head.add(kit.cyl(.016, .016, .17, dark, 0, .33, 0, 8));
    const bulbM = kit.own({color: 0x111111, emissive: A.bright.clone(), emissiveIntensity: 1.5, toneMapped: false});
    const bulb = new THREE.Mesh(kit.sphereGeo(.055, 14), bulbM); bulb.position.set(0, .52, 0); head.add(bulb);
    g.add(look.makeBlob(1.0, .8, .5));
    // the pad under the runner: an accent ring that marks "you are here"
    const ringM = ownMat(new THREE.MeshBasicMaterial({color: A.bright, transparent: true, opacity: .9, toneMapped: false, depthWrite: false}));
    const ring = new THREE.Mesh(ownGeo(new THREE.RingGeometry(.52, .64, 36)), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = .035; ring.renderOrder = 3; g.add(ring);
    // streak aura: a soft glow behind the runner that grows with the streak
    const auraM = ownMat(kit.glowMat(A.bright.getHex()).clone()); auraM.opacity = 0;
    const aura = new THREE.Sprite(auraM); aura.position.set(0, .7, .25); aura.scale.set(2.2, 2.2, 1); aura.renderOrder = 4; g.add(aura);
    g.scale.setScalar(1.35);
    return {g, body, torso, legs, arms, head, eyeM, bulbM, ringM, auraM, aura};
  }

  // ---------- effects: pooled, no per-frame allocation ----------
  const NCH = 80;
  const chunkGeo = kit.bevel(.15, .15, .15, .04);
  const chunkMat = ownMat(new THREE.MeshBasicMaterial({color: 0xffffff, toneMapped: false}));
  const chunks = new THREE.InstancedMesh(chunkGeo, chunkMat, NCH); chunks.frustumCulled = false; chunks.renderOrder = 6; root.add(chunks);
  const ch = {pos: new Float32Array(NCH * 3), vel: new Float32Array(NCH * 3), life: new Float32Array(NCH), max: new Float32Array(NCH), size: new Float32Array(NCH), rot: new Float32Array(NCH), spin: new Float32Array(NCH), next: 0, live: 0};
  dummy.scale.setScalar(0); dummy.updateMatrix();
  for (let i = 0; i < NCH; i++) { chunks.setMatrixAt(i, dummy.matrix); chunks.setColorAt(i, WHITE); }
  chunks.instanceMatrix.needsUpdate = true; chunks.instanceColor.needsUpdate = true;
  function spawnChunks(n, x, y, z, colors, speed, up, forward) {
    if (reduced()) return;
    for (let k = 0; k < n; k++) {
      const i = ch.next; ch.next = (ch.next + 1) % NCH;
      const a = Math.random() * Math.PI * 2, r = .3 + Math.random() * .7;
      ch.pos[i * 3] = x + Math.cos(a) * .25; ch.pos[i * 3 + 1] = y + Math.random() * .3; ch.pos[i * 3 + 2] = z;
      ch.vel[i * 3] = Math.cos(a) * speed * r; ch.vel[i * 3 + 1] = up * (.6 + Math.random() * .8); ch.vel[i * 3 + 2] = forward * (.5 + Math.random()) + Math.sin(a) * speed * .5 * r;
      ch.max[i] = ch.life[i] = .7 + Math.random() * .5; ch.size[i] = .6 + Math.random() * .8; ch.rot[i] = Math.random() * 6; ch.spin[i] = (Math.random() - .5) * 14;
      chunks.setColorAt(i, colors[k % colors.length]);
    }
    chunks.instanceColor.needsUpdate = true; ch.live = 1;
  }
  function updateChunks(dt) {
    if (!ch.live) return;
    let any = 0;
    for (let i = 0; i < NCH; i++) {
      if (ch.life[i] <= 0) continue;
      ch.life[i] -= dt;
      if (ch.life[i] <= 0) { dummy.scale.setScalar(0); dummy.position.set(0, -9, 0); dummy.updateMatrix(); chunks.setMatrixAt(i, dummy.matrix); continue; }
      any = 1;
      ch.vel[i * 3 + 1] -= 9 * dt;
      ch.pos[i * 3] += ch.vel[i * 3] * dt; ch.pos[i * 3 + 1] = Math.max(.05, ch.pos[i * 3 + 1] + ch.vel[i * 3 + 1] * dt); ch.pos[i * 3 + 2] += ch.vel[i * 3 + 2] * dt;
      ch.rot[i] += ch.spin[i] * dt;
      dummy.position.set(ch.pos[i * 3], ch.pos[i * 3 + 1], ch.pos[i * 3 + 2]);
      dummy.rotation.set(ch.rot[i], ch.rot[i] * .7, 0);
      dummy.scale.setScalar(ch.size[i] * Math.min(1, ch.life[i] / ch.max[i] * 2.5));
      dummy.updateMatrix(); chunks.setMatrixAt(i, dummy.matrix);
    }
    chunks.instanceMatrix.needsUpdate = true; ch.live = any;
  }
  const ringGeo = ownGeo(new THREE.RingGeometry(.5, .64, 40));
  const rings = [0, 1].map(() => {
    const m = ownMat(new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false}));
    const mesh = new THREE.Mesh(ringGeo, m); mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.renderOrder = 5; root.add(mesh);
    return {mesh, m, t: 1, life: .8, size: 1};
  });
  let ringNext = 0;
  function ring(x, z, color, size) {
    const r = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
    r.mesh.position.set(x, .06, z); r.m.color.copy(color); r.t = 0; r.size = size; r.life = reduced() ? 1 : .75; r.mesh.visible = true;
  }
  const glows = [0, 1].map(() => {
    const m = ownMat(kit.glowMat(0xffffff).clone()); m.opacity = 0;
    const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 7; root.add(s);
    return {s, m, t: 1, size: 3, life: .6};
  });
  let glowNext = 0;
  function flash(x, y, z, color, size, life = .6) {
    const g = glows[glowNext]; glowNext = (glowNext + 1) % glows.length;
    g.m.color.copy(color); g.s.position.set(x, y, z); g.t = 0; g.size = size; g.life = reduced() ? .5 : life; g.s.visible = true;
  }
  const marks = {};
  ['right', 'wrong'].forEach((kind) => {
    const m = ownMat(new THREE.SpriteMaterial({map: markTex[kind], transparent: true, depthTest: false, toneMapped: false}));
    const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 20; root.add(s);
    marks[kind] = {s, m, t: 1, y: 0, life: 1.3, size: 1};
  });
  const markList = [marks.right, marks.wrong];
  function mark(kind, x, y, z, size = 1.1) {
    const k = marks[kind]; k.s.position.set(x, y, z); k.y = y; k.t = 0; k.size = size; k.life = reduced() ? 1.5 : 1.3; k.s.visible = true;
  }
  // the engine's accent point light doubles as the "light burst" when a door opens
  const L = engine.lights && engine.lights.accent;
  const lightBase = L ? {i: L.intensity, c: L.color.clone(), p: L.position.clone()} : null;
  let lightK = 0;
  function lightBurst(x, z, color, power) { if (!L || reduced()) return; L.position.set(x, 1.4, z + 1.2); L.color.copy(color); lightK = Math.max(lightK, power); }

  // ---------- gates (pooled) ----------
  const hitGeo = ownGeo(new THREE.BoxGeometry(DOOR_W, POST_H, .7));
  const hitMat = ownMat(new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false}));
  const portalGeo = ownGeo(new THREE.PlaneGeometry(DOOR_W - .12, DOOR_H));
  const tintGeo = ownGeo(new THREE.PlaneGeometry(SIGN.w, SIGN.h));
  // A door sign keeps exactly the lines signText chose (maxLines = that count, so the label does not re-wrap them into a
  // lone "the"), never below the font floor unless the text cannot fit otherwise. With fixed > 0 the font is exactly
  // that size (used to give all three doors of a gate the same letter size). It is added to the door's tilted pivot.
  const signBack = hex(frameCol);
  function makeSign(text, fixed) {
    const f = fixed > 0 ? fixed : 0, n = Math.min(3, Math.max(1, String(text).split('\n').length));
    const l = kit.label(text, {w: SIGN.w, h: SIGN.h, maxLines: n, accent: null, bg: '#fffaf1', fg: '#141c29', maxFont: f || SIGN.maxFont, minFont: f || SIGN.minFont, depth: .04, back: signBack});
    l.position.set(0, SIGN.h / 2, 0);
    return l;
  }
  function setSigns(gate, q) {
    const ds = gate.doors;
    for (let k = 0; k < ds.length; k++) ds[k].label.dispose();
    for (let k = 0; k < ds.length; k++) { ds[k].text = signText(q.options[k]); ds[k].label = makeSign(ds[k].text, 0); ds[k].pivot.add(ds[k].label); }
    const f = evenSignFont(ds.map((d) => d.label.fontSize));
    if (!(f > 0)) return;
    for (let k = 0; k < ds.length; k++) {
      if (Math.abs(ds[k].label.fontSize - f) <= f * .03) continue;
      ds[k].label.dispose(); ds[k].label = makeSign(ds[k].text, f); ds[k].pivot.add(ds[k].label);
    }
  }
  const frameM = kit.own({color: frameCol, roughness: .5, metalness: .12});
  const baseM = kit.own({color: frameCol.clone().lerp(WHITE, .1), roughness: .6, metalness: .05});
  const gates = [];
  let active = null, state = null, shownIndex = -1, spawnDelay = 0, time = 0, floorSpeed = 1.4, lastStreak = 0, pendingResume = false;

  function buildGate() {
    const g = new THREE.Group(); g.name = 'gate'; g.visible = false;
    const lo = new THREE.Group(); lo.rotation.x = LEAN; g.add(lo);
    // posts, bases, lintel
    [[-2.77, .12], [-.925, .1], [.925, .1], [2.77, .12]].forEach(([x, w]) => {
      lo.add(kit.box(w, POST_H, .3, frameM, x, 0, 0, .05));
      lo.add(kit.box(w + .18, .12, .56, baseM, x, 0, .04, .04));
    });
    lo.add(kit.box(5.95, .3, .36, frameM, 0, POST_H - .02, 0, .07));
    // timer bar on the lintel (full for untimed runs; drains as the clock runs down)
    const barM = ownMat(new THREE.MeshBasicMaterial({color: A.bright, toneMapped: false}));
    const bar = new THREE.Mesh(ownGeo(new THREE.BoxGeometry(5.3, .09, .05)), barM); bar.position.set(0, POST_H + .13, .2); lo.add(bar);
    const lampM = ownMat(new THREE.MeshBasicMaterial({color: A.bright, toneMapped: false}));
    [-2.77, 2.77].forEach((x) => { const l = new THREE.Mesh(kit.sphereGeo(.13, 12), lampM); l.position.set(x, POST_H + .3, 0); lo.add(l); });
    const doors = LANES.map((id, k) => {
      const door = new THREE.Group(); door.position.x = LANE_X[k]; door.userData.choiceId = id; door.name = 'door-' + id; lo.add(door);
      const panelM = kit.own({color: leafCol.clone(), roughness: .5, metalness: .05, emissive: C(0x000000), emissiveIntensity: 1});
      const portalM = ownMat(new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false}));
      const portal = new THREE.Mesh(portalGeo, portalM); portal.position.set(0, DOOR_H / 2 + .04, -.12); portal.renderOrder = 1; door.add(portal);
      const leaf = new THREE.Group(); leaf.position.set(-HW, .04, 0); door.add(leaf);
      leaf.add(kit.box(2 * HW, DOOR_H, .13, panelM, HW, 0, 0, .05));
      const pivot = new THREE.Group(); pivot.position.set(HW, SIGN.y - SIGN.h / 2, .085); pivot.rotation.x = SIGN.tilt; leaf.add(pivot);
      const label = makeSign('Door', 0); pivot.add(label);
      const badge = kit.label(String(k + 1), {w: .34, h: .28, maxLines: 1, accent: null, bg: hex(A.dark.clone().lerp(WHITE, .05)), fg: '#ffffff', maxFont: .26, minFont: .12, depth: .03, back: hex(frameCol)});
      badge.position.set(HW, DOOR_H - .15, .085); leaf.add(badge);
      const knob = new THREE.Mesh(kit.sphereGeo(.07, 12), kit.cmat('ln-knob', {color: 0xf0d98c, roughness: .3, metalness: .8})); knob.position.set(2 * HW - .12, .14, .12); leaf.add(knob);
      const tintM = ownMat(new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false}));
      const tint = new THREE.Mesh(tintGeo, tintM); tint.position.set(0, SIGN.h / 2, .05); tint.renderOrder = 3; pivot.add(tint);
      // glow trim around the opening (lights green on the right door, red on a wrong pick)
      const glowM = ownMat(new THREE.MeshBasicMaterial({color: A.bright, toneMapped: false}));
      [-1, 1].forEach((s) => { const t = new THREE.Mesh(ownGeo(new THREE.BoxGeometry(.07, DOOR_H + .05, .06)), glowM); t.position.set(s * (HW + .06), DOOR_H / 2 + .04, .1); door.add(t); });
      const top = new THREE.Mesh(ownGeo(new THREE.BoxGeometry(2 * HW + .19, .07, .06)), glowM); top.position.set(0, DOOR_H + .06, .1); door.add(top);
      const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.set(0, POST_H / 2, 0); door.add(hit);
      return {door, leaf, pivot, label, text: '', portalM, panelM, glowM, tintM, open: 0, kind: 'idle', shake: 0};
    });
    const blob = look.makeBlob(6.4, 1.5, .4); blob.position.y = .03; g.add(blob);
    root.add(g);
    return {g, lo, doors, barM, lampM, index: -1, q: null, z: Z_FAR, z0: 0, age: 0, t: 0, held: 0, mode: 'idle', ev: null, pick: 1, correct: 0, resumed: false, impact: false, rush: .4, vz: 0};
  }
  gates.push(buildGate(), buildGate());

  function paintDoor(d, kind) {
    d.kind = kind;
    const glowStrength = (c, i) => { d.glowM.color.copy(c).multiplyScalar(i); };
    d.panelM.emissive.setRGB(0, 0, 0); d.tintM.opacity = 0;
    if (kind === 'idle') { glowStrength(A.bright, idleGlow); }
    else if (kind === 'right') { glowStrength(GREEN, 1.5); d.tintM.color.copy(GREEN); d.tintM.opacity = .22; d.panelM.emissive.copy(GREEN).multiplyScalar(.35); }
    else if (kind === 'wrong') { glowStrength(RED, 1.3); d.tintM.color.copy(RED); d.tintM.opacity = .5; d.panelM.emissive.copy(RED).multiplyScalar(.45); }
    else if (kind === 'hint') { glowStrength(GREEN, 1.5); d.tintM.color.copy(GREEN); d.tintM.opacity = .2; d.panelM.emissive.copy(GREEN).multiplyScalar(.5); }
    else if (kind === 'dim') { glowStrength(A.bright, .25); d.tintM.color.setRGB(.05, .06, .1); d.tintM.opacity = .45; }
  }
  function activate(gate, q, index, z) {
    gate.index = index; gate.q = q; gate.z = z; gate.z0 = z; gate.age = 0; gate.t = 0; gate.held = 0; gate.mode = 'approach'; gate.ev = null; gate.resumed = false; gate.impact = false; gate.vz = 0;
    gate.doors.forEach((d, k) => {
      d.door.userData.choiceId = LANES[k];
      d.leaf.rotation.set(0, 0, 0); d.leaf.position.z = 0; d.door.position.z = 0; d.portalM.opacity = 0; d.open = 0; d.shake = 0; paintDoor(d, 'idle');
    });
    setSigns(gate, q);
    gate.barM.color.copy(A.bright); gate.lampM.color.copy(A.bright);
    gate.lo.scale.x = 1; gate.g.position.set(0, -2.4, z); gate.g.visible = true;
  }
  function retire(gate) {
    gate.mode = 'idle'; gate.g.visible = false; gate.index = -1;
    if (active === gate) active = null;
  }
  function acquire() {
    let g = gates.find((x) => x.mode === 'idle');
    if (!g) { g = gates.slice().sort((a, b) => (b.mode === 'held' ? 0 : 1) - (a.mode === 'held' ? 0 : 1) || b.t - a.t)[0]; retire(g); }
    return g;
  }
  function targetZ() {
    if (!state || !state.timed) return Z_HOLD;
    let p = approachProgress(state.left, state.travel);
    if (reduced()) p = Math.floor(p * 6) / 6; // steps closer instead of gliding
    return Z_READ + (Z_NEAR - Z_READ) * p;
  }
  // No allocation: plain loops. A gate that is sliding away after a right answer lets the next one rise once it is
  // well past the runner (t > .3), so the scene never shows the old question for long.
  function spawnBlocked() {
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      if (gateBlocksSpawn(g.mode, g.ev && g.ev.type, g.impact, g.t, reduced())) return true;
    }
    return false;
  }
  function anyMode(a, b) {
    for (let i = 0; i < gates.length; i++) if (gates[i].mode === a || gates[i].mode === b) return true;
    return false;
  }
  function anyHeld() { return anyMode('held', 'held'); }
  function trySpawn() {
    if (active || !state || shownIndex < 0 || spawnDelay > 0) return;
    if (spawnBlocked()) return;
    const q = state.questions[shownIndex]; if (!q) return;
    const gate = acquire();
    activate(gate, q, shownIndex, reduced() ? targetZ() : Z_FAR);
    if (reduced()) { gate.age = 9; gate.g.position.y = 0; }
    active = gate;
  }

  // ---------- resolving a gate ----------
  function resolve(gate, ev) {
    if (active === gate) active = null;
    gate.mode = 'resolve'; gate.t = 0; gate.ev = ev; gate.z0 = gate.z; gate.impact = false; gate.resumed = false;
    gate.pick = ev.type === 'timeout' ? rs.lane : Math.max(0, LANES.indexOf(ev.choice));
    gate.correct = Math.max(0, LANES.indexOf(ev.correct));
    if (ev.type !== 'timeout' && gate.pick !== rs.lane) { rs.lane = gate.pick; rs.dash = 1; }
    gate.g.position.y = 0;
    // the answered gate is only scenery now: its doors must not take taps meant for the next question
    for (let k = 0; k < gate.doors.length; k++) gate.doors[k].door.userData.choiceId = null;
    gate.rush =reduced() ? .01 : Math.max(.16, Math.min(.38, (Z_CONTACT - gate.z) * .17));
    rs.reachGoal = ev.type === 'wrong' ? 1 : 0;
  }
  function impact(gate) {
    gate.impact = true; gate.t = 0; gate.z = Z_CONTACT; gate.g.position.set(0, 0, Z_CONTACT);
    const ev = gate.ev, px = LANE_X[gate.pick], gz = Z_CONTACT + .6;
    if (ev.type === 'right') {
      const big = celebrate(ev.streak || lastStreak + 1);
      lastStreak = big.level;
      paintDoor(gate.doors[gate.pick], 'right');
      gate.doors.forEach((o, k) => { if (k !== gate.pick) paintDoor(o, 'dim'); });
      gate.doors[gate.pick].portalM.color.copy(CREAM).lerp(GREEN, .25);
      spawnChunks(big.chunks, px, .5, gz, [GREEN, CREAM, A.bright, C(0xffd23f)], 3.2, 4.2, 4.2);
      ring(px, gz + .2, GREEN, 1.2 * big.ring);
      flash(px, 1.0, Z_CONTACT + .35, CREAM.clone().lerp(GREEN, .35), 4.2 * big.flash);
      lightBurst(px, Z_CONTACT, GREEN, 14 * big.flash);
      mark('right', px, 2.0, RUNNER_Z + .2, .95);
      rs.hop = 1; rs.look = 1; rs.auraGoal = big.aura;
      spawnDelay = reduced() ? .7 : .2;
    } else {
      const lost = lastStreak; lastStreak = 0; rs.auraGoal = 0;
      gate.doors.forEach((o, k) => paintDoor(o, k === gate.correct ? 'hint' : (ev.type === 'timeout' || k === gate.pick ? 'wrong' : 'dim')));
      gate.doors[gate.pick].shake = 1;
      spawnChunks(10, px, .5, gz, [RED, C(0xffb3ba), AMBER], 2.6, 3, 2.4);
      ring(px, gz + .2, RED, 1.0);
      lightBurst(px, Z_CONTACT, RED, 7);
      mark('wrong', ev.type === 'timeout' ? 0 : px, POST_H + .85, Z_CONTACT + .6, .95);
      engine.shake(lossShake(lost));
      rs.bump = 1; rs.stopped = true; rs.reachGoal = 0;
      gate.mode = 'held'; gate.held = 0;
    }
  }
  function releaseHeld(gate) { gate.mode = 'out'; gate.t = 0; rs.stopped = false; spawnDelay = Math.min(spawnDelay, .25); restoreFocus(); }

  // ---------- framing ----------
  // The camera frames the gate as large as the canvas allows (that is what makes the door signs readable on a phone), then
  // moves the near edge of the frame toward the camera just far enough to keep the runner's feet on screen. Re-done when
  // the canvas changes size (the shell's sheet height changes from question to question).
  let baseZ1 = FOCUS.z1, fitAspect = 0, focusShifted = false, probeT = 0, probeTries = 0;
  const probe = new THREE.Vector3(), feet = new THREE.Vector3(0, 0, RUNNER_Z + .5);
  const boxFor = (z1) => ({...FOCUS, z1});
  const snap = {...FOCUS_OPTS, ease: 0};
  function runnerInside(z1) {
    engine.setFocus(boxFor(z1), snap);
    const c = engine.worldToClient(feet), r = engine.renderer.domElement.getBoundingClientRect();
    // on a short canvas the feet may sit a little below the edge so the gate (and its signs) can be framed tighter
    return c.y <= r.top + r.height * (r.height < 300 ? 1.07 : .95);
  }
  function fitFrame() {
    fitAspect = engine.camera.aspect;
    let z1 = FOCUS.z1;
    if (!runnerInside(z1)) {
      let lo = z1, hi = RUNNER_Z + .6;
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (runnerInside(mid)) hi = mid; else lo = mid; }
      z1 = hi;
    }
    engine.setFocus(boxFor(baseZ1), snap);
    baseZ1 = z1;
    engine.setFocus(boxFor(z1), {...FOCUS_OPTS, ease: .35});
  }
  // The "Not quite" dialog covers the lower part of the canvas on phones (more on short ones). While a wrong pick is held,
  // look for it and re-frame so the runner and the glowing right door stay in the part of the canvas that remains visible.
  function probeDialog() {
    if (typeof document === 'undefined') return;
    const dlg = document.querySelector('[role="alertdialog"]');
    const cv = engine.renderer && engine.renderer.domElement;
    if (!dlg || !cv) return;
    const d = dlg.getBoundingClientRect(), c = cv.getBoundingClientRect();
    probeTries = 99;
    if (!c.height || d.width < c.width * .6 || d.top > c.bottom - 8 || d.top < c.top + c.height * .15) return;
    const limit = d.top - 14;
    probe.set(rs.x, 0, RUNNER_Z + .5);
    let lo = 0, hi = 16;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      engine.setFocus(boxFor(baseZ1 + mid), snap);
      if (engine.worldToClient(probe).y > limit) lo = mid; else hi = mid;
    }
    engine.setFocus(boxFor(baseZ1), snap);
    engine.setFocus(boxFor(baseZ1 + hi), FOCUS_OPTS);
    focusShifted = true;
  }
  function restoreFocus() {
    focusShifted = false; probeTries = 0; probeT = 0;
    engine.setFocus(boxFor(baseZ1), FOCUS_OPTS);
    fitAspect = 0; // measure again on the next frame (the canvas may have changed while the dialog was up)
  }

  // ---------- contract ----------
  function sync(s) {
    state = s;
    const idx = s.i < s.questions.length ? s.i : -1;
    if (idx !== shownIndex) {
      shownIndex = idx;
      if (active && active.index !== idx) retire(active);
    }
    trySpawn();
  }
  function event(ev) {
    if (ev.type === 'resume') {
      const held = gates.find((g) => g.mode === 'held');
      if (held) held.resumed = true;
      else if (gates.some((g) => g.mode === 'resolve' && g.ev && g.ev.type !== 'right')) pendingResume = true;
      return;
    }
    if (ev.type !== 'right' && ev.type !== 'wrong' && ev.type !== 'timeout') return;
    if (!state) return;
    const index = Number.isInteger(ev.index) ? ev.index : state.i;
    pendingResume = false;
    // a fast answer: finish whatever the previous gate was doing right away
    for (const g of gates) {
      if (g.mode === 'resolve' && !g.impact) impact(g);
      if (g.mode === 'held') releaseHeld(g);
    }
    let gate = active && active.index === index ? active : null;
    if (!gate) {
      const q = state.questions[index]; if (!q) return;
      if (active) retire(active);
      gate = acquire(); activate(gate, q, index, Z_HOLD); gate.g.position.y = 0;
    }
    resolve(gate, ev);
    spawnDelay = 0;
  }

  function update(dt) {
    time += dt;
    const rm = reduced();
    if (engine.camera.aspect !== fitAspect && !focusShifted && !anyHeld()) fitFrame();
    // ---- runner ----
    const tx = LANE_X[rs.lane];
    const dx = tx - rs.x;
    rs.x += dx * Math.min(1, dt * (rm ? 30 : 13));
    const g = runner.g;
    g.position.x = rs.x;
    rs.reach += (rs.reachGoal - rs.reach) * Math.min(1, dt * (rm ? 40 : rs.reachGoal > rs.reach ? 16 : 6));
    const running = !rs.stopped;
    const cyc = rm ? 0 : time * (7 + floorSpeed * 1.6), amp = running && !rm ? .75 : 0;
    runner.legs[0].rotation.x = Math.sin(cyc) * amp; runner.legs[1].rotation.x = -Math.sin(cyc) * amp;
    runner.arms[0].rotation.x = -Math.sin(cyc) * amp * .9; runner.arms[1].rotation.x = Math.sin(cyc) * amp * .9;
    runner.body.position.y = running && !rm ? Math.abs(Math.sin(cyc)) * .06 : 0;
    runner.body.rotation.z = rm ? 0 : dx * -.3;
    // squash and stretch: a long thin shape while dashing sideways, a squash when it lands, a stretch on the hop
    let sx = 1, sy = 1;
    if (!rm) {
      if (rs.dash > 0) { rs.dash = Math.max(0, rs.dash - dt * 3.2); const k = Math.sin(rs.dash * Math.PI); sx = 1 - .16 * k; sy = 1 + .18 * k; }
      sx += Math.min(.25, Math.abs(dx) * .12); sy -= Math.min(.2, Math.abs(dx) * .08);
    } else rs.dash = 0;
    if (rs.hop > 0) {
      rs.hop = Math.max(0, rs.hop - dt * 2.4);
      const k = 1 - rs.hop;
      g.position.y = rm ? 0 : Math.sin(k * Math.PI) * .45;
      if (!rm) { const st = k < .5 ? Math.sin(k * 2 * Math.PI / 2) : 0; sy += .14 * st; sx -= .08 * st; if (k > .85) { const sq = (k - .85) / .15; sy -= .14 * Math.sin(sq * Math.PI); sx += .1 * Math.sin(sq * Math.PI); } }
    } else g.position.y = 0;
    runner.body.scale.set(sx, sy, sx);
    if (rs.bump > 0) {
      rs.bump = Math.max(0, rs.bump - dt * 1.5);
      const k = 1 - rs.bump, kick = rm ? 0 : Math.sin(Math.min(1, k * 3) * Math.PI) * .4;
      g.position.z = RUNNER_Z - REACH * rs.reach + kick; runner.body.rotation.x = rm ? 0 : kick * 1.0;
      runner.head.rotation.y = rm ? 0 : Math.sin(k * 20) * .4 * rs.bump;
    } else { g.position.z = RUNNER_Z - REACH * rs.reach; runner.body.rotation.x = 0; }
    if (rs.look > 0) { rs.look = Math.max(0, rs.look - dt * 1.1); runner.head.rotation.y = rm ? 0 : Math.PI * .85 * Math.sin(Math.min(1, (1 - rs.look) * 1.6) * Math.PI); }
    else if (rs.bump <= 0) runner.head.rotation.y = 0;
    runner.bulbM.emissiveIntensity = rm ? 1.5 : 1.2 + .5 * Math.sin(time * 4);
    runner.ringM.opacity = rm ? .85 : .65 + .25 * Math.sin(time * 5);
    rs.aura += (rs.auraGoal - rs.aura) * Math.min(1, dt * 4);
    runner.auraM.opacity = rs.aura * (rm ? .5 : .6 + .15 * Math.sin(time * 7));
    runner.aura.scale.setScalar(2.0 + rs.aura * 1.4);
    for (let k = 0; k < laneStrips.length; k++) laneStrips[k].m.opacity = k === rs.lane ? .13 + (rm ? 0 : .04 * Math.sin(time * 4)) : 0;

    // ---- spawning ----
    if (spawnDelay > 0) spawnDelay = Math.max(0, spawnDelay - dt);
    trySpawn();

    // ---- gates ----
    let rush = 0;
    const timed = !!(state && state.timed), left = state ? Math.max(0, state.left) : 0;
    for (const gate of gates) {
      if (gate.mode === 'idle') continue;
      const prevZ = gate.z;
      if (gate.mode === 'approach') {
        gate.age += dt;
        const e = rm ? 1 : ease.out3(clamp01(gate.age / ARRIVE));
        const zEnd = targetZ();
        gate.z = Z_FAR + (zEnd - Z_FAR) * e;
        const r = rm ? 1 : ease.back(clamp01(gate.age / .5));
        gate.g.position.set(0, -(1 - r) * 2.4, gate.z);
        // timer: the lintel bar drains, goes amber then red and blinks in the last seconds
        const frac = timed ? clamp01(left / (state.travel || TRAVEL_SECONDS)) : 1;
        gate.lo.scale.x = 1;
        gate.barM.color.copy(A.bright);
        if (timed) {
          if (frac < .5) gate.barM.color.copy(AMBER);
          if (frac < .25) gate.barM.color.copy(RED);
          if (frac < .25 && !rm && Math.sin(time * 9) > 0) gate.barM.color.multiplyScalar(.45);
        }
        gate.lampM.color.copy(gate.barM.color);
      } else if (gate.mode === 'resolve') {
        gate.t += dt;
        if (!gate.impact) {
          const k = Math.min(1, gate.t / gate.rush);
          gate.z = gate.z0 + (Z_CONTACT - gate.z0) * (rm ? k : k * k);
          gate.g.position.set(0, 0, gate.z);
          if (k >= 1) impact(gate);
        } else {
          // right: the door swings open in a burst of light, the gate slides past the runner and sinks into the floor
          const d = gate.doors[gate.pick], t = gate.t;
          d.open = clamp01(t / (rm ? .01 : .22));
          d.leaf.rotation.y = (rm ? d.open : ease.back(d.open)) * 1.75;
          d.portalM.opacity = rm ? 1 : clamp01(t * 9) * (1 - clamp01((t - .45) / .3));
          if (!rm && t > .1) { gate.z += dt * 3.6; gate.g.position.z = gate.z; }
          if (!rm && t > .22) gate.g.position.y = -(t - .22) * 4.2;
          if (t >= (rm ? .65 : .8)) retire(gate);
        }
      } else if (gate.mode === 'held') {
        gate.held += dt;
        // the shut door pushes the gate back so all three signs, and the right door's glow, stay readable
        if (gate.held > .12 || rm) { gate.z += (Z_HOLD - gate.z) * (rm ? 1 : Math.min(1, dt * 6)); gate.g.position.z = gate.z; }
        const c = gate.doors[gate.correct];
        c.glowM.color.copy(GREEN).multiplyScalar(rm ? 1.6 : 1.3 + .6 * (.5 + .5 * Math.sin(time * 5)));
        const d = gate.doors[gate.pick];
        if (d.shake > 0 && !rm) {
          d.shake = Math.max(0, d.shake - dt * 2.2);
          d.leaf.rotation.y = Math.sin(d.shake * 40) * .05 * d.shake; d.door.position.z = -Math.sin(Math.min(1, (1 - d.shake) * 4) * Math.PI) * .09;
        }
        if (pendingResume) { gate.resumed = true; pendingResume = false; }
        if (!focusShifted && probeTries < 20) { probeT -= dt; if (probeT <= 0) { probeT = .12; probeTries++; probeDialog(); } }
        if (holdOver(gate.held, gate.resumed)) releaseHeld(gate);
      } else if (gate.mode === 'out') {
        gate.t += dt;
        const k = clamp01(gate.t / (rm ? .01 : .4));
        gate.g.position.y = -k * k * 2.6;
        if (k >= 1) retire(gate);
      }
      gate.vz = dt > 0 ? (gate.z - prevZ) / dt : 0;
      if (gate.mode === 'approach' || gate.mode === 'resolve') rush = Math.max(rush, Math.abs(gate.vz));
    }
    if (!active) trySpawn();

    // ---- floor and lamp posts stream toward the camera; faster while a gate glides in or rushes the runner ----
    const cruise = rs.stopped ? 0 : 1.5;
    const want = rm ? 0 : Math.max(cruise, rush * .9);
    floorSpeed += (want - floorSpeed) * Math.min(1, dt * 7);
    if (!rm && floorSpeed > .001) {
      const step = floorSpeed * dt;
      scrollDist += step;
      floorTex.offset.y = (floorTex.offset.y + step / TILE) % 1;
      glowTex.offset.y = floorTex.offset.y;
      placePosts();
    }

    // ---- effects ----
    updateChunks(dt);
    for (const r of rings) {
      if (r.t >= 1) { r.mesh.visible = false; continue; }
      r.t = Math.min(1, r.t + dt / r.life);
      r.mesh.scale.setScalar(reduced() ? r.size * 1.6 : r.size * (.6 + r.t * 2.2));
      r.m.opacity = .9 * (1 - r.t);
    }
    for (const gl of glows) {
      if (gl.t >= 1) { gl.s.visible = false; continue; }
      gl.t = Math.min(1, gl.t + dt / gl.life);
      const pop = reduced() ? 1 : .5 + .9 * ease.out3(Math.min(1, gl.t * 3));
      gl.s.scale.set(gl.size * pop, gl.size * pop, 1);
      gl.m.opacity = (1 - gl.t) * (1 - gl.t) * .95;
    }
    for (let mi = 0; mi < markList.length; mi++) {
      const k = markList[mi];
      if (k.t >= 1) { k.s.visible = false; continue; }
      k.t = Math.min(1, k.t + dt / k.life);
      const pop = reduced() ? 1 : Math.min(1, k.t * 7) * (1 + .18 * Math.sin(Math.min(1, k.t * 7) * Math.PI));
      k.s.scale.setScalar(k.size * Math.max(.01, pop));
      if (!reduced()) k.s.position.y = k.y + k.t * .3;
      k.m.opacity = k.t > .75 ? 1 - (k.t - .75) / .25 : 1;
    }
    if (L && lightBase) {
      lightK = Math.max(0, lightK - dt * 3.5);
      L.intensity = lightBase.i + lightK;
      if (lightK <= 0 && L.color.getHex() !== lightBase.c.getHex()) { L.color.copy(lightBase.c); L.position.copy(lightBase.p); }
    }
  }
  function dispose() {
    engine.scene.remove(root);
    if (L && lightBase) { L.intensity = lightBase.i; L.color.copy(lightBase.c); L.position.copy(lightBase.p); }
    gates.forEach((gt) => { gt.doors.forEach((d) => { d.label.dispose(); }); });
    kit.disposeTree(root);
    chunks.dispose(); posts.dispose(); lamps.dispose();
    disposables.forEach((d) => d.dispose && d.dispose()); disposables.length = 0;
    textures.forEach((t) => t.dispose()); textures.length = 0;
    gates.length = 0;
  }
  return {sync, event, update, dispose, get gates() { return gates; }, get runner() { return rs; }};
}

export default {id: 'lane', label: 'Steer', howTo, rules, createView};
