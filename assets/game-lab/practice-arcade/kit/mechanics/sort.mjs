// Mechanic 'sort' (label "Sort"): a conveyor across the front of the stage brings one item at a time; 3-4 labelled
// bins stand in an arc behind it. The player sends each item to the right bin. Timed runs: the conveyor carrying the
// item to the end of the belt is the timer.
//
// Level payload: prompt, bins: [{id, label}] (3-4), items: [{label, note?, answer: binId, why, prop?}] (8-10).
// An item may carry its own prop id; the 3D view uses item.prop || level.prop || 'block'.
// rules are PURE (no DOM, no three) and deterministic for a given seed; state is plain JSON.
// Item order is shuffled from the seed. Bin order stays as authored, so a bin keeps its place (and its number key)
// for the whole level. Events add two optional fields beyond the contract, used by the 3D view: choice (the picked
// bin id) and correct (the right bin id).

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
const labelOf = (state, id) => (state.bins.find((b) => b.id === id) || {label: String(id)}).label;
const miss = (state, it, type, extra) => ({type, correctLabel: labelOf(state, it.answer), why: it.why, review: {title: it.label, correct: labelOf(state, it.answer)}, correct: it.answer, ...extra});

function advance(state, events) {
  const next = {...state, i: state.i + 1, left: state.travel};
  if (next.i >= next.items.length) events.push({type: 'done'});
  return next;
}

export const rules = {
  init(level, {seed = 1, timed = false} = {}) {
    const rnd = rng(seed);
    const items = shuffle(level.items, rnd).map((it) => ({label: it.label, note: it.note ? String(it.note) : '', answer: it.answer, why: it.why, prop: it.prop ? String(it.prop) : ''}));
    return {
      mechanic: 'sort',
      timed: !!timed,
      travel: TRAVEL_SECONDS,
      left: TRAVEL_SECONDS,
      prompt: level.prompt,
      bins: level.bins.map((b) => ({id: b.id, label: b.label})),
      items,
      i: 0
    };
  },
  view(state) {
    const it = state.items[state.i] || null;
    return {
      card: it ? {title: it.label, lines: it.note ? [it.note] : []} : null,
      prompt: it ? state.prompt : '',
      choices: state.bins.map((b) => ({id: b.id, label: b.label, done: false})),
      progress: {done: Math.min(state.i, state.items.length), total: state.items.length},
      timer: state.timed && it ? {left: Math.max(0, state.left), total: state.travel} : null
    };
  },
  act(state, choiceId) {
    const it = state.items[state.i];
    if (!it || !state.bins.some((b) => b.id === choiceId)) return {state, events: []};
    const events = [];
    if (choiceId === it.answer) events.push({type: 'right', why: it.why, choice: choiceId, correct: it.answer});
    else events.push(miss(state, it, 'wrong', {choice: choiceId}));
    return {state: advance(state, events), events};
  },
  tick(state, dt) {
    const it = state.items[state.i];
    if (!state.timed || !it || !(dt > 0)) return {state, events: []};
    const left = state.left - dt;
    if (left > 0) return {state: {...state, left}, events: []};
    const events = [miss(state, it, 'timeout')];
    return {state: advance(state, events), events};
  },
  hint(state) {
    const it = state.items[state.i];
    return it ? it.answer : null;
  },
  done(state) { return state.i >= state.items.length; }
};

function howTo(level) {
  const n = (level.bins || []).length || 3;
  return [
    'A conveyor brings items one at a time. Read each one.',
    `Send it to the right one of the ${n} bins.`,
    'Tap a button below, or tap a bin in the scene.'
  ];
}

// ---------------------------------------------------------------------------------------------
// 3D view. ctx = {THREE, engine, look, world, theme, level, props, reduced, accent}
// "Toy diorama" layout, framed with engine.setFocus so belt and bins fill the canvas:
//   a chunky conveyor runs across the front (z = 1.2): a feeder chute on the left, the item (big, with its name tag
//   riding above it) and a stop post on the right. 3-4 rounded bins stand in a shallow arc behind it. Each bin has an
//   upright sign (kit.label, wrapped, never cut) and a number badge that matches the button's number key.
// Right: anticipation squash, a stretched hop into the bin, landing squash, the bin lights up, particles, the pile
// grows (bigger from streak 3). Wrong: hop at the wrong bin, red flash and shake, the right bin glows with an arrow
// until the shell sends {type: 'resume'}. Reduced motion: straight slides, colour changes only.
function createView(ctx) {
  const {THREE, engine, look, theme, level, props} = ctx;
  const kit = engine.kit;
  const reduced = () => !!(ctx.reduced || engine.reduced);
  const root = new THREE.Group(); root.name = 'sort-view'; engine.scene.add(root);

  // ---------- colour ----------
  const mood = engine.mood || {};
  const night = mood.id === 'night';
  const glow = typeof mood.glow === 'number' ? mood.glow : .6;
  const acc = (ctx.accent && ctx.accent.bright) ? ctx.accent : (typeof look.accentSet === 'function' ? look.accentSet(theme.accent || '#2b7bb9') : null);
  const fallback = new THREE.Color(theme.accent || '#2b7bb9');
  const A = acc || {base: fallback, bright: fallback.clone().offsetHSL(0, 0, .12), dark: fallback.clone().offsetHSL(0, 0, -.18), soft: fallback.clone().offsetHSL(0, 0, .35)};
  const hexOf = (c) => '#' + c.getHexString();
  const GREEN = new THREE.Color(0x45d27a), RED = new THREE.Color(0xff4b57), GOLD = new THREE.Color(0xffd45a), AMBER = new THREE.Color(0xffb02e);
  const IDLE = A.bright.clone();
  const bodyCol = night ? A.dark.clone().lerp(new THREE.Color(0x141c33), .55) : A.dark.clone();
  const innerCol = bodyCol.clone().multiplyScalar(.38);
  const RIM_BASE = .35 + glow * .75;

  // ---------- layout ----------
  // The belt runs across the front. The item's name tag stands in FRONT of the belt (below the item on screen), so it
  // never covers a bin or its sign. The bins stand behind the belt in one of two layouts, picked from the canvas shape:
  //   'row'   every bin in one shallow arc (wide canvases, and always for 1-2 bins);
  //   'block' 3-4 bins in a 2-wide block (tall phone canvases), so each sign is wide enough for big text.
  const Z_BELT = .7, BELT_TOP = .17, X_ENTER = -2.5, X_START = -1.1, X_HOLD = 0, X_END = 1.8, BELT_X0 = -2.6, BELT_X1 = 2.4;
  const Z_TAG = Z_BELT + 1.05;
  const ITEM_MIN = 1.9, ITEM_MAX = 3.4, ITEM_MAX_W = 1.45, ITEM_SHARE = .17; // share of canvas width
  let itemScale = 2.3; // world scale for the next item, re-solved from engine.pxPerUnit so the item is about 17% wide
  const textures = [];
  const own = (t) => { textures.push(t); t.userData.cached = true; return t; };

  // ---------- conveyor across the front ----------
  const BELT_LEN = BELT_X1 - BELT_X0, beltMid = (BELT_X0 + BELT_X1) / 2, REP = 8;
  const beltTex = own(look.canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = night ? '#1b2335' : '#3d4657'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.strokeStyle = hexOf(A.bright); g.globalAlpha = .95; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(40, 30); g.lineTo(84, 64); g.lineTo(40, 98); g.stroke();
  }, {repeat: [REP, 1], aniso: 8}));
  const beltBaseM = kit.own({color: bodyCol, roughness: .5, metalness: .08});
  root.add(kit.box(BELT_LEN, .16, 1.42, beltBaseM, beltMid, 0, Z_BELT, .07));
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(BELT_LEN - .08, 1.04), kit.own({map: beltTex, emissive: new THREE.Color(0xffffff), emissiveMap: beltTex, emissiveIntensity: .22 + glow * .3, roughness: .8, metalness: 0}));
  belt.rotation.x = -Math.PI / 2; belt.position.set(beltMid, BELT_TOP - .006, Z_BELT); belt.receiveShadow = true; root.add(belt);
  const railM = kit.own({color: A.base, emissive: A.bright, emissiveIntensity: RIM_BASE, roughness: .35, metalness: 0, toneMapped: false});
  [-.62, .62].forEach((dz) => root.add(kit.box(BELT_LEN + .06, .11, .13, railM, beltMid, .1, Z_BELT + dz + (dz > 0 ? .02 : -.02), .045)));
  // feeder chute on the left (a chunky hopper with a glowing lip)
  const chuteM = kit.own({color: A.dark.clone().lerp(new THREE.Color(0x222a3a), night ? .2 : .1), roughness: .5, metalness: .1});
  root.add(kit.box(.2, 1.35, 1.4, chuteM, BELT_X0 - .02, 0, Z_BELT, .08));
  root.add(kit.box(.95, .22, 1.46, chuteM, BELT_X0 + .38, 1.2, Z_BELT, .08));
  const lipM = kit.own({color: A.base, emissive: A.bright, emissiveIntensity: RIM_BASE * 1.3, roughness: .3, toneMapped: false});
  root.add(kit.box(.9, .06, 1.34, lipM, BELT_X0 + .38, 1.18, Z_BELT, .02));
  // stop post on the right: the end of the belt (amber when time runs low, red on a timeout)
  const endM = kit.own({color: A.base, emissive: IDLE.clone(), emissiveIntensity: .5, roughness: .3, toneMapped: false});
  [-.62, .62].forEach((dz) => root.add(kit.box(.18, .95, .18, chuteM, BELT_X1 + .04, 0, Z_BELT + dz, .07)));
  root.add(kit.box(.14, .14, 1.42, endM, BELT_X1 + .04, .82, Z_BELT, .04));
  const endFx = {color: IDLE.clone(), t: 0};

  // ---------- bins ----------
  const bins = new Map();
  const list = level.bins || [];
  const n = Math.max(1, list.length);
  // Reading order = number order in both layouts. Block: bin 1 at the back left (a third bin stands alone in the front
  // row); more than 4 bins use rows of 3. Bodies are built once at the block width and stretched along x for a row;
  // the pile sits in its own group so it is never stretched. Signs are billboards (they always face the camera, so they
  // never lean away) raised above the rim, so a pile cannot cover them; they are rebuilt only when the layout changes.
  const binD = 1.0, wallH = .46, SIGN_LIFT = .4, BIN_W0 = 2.15;
  // a long label gets a taller sign so it can wrap onto two big lines instead of shrinking onto one small line
  const longest = Math.max(0, ...list.map((b) => String(b.label).length));
  const LAYOUTS = {
    row: (() => {
      const sp = Math.min(2.7, 5.75 / n);
      return {id: 'row', cols: n, rows: 1, spacing: sp, binW: Math.min(BIN_W0, sp - .22), signW: Math.min(2.3, sp - .1), signH: longest > 10 || n >= 4 ? .9 : .7, gap: 0, front: Z_BELT - 2.05};
    })(),
    block: {id: 'block', cols: n <= 4 ? 2 : 3, rows: Math.ceil(n / (n <= 4 ? 2 : 3)), spacing: n <= 4 ? 2.7 : 1.95, binW: n <= 4 ? BIN_W0 : 1.7, signW: n <= 4 ? 2.45 : 1.85, signH: longest > 12 ? .98 : .74, gap: 2.5, front: Z_BELT - 1.8}
  };
  let L = null, layoutId = '';
  const signBg = night ? '#122038' : '#fffaf1', signFg = night ? '#eaf6ff' : '#141c29';
  const ringGeo = new THREE.RingGeometry(.5, .62, 48);
  const hitM = new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false});
  const hitGeo = new THREE.BoxGeometry(1, 1, 1);
  const innerM = kit.own({color: innerCol, roughness: .9, metalness: 0});
  const binM = kit.own({color: bodyCol, roughness: .5, metalness: .06});
  const badgeGeo = new THREE.PlaneGeometry(.46, .46);
  const signY = () => wallH + SIGN_LIFT + L.signH / 2; // sign centre height (inside the bin group)
  const signZ = -binD / 2 + .08;
  list.forEach((b, i) => {
    const g = new THREE.Group(); g.name = 'bin-' + b.id; g.userData.choiceId = b.id;
    const body = new THREE.Group(); g.add(body);
    const pileG = new THREE.Group(); g.add(pileG);
    const W = BIN_W0;
    // floor pad with an accent rim, then the open tub
    const padM = kit.own({color: A.base, emissive: A.bright, emissiveIntensity: RIM_BASE * .45, roughness: .45, metalness: 0, toneMapped: false});
    body.add(kit.box(W + .34, .05, binD + .34, padM, 0, 0, 0, .02));
    body.add(kit.box(W, .1, binD, binM, 0, .05, 0, .045));
    body.add(kit.box(W - .16, .02, binD - .16, innerM, 0, .15, 0, .005));
    body.add(kit.box(W, wallH, .12, binM, 0, .05, binD / 2 - .06, .05));
    body.add(kit.box(W, wallH, .12, binM, 0, .05, -binD / 2 + .06, .05));
    body.add(kit.box(.12, wallH, binD, binM, W / 2 - .06, .05, 0, .05));
    body.add(kit.box(.12, wallH, binD, binM, -W / 2 + .06, .05, 0, .05));
    const rimM = kit.own({color: A.base, emissive: A.bright.clone(), emissiveIntensity: RIM_BASE, roughness: .35, metalness: 0, toneMapped: false});
    const top = wallH + .05;
    body.add(kit.box(W + .05, .07, .14, rimM, 0, top - .02, binD / 2 - .06, .03));
    body.add(kit.box(W + .05, .07, .14, rimM, 0, top - .02, -binD / 2 + .06, .03));
    body.add(kit.box(.14, .07, binD, rimM, W / 2 - .06, top - .02, 0, .03));
    body.add(kit.box(.14, .07, binD, rimM, -W / 2 + .06, top - .02, 0, .03));
    // a short post holds the raised sign up off the back wall
    body.add(kit.box(.1, SIGN_LIFT + .12, .08, binM, 0, top - .05, -binD / 2 + .06, .03));
    // number badge (matches the button's number key); re-parented onto the sign whenever the sign is rebuilt
    const bt = own(look.canvasTexture(128, 128, (c, w) => {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, w / 2, 62, 0, Math.PI * 2); c.fill();
      c.fillStyle = hexOf(A.dark); c.beginPath(); c.arc(w / 2, w / 2, 52, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.font = '800 80px system-ui, "Segoe UI", Roboto, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), w / 2, w / 2 + 5);
    }, {aniso: 4}));
    const badge = new THREE.Mesh(badgeGeo, kit.basic({map: bt, transparent: true, toneMapped: false}));
    badge.renderOrder = 4;
    // soft contact shadow, floor ring (the shockwave), halos for right (green) and wrong (red)
    const blob = look.makeBlob(W * 1.5, binD * 1.6, .38); g.add(blob);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color: GREEN, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false}));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .06; g.add(ring);
    const haloG = kit.glow(g, 0x45d27a, 1, 0, wallH + .5, .15), haloR = kit.glow(g, 0xff4b57, 1, 0, wallH + .5, .15);
    haloG.scale.set(.001, .001, 1); haloR.scale.set(.001, .001, 1);
    const hit = new THREE.Mesh(hitGeo, hitM); g.add(hit);
    root.add(g);
    bins.set(b.id, {id: b.id, label: b.label, index: i, g, body, pileG, blob, rimM, padM, ring, haloG, haloR, badge, hit, sign: null, x: 0, z: 0, sx: 1, pile: 0, fx: null, squash: 0});
  });
  // where the pile's slot-th item rests inside a bin (pile group space; the pile keeps to the front half of the tub)
  const pileSpot = (slot, out) => {
    const s6 = slot % 6, col = s6 % 3, row = Math.floor(s6 / 3), w = L.binW;
    return out.set((col - 1) * w * .27 + (row ? w * .1 : 0), .22 + row * .24, .14 - row * .12);
  };
  function relayout(id) {
    if (id === layoutId) return;
    layoutId = id; L = LAYOUTS[id];
    for (const b of bins.values()) {
      const i = b.index, row = Math.floor(i / L.cols), inRow = Math.min(L.cols, n - row * L.cols);
      const x = ((i - row * L.cols) - (inRow - 1) / 2) * L.spacing;
      const z = L.front - (L.rows - 1 - row) * L.gap + (L.rows === 1 ? .06 * x * x : 0);
      b.x = x; b.z = z; b.sx = L.binW / BIN_W0;
      b.g.position.set(x, 0, z); b.g.rotation.y = L.rows === 1 ? Math.atan2(-x, 14) * .8 : 0;
      b.body.scale.set(b.sx, 1, 1);
      b.blob.scale.set(b.sx, 1, 1);
      b.ring.scale.set(L.binW * 1.1, binD * 1.4, 1);
      b.hit.scale.set(Math.min(L.spacing - .04, L.binW + .4), wallH + SIGN_LIFT + L.signH + .3, binD + .7);
      b.hit.position.set(0, b.hit.scale.y / 2, -.1);
      if (b.sign) { b.sign.remove(b.badge); b.g.remove(b.sign); kit.disposeTree(b.sign); }
      const sign = kit.label(b.label, {w: L.signW, h: L.signH, maxLines: 2, maxFont: .38, minFont: .14, billboard: true, accent: A.base, bg: signBg, fg: signFg, depth: .06, weight: 800});
      sign.position.set(0, signY(), signZ);
      b.badge.position.set(-L.signW / 2 + .05, L.signH / 2 - .03, .08); sign.add(b.badge);
      b.g.add(sign); b.sign = sign;
      b.pileG.children.forEach((c) => { if (c.userData.slot !== undefined) pileSpot(c.userData.slot, c.position); });
      b.g.updateMatrixWorld(true);
    }
  }
  relayout(n >= 3 ? 'block' : 'row');
  const binTop = (id, up = .3) => { const b = bins.get(id); return b ? new THREE.Vector3(b.x, wallH + up, b.z + .05) : new THREE.Vector3(0, 1, -2); };
  const binFront = (id) => { const b = bins.get(id); return b ? new THREE.Vector3(b.x * .98, wallH + .5, b.z + binD / 2 + .2) : new THREE.Vector3(0, 1, -1); };
  // Tick and cross sit on the sign's top-right corner (the number badge owns the top-left), clear of the centred text.
  const markPos = (id) => {
    const b = bins.get(id);
    return b ? new THREE.Vector3(b.x + L.signW / 2 - .22, signY() + L.signH / 2 + .05, b.z + signZ + .2) : new THREE.Vector3(0, 2, -2);
  };

  // ---------- small shared pieces ----------
  const disc = (fill) => (g, w) => { g.fillStyle = fill; g.beginPath(); g.arc(w / 2, w / 2, 58, 0, Math.PI * 2); g.fill(); };
  const markTex = {
    right: own(look.canvasTexture(128, 128, (g, w) => { disc('#35b86a')(g, w); g.strokeStyle = '#fff'; g.lineWidth = 15; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(36, 66); g.lineTo(56, 87); g.lineTo(93, 44); g.stroke(); }, {aniso: 1})),
    wrong: own(look.canvasTexture(128, 128, (g, w) => { disc('#e0414d')(g, w); g.strokeStyle = '#fff'; g.lineWidth = 15; g.lineCap = 'round'; g.beginPath(); g.moveTo(42, 42); g.lineTo(86, 86); g.moveTo(86, 42); g.lineTo(42, 86); g.stroke(); }, {aniso: 1}))
  };
  const arrowTex = own(look.canvasTexture(128, 160, (g, w) => {
    g.fillStyle = '#35b86a'; g.beginPath(); g.arc(w / 2, 64, 60, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 26, 112); g.lineTo(w / 2 + 26, 112); g.lineTo(w / 2, 156); g.closePath(); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 13; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(w / 2, 30); g.lineTo(w / 2, 96); g.moveTo(w / 2 - 24, 72); g.lineTo(w / 2, 96); g.lineTo(w / 2 + 24, 72); g.stroke();
  }, {aniso: 1}));
  const arrow = new THREE.Sprite(new THREE.SpriteMaterial({map: arrowTex, transparent: true, depthTest: false, toneMapped: false}));
  arrow.scale.set(.6, .6 * 160 / 128, 1); arrow.renderOrder = 18; arrow.visible = false; root.add(arrow);
  const itemRingM = new THREE.MeshBasicMaterial({color: A.bright, transparent: true, opacity: .9, side: THREE.DoubleSide, toneMapped: false, depthWrite: false});
  const itemRingGeo = new THREE.RingGeometry(.74, .86, 48); itemRingGeo.userData.cached = true; // shared by every item; dispose() frees both

  // particle pool: one Points object, no allocations per frame
  const MAXP = 80;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pBase = new Float32Array(MAXP * 3), pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP), pDur = new Float32Array(MAXP);
  for (let i = 0; i < MAXP; i++) pPos[i * 3 + 1] = -50;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const dotTex = own(look.canvasTexture(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, {aniso: 1}));
  const pMat = new THREE.PointsMaterial({size: .26, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true});
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 16; root.add(points);
  let pAlive = 0;
  function emit(pos, color, count, speed, up = 3) {
    if (reduced()) return;
    for (let i = 0; i < MAXP && count > 0; i++) {
      if (pLife[i] > 0) continue;
      count--;
      const a = Math.random() * Math.PI * 2, s = speed * (.45 + Math.random() * .75), j = i * 3;
      pPos[j] = pos.x; pPos[j + 1] = pos.y; pPos[j + 2] = pos.z;
      pVel[j] = Math.cos(a) * s; pVel[j + 1] = up * (.6 + Math.random() * .7); pVel[j + 2] = Math.sin(a) * s * .7;
      pBase[j] = color.r; pBase[j + 1] = color.g; pBase[j + 2] = color.b;
      pDur[i] = pLife[i] = .65 + Math.random() * .45; pAlive++;
    }
  }
  function stepParticles(dt) {
    if (!pAlive) return;
    for (let i = 0; i < MAXP; i++) {
      if (pLife[i] <= 0) continue;
      const j = i * 3;
      pLife[i] -= dt;
      if (pLife[i] <= 0) { pPos[j + 1] = -50; pCol[j] = pCol[j + 1] = pCol[j + 2] = 0; pAlive--; continue; }
      pVel[j + 1] -= 8 * dt;
      pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
      const k = pLife[i] / pDur[i];
      pCol[j] = pBase[j] * k; pCol[j + 1] = pBase[j + 1] * k; pCol[j + 2] = pBase[j + 2] * k;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- state ----------
  let state = null, shownIndex = -1, item = null, spawnDelay = 0, time = 0, beltSpeed = 0, waitResume = false, waitT = 0, lastStreak = 0, focusKey = '';
  let wantW = 1.1; // world width the item should have on screen (from ITEM_SHARE of the canvas width)
  const moving = [], fx = [];
  const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const ease = (k) => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // The focus box is the item's name tag in front of the belt, the belt, and the bins up to their sign tops. Pitch 40
  // everywhere. On a tall canvas the box is width-limited and the solver would split the spare height above and below,
  // leaving empty floor under the belt. So the box grows upward (y1) as far as it can without the camera pulling back:
  // the belt and its tag sit near the bottom margin and the room shows above. Re-solved when the bucket changes.
  function focusBox() {
    const back = Math.min(...[...bins.values()].map((b) => b.z));
    return {x0: -2.62, x1: 2.62, z0: (Number.isFinite(back) ? back : -2) - binD / 2 - .15, z1: Z_TAG + .18, y0: 0, y1: wallH + SIGN_LIFT + L.signH + .15};
  }
  const FOCUS_OPTS = {pitch: 40, margin: .035};
  const camDepth = () => { const v = engine.view, p = (v.pitch || 40) * Math.PI / 180; return -(v.ty * Math.sin(p) + v.tz * Math.cos(p)) - v.dist; };
  function setFocusLifted(box, ease) {
    const o = {...FOCUS_OPTS, ease};
    engine.setFocus(box, o);
    if (!engine.view || !Number.isFinite(engine.view.dist)) return;
    const d0 = camDepth(), tol = .004 * engine.view.dist;
    let lo = 0, hi = 9;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      engine.setFocus({...box, y1: box.y1 + mid}, o);
      if (camDepth() >= d0 - tol) lo = mid; else hi = mid;
    }
    engine.setFocus({...box, y1: box.y1 + lo * .97}, o);
  }
  function applyFocus(force) {
    const sz = engine.size || {w: 0, h: 0};
    if (!(sz.w > 0 && sz.h > 0)) return false;
    const asp = sz.w / sz.h;
    relayout(n >= 3 ? 'block' : 'row');
    const key = layoutId + Math.round(asp * 40);
    if (!force && key === focusKey) return true;
    focusKey = key;
    setFocusLifted(focusBox(), force ? 0 : .35);
    return true;
  }
  if (!applyFocus(true)) engine.setFocus(focusBox(), {...FOCUS_OPTS, ease: 0});
  // the item is the thing being judged: aim for ITEM_SHARE of the canvas width at the hold point (capped in world size)
  function solveItemSize() {
    const sz = engine.size;
    if (!(sz && sz.w > 0) || typeof engine.pxPerUnit !== 'function') return;
    const ppu = engine.pxPerUnit(tmpV.set(X_HOLD, BELT_TOP + .4, Z_BELT));
    if (ppu > 0 && Number.isFinite(ppu)) wantW = Math.min(ITEM_MAX_W, ITEM_SHARE * sz.w / ppu);
  }
  solveItemSize();
  const itemTarget = (it) => clamp(wantW / it.baseW, ITEM_MIN, ITEM_MAX);

  // in a pile every prop ends up about the same small width, whatever its size on the belt
  const pileRatio = (it) => clamp(.56 / it.baseW, .8, 1.6) / it.base;
  const squashBody = (it, sq) => it.body.scale.set(it.base * (1 - sq * .5), it.base * (1 + sq), it.base * (1 - sq * .5));

  function spawn(data, index) {
    const g = new THREE.Group(); g.name = 'item-' + index;
    const body = props.make(data.prop || level.prop || 'block', {accent: A.base.clone()});
    g.add(body);
    // measure the prop at scale 1 so every prop ends up about the same on-screen width
    body.updateMatrixWorld(true); tmpBox.setFromObject(body); tmpBox.getSize(tmpS);
    const baseW = clamp(Math.max(tmpS.x, tmpS.z * .8), .25, 1.2);
    const it0 = {baseW, base: 0};
    it0.base = itemTarget(it0);
    body.scale.setScalar(it0.base);
    const blob = look.makeBlob(1.6, 1.2, .42); blob.position.y = .004; g.add(blob);
    const ringM = new THREE.Mesh(itemRingGeo, itemRingM); ringM.userData.keepMat = true; ringM.rotation.x = -Math.PI / 2; ringM.position.y = .02; g.add(ringM);
    // the name tag stands on the floor in front of the belt (under the item on screen): sized to its text, one or two
    // lines, wrapped, never cut. A billboard tilts back with the camera, so its centre is lifted to keep the bottom up.
    const len = String(data.label).length, tw = clamp(.8 + len * .17, 1.6, 3.4), two = len * .17 > tw - .6, th = two ? .9 : .58;
    const tag = kit.label(data.label, {w: tw, h: th, maxLines: 2, maxFont: .36, minFont: .16, billboard: true, accent: A.base, bg: signBg, fg: signFg, depth: .06, weight: 800});
    tag.position.set(0, th * .4 + .04 - BELT_TOP, Z_TAG - Z_BELT); tag.userData.halfW = tw / 2; g.add(tag);
    g.position.set(X_ENTER, BELT_TOP, Z_BELT); g.scale.setScalar(.6);
    root.add(g);
    item = {g, body, tag, blob, ring: ringM, index, age: 0, baseW, base: it0.base};
    sizeRing(item);
  }
  // the accent ring under the item follows its size
  function sizeRing(it) { const r = clamp(it.baseW * it.base * .62, .7, 1.1); it.ring.scale.set(r, r * .72, 1); it.ringR = r; }
  function targetX() {
    if (!item) return X_START;
    // timed: the belt carries the item toward the stop post (the timer). Reduced motion: it waits at the hold point and
    // the shell's timer bar alone shows the time, so nothing in the scene drifts.
    if (state && state.timed && !reduced()) return X_START + (X_END - X_START) * Math.min(1, Math.max(0, 1 - Math.max(0, state.left) / state.travel));
    return X_HOLD;
  }
  function mark(kind, pos, size = .85) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: markTex[kind], transparent: true, depthTest: false, toneMapped: false}));
    s.position.copy(pos); s.scale.setScalar(.01); s.renderOrder = 20; root.add(s);
    const red = reduced();
    fx.push({t: 0, life: red ? 1.5 : 1.25, update(k) {
      const pop = red ? 1 : Math.min(1, k * 6) * (1 + .18 * Math.sin(Math.min(1, k * 6) * Math.PI));
      s.scale.setScalar(size * Math.max(.01, pop));
      if (!red) s.position.y = pos.y + k * .12;
      s.material.opacity = k > .75 ? 1 - (k - .75) / .25 : 1;
    }, done() { root.remove(s); s.material.dispose(); }});
  }
  // Light a bin: a short flash, or a held highlight (the right bin while the feedback sheet is up).
  function flashBin(id, color, {delay = 0, life = 1.1, strength = 1, hold = 0, size = 2} = {}) {
    const b = bins.get(id); if (!b) return;
    b.fx = {color: color.clone(), red: color === RED, t: -delay, life: reduced() ? life * 1.4 : life, strength, hold, size};
  }
  function releaseHolds() { for (const b of bins.values()) if (b.fx && b.fx.hold > 0) { b.fx.hold = 0; b.fx.t = 0; } }
  function setEnd(color, life = 1) { endFx.color.copy(color); endFx.t = life; }

  // A hop: arc from a to b with a stretch in the air and a spin. then() runs on landing and returns true.
  function hop(it, a, b, dur, height, s0, s1, then, spin = 1) {
    return {t: 0, update(dt) {
      this.t += dt;
      const k = Math.min(1, this.t / dur), e = ease(k), red = reduced();
      it.g.position.lerpVectors(a, b, e);
      it.g.position.y += Math.sin(e * Math.PI) * height;
      it.g.scale.setScalar(s0 + (s1 - s0) * e);
      if (!red) { squashBody(it, Math.sin(e * Math.PI) * .22); it.body.rotation.y = e * Math.PI * 2 * spin; }
      if (k >= 1) { it.body.rotation.y = 0; if (!red) squashBody(it, 0); return then ? then() : true; }
      return false;
    }};
  }
  // a short crouch before a jump (anticipation); amount > 0 crouches
  function squashStep(it, dur, amount) {
    return {t: 0, update(dt) {
      if (reduced()) return true;
      this.t += dt;
      const k = Math.min(1, this.t / dur);
      squashBody(it, -amount * Math.sin(k * Math.PI / 2));
      return k >= 1;
    }};
  }
  function wait(sec) { return {t: 0, update(dt) { this.t += dt; return this.t >= sec; }}; }
  function settleInBin(it, id, power) {
    // drop into the bin and stay there as part of a growing pile (a child of the bin's pile group, so the bin squash
    // moves it but the row layout's x stretch does not)
    const b = bins.get(id);
    let slot = 0, dest = null, from = null, s0 = 1, phase = 0, t2 = 0;
    return {t: 0, update(dt) {
      if (!b) return true;
      if (!dest) {
        slot = b.pile++;
        b.pileG.attach(it.g); it.g.userData.slot = slot;
        dest = pileSpot(slot, new THREE.Vector3());
        from = it.g.position.clone(); s0 = it.g.scale.x;
        it.tag.visible = false; it.blob.visible = false; it.ring.visible = false;
      }
      if (phase === 0) {
        this.t += dt;
        const k = Math.min(1, this.t / (reduced() ? .4 : .24));
        it.g.position.lerpVectors(from, dest, k * k);
        it.g.scale.setScalar(s0 + (pileRatio(it) - s0) * k);
        it.g.rotation.y = ((slot * 1.3) % 1 - .5) * .9;
        if (k >= 1) { phase = 1; b.squash = reduced() ? 0 : power; }
        return false;
      }
      if (reduced()) return 'keep';
      t2 += dt;
      const k = Math.min(1, t2 / .28);
      squashBody(it, -.3 * (1 - k) * (1 - k) * Math.cos(k * Math.PI * 2.5));
      if (k >= 1) { squashBody(it, 0); return 'keep'; }
      return false;
    }};
  }

  function exit(ev) {
    if (!item) return;
    const it = item; item = null;
    it.tag.visible = false; it.ring.visible = false;
    const from = it.g.position.clone();
    const red = reduced(), slow = red ? 1.35 : 1;
    if (ev.type === 'right') {
      const streak = Math.max(1, ev.streak || 1), power = streak >= 3 ? 1 + Math.min(1, (streak - 2) * .3) : 1;
      lastStreak = streak;
      const to = binTop(ev.choice, .35);
      const steps = [
        squashStep(it, .1, .24),
        hop(it, from, to, .5 * slow, red ? 0 : 1.5 + .12 * (power - 1), 1, pileRatio(it) * 1.1, () => {
          flashBin(ev.choice, streak >= 3 ? GOLD.clone().lerp(GREEN, .45) : GREEN, {life: 1.2, strength: Math.min(1.4, power), size: 1.8 + power * .8});
          emit(to.clone().setY(wallH + .3), GREEN, Math.round(14 * power), 1.9 * power);
          if (streak >= 3) emit(to.clone().setY(wallH + .3), A.bright, Math.round(10 * power), 2.4 * power, 3.8);
          if (streak >= 5) emit(to.clone().setY(wallH + .3), GOLD, 14, 2.8, 4.4);
          mark('right', markPos(ev.choice), .7 + (power - 1) * .2);
          return true;
        }, streak % 2 ? 1 : -1),
        settleInBin(it, ev.choice, power)
      ];
      moving.push({it, steps});
      spawnDelay = .5;
    } else if (ev.type === 'wrong') {
      // hop at the wrong bin, bounce off its rim, back to the belt, then into the right bin (shown while the sheet is up)
      // the bounce point is low and in front of the tub, and the item shrinks for the hop, so the sign stays readable
      const wb = bins.get(ev.choice);
      const rim = wb ? new THREE.Vector3(wb.x * .98, wallH + .2, wb.z + binD / 2 + .5) : binFront(ev.choice), back = new THREE.Vector3(from.x * .5, BELT_TOP + .05, Z_BELT - .15), to = binTop(ev.correct, .35);
      const amt = .6 + Math.min(.6, lastStreak * .07);
      lastStreak = 0;
      const steps = [
        squashStep(it, .1, .24),
        hop(it, from, rim, .42 * slow, red ? 0 : .8, 1, .62, () => {
          flashBin(ev.choice, RED, {life: 1.3});
          mark('wrong', markPos(ev.choice), .7);
          engine.shake(amt);
          emit(rim, RED, 16, 1.6, 2.4);
          flashBin(ev.correct, GREEN, {delay: .45, life: 1, strength: .9, hold: 1e9});
          return true;
        }, .5),
        hop(it, rim, back, .5 * slow, red ? 0 : .7, .62, 1, null, -.5),
        wait(.3),
        hop(it, back, to, .6 * slow, red ? 0 : 1.5, 1, pileRatio(it) * 1.1, () => { emit(to.clone().setY(wallH + .3), GREEN, 10, 1.5); return true; }),
        settleInBin(it, ev.correct, 1)
      ];
      moving.push({it, steps});
      waitResume = true; waitT = 0; spawnDelay = 0;
    } else if (ev.type === 'timeout') {
      lastStreak = 0;
      setEnd(RED, 1.6);
      mark('wrong', new THREE.Vector3(BELT_X1 - .3, 1.4, Z_BELT));
      engine.shake(.5);
      emit(new THREE.Vector3(BELT_X1, .6, Z_BELT), RED, 12, 1.5, 2.4);
      flashBin(ev.correct, GREEN, {delay: .4, life: 1, strength: .9, hold: 1e9});
      const end = new THREE.Vector3(BELT_X1 + .6, -.7, Z_BELT);
      moving.push({it, steps: [hop(it, from, end, .7 * slow, red ? 0 : .4, 1, .5, () => true, .3)]});
      waitResume = true; waitT = 0; spawnDelay = 0;
    }
  }

  function sync(s) {
    state = s;
    const idx = s.i < s.items.length ? s.i : -1;
    if (idx !== shownIndex) {
      if (item) { root.remove(item.g); kit.disposeTree(item.g); item = null; }
      shownIndex = idx;
      if (idx >= 0 && spawnDelay <= 0 && !waitResume) spawn(s.items[idx], idx);
    }
  }
  function event(ev) {
    if (ev.type === 'right' || ev.type === 'wrong' || ev.type === 'timeout') exit(ev);
    else if (ev.type === 'resume') { waitResume = false; releaseHolds(); spawnDelay = Math.max(spawnDelay, .2); }
  }
  function update(rawDt) {
    // Never run the animation backwards or with a garbage step: the first frame after start() can be 0 or negative.
    const dt = Math.min(.05, rawDt > 0 && Number.isFinite(rawDt) ? rawDt : 0);
    if (dt <= 0) return;
    time += dt;
    const red = reduced();
    if ((time * 4 | 0) !== ((time - dt) * 4 | 0)) { applyFocus(false); solveItemSize(); }
    if (waitResume) { waitT += dt; if (waitT > 30) { waitResume = false; releaseHolds(); spawnDelay = .2; } }
    if (!waitResume && spawnDelay > 0) {
      spawnDelay -= dt;
      if (spawnDelay <= 0 && !item && state && shownIndex >= 0) spawn(state.items[shownIndex], shownIndex);
    }
    let speed = 0;
    if (item) {
      item.age += dt;
      const s = Math.min(1, item.age / .3);
      item.g.scale.setScalar(.6 + .4 * (s < 1 ? s * (1.12 - .12 * s) : 1));
      const tx = targetX(), prev = item.g.position.x;
      const rate = state && state.timed ? (item.age < 1.2 ? 2.4 : 6) : (red ? 1.6 : 2.4);
      const x = prev + (tx - prev) * Math.min(1, dt * rate);
      item.g.position.x = x; speed = (x - prev) / dt;
      item.g.position.y = BELT_TOP + (red ? 0 : Math.abs(Math.sin(time * 5)) * Math.min(.06, Math.abs(speed) * .06));
      // glide to the solved size (it changes only when the canvas or the camera framing does)
      const tgt = itemTarget(item);
      if (Math.abs(tgt - item.base) > .002) { item.base += (tgt - item.base) * Math.min(1, dt * 5); sizeRing(item); }
      if (!red) {
        item.body.rotation.y = Math.sin(time * .9) * .14;
        const pulse = 1 + .05 * Math.sin(time * 3.2); item.ring.scale.set(item.ringR * pulse, item.ringR * .72 * pulse, 1);
        if (Math.abs(speed) < .05) squashBody(item, .02 * Math.sin(time * 2.4)); else squashBody(item, 0);
      } else squashBody(item, 0);
      // keep the name tag fully on screen even when the item is near either end of the belt
      const lim = 2.55 - (item.tag.userData.halfW || 1.5); item.tag.position.x = Math.max(-lim, Math.min(lim, x)) - x;
      if (state && state.timed && state.left < 5 && endFx.t <= 0) { endM.emissive.copy(AMBER); endM.emissiveIntensity = red ? 1.2 : .8 + .6 * Math.max(0, Math.sin(time * 6)); }
    }
    // the belt arrows scroll with the item; under reduced motion they hold still (the item itself does not travel then)
    beltSpeed = red ? 0 : beltSpeed + (speed - beltSpeed) * Math.min(1, dt * 8);
    if (beltSpeed !== 0) {
      const off = ((beltTex.offset.x - beltSpeed * dt / (BELT_LEN / REP)) % 1 + 1) % 1; // wrapped: keeps UV precision
      beltTex.offset.x = Number.isFinite(off) ? off : 0;
    }
    for (let i = moving.length - 1; i >= 0; i--) {
      const m = moving[i];
      const r = m.steps[0].update(dt);
      if (r === 'keep') { moving.splice(i, 1); continue; } // stays in its bin pile
      if (r) { m.steps.shift(); if (!m.steps.length) { if (m.it.g.parent) m.it.g.parent.remove(m.it.g); kit.disposeTree(m.it.g); moving.splice(i, 1); } }
    }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const k = Math.min(1, f.t / f.life); f.update(k, dt); if (k >= 1) { f.done(); fx.splice(i, 1); } }
    stepParticles(dt);
    arrow.visible = false;
    for (const b of bins.values()) {
      const f = b.fx;
      if (f && f.hold > 0 && f.t >= 0 && f.t < f.hold) {
        arrow.visible = true;
        // above the right bin's sign, pointing down at it (a sprite, so no bin or sign in front can hide it)
        arrow.position.set(b.x, signY() + L.signH / 2 + .5 + (red ? 0 : Math.abs(Math.sin(time * 4)) * .14), b.z + signZ + .1);
        arrow.material.opacity = Math.min(1, f.t * 4);
      }
      if (b.squash > 0) {
        b.squash = Math.max(0, b.squash - dt * 3.2);
        const k = Math.sin(b.squash * Math.PI) * .13;
        b.body.scale.set(b.sx * (1 + k * .5), 1 - k, 1 + k * .5); b.pileG.scale.set(1 + k * .5, 1 - k, 1 + k * .5);
      } else if (b.body.scale.y !== 1) { b.body.scale.set(b.sx, 1, 1); b.pileG.scale.set(1, 1, 1); }
      if (!f) continue;
      f.t += dt;
      if (f.t < 0) continue;
      let amt;
      if (f.hold > 0 && f.t < f.hold) amt = f.strength * (red ? 1 : .75 + .25 * Math.sin(f.t * 6));
      else {
        const k = Math.min(1, f.t / f.life);
        amt = (red ? (k < .6 ? 1 : 1 - (k - .6) / .4) : 1 - k) * f.strength;
        if (k >= 1) amt = -1;
      }
      const halo = f.red ? b.haloR : b.haloG, other = f.red ? b.haloG : b.haloR;
      if (amt < 0) {
        b.rimM.emissive.copy(A.bright); b.rimM.emissiveIntensity = RIM_BASE; b.padM.emissive.copy(A.bright); b.padM.emissiveIntensity = RIM_BASE * .45;
        b.ring.material.opacity = 0; halo.scale.set(.001, .001, 1); b.fx = null; continue;
      }
      other.scale.set(.001, .001, 1);
      b.rimM.emissive.copy(f.color); b.rimM.emissiveIntensity = RIM_BASE + 1.0 * amt;
      b.padM.emissive.copy(f.color); b.padM.emissiveIntensity = RIM_BASE * .45 + .8 * amt;
      b.ring.material.color.copy(f.color); b.ring.material.opacity = .42 * Math.min(1, amt);
      const grow = red ? 1 : 1 + (1 - Math.min(1, amt)) * .5;
      b.ring.scale.set(L.binW * 1.1 * grow, binD * 1.4 * grow, 1);
      const hs = f.size * Math.min(1.2, amt);
      halo.scale.set(hs, hs, 1);
    }
    if (endFx.t > 0) { endFx.t = Math.max(0, endFx.t - dt); endM.emissive.copy(endFx.color); endM.emissiveIntensity = 1.6 * Math.min(1, endFx.t * 2) + .2; }
    else if (!(item && state && state.timed && state.left < 5)) { endM.emissive.copy(IDLE); endM.emissiveIntensity = .5; }
  }
  function dispose() {
    engine.scene.remove(root);
    fx.forEach((f) => f.done()); fx.length = 0;
    for (const b of bins.values()) { for (const h of [b.haloG, b.haloR]) { const i = kit.glows.indexOf(h); if (i >= 0) kit.glows.splice(i, 1); } }
    kit.disposeTree(root);
    hitGeo.dispose(); hitM.dispose(); badgeGeo.dispose(); ringGeo.dispose(); itemRingGeo.dispose(); itemRingM.dispose(); pGeo.dispose(); pMat.dispose();
    textures.forEach((t) => t.dispose());
  }
  return {sync, event, update, dispose, bins, get item() { return item; }};
}

export default {id: 'sort', label: 'Sort', howTo, rules, createView};
