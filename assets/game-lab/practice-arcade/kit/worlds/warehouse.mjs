// World: a distribution warehouse ("toy diorama"). The stage (x -3..3, z -6..2, up to y 2) is a painted receiving
// lane framed by accent strips and yellow walkway lines. Two rows of tall pallet racking stand on each side (blue
// uprights, orange beams, cartons, totes and wrapped loads). At the back: a dock wall with three dock doors (the
// middle one open to the yard, one slowly rolling up and down), dock lights, a staging area with loaded pallets and
// a parked forklift with a turning amber beacon and gently lifting forks. High-bay lamps glow at dusk and night.
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Only primitives, canvas textures and the look kit.
const PAL = {
  day: {wall: 0x87a3c2, wallLow: 0x4f6782, floor: 0xcfc6b6, lane: 0xb8b2a6, up: 0x2f62b0, beam: 0xee7a2a, lamp: .3, strip: .6},
  dusk: {wall: 0x8b8fb3, wallLow: 0x4f5478, floor: 0xc6b7aa, lane: 0xafa49c, up: 0x2f58a0, beam: 0xe06e2a, lamp: 1.0, strip: 1.0},
  night: {wall: 0x26324a, wallLow: 0x1a2336, floor: 0x4a5163, lane: 0x3d4456, up: 0x2a4b86, beam: 0xb85a24, lamp: 1.6, strip: 2.0}
};
const mq = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

const W = {
  id: 'warehouse',
  label: 'Warehouse',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const moodId = PAL[theme.mood] ? theme.mood : (ctx.mood && PAL[ctx.mood.id] ? ctx.mood.id : 'day');
    const P = PAL[moodId], night = moodId === 'night', mood = look.moodOf(moodId);
    const A = ctx.accent && ctx.accent.bright ? ctx.accent : look.accentSet(theme.accent || '#2b7bb9');
    const accent = A.base.clone(), glowC = night ? A.bright.clone() : A.base.clone();
    const accHex = '#' + accent.getHexString();
    const still = () => !!ctx.reduced || mq();
    const group = new THREE.Group(); group.name = 'world-warehouse';
    const own = [], inst = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const plane = (w, h, m, x, y, z, ry = 0) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; group.add(p); return p; };
    const flat = (w, d, m, x, z, y = .006) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; group.add(p); return p; };

    // ---------- instanced parts (same helper in every world of this set) ----------
    const L = {};
    const add = (kind, t) => (L[kind] || (L[kind] = [])).push(t);
    const box = (x, y, z, w, h, d, c, o = {}) => add(o.kind || 'soft', [x, o.c ? y : y + h / 2, z, o.ry || 0, w, h, d, o.rx || 0, o.rz || 0, c]);
    const cyl = (x, y, z, r, h, c, o = {}) => add(o.kind || 'cyl', [x, o.c ? y : y + h / 2, z, o.ry || 0, 2 * r, h, 2 * r, o.rx || 0, o.rz || 0, c]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    function instanced(geo, material, list, shadow = true) {
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((t, i) => {
        v.set(t[0], t[1], t[2]); e.set(t[7] || 0, t[3] || 0, t[8] || 0); q.setFromEuler(e); s.set(t[4], t[5], t[6]);
        m4.compose(v, q, s); im.setMatrixAt(i, m4);
        if (t[9] !== undefined) im.setColorAt(i, t[9] && t[9].isColor ? t[9] : col.set(t[9]));
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; inst.push(im); group.add(im); return im;
    }
    const DEFS = {
      soft: () => [kit.bevel(1, 1, 1, .04), mat({color: 0xffffff, roughness: .62, metalness: .03})],
      hard: () => [kit.bevel(1, 1, 1, .008), mat({color: 0xffffff, roughness: .75, metalness: .02})],
      metal: () => [kit.bevel(1, 1, 1, .015), mat({color: 0xffffff, roughness: .38, metalness: .55})],
      carton: () => [kit.bevel(1, 1, 1, .03), mat({map: cartonTex, color: 0xffffff, roughness: .85, metalness: 0})],
      cyl: () => [kit.cylGeo(.5, .5, 1, 16), mat({color: 0xffffff, roughness: .5, metalness: .1})],
      glow: () => [new THREE.BoxGeometry(1, 1, 1), kit.basic({color: 0xffffff, toneMapped: false})]
    };
    const glowK = (c, k) => new THREE.Color(c).multiplyScalar(night ? Math.min(1.3, k * .65) : 1);
    // carton texture: tape strip and a small label, tinted per instance
    const cartonTex = tex(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, h / 2 - 10, w, 20);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(w / 2 - 9, 0, 18, h);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(16, 74, 34, 24); g.fillStyle = 'rgba(0,0,0,.45)'; for (let i = 0; i < 6; i++) g.fillRect(20 + i * 5, 78, 2, 16);
    });

    // ---------- floor: warm sealed concrete with saw-cut joints; painted lanes ----------
    const conc = tex(512, 512, (g, w, h) => {
      const r = look.rng(17); g.fillStyle = '#e6e2da'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 80; i++) { const x = r() * w, y = r() * h, rad = 30 + r() * 90, k = r() < .5 ? 0 : 255; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${k},${k},${k},.06)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      for (let i = 0; i < 2600; i++) { const k = 170 + (r() * 60 | 0); g.fillStyle = `rgba(${k},${k},${k - 6},.35)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
      g.strokeStyle = 'rgba(90,86,80,.45)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    }, {repeat: [12, 12], aniso: 8});
    const floor = flat(48, 48, mat({map: conc, color: P.floor, roughness: .6, metalness: .03}), 0, -4, 0);
    flat(6.4, 8.8, mat({color: P.lane, roughness: .6}), 0, -2.0, .003);
    const Y = 0xf2c230;
    box(-3.3, 0, -2.0, .1, .012, 8.8, glowK(glowC, P.strip), {kind: 'glow'});
    box(3.3, 0, -2.0, .1, .012, 8.8, glowK(glowC, P.strip), {kind: 'glow'});
    [-3.68, 3.68].forEach((x) => box(x, 0, -2.5, .12, .01, 17, Y, {kind: 'hard'}));
    box(0, 0, -7.4, 6.0, .01, .14, Y, {kind: 'hard'});
    const hatch = tex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#f2c230'; for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, h); g.lineTo(x + 14 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); } });
    flat(3.0, 1.0, mat({map: hatch, transparent: true, roughness: .6}), 0, -10.2, .008);

    // ---------- dock wall: ribbed cladding, three dock doors (middle open), dock lights, door numbers ----------
    const wallZ = -11.2, WH = 7.6, DW = 2.8, DH = 3.0, DOORS = [-4.7, 0, 4.7];
    const clad = tex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { const gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(0,0,0,.14)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(x, 0, 32, h); } }, {repeat: [14, 2]});
    const cladM = mat({map: clad, color: P.wall, roughness: .55, metalness: .3});
    // wall pieces between and around the doors (one textured InstancedMesh)
    const wallPieces = [];
    const edges = [-22, ...DOORS.flatMap((x) => [x - DW / 2, x + DW / 2]), 22];
    for (let i = 0; i < edges.length; i += 2) { const x0 = edges[i], x1 = edges[i + 1]; wallPieces.push([(x0 + x1) / 2, WH / 2, wallZ, 0, x1 - x0, WH, .3]); }
    DOORS.forEach((x) => wallPieces.push([x, DH + (WH - DH) / 2, wallZ, 0, DW, WH - DH, .3]));
    [-1, 1].forEach((sd) => wallPieces.push([sd * 11.2, WH / 2, -3.6, 0, .3, WH, 15.6]));
    instanced(kit.bevel(1, 1, 1, .01), cladM, wallPieces, false);
    box(0, 0, wallZ + .17, 44, 1.0, .05, P.wallLow, {kind: 'hard'});
    box(0, 4.6, wallZ + .17, 44, .14, .05, accent, {kind: 'hard'});
    // the open middle door: yard and a trailer under the sky
    const yard = tex(256, 256, (g, w, h) => {
      const c = new THREE.Color(mood.window);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#' + c.clone().offsetHSL(0, 0, .04).getHexString()); gr.addColorStop(.6, '#' + c.clone().offsetHSL(0, -.1, .12).getHexString()); gr.addColorStop(.61, night ? '#1b2232' : '#8c949a'); gr.addColorStop(1, night ? '#141a26' : '#737b82');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = night ? '#2a3448' : '#e9edf0'; g.fillRect(30, 60, 196, 120); g.fillStyle = accHex; g.fillRect(30, 150, 196, 14);
      g.fillStyle = '#222'; [60, 90, 170, 200].forEach((x) => { g.beginPath(); g.arc(x, 186, 12, 0, 7); g.fill(); });
      if (night) { g.fillStyle = 'rgba(255,214,140,.95)'; g.fillRect(12, 40, 8, 8); g.fillRect(236, 52, 8, 8); }
    });
    const yardM = mat({map: yard, emissiveMap: yard, emissive: 0xffffff, emissiveIntensity: mood.windowGlow, roughness: 1});
    plane(DW, DH, yardM, 0, DH / 2, wallZ - .5); plane(DW, DH, yardM, DOORS[0], DH / 2, wallZ - .5);
    // closed roll-up doors (the left one rolls slowly up and down)
    const doorTex = tex(128, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(w / 2 - 14, h - 22, 28, 6); }, {repeat: [1, 2]});
    const doorM = mat({map: doorTex, color: night ? 0x6c7890 : 0xc9d2dc, roughness: .5, metalness: .35});
    const rollDoor = new THREE.Mesh(kit.bevel(DW - .06, DH, .08, .01), doorM); rollDoor.geometry = kit.bevel(DW - .06, 1, .08, .005);
    rollDoor.position.set(DOORS[0], DH / 2, wallZ + .02); rollDoor.scale.y = DH; group.add(rollDoor);
    box(DOORS[2], 0, wallZ + .02, DW - .06, DH, .08, night ? 0x6c7890 : 0xc9d2dc, {kind: 'metal'});
    // door frames: striped bumper posts, black bumpers, dock lights and big door numbers
    const stripeTex = tex(64, 256, (g, w, h) => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; for (let y = -w; y < h + w; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y - w); g.lineTo(w, y - w + 24); g.lineTo(0, y + 24); g.closePath(); g.fill(); } }, {repeat: [1, 3]});
    const postM = mat({map: stripeTex, roughness: .5});
    const posts = []; DOORS.forEach((x) => [-1, 1].forEach((sd) => posts.push([x + sd * (DW / 2 + .12), DH / 2, wallZ + .2, 0, .24, DH, .3])));
    instanced(kit.bevel(1, 1, 1, .02), postM, posts);
    DOORS.forEach((x, i) => {
      [-1, 1].forEach((sd) => box(x + sd * (DW / 2 - .3), .2, wallZ + .34, .32, .42, .22, 0x1c1c1e));
      box(x, DH, wallZ + .18, DW + .6, .18, .2, 0x2a303a, {kind: 'metal'});
      box(x - DW / 2 - .5, DH - .3, wallZ + .25, .3, .2, .2, glowK(i === 1 ? 0x56e08a : 0xffb02e, P.lamp + .8), {kind: 'glow'});
    });
    const numTex = tex(384, 128, (g, w, h) => {
      ['1', '2', '3'].forEach((n, i) => { const x0 = i * 128; g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x0 + 8, 8, 112, 112, 18); g.fill(); g.fillStyle = accHex; g.beginPath(); g.roundRect(x0 + 16, 16, 96, 96, 12); g.fill(); g.fillStyle = '#ffffff'; g.font = '800 80px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, x0 + 64, 70); });
    }, {aniso: 8});
    const numM = mat({map: numTex, emissiveMap: numTex, emissive: 0xffffff, emissiveIntensity: night ? .9 : .15, roughness: .5, toneMapped: !night});
    DOORS.forEach((x, i) => { const g = new THREE.PlaneGeometry(.75, .75); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / 3); const m = new THREE.Mesh(g, numM); m.position.set(x, DH + .55, wallZ + .17); group.add(m); });

    // ---------- pallet racking: two rows each side; uprights, beams, decks, loads ----------
    const ROWS = [{xf: 4.15, xb: 5.35, hup: 4.7, lv: [0, 1.45, 2.9]}, {xf: 7.55, xb: 8.75, hup: 5.6, lv: [0, 1.45, 2.9, 4.25]}];
    const BAY = 2.7, bayZ = [-6.6, -3.9, -1.2, 1.5];
    const ups = [], beams = [], guards = [];
    const r = look.rng(41);
    const BOX = [0xc99a62, 0xbd8a52, 0xd7b077, 0xb07f4a, 0xc99a62, 0xe8dcc4];
    const TOTE = [0x2f74c0, 0xd94b3d, 0x3d9a55, accent];
    ROWS.forEach((row) => [-1, 1].forEach((side) => {
      for (let i = 0; i <= bayZ.length; i++) {
        const z = bayZ[0] - BAY / 2 + i * BAY;
        [row.xf, row.xb].forEach((x) => ups.push([side * x, row.hup / 2, z, 0, .11, row.hup, .11]));
        guards.push([side * row.xf, .25, z, 0, .22, .5, .22]);
      }
      bayZ.forEach((bz) => {
        row.lv.slice(1).forEach((y) => [row.xf, row.xb].forEach((x) => beams.push([side * x, y - .07, bz, 0, .09, .15, BAY - .1])));
        row.lv.forEach((y, li) => [-.65, .65].forEach((dz) => {
          if (r() < .1) return;
          const py = y + (li ? .02 : 0), cx = side * (row.xf + row.xb) / 2;
          box(cx, py, bz + dz, 1.0, .14, 1.15, 0xb88a57, {kind: 'hard'});
          const kind = r();
          if (kind < .55) { // stacked cartons
            const n = r() < .5 ? 2 : 1, bh = .5;
            for (let k = 0; k < n; k++) box(cx + (r() - .5) * .06, py + .14 + k * bh, bz + dz, .95, bh - .02, 1.05, new THREE.Color(BOX[(r() * BOX.length) | 0]).offsetHSL(0, 0, (r() - .5) * .05), {kind: 'carton', ry: (r() - .5) * .06});
          } else if (kind < .8) { // coloured totes
            const tc = TOTE[(r() * TOTE.length) | 0];
            [-.24, .24].forEach((tz) => box(cx, py + .14, bz + dz + tz, .9, .42, .46, tc));
          } else { // stretch-wrapped load with an accent label
            box(cx, py + .14, bz + dz, .98, .95, 1.1, 0xe4eaf0);
            box(cx - side * .5, py + .6, bz + dz, .02, .22, .4, accent, {kind: 'hard'});
          }
        }));
      });
      // row end frame plate with an accent stripe (the near end)
      box(side * (row.xf + row.xb) / 2, .2, bayZ[3] + BAY / 2 + .08, 1.3, .9, .06, A.dark, {kind: 'hard'});
    }));
    instanced(kit.bevel(1, 1, 1, .012), mat({color: P.up, roughness: .45, metalness: .35}), ups);
    instanced(kit.bevel(1, 1, 1, .012), mat({color: P.beam, roughness: .45, metalness: .25}), beams);
    instanced(kit.bevel(1, 1, 1, .02), mat({map: stripeTex, roughness: .5}), guards);
    // accent glow line at the foot of the near racks
    [-1, 1].forEach((sd) => box(sd * 3.98, 0, -2.6, .06, .012, 11.2, glowK(glowC, P.strip * .8), {kind: 'glow'}));

    // ---------- staging area: loaded pallets, a pallet jack, an empty pallet stack ----------
    [[-4.6, -9.6], [2.4, -8.9], [3.6, -9.9]].forEach(([x, z], i) => {
      box(x, 0, z, 1.1, .14, 1.2, 0xb88a57, {kind: 'hard'});
      if (i === 1) { box(x, .14, z, 1.06, 1.0, 1.16, 0xe4eaf0); box(x, .55, z + .59, .4, .26, .02, accent, {kind: 'hard'}); }
      else for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) box(x - .26 + j * .52, .14 + k * .44, z, .5, .42, 1.1, BOX[(i + k + j) % BOX.length], {kind: 'carton'});
    });
    for (let k = 0; k < 5; k++) box(-8.6 + (k % 2) * .04, k * .15, -9.6, 1.1, .13, 1.2, 0xb88a57, {kind: 'hard'});
    box(1.0, 0, -9.4, .56, .32, .3, accent); [-.17, .17].forEach((dx) => box(1.0 + dx, 0, -8.85, .14, .07, 1.0, 0x55595f, {kind: 'metal'}));
    box(1.0, .32, -9.55, .05, .9, .05, 0x55595f, {kind: 'metal', rx: -.3});

    // ---------- forklift (back left), facing the stage: body parts instanced, forks and beacon animated ----------
    const FX = -2.2, FZ = -9.0, FY = 0xf2b705;
    box(FX, .22, FZ, 1.1, .7, 1.4, FY);
    box(FX, .22, FZ - .85, 1.12, .85, .36, 0x3a3f47);
    box(FX, .92, FZ - .05, 1.0, .06, .9, 0x2a2e35);
    box(FX, .98, FZ - .25, .46, .12, .46, 0x22262c); box(FX, 1.05, FZ - .48, .46, .5, .1, 0x22262c);
    box(FX + .2, .98, FZ + .25, .05, .35, .05, 0x22262c, {rx: -.4});
    [[-.48, -.55], [.48, -.55], [-.48, .4], [.48, .4]].forEach(([dx, dz]) => box(FX + dx, .95, FZ + dz, .06, 1.2, .06, 0x2a2e35, {kind: 'metal'}));
    box(FX, 2.15, FZ - .07, 1.06, .07, 1.06, 0x2a2e35, {kind: 'metal'});
    box(FX, .75, FZ + .71, 1.1, .1, .02, accent, {kind: 'hard'});
    [-.36, .36].forEach((dx) => box(FX + dx, .1, FZ + .82, .08, 2.5, .1, 0x30353d, {kind: 'metal'}));
    [[-.42, .45], [.42, .45], [-.42, -.5], [.42, -.5]].forEach(([dx, dz]) => cyl(FX + dx, .22, FZ + dz, .22, .22, 0x1d1f23, {c: true, rz: Math.PI / 2}));
    const forks = new THREE.Group(); forks.position.set(FX, .12, FZ + .95); group.add(forks);
    const forkM = mat({color: 0x30353d, roughness: .4, metalness: .6});
    forks.add(kit.box(.9, .5, .06, forkM, 0, 0, 0, .01));
    [-.25, .25].forEach((dx) => forks.add(kit.box(.12, .05, 1.0, forkM, dx, 0, .5, .01)));
    const beacon = new THREE.Group(); beacon.position.set(FX + .35, 2.22, FZ - .4); group.add(beacon);
    beacon.add(kit.cyl(.09, .09, .16, mat({color: 0xffb02e, emissive: 0xff9a1a, emissiveIntensity: night ? 1.4 : .6, transparent: true, opacity: .9, roughness: .2}), 0, 0, 0, 14));
    const spin = new THREE.Group(); spin.position.y = .08; beacon.add(spin);
    spin.add(kit.box(.04, .1, .12, kit.basic({color: 0xffe0a0, toneMapped: false}), .05, -.05, 0, .01));
    const beaconGlow = kit.glow(beacon, 0xffb02e, 1.0, 0, .1, 0);

    // ---------- overhead: high-bay lamps over the aisles and the dock; an exit sign ----------
    const lampC = glowK(0xfff1d6, P.lamp + .5);
    [[-6.4, -6], [6.4, -6], [-6.4, -.5], [6.4, -.5], [-2.6, -9.6], [2.6, -9.6]].forEach(([x, z]) => {
      cyl(x, 6.2, z, .015, 1.6, 0x40464f);
      cyl(x, 5.85, z, .42, .36, 0x3a4048);
      box(x, 5.83, z, .62, .03, .62, lampC, {kind: 'glow'});
      if (moodId !== 'day') kit.glow(group, 0xfff1d6, night ? 2.4 : 1.6, x, 5.6, z);
    });
    box(-11.0, 3.6, -1.0, .1, .32, .8, glowK(0x2fd27a, 1.4), {kind: 'glow'});
    box(-11.0, 0, -1.0, .1, 3.2, 1.8, night ? 0x3a4458 : 0x9aa6b4, {kind: 'metal'});

    // ---------- build the instanced parts; contact shadows ----------
    Object.keys(L).forEach((k) => { const [geo, m] = DEFS[k](); instanced(geo, m, L[k], k !== 'glow'); });
    [[-4.75, -2.6, 1.8, 11.4], [4.75, -2.6, 1.8, 11.4], [-8.15, -2.6, 1.8, 11.4], [8.15, -2.6, 1.8, 11.4], [FX, FZ, 1.6, 2.4], [-4.6, -9.6, 1.4, 1.4], [2.4, -8.9, 1.4, 1.4]].forEach(([x, z, w, d]) => { const b = look.makeBlob(w, d, .36); b.position.x = x; b.position.z = z; group.add(b); });
    group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.blob) { o.castShadow = o !== floor && !(o.geometry && o.geometry.type === 'PlaneGeometry'); o.receiveShadow = true; } });

    let t = 0;
    return {
      group,
      update(dt) {
        if (still() || !(dt > 0)) return;
        t += dt;
        spin.rotation.y = t * 4.2;
        beaconGlow.scale.setScalar(.5 + .55 * Math.max(0, Math.cos(t * 4.2)));
        forks.position.y = .12 + .55 * (.5 - .5 * Math.cos(t * .45));
        const k = Math.min(1, Math.max(0, Math.sin(t * .18) * 1.6 + .2)); // left door: mostly closed, rolls up now and then
        rollDoor.scale.y = DH * (1 - .78 * k); rollDoor.position.y = DH - rollDoor.scale.y / 2;
      },
      dispose() { inst.forEach((m) => m.dispose()); kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
