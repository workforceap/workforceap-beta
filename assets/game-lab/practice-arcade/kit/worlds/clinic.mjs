// World: a bright community clinic ("toy diorama"). The stage (x -3..3, z -6..2, up to y 2) sits on a soft blue
// floor inset framed by accent strips. Around it: a reception counter under a big lit cross sign (back left), a
// patient queue screen, an eye chart and a heart chart on the mint back wall, an exam bay with an exam bed, a vitals
// monitor, a sink and a half-drawn privacy curtain (back right), a pharmacy shelf and a medical cart (right), waiting
// chairs, a plant and a hand-sanitiser stand (left), frosted windows and an accent handrail along the walls.
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Only primitives, canvas textures and the look kit.
const PAL = {
  day: {wall: 0x9ad6c8, wallLow: 0x3c9a9a, floor: 0xead9bd, inset: 0x86b6cc, wood: 0xc98f55, white: 0xf6f1e7, steel: 0xb9c3cc, curtain: 0xa9d4ea, lamp: .35, screen: .85, strip: .6},
  dusk: {wall: 0xa7c9c4, wallLow: 0x3d7f8a, floor: 0xd9c3aa, inset: 0x7b9cc0, wood: 0xb9804c, white: 0xeee4da, steel: 0xaab0bd, curtain: 0xa3bfe0, lamp: 1.0, screen: 1.05, strip: 1.0},
  night: {wall: 0x2e4d58, wallLow: 0x1c343e, floor: 0x4a5464, inset: 0x34506e, wood: 0x6b4c34, white: 0x9aa3ad, steel: 0x6e7884, curtain: 0x4e6b88, lamp: 1.6, screen: 1.5, strip: 2.0}
};
const mq = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

const W = {
  id: 'clinic',
  label: 'Clinic',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const moodId = PAL[theme.mood] ? theme.mood : (ctx.mood && PAL[ctx.mood.id] ? ctx.mood.id : 'day');
    const P = PAL[moodId], night = moodId === 'night', mood = look.moodOf(moodId);
    const A = ctx.accent && ctx.accent.bright ? ctx.accent : look.accentSet(theme.accent || '#2b7bb9');
    const accent = A.base.clone(), glowC = night ? A.bright.clone() : A.base.clone();
    const accHex = '#' + accent.getHexString();
    const still = () => !!ctx.reduced || mq();
    const group = new THREE.Group(); group.name = 'world-clinic';
    const own = [], inst = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const lit = (map, k) => mat({map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: k, roughness: .4, toneMapped: !night});
    const plane = (w, h, m, x, y, z, ry = 0) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; group.add(p); return p; };
    const flat = (w, d, m, x, z, y = .006) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; group.add(p); return p; };

    // ---------- instanced parts: every plain box / cylinder / sphere goes into a few InstancedMeshes ----------
    const L = {};
    const add = (kind, t) => (L[kind] || (L[kind] = [])).push(t);
    // box(x, y, z, w, h, d, colour, {ry, rx, rz, kind, c}): y is the bottom unless c (centred)
    const box = (x, y, z, w, h, d, c, o = {}) => add(o.kind || 'soft', [x, o.c ? y : y + h / 2, z, o.ry || 0, w, h, d, o.rx || 0, o.rz || 0, c]);
    const cyl = (x, y, z, r, h, c, o = {}) => add(o.kind || 'cyl', [x, o.c ? y : y + h / 2, z, o.ry || 0, 2 * r, h, 2 * r, o.rx || 0, o.rz || 0, c]);
    const sph = (x, y, z, r, c, o = {}) => add(o.kind || 'sph', [x, y, z, o.ry || 0, 2 * r * (o.sx || 1), 2 * r * (o.sy || 1), 2 * r * (o.sz || 1), 0, 0, c]);
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
      soft: () => [kit.bevel(1, 1, 1, .04), mat({color: 0xffffff, roughness: .6, metalness: .03})],
      hard: () => [kit.bevel(1, 1, 1, .008), mat({color: 0xffffff, roughness: .75, metalness: .02})],
      metal: () => [kit.bevel(1, 1, 1, .02), mat({color: 0xffffff, roughness: .3, metalness: .7})],
      cyl: () => [kit.cylGeo(.5, .5, 1, 18), mat({color: 0xffffff, roughness: .5, metalness: .05})],
      cylm: () => [kit.cylGeo(.5, .5, 1, 14), mat({color: 0xffffff, roughness: .3, metalness: .75})],
      sph: () => [kit.sphereGeo(.5, 12), mat({color: 0xffffff, roughness: .7, metalness: 0})],
      glow: () => [new THREE.BoxGeometry(1, 1, 1), kit.basic({color: 0xffffff, toneMapped: false})]
    };
    const glowK = (c, k) => new THREE.Color(c).multiplyScalar(night ? Math.min(1.3, k * .65) : 1);

    // ---------- floor: warm speckled vinyl; a soft blue inset under the stage with accent edge strips ----------
    const vinyl = tex(256, 256, (g, w, h) => {
      const r = look.rng(13); g.fillStyle = '#f4efe6'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2000; i++) { const k = 205 + (r() * 45 | 0); g.fillStyle = `rgba(${k},${k - 4},${k - 14},.55)`; g.fillRect(r() * w, r() * h, 2, 2); }
      g.strokeStyle = 'rgba(150,130,110,.22)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    }, {repeat: [16, 16], aniso: 8});
    const floor = flat(48, 48, mat({map: vinyl, color: P.floor, roughness: .5, metalness: 0}), 0, -4, 0);
    flat(6.6, 8.8, mat({color: P.inset, roughness: .55}), 0, -2.0, .004);
    box(-3.36, 0, -2.0, .1, .012, 8.8, glowK(glowC, P.strip), {kind: 'glow'});
    box(3.36, 0, -2.0, .1, .012, 8.8, glowK(glowC, P.strip), {kind: 'glow'});

    // ---------- walls: mint walls with a teal lower band and an accent handrail; frosted windows ----------
    const wallZ = -11.0, WH = 6.6;
    box(0, 0, wallZ - .15, 44, WH, .3, P.wall, {kind: 'hard'});
    [-1, 1].forEach((sd) => box(sd * 10.6, 0, -3.4, .3, WH, 15.6, P.wall, {kind: 'hard'}));
    box(0, 0, wallZ + .03, 44, 1.05, .06, P.wallLow, {kind: 'hard'});
    [-1, 1].forEach((sd) => box(sd * 10.42, 0, -3.4, .06, 1.05, 15.6, P.wallLow, {kind: 'hard'}));
    box(0, .98, wallZ + .12, 44, .09, .09, accent, {kind: 'soft'});
    [-1, 1].forEach((sd) => box(sd * 10.33, .98, -3.4, .09, .09, 15.6, accent, {kind: 'soft'}));
    box(0, 1.1, wallZ + .1, 44, .03, .03, glowK(glowC, P.strip * .7), {kind: 'glow'});
    // crown band near the top
    box(0, 5.4, wallZ + .04, 44, .22, .06, P.white, {kind: 'hard'});
    // frosted windows on the side walls (daylight by day, deep blue at night)
    const win = tex(256, 192, (g, w, h) => {
      const c = new THREE.Color(mood.window); const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#' + c.clone().offsetHSL(0, -.05, .06).getHexString()); gr.addColorStop(1, '#' + c.clone().offsetHSL(0, -.15, .14).getHexString());
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.2)'; for (let x = 0; x < w; x += 14) g.fillRect(x, 0, 6, h);
    });
    const paneM = mat({map: win, emissiveMap: win, emissive: 0xffffff, emissiveIntensity: mood.windowGlow * .9, roughness: .3});
    [[-10.43, Math.PI / 2], [10.43, -Math.PI / 2]].forEach(([x, ry]) => {
      plane(5.6, 2.6, paneM, x, 2.9, -4.4, ry);
      [1.55, 4.25].forEach((y) => box(x, y - .06, -4.4, .14, .12, 5.8, P.white, {kind: 'hard'}));
      [-7.25, -4.4, -1.55].forEach((z) => box(x, 1.55, z, .14, 2.75, .12, P.white, {kind: 'hard'}));
    });

    // ---------- reception (back left): counter, desk, computer, bell, plant; big lit cross sign + label ----------
    const RX = -4.5, RZ = -8.3;
    box(RX, 0, RZ, 4.4, 1.1, .32, P.white);
    box(RX, .55, RZ + .17, 4.4, .2, .04, accent);
    box(RX, 1.1, RZ + .05, 4.6, .07, .55, P.wood);
    box(RX, 0, RZ - .8, 4.4, .74, .8, P.white);
    box(RX, .74, RZ - .8, 4.5, .05, .86, P.wood);
    box(RX - .9, .79, RZ - .85, .7, .44, .05, 0x23272e, {ry: .25});
    box(RX - .9, .79, RZ - .9, .08, .2, .08, 0x5a6270);
    cyl(RX + .7, 1.17, RZ + .05, .09, .09, 0xd9a93e, {kind: 'cylm'});
    box(RX + 1.5, 1.17, RZ + .02, .3, .36, .2, 0xdfe5ea, {rx: -.3});
    cyl(RX - 1.8, 1.17, RZ + .05, .13, .2, P.white);
    [[0, .45, 0, .17], [.08, .52, -.05, .12], [-.08, .5, .06, .13]].forEach(([dx, y, dz, r]) => sph(RX - 1.8 + dx, 1.17 + y - .1, RZ + .05 + dz, r, 0x4f9a5a));
    box(RX + .6, 0, RZ - 1.6, .55, .45, .5, 0x3b6f86); box(RX + .6, .45, RZ - 1.85, .55, .6, .08, 0x3b6f86);
    // cross sign: a rounded accent plate with a white cross (glows at night), and a "Reception" label
    const crossTex = tex(256, 256, (g, w) => {
      g.fillStyle = accHex; g.beginPath(); g.roundRect(8, 8, w - 16, w - 16, 46); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.roundRect(8, 8, w - 16, (w - 16) / 2, [46, 46, 0, 0]); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(w / 2 - 30, 44, 60, w - 88); g.fillRect(44, w / 2 - 30, w - 88, 60);
    }, {aniso: 8});
    const crossM = mat({map: crossTex, emissiveMap: crossTex, emissive: 0xffffff, emissiveIntensity: night ? 1.25 : moodId === 'dusk' ? .55 : .25, roughness: .4, transparent: true, toneMapped: !night});
    // Kept low (top edge about y 2.5) so the gate and sort framings (focus y up to ~1.3, pitch ~40) still show it.
    plane(1.0, 1.0, crossM, -4.6, 1.95, wallZ + .05);
    const sign = kit.label('Reception', {w: 2.2, h: .56, bg: night ? '#e8eef2' : '#ffffff', fg: '#163a44', accent: accHex, depth: .06});
    sign.position.set(-2.9, 1.95, wallZ + .06); group.add(sign);
    if (night) kit.glow(group, A.bright.getHex(), 2.2, -4.6, 1.95, wallZ + .3);
    // a second, lower cue that stays in view even in tight framings: a cross plate on the counter front and a
    // small upright "Reception" desk sign standing on the counter top
    plane(.62, .62, crossM, RX + 1.25, .6, RZ + .2);
    const deskSign = kit.label('Reception', {w: 1.3, h: .34, bg: night ? '#e8eef2' : '#ffffff', fg: '#163a44', accent: accHex, depth: .05});
    deskSign.position.set(RX - .55, 1.36, RZ + .12); group.add(deskSign);
    box(RX - .55, 1.17, RZ + .08, .5, .03, .14, 0x2a2e33, {kind: 'metal'});

    // ---------- back wall: queue screen, eye chart, heart chart, clock ----------
    const monTex = tex(320, 180, (g, w, h) => {
      g.fillStyle = '#f5f8fa'; g.fillRect(0, 0, w, h);
      g.fillStyle = accHex; g.fillRect(0, 0, w, 40);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(22, 20, 9, 0, 7); g.fill();
      g.fillStyle = '#1a1a1a'; g.font = '800 64px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('A 12', 20, 98);
      [0, 1, 2].forEach((i) => { g.fillStyle = i ? '#d5dde3' : '#b9c9d6'; g.fillRect(186, 64 + i * 26, 116 - i * 16, 14); });
      g.fillStyle = '#c4d0d8'; g.fillRect(18, 148, 284, 12); g.fillStyle = '#4a9b4f'; g.fillRect(18, 148, 170, 12);
    });
    box(.05, 2.05, wallZ + .02, 2.0, 1.2, .08, 0x1f2329);
    plane(1.88, 1.06, lit(monTex, P.screen), .05, 2.65, wallZ + .07);
    const eyeTex = tex(192, 256, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#16202a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      [['E', 74], ['F P', 46], ['T O Z', 32], ['L P E D', 23], ['P E C F D', 17], ['E D F C Z P', 12]].forEach(([t, px], i) => { g.font = `700 ${px}px system-ui, sans-serif`; g.fillText(t, w / 2, 46 + [0, 62, 108, 145, 174, 198][i]); });
      g.fillStyle = '#c33'; g.fillRect(24, 226, w - 48, 4);
    }, {aniso: 8});
    box(1.75, 1.8, wallZ + .02, 1.12, 1.48, .05, P.wood);
    plane(1.0, 1.36, mat({map: eyeTex, roughness: .7}), 1.75, 2.54, wallZ + .06);
    const heartTex = tex(192, 256, (g, w, h) => {
      g.fillStyle = '#fbf7ef'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d64545'; g.beginPath(); g.moveTo(96, 170); g.bezierCurveTo(20, 120, 30, 50, 96, 80); g.bezierCurveTo(162, 50, 172, 120, 96, 170); g.fill();
      g.strokeStyle = '#2b6cb0'; g.lineWidth = 8; g.beginPath(); g.moveTo(80, 76); g.lineTo(80, 36); g.moveTo(112, 76); g.lineTo(120, 30); g.stroke();
      g.strokeStyle = '#d64545'; g.lineWidth = 5; g.beginPath(); [[16, 214], [62, 214], [76, 190], [92, 236], [106, 204], [116, 214], [176, 214]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    }, {aniso: 8});
    box(2.95, 1.9, wallZ + .02, .96, 1.24, .05, P.wood);
    plane(.86, 1.12, mat({map: heartTex, roughness: .7}), 2.95, 2.52, wallZ + .06);
    // wall clock with a ticking second hand
    const clock = new THREE.Group(); clock.position.set(.05, 3.75, wallZ + .05); group.add(clock);
    const face = kit.cyl(.34, .34, .05, mat({color: 0xffffff, roughness: .4}), 0, 0, 0, 28); face.rotation.x = Math.PI / 2; face.position.set(0, 0, .03); clock.add(face);
    const rim = kit.cyl(.38, .38, .04, mat({color: 0x2a2e33, roughness: .4, metalness: .4}), 0, 0, 0, 28); rim.rotation.x = Math.PI / 2; rim.position.z = .01; clock.add(rim);
    const handM = mat({color: 0x1a1a1a, roughness: .5});
    const pivot = (mesh, len, rot) => { const p = new THREE.Group(); p.position.z = .07; mesh.position.set(0, len / 2 - .02, 0); p.add(mesh); p.rotation.z = rot; clock.add(p); return p; };
    pivot(new THREE.Mesh(kit.bevel(.04, .18, .02, .005), handM), .18, -2.2);
    pivot(new THREE.Mesh(kit.bevel(.03, .27, .02, .005), handM), .27, .6);
    const sec = pivot(new THREE.Mesh(kit.bevel(.014, .3, .012, .004), mat({color: accent, roughness: .4})), .3, 0);

    // ---------- exam bay (back right): exam bed, step, vitals monitor, sink, scale, half-drawn privacy curtain ----------
    const BX = 5.2, BZ = -9.4;
    box(BX, 0, BZ, 1.9, .5, .7, P.steel, {kind: 'metal'});
    box(BX + .15, .5, BZ, 1.6, .17, .8, 0x2f8fa8);
    box(BX - .85, .74, BZ, .6, .14, .8, 0x2f8fa8, {c: true, rz: -.35});
    box(BX + .2, .67, BZ, 1.3, .012, .52, 0xfbfbf4, {kind: 'hard'});
    box(BX, 0, BZ + .62, .6, .22, .34, 0x8796a4);
    // vitals monitor on a wheeled pole, its pulse line scrolls
    cyl(3.85, 0, -10.1, .22, .06, 0x3d4652, {kind: 'cylm'});
    cyl(3.85, 0, -10.1, .025, 1.6, P.steel, {kind: 'cylm'});
    box(3.85, 1.45, -10.1, .7, .52, .16, 0x2a3038, {ry: .45});
    const ecgTex = tex(256, 64, (g, w, h) => {
      g.fillStyle = '#071a14'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#43f08f'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
      [[0, 38], [60, 38], [72, 30], [84, 38], [100, 38], [108, 10], [118, 56], [126, 38], [170, 38], [184, 28], [198, 38], [256, 38]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    }, {repeat: [1, 1]});
    ecgTex.wrapS = THREE.RepeatWrapping;
    const ecg = plane(.6, .4, lit(ecgTex, P.screen * 1.1), 3.85 + Math.sin(.45) * .085, 1.71, -10.1 + Math.cos(.45) * .085, .45);
    // IV stand with a fluid bag
    cyl(6.7, 0, -10.2, .2, .05, 0x3d4652, {kind: 'cylm'}); cyl(6.7, 0, -10.2, .02, 2.1, P.steel, {kind: 'cylm'});
    box(6.7, 1.75, -10.2, .22, .32, .08, 0xcfe8f4); box(6.7, 2.08, -10.2, .3, .03, .03, P.steel, {kind: 'metal'});
    // sink cabinet with mirror and towel dispenser
    box(8.4, 0, -10.5, 1.7, .9, .7, P.white); box(8.4, .9, -10.5, 1.8, .07, .78, 0xd8dee4, {kind: 'hard'});
    cyl(8.4, .93, -10.45, .3, .05, 0xe9eef2); cyl(8.4, .97, -10.75, .03, .3, P.steel, {kind: 'cylm'});
    box(8.4, 1.25, -10.68, .04, .04, .2, P.steel, {kind: 'metal'});
    box(8.4, 1.45, wallZ + .02, 1.1, 1.0, .03, 0xcfe4ef, {kind: 'metal'});
    box(9.45, 1.4, wallZ + .05, .34, .44, .16, P.white);
    box(8.4, 0, -10.84 + .04, 1.6, .7, .02, accent, {kind: 'hard'});
    // weighing scale
    box(9.3, 0, -8.6, .5, .08, .5, 0x3d4652); cyl(9.3, .08, -8.8, .03, 1.4, P.steel, {kind: 'cylm'}); box(9.3, 1.45, -8.8, .3, .2, .1, P.white);
    // curtain rail (L-shape) and a half-drawn curtain bunched in the corner
    cyl(6.2, 3.05, -7.6, .03, 4.8, P.steel, {kind: 'cylm', c: true, rz: Math.PI / 2});
    cyl(8.6, 3.05, -9.3, .03, 3.4, P.steel, {kind: 'cylm', c: true, rx: Math.PI / 2});
    [[3.9, -7.6], [8.6, -7.6], [8.6, -10.9]].forEach(([x, z]) => cyl(x, 3.05, z, .02, 3.55, P.steel, {kind: 'cylm'}));
    const curtTex = tex(256, 256, (g, w, h) => {
      const c = new THREE.Color(P.curtain);
      for (let x = 0; x < w; x += 32) { const gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, '#' + c.clone().offsetHSL(0, 0, -.1).getHexString()); gr.addColorStop(.5, '#' + c.clone().offsetHSL(0, 0, .06).getHexString()); gr.addColorStop(1, '#' + c.clone().offsetHSL(0, 0, -.1).getHexString()); g.fillStyle = gr; g.fillRect(x, 0, 32, h); }
      g.fillStyle = 'rgba(255,255,255,.35)'; for (let y = 30; y < h - 30; y += 36) for (let x = 10; x < w; x += 32) { g.beginPath(); g.arc(x + (y % 72 ? 8 : 0), y, 3, 0, 7); g.fill(); }
      g.fillStyle = accHex; g.fillRect(0, h - 18, w, 18);
      g.fillStyle = '#e8eef2'; g.fillRect(0, 0, w, 14);
    });
    const curtM = mat({map: curtTex, roughness: .85, side: THREE.DoubleSide});
    const pleated = (len, folds) => { const gg = new THREE.PlaneGeometry(len, 2.75, folds * 2, 1); const pa = gg.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i); pa.setZ(i, Math.sin((x / len + .5) * folds * Math.PI * 2) * .08); } gg.computeVertexNormals(); return gg; };
    const c1 = new THREE.Mesh(pleated(1.5, 5), curtM); c1.position.set(7.85, 1.65, -7.6); group.add(c1);
    const c2 = new THREE.Mesh(pleated(1.6, 5), curtM); c2.position.set(8.6, 1.65, -8.4); c2.rotation.y = Math.PI / 2; group.add(c2);

    // ---------- right side: pharmacy shelf with bottles and boxes, a medical cart, supply cabinet ----------
    const SX = 4.65, SZ = -3.5, SW = 2.6;
    [-SW / 2, SW / 2].forEach((dz) => box(SX, 0, SZ + dz, .5, 2.2, .05, P.white, {kind: 'hard'}));
    box(SX + .23, 0, SZ, .04, 2.2, SW, accent, {kind: 'hard'});
    const r = look.rng(57);
    const BOXC = [0x8fc8e8, 0xf2b8a0, 0xc9e3a6, 0xf6e08a, 0xd7c2ef, 0xffffff];
    for (let k = 0; k < 4; k++) {
      const y = .08 + k * .52;
      box(SX, y - .04, SZ, .5, .04, SW, P.white, {kind: 'hard'});
      for (let z = SZ - SW / 2 + .14; z < SZ + SW / 2 - .1;) {
        if (r() < .55) { const h = .2 + r() * .1; cyl(SX - .05, y, z, .06, h, [0xd9822b, 0xe9eef2, 0xd9822b][(r() * 3) | 0]); cyl(SX - .05, y + h, z, .065, .05, [0xffffff, accent, 0x4a9b4f][(r() * 3) | 0]); z += .16; }
        else { const w = .16 + r() * .14, h = .18 + r() * .16; box(SX - .04, y, z + w / 2, .3, h, w, BOXC[(r() * BOXC.length) | 0], {kind: 'hard'}); z += w + .03; }
      }
    }
    box(SX, 2.08, SZ, .5, .05, SW, P.white, {kind: 'hard'});
    // medical cart with accent drawers
    const MX = 4.4, MZ = -.5;
    box(MX, .1, MZ, .6, .85, .8, accent);
    [0, 1, 2].forEach((i) => { box(MX - .31, .2 + i * .27, MZ, .02, .2, .7, A.dark); box(MX - .33, .27 + i * .27, MZ, .03, .04, .3, P.white, {kind: 'metal'}); });
    box(MX, .95, MZ, .66, .05, .86, P.white, {kind: 'hard'});
    [[-.25, -.33], [.25, -.33], [-.25, .33], [.25, .33]].forEach(([dx, dz]) => cyl(MX + dx, 0, MZ + dz, .06, .1, 0x2a2e35));
    box(MX + .05, 1.0, MZ - .2, .22, .14, .2, 0xf2f6f8); cyl(MX + .05, 1.0, MZ + .2, .07, .2, 0xd9822b);
    // supply cabinet and fridge further out
    box(8.6, 0, -4.2, .7, 2.3, 1.8, P.white); box(8.24, .15, -4.2, .02, 2.0, 1.7, 0xcfe4ef, {kind: 'metal'});
    box(8.7, 0, -1.6, .8, 1.7, .9, 0xe8eef2); box(8.28, 1.2, -1.6, .02, .2, .4, glowK(A.bright, 1.2), {kind: 'glow'});

    // ---------- left side: waiting chairs, side table, plant, sanitiser stand, water cooler ----------
    const CH = [0x3c9a9a, 0xf28c6b, 0x3c9a9a, 0xf2c14e];
    [-5.0, -4.3, -3.6, -2.9].forEach((z, i) => {
      box(-4.6, .4, z, .52, .1, .56, CH[i]); box(-4.88, .45, z, .09, .6, .56, CH[i]);
    });
    box(-4.68, 0, -3.95, .06, .4, 2.6, P.steel, {kind: 'metal'});
    [-5.3, -2.6].forEach((z) => box(-4.68, 0, z, .5, .42, .05, P.steel, {kind: 'metal'}));
    box(-4.6, 0, -1.9, .55, .48, .55, P.wood); box(-4.62, .48, -1.92, .34, .03, .26, 0x2b7bb9, {kind: 'hard'}); box(-4.56, .51, -1.88, .3, .03, .24, 0xf2e6c8, {kind: 'hard'});
    cyl(-4.5, 0, -.7, .26, .46, P.white);
    const pr = look.rng(5);
    for (let i = 0; i < 7; i++) sph(-4.5 + (pr() - .5) * .4, .7 + pr() * .55, -.7 + (pr() - .5) * .4, .2 + pr() * .08, 0x4f9a5a);
    box(-3.95, 0, 1.4, .3, .05, .3, 0x5a6270); box(-3.95, 0, 1.4, .05, 1.05, .05, P.steel, {kind: 'metal'});
    box(-3.95, 1.05, 1.42, .2, .28, .14, P.white); box(-3.95, 1.16, 1.5, .07, .05, .04, accent);
    box(-8.4, 0, -9.9, .55, 1.0, .55, P.white); cyl(-8.4, 1.0, -9.9, .2, .5, 0x9fd0ef);
    box(-7.4, 0, -6.6, .6, .45, 1.4, P.wood); // bench
    cyl(-8.6, 0, -2.6, .3, .5, P.white);
    for (let i = 0; i < 6; i++) sph(-8.6 + (pr() - .5) * .4, .8 + pr() * .6, -2.6 + (pr() - .5) * .4, .24, 0x5aa564);
    // hand-washing poster on the left wall
    const handTex = tex(160, 220, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = accHex; g.fillRect(0, 0, w, 30); g.fillStyle = '#7cc4e8'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(40 + (i % 2) * 80, 80 + (i >> 1) * 80, 28, 0, 7); g.fill(); } g.fillStyle = '#f4c7a1'; for (let i = 0; i < 4; i++) g.fillRect(28 + (i % 2) * 80, 70 + (i >> 1) * 80, 24, 22); });
    plane(.9, 1.24, mat({map: handTex, roughness: .7}), -10.43, 2.6, -8.6, Math.PI / 2);
    // wall sconces (warm glow at dusk and night) and wayfinding stripes on the floor
    [[-7.9, wallZ + .1, 0], [-1.3, wallZ + .1, 0], [-10.4, -1.2, 1], [10.4, -1.2, 1], [-10.4, -7.6, 1], [10.4, -7.6, 1]].forEach(([x, z, side]) => {
      box(x, 3.3, z, side ? .12 : .34, .3, side ? .34 : .12, P.white);
      if (moodId !== 'day') kit.glow(group, 0xffd9a0, moodId === 'night' ? 1.9 : 1.3, x + (side ? -Math.sign(x) * .2 : 0), 3.45, z + (side ? 0 : .2));
    });
    [[-3.75, 0x3c9a9a], [3.75, A.soft]].forEach(([x, c]) => box(x, 0, -1.5, .16, .012, 15, c, {kind: 'hard'}));
    box(-4.6, 0, -7.0, 1.8, .012, .16, 0x3c9a9a, {kind: 'hard'}); box(-3.75, 0, -7.0, .16, .012, .16, 0x3c9a9a, {kind: 'hard'});
    box(5.0, 0, -7.0, 2.5, .012, .16, A.soft, {kind: 'hard'});

    // ---------- build the instanced parts ----------
    Object.keys(L).forEach((k) => { const [geo, m] = DEFS[k](); instanced(geo, m, L[k], k !== 'glow'); });
    // contact shadows
    [[RX, RZ - .4, 5.0, 1.8], [BX, BZ, 2.4, 1.2], [SX, SZ, .9, 2.8], [MX, MZ, .9, 1.1], [-4.6, -3.9, 1.0, 2.8], [-4.5, -.7, .8, .8]].forEach(([x, z, w, d]) => { const b = look.makeBlob(w, d, .34); b.position.x = x; b.position.z = z; group.add(b); });
    group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.blob) { o.castShadow = o !== floor && !o.parent.name.startsWith('label') && o.material !== paneM; o.receiveShadow = true; } });

    let t = 0;
    return {
      group,
      update(dt) {
        if (still() || !(dt > 0)) return;
        t += dt;
        sec.rotation.z = -Math.floor(t) * (Math.PI / 30);
        ecgTex.offset.x = (t * .35) % 1;
        ecg.material.emissiveIntensity = P.screen * (1.05 + .12 * Math.max(0, Math.sin(t * 7)));
      },
      dispose() { inst.forEach((m) => m.dispose()); kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
