// World: a factory production hall ("toy diorama"). The stage (x -3..3, z -6..2, up to y 2) is a dark walkway
// with hazard-striped edges, accent strips and yellow guard rails. Left: an assembly conveyor with cartons rolling
// toward the camera out of a long production machine at the back (inspection windows, status screens, a hopper and
// pipes). Right: a fenced robot cell with an articulated arm in the accent colour, a control cabinet with a blinking
// stack light. Overhead: a yellow gantry crane whose trolley travels slowly, a big duct and high-bay lamps; high
// clerestory windows. Far sides: drums, gas cylinders, parts racks and a tool board.
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Only primitives, canvas textures and the look kit.
const PAL = {
  day: {wall: 0x7893b0, wallLow: 0x40556b, floor: 0x8fb89c, walk: 0x56636c, mach: 0xd3d8dc, machDark: 0x34404c, lamp: .3, strip: .6, screen: .85},
  dusk: {wall: 0x8583a8, wallLow: 0x46466a, floor: 0x9cae9e, walk: 0x4f5466, mach: 0xc6c4cc, machDark: 0x2e3446, lamp: 1.0, strip: 1.0, screen: 1.05},
  night: {wall: 0x26344a, wallLow: 0x1a2334, floor: 0x46505e, walk: 0x2c3442, mach: 0x56606e, machDark: 0x1a2232, lamp: 1.6, strip: 2.0, screen: 1.5}
};
const YELLOW = 0xf2c230;
const mq = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

const W = {
  id: 'factory',
  label: 'Factory',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const moodId = PAL[theme.mood] ? theme.mood : (ctx.mood && PAL[ctx.mood.id] ? ctx.mood.id : 'day');
    const P = PAL[moodId], night = moodId === 'night', mood = look.moodOf(moodId);
    const A = ctx.accent && ctx.accent.bright ? ctx.accent : look.accentSet(theme.accent || '#2b7bb9');
    const accent = A.base.clone(), glowC = night ? A.bright.clone() : A.base.clone();
    const accHex = '#' + accent.getHexString();
    const still = () => !!ctx.reduced || mq();
    const group = new THREE.Group(); group.name = 'world-factory';
    const own = [], inst = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const lit = (map, k) => mat({map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: k, roughness: .4, toneMapped: !night});
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
      soft: () => [kit.bevel(1, 1, 1, .04), mat({color: 0xffffff, roughness: .55, metalness: .08})],
      hard: () => [kit.bevel(1, 1, 1, .008), mat({color: 0xffffff, roughness: .7, metalness: .05})],
      metal: () => [kit.bevel(1, 1, 1, .015), mat({color: 0xffffff, roughness: .35, metalness: .6})],
      hazard: () => [kit.bevel(1, 1, 1, .01), mat({map: hazardTex, roughness: .55})],
      cyl: () => [kit.cylGeo(.5, .5, 1, 18), mat({color: 0xffffff, roughness: .45, metalness: .2})],
      glow: () => [new THREE.BoxGeometry(1, 1, 1), kit.basic({color: 0xffffff, toneMapped: false})]
    };
    const glowK = (c, k) => new THREE.Color(c).multiplyScalar(night ? Math.min(1.3, k * .65) : 1);
    const hazardTex = tex(128, 32, (g, w, h) => {
      g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a';
      for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
    }, {repeat: [1, 1]});

    // ---------- floor: grey-green epoxy with panel joints; dark walkway under the stage, hazard edges ----------
    const epoxy = tex(256, 256, (g, w, h) => {
      const r = look.rng(29); g.fillStyle = '#e8eeeb'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) { const k = 200 + (r() * 45 | 0); g.fillStyle = `rgba(${k - 6},${k + 2},${k},.4)`; g.fillRect(r() * w, r() * h, 2, 2); }
      g.strokeStyle = 'rgba(60,70,68,.35)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    }, {repeat: [16, 16], aniso: 8});
    const floor = flat(48, 48, mat({map: epoxy, color: P.floor, roughness: .42, metalness: .05}), 0, -4, 0);
    flat(6.6, 8.8, mat({color: P.walk, roughness: .5}), 0, -2.0, .003);
    const hzStrip = mat({map: tex(128, 32, (g, w, h) => { g.drawImage(hazardTex.image, 0, 0); }, {repeat: [26, 1]}), roughness: .55});
    [-3.42, 3.42].forEach((x) => { const b = flat(13, .18, hzStrip, x, -2.5, .006); b.rotation.z = Math.PI / 2; });
    box(-3.24, 0, -2.0, .08, .012, 8.8, glowK(glowC, P.strip), {kind: 'glow'});
    box(3.24, 0, -2.0, .08, .012, 8.8, glowK(glowC, P.strip), {kind: 'glow'});

    // ---------- near-stage floor markings (z 2.5..5, in front of the stage): a hazard-edged cross walkway with
    // painted lane arrows, painted stop bars at the stage mouth, a floor drain and an oil stain ----------
    const crossTex = tex(256, 64, (g, w, h) => {
      g.fillStyle = '#3a424c'; g.fillRect(0, 0, w, h);
      g.drawImage(hazardTex.image, 0, 0, 128, 10, 0, 0, 128, 10); g.drawImage(hazardTex.image, 0, 0, 128, 10, 128, 0, 128, 10);
      g.drawImage(hazardTex.image, 0, 22, 128, 10, 0, h - 10, 128, 10); g.drawImage(hazardTex.image, 0, 22, 128, 10, 128, h - 10, 128, 10);
      g.fillStyle = '#f4f1e6'; [40, 168].forEach((x) => { g.beginPath(); g.moveTo(x, 22); g.lineTo(x + 30, 32); g.lineTo(x, 42); g.lineTo(x + 6, 32); g.closePath(); g.fill(); g.fillRect(x - 34, 29, 36, 6); });
    }, {repeat: [9, 1], aniso: 8});
    flat(22, 1.25, mat({map: crossTex, roughness: .55}), 0, 3.3, .008);
    // stop bars across the stage mouth, broken by a gap in the middle
    [-1.9, 1.9].forEach((x) => box(x, 0, 2.5, 2.2, .01, .14, 0xf4f1e6, {kind: 'hard'}));
    // floor drain (grated disc) and an oil-stain decal
    const drainTex = tex(128, 128, (g, w) => {
      g.clearRect(0, 0, w, w); g.fillStyle = '#5d6670'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
      g.fillStyle = '#1b1f25'; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.fill();
      g.fillStyle = '#7d8792'; for (let x = 22; x < 110; x += 12) g.fillRect(x, 20, 5, 88);
    }, {aniso: 8});
    flat(.75, .75, mat({map: drainTex, transparent: true, alphaTest: .2, roughness: .5, metalness: .4}), -1.7, 4.4, .009);
    const oilTex = tex(128, 128, (g, w) => {
      g.clearRect(0, 0, w, w); const r = look.rng(41);
      for (let i = 0; i < 9; i++) { const x = 40 + r() * 48, y = 40 + r() * 48, rad = 14 + r() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(22,26,30,.55)'); gr.addColorStop(1, 'rgba(22,26,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }
    });
    flat(1.3, 1.0, mat({map: oilTex, transparent: true, depthWrite: false, roughness: .2, metalness: .1}), 2.3, 4.5, .009).rotation.z = .6;
    // painted direction arrows pointing toward the camera on the floor beside the stage
    const arrowTex = tex(64, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = '#f2c230';
      g.fillRect(24, 10, 16, 70); g.beginPath(); g.moveTo(6, 74); g.lineTo(58, 74); g.lineTo(32, 118); g.closePath(); g.fill();
    }, {aniso: 8});
    const arrowM = mat({map: arrowTex, transparent: true, alphaTest: .3, roughness: .55});
    [[-4.25, 1.6], [4.25, 1.6], [-4.25, -2.2], [4.25, 4.6], [-4.25, 4.6]].forEach(([x, z]) => flat(.45, .9, arrowM, x, z, .009));

    // ---------- walls: steel panels, dark lower band with hazard stripe, high clerestory windows ----------
    const wallZ = -11.4, WH = 8.4;
    const panel = tex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.13)'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h); g.fillRect(0, 0, w, 3); }, {repeat: [10, 2]});
    const wallPieces = [[0, WH / 2, wallZ, 0, 44, WH, .3], [-11.4, WH / 2, -3.6, 0, .3, WH, 16], [11.4, WH / 2, -3.6, 0, .3, WH, 16]];
    instanced(kit.bevel(1, 1, 1, .01), mat({map: panel, color: P.wall, roughness: .6, metalness: .3}), wallPieces, false);
    box(0, 0, wallZ + .17, 44, 1.2, .05, P.wallLow, {kind: 'hard'});
    box(0, 1.2, wallZ + .18, 44, .16, .06, 0xffffff, {kind: 'hazard'});
    [-1, 1].forEach((sd) => { box(sd * 11.22, 0, -3.6, .05, 1.2, 16, P.wallLow, {kind: 'hard'}); });
    const winTex = tex(256, 64, (g, w, h) => { const c = new THREE.Color(mood.window); g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, h / 3); g.fillStyle = 'rgba(40,46,56,.9)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 4, h); g.fillRect(0, h / 2 - 2, w, 4); }, {repeat: [7, 1]});
    plane(28, 1.3, mat({map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: mood.windowGlow, roughness: .3}), 0, 6.6, wallZ + .17);
    // big round duct along the back wall
    cyl(0, 5.3, wallZ + .9, .45, 30, night ? 0x5b6676 : 0xb9c3cc, {c: true, rz: Math.PI / 2});
    [-8, -2.5, 3, 8.5].forEach((x) => box(x, 5.3, wallZ + .5, .12, 1.2, .8, 0x3a4048, {kind: 'metal'}));

    // ---------- production machine across the back: body, windows, screens, hopper, pipes ----------
    // Kept lower (top about y 2.2) and a little closer so its lit top edge shows in the sort and gate framings.
    const MZ = -9.2, MW = 13, MH = 2.2, MD = 1.7;
    box(0, 0, MZ, MW, MH, MD, P.mach);
    box(0, 0, MZ + MD / 2 - .02, MW + .1, .5, .08, P.machDark, {kind: 'hard'});
    box(0, MH - .1, MZ + MD / 2 + .01, MW, .1, .06, glowK(glowC, P.strip), {kind: 'glow'});
    box(0, MH, MZ, MW + .2, .12, MD + .2, P.machDark, {kind: 'metal'});
    const winGlow = glowK(night ? 0xbfe6ff : 0xdff3ff, 1.0);
    const machScr = tex(256, 160, (g, w, h) => {
      g.fillStyle = '#0b1a2a'; g.fillRect(0, 0, w, h); g.fillStyle = accHex; g.fillRect(0, 0, w, 22);
      g.fillStyle = '#4fd18b'; g.beginPath(); g.arc(230, 11, 7, 0, 7); g.fill();
      for (let i = 0; i < 6; i++) { g.fillStyle = i === 3 ? '#ffb02e' : '#2f8fd8'; g.fillRect(16 + i * 38, 140 - (30 + i * 13 % 70), 26, 30 + i * 13 % 70); }
    });
    const scrM = lit(machScr, P.screen);
    [-4.6, 0, 4.6].forEach((x, i) => {
      box(x - 1.0, 1.0, MZ + MD / 2 + .04, 1.3, .9, .02, winGlow, {kind: 'glow'});
      box(x - 1.0, .95, MZ + MD / 2 + .01, 1.42, 1.0, .03, P.machDark, {kind: 'metal'});
      plane(.9, .56, scrM, x + .8, 1.55, MZ + MD / 2 + .04);
      box(x + .5, .7, MZ + MD / 2 + .02, .14, .14, .05, i === 1 ? 0xd23b3b : 0x3ee08a, {kind: 'glow'});
    });
    // hopper and pipes on top
    cyl(-3.2, MH + .1, MZ, .9, .9, 0xc9d1d9, {kind: 'cyl'});
    const cone = new THREE.Mesh(kit.cylGeo(.3, .9, .5, 18), mat({color: 0xc9d1d9, roughness: .4, metalness: .4})); cone.position.set(-3.2, MH + 1.25, MZ); group.add(cone);
    cyl(-3.2, MH + 1.0, MZ, .93, .1, accent, {kind: 'cyl'});
    [[2.0, 1.6], [3.0, 2.3], [4.0, 1.4]].forEach(([x, h]) => cyl(x, MH + .1, MZ - .3, .14, h, 0x9aa5b1, {kind: 'cyl'}));
    cyl(3.0, MH + 1.6, MZ - .3, .14, 2.3, 0x9aa5b1, {c: true, rz: Math.PI / 2});
    cyl(5.6, MH + .1, MZ + .2, .35, 1.1, 0xe9eef2, {kind: 'cyl'}); cyl(5.6, MH + 1.2, MZ + .2, .37, .08, accent);
    // a machine at the back corners (left: press, right: tank)
    box(-8.6, 0, -9.8, 2.2, 3.6, 1.8, P.mach); box(-8.6, 3.6, -9.8, 2.4, .3, 2.0, P.machDark, {kind: 'metal'}); box(-8.6, 1.2, -8.88, 1.4, 1.2, .04, winGlow, {kind: 'glow'});
    cyl(8.6, 0, -9.8, 1.1, 4.2, 0xd2d9e0); cyl(8.6, 4.2, -9.8, 1.12, .12, accent); cyl(8.6, 2.0, -9.8, 1.12, .12, accent);
    box(7.6, 0, -8.7, .5, 1.5, .3, 0x3a4048, {kind: 'metal'});

    // ---------- yellow guard rails along both sides of the stage ----------
    const GX = 3.68, GZ0 = -8.4, GZ1 = 2.6;
    for (let z = GZ0; z <= GZ1 + .01; z += 1.57) [-1, 1].forEach((sd) => box(sd * GX, 0, z, .09, 1.1, .09, YELLOW));
    [-1, 1].forEach((sd) => { [1.06, .58].forEach((y) => box(sd * GX, y - .035, (GZ0 + GZ1) / 2, .07, .07, GZ1 - GZ0, YELLOW)); box(sd * GX, 0, (GZ0 + GZ1) / 2, .04, .14, GZ1 - GZ0, 0xffffff, {kind: 'hazard'}); });

    // ---------- assembly conveyor (left) with cartons rolling toward the camera ----------
    const CX = -5.0, CZ0 = -8.6, CZ1 = 3.0, CY = .8, CL = CZ1 - CZ0, CW = 1.0;
    [-1, 1].forEach((sd) => box(CX + sd * (CW / 2 + .04), CY - .18, (CZ0 + CZ1) / 2, .08, .18, CL, 0x5d6670, {kind: 'metal'}));
    [-1, 1].forEach((sd) => box(CX + sd * (CW / 2 + .09), CY - .05, (CZ0 + CZ1) / 2, .03, .06, CL, glowK(glowC, P.strip * .7), {kind: 'glow'}));
    for (let z = CZ0 + .3; z < CZ1; z += 1.9) [-1, 1].forEach((sd) => box(CX + sd * (CW / 2), 0, z, .07, CY - .18, .07, 0x5d6670, {kind: 'metal'}));
    const belt = tex(64, 64, (g, w, h) => { g.fillStyle = '#2b2f36'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, w, 6); }, {repeat: [1, CL / .5]});
    const beltM = mat({map: belt, roughness: .7});
    const beltMesh = flat(CW, CL, beltM, CX, (CZ0 + CZ1) / 2, CY - .02);
    const cartonM = mat({color: 0xc99a62, roughness: .8}), tapeM = mat({color: 0xeadbb6, roughness: .6}), tagM = mat({color: accent, roughness: .5});
    const cartonGeo = kit.bevel(.6, .42, .5, .02);
    const cartons = new THREE.InstancedMesh(cartonGeo, cartonM, 6), tapes = new THREE.InstancedMesh(kit.bevel(.1, .012, .52, .003), tapeM, 6), tags = new THREE.InstancedMesh(kit.bevel(.012, .14, .22, .003), tagM, 6);
    [cartons, tapes, tags].forEach((m) => { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; group.add(m); inst.push(m); });
    const cz = []; for (let i = 0; i < 6; i++) cz.push(CZ0 + (i + .4) * CL / 6);
    const placeCartons = () => {
      for (let i = 0; i < 6; i++) {
        v.set(CX, CY + .21, cz[i]); q.identity(); s.set(1, 1, 1); m4.compose(v, q, s); cartons.setMatrixAt(i, m4);
        v.y = CY + .426; m4.compose(v, q, s); tapes.setMatrixAt(i, m4);
        v.set(CX + .306, CY + .24, cz[i]); m4.compose(v, q, s); tags.setMatrixAt(i, m4);
      }
      cartons.instanceMatrix.needsUpdate = true; tapes.instanceMatrix.needsUpdate = true; tags.instanceMatrix.needsUpdate = true;
    };
    placeCartons();

    // ---------- robot cell (right): fence, striped floor square, articulated arm in the accent colour ----------
    const RX = 5.7, RZ = -5.4;
    const fenceTex = tex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(40,46,56,.85)'; g.lineWidth = 3; for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } g.lineWidth = 8; g.strokeStyle = '#f2c230'; g.strokeRect(0, 0, w, h); }, {repeat: [1, 1]});
    const fenceM = mat({map: fenceTex, transparent: true, alphaTest: .3, side: THREE.DoubleSide, roughness: .5, metalness: .3});
    [[4.0, RZ, Math.PI / 2, 3.6], [RX, RZ + 1.8, 0, 3.4], [RX, RZ - 1.8, 0, 3.4]].forEach(([x, z, ry, w]) => { const f = plane(w, 1.8, fenceM, x, .95, z, ry); f.userData.fence = true; });
    [[4.0, RZ - 1.8], [4.0, RZ + 1.8], [7.4, RZ - 1.8], [7.4, RZ + 1.8], [4.0, RZ]].forEach(([x, z]) => box(x, 0, z, .1, 1.9, .1, YELLOW));
    const cellFloor = mat({map: tex(128, 32, (g) => g.drawImage(hazardTex.image, 0, 0), {repeat: [8, 1]}), roughness: .55});
    [[RX, RZ - 1.5, 3.0, 0], [RX, RZ + 1.5, 3.0, 0], [RX - 1.5, RZ, 3.0, Math.PI / 2], [RX + 1.5, RZ, 3.0, Math.PI / 2]].forEach(([x, z, w, rz]) => { const p = flat(w, .16, cellFloor, x, z, .007); p.rotation.z = rz; });
    const armM = mat({color: accent, roughness: .38, metalness: .2}), jointM = mat({color: 0x2c3036, roughness: .45, metalness: .5});
    const robot = new THREE.Group(); robot.position.set(RX, 0, RZ); group.add(robot);
    robot.add(kit.box(1.0, .35, 1.0, jointM, 0, 0, 0, .05));
    const turret = new THREE.Group(); turret.position.y = .35; robot.add(turret);
    turret.add(kit.cyl(.4, .45, .42, armM, 0, 0, 0, 20));
    const shoulder = new THREE.Group(); shoulder.position.set(0, .6, 0); turret.add(shoulder);
    const sj = kit.cyl(.24, .24, .52, jointM, 0, 0, 0, 16); sj.rotation.z = Math.PI / 2; sj.position.set(0, 0, 0); shoulder.add(sj);
    shoulder.add(kit.box(.32, 1.25, .34, armM, 0, 0, 0, .08));
    const elbow = new THREE.Group(); elbow.position.set(0, 1.2, 0); shoulder.add(elbow);
    const ej = kit.cyl(.19, .19, .42, jointM, 0, 0, 0, 16); ej.rotation.z = Math.PI / 2; ej.position.set(0, 0, 0); elbow.add(ej);
    elbow.add(kit.box(.25, 1.0, .27, armM, 0, 0, 0, .06));
    const wrist = new THREE.Group(); wrist.position.set(0, .98, 0); elbow.add(wrist);
    wrist.add(kit.cyl(.12, .12, .16, jointM, 0, 0, 0, 14));
    [-.08, .08].forEach((x) => wrist.add(kit.box(.05, .24, .12, mat({color: 0xc9ced6, roughness: .3, metalness: .85}), x, .14, 0, .01)));
    const pose = {yaw: -.6, sh: .3, el: 1.25, wr: .9};
    const applyPose = (y, a, b, c) => { turret.rotation.y = y; shoulder.rotation.x = a; elbow.rotation.x = b; wrist.rotation.x = c; };
    applyPose(pose.yaw, pose.sh, pose.el, pose.wr);
    box(RX + .3, 0, RZ + 1.2, 1.0, .8, .6, 0x9aa3ad, {kind: 'metal'});
    [[-.25, 0], [0, .1], [.25, -.05]].forEach(([dx, dz]) => cyl(RX + .3 + dx, .8, RZ + 1.2 + dz, .08, .12, 0x6f7a86));

    // ---------- control cabinet with HMI and a stack light (right, near the camera) ----------
    const KX = 4.4, KZ = -1.4;
    box(KX, .1, KZ, .5, 1.9, 1.0, 0xd5d9dd); box(KX, 0, KZ, .54, .1, 1.04, 0x2c3036, {kind: 'metal'});
    box(KX - .26, 1.25, KZ + .22, .04, .26, .26, YELLOW, {kind: 'hard'});
    cyl(KX - .29, 1.38, KZ + .22, .08, .06, 0xd23b3b, {c: true, rz: Math.PI / 2});
    const hmiTex = tex(128, 96, (g, w, h) => { g.fillStyle = '#0f1b26'; g.fillRect(0, 0, w, h); g.fillStyle = '#4fd18b'; g.fillRect(8, 8, 50, 10); g.fillStyle = '#2f8fd8'; for (let i = 0; i < 5; i++) g.fillRect(8 + i * 22, 70 - i * 9, 14, 18 + i * 9); });
    plane(.44, .32, lit(hmiTex, P.screen), KX - .26, 1.6, KZ - .18, -Math.PI / 2);
    cyl(KX, 2.0, KZ + .3, .025, .25, 0x5d6670);
    const stackHex = [0x3ee08a, 0xffb02e, 0xff5a4f];
    const stackM = stackHex.map((hex, i) => { const m = kit.own({color: new THREE.Color(hex).multiplyScalar(.35), emissive: new THREE.Color(hex), emissiveIntensity: i === 0 ? 1.8 : .08, roughness: .25}); group.add(kit.cyl(.08, .08, .14, m, KX, 2.25 + i * .145, KZ + .3, 14)); return m; });
    cyl(KX, 2.25 + 3 * .145, KZ + .3, .085, .03, 0x2c3036);

    // ---------- gantry crane overhead: runway beams, bridge and a travelling trolley with hook ----------
    const CRY = 6.0, CRZ = -7.6;
    [-1, 1].forEach((sd) => { box(sd * 10.4, CRY, -3.6, .3, .35, 15, YELLOW); [-10, -4, 2].forEach((z) => box(sd * 10.4, 0, z, .3, CRY, .3, 0x5d6670, {kind: 'metal'})); });
    box(0, CRY + .35, CRZ, 21, .45, .4, YELLOW);
    box(0, CRY + .2, CRZ, 21, .12, .5, 0x2c3036, {kind: 'metal'});
    const trolley = new THREE.Group(); trolley.position.set(-3, CRY + .3, CRZ); group.add(trolley);
    trolley.add(kit.box(.9, .4, .8, mat({color: 0x3a4048, roughness: .4, metalness: .5}), 0, -.35, 0, .04));
    trolley.add(kit.cyl(.015, .015, 2.2, mat({color: 0x22262c, roughness: .5}), 0, -2.55, 0, 6));
    const hookBlock = kit.box(.3, .35, .2, mat({color: YELLOW, roughness: .4}), 0, -2.9, 0, .04); trolley.add(hookBlock);

    // ---------- far sides: drums, gas cylinders, parts rack, tool board, lamps ----------
    const DRUM = [0x2f62b0, 0x2f62b0, 0xd94b3d, 0x3d9a55];
    [[-8.6, -4.2], [-8.0, -4.6], [-8.7, -3.4], [-7.9, -3.6], [-8.4, -2.6]].forEach(([x, z], i) => { cyl(x, 0, z, .3, .9, DRUM[i % DRUM.length]); cyl(x, .9, z, .31, .03, 0x2c3036); });
    [[-10.7, 0], [-10.7, .45], [-10.7, .9]].forEach(([x, z], i) => { cyl(x, 0, z, .14, 1.4, [0x3d9a55, 0x2f62b0, accent][i]); cyl(x, 1.4, z, .06, .12, 0x9aa5b1); });
    const PX = 10.6, PZ = -1.6;
    [-1.2, 1.2].forEach((dz) => box(PX, 0, PZ + dz, .5, 2.4, .06, P.mach, {kind: 'metal'}));
    const BIN = [0x2f74c0, 0xd94b3d, YELLOW, 0x3d9a55, accent];
    for (let k = 0; k < 4; k++) { box(PX, .1 + k * .58, PZ, .5, .04, 2.4, 0x5d6670, {kind: 'metal'}); for (let j = 0; j < 5; j++) box(PX - .05, .14 + k * .58, PZ - .96 + j * .48, .4, .26, .4, BIN[(j + k) % BIN.length]); }
    const toolTex = tex(256, 128, (g, w, h) => { g.fillStyle = '#d8dee4'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 8; y < h; y += 12) for (let x = 8; x < w; x += 12) g.fillRect(x, y, 2, 2); g.fillStyle = '#3a4048'; [[20, 20, 10, 80], [44, 26, 46, 10], [60, 50, 8, 60], [100, 20, 30, 30], [150, 30, 10, 70], [176, 24, 50, 14], [190, 60, 24, 40]].forEach(([x, y, ww, hh]) => g.fillRect(x, y, ww, hh)); g.fillStyle = '#d94b3d'; g.fillRect(100, 60, 30, 50); });
    plane(2.6, 1.3, mat({map: toolTex, roughness: .7}), -11.22, 2.6, -6.8, Math.PI / 2);
    box(-10.6, 0, -6.8, .8, .9, 2.4, accent); box(-10.6, .9, -6.8, .9, .06, 2.5, 0x9aa3ad, {kind: 'metal'});
    // high-bay lamps
    const lampC = glowK(0xfff1d6, P.lamp + .5);
    [[-7, -6.5], [7, -6.5], [-7, -.5], [7, -.5], [-3, -10.0], [3, -10.0]].forEach(([x, z]) => {
      cyl(x, 6.9, z, .015, 1.6, 0x40464f);
      cyl(x, 6.55, z, .42, .36, 0x3a4048);
      box(x, 6.53, z, .62, .03, .62, lampC, {kind: 'glow'});
      if (moodId !== 'day') kit.glow(group, 0xfff1d6, night ? 2.4 : 1.6, x, 6.3, z);
    });

    // ---------- build the instanced parts; contact shadows ----------
    Object.keys(L).forEach((k) => { const [geo, m] = DEFS[k](); instanced(geo, m, L[k], k !== 'glow'); });
    [[CX, (CZ0 + CZ1) / 2, 1.6, CL], [0, MZ, 13.6, 2.2], [RX, RZ, 1.6, 1.6], [KX, KZ, .9, 1.3], [-8.6, -9.8, 2.6, 2.2], [8.6, -9.8, 2.6, 2.6]].forEach(([x, z, w, d]) => { const b = look.makeBlob(w, d, .36); b.position.x = x; b.position.z = z; group.add(b); });
    group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.blob) { o.castShadow = o !== floor && !o.userData.fence && !(o.geometry && o.geometry.type === 'PlaneGeometry'); o.receiveShadow = true; } });

    let t = 0;
    return {
      group,
      update(dt) {
        if (still() || !(dt > 0)) return;
        t += dt;
        const k = (Math.sin(t * .7) + 1) / 2;
        applyPose(pose.yaw + k * 1.6, pose.sh + Math.sin(t * 1.1) * .12, pose.el - k * .35, pose.wr + Math.sin(t * 1.4) * .25);
        for (let i = 0; i < 6; i++) { cz[i] += dt * .55; if (cz[i] > CZ1 - .3) cz[i] = CZ0 + .3; }
        placeCartons();
        belt.offset.y = -(t * .55 / .5) % 1;
        const on = Math.sin(t * 3) > .2;
        stackM[1].emissiveIntensity = on ? 1.6 : .08;
        trolley.position.x = Math.sin(t * .16) * 7;
        hookBlock.position.y = -2.9 + Math.sin(t * .4) * .25;
      },
      dispose() { inst.forEach((m) => m.dispose()); kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
