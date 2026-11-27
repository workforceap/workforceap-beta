// World: a construction job site ("toy diorama"). Set dressing only; the stage (x -3..3, z -6..2, y up to 2) stays empty.
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Primitives, instanced repeats and canvas textures only.
// Layout: a dense, colourful low band behind and beside the stage (z -6.6..-13, mostly under 3.5 high), a tall
// half-built tower and a tower crane behind that for tall canvases and low camera pitches, a far skyline in the fog.
const W = {
  id: 'site',
  label: 'Job site',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const mood = look.moodOf(ctx.mood || theme.mood);
    const night = mood.id === 'night', dusk = mood.id === 'dusk';
    const acc = ctx.accent || look.accentSet(theme.accent || '#ad2c4d');
    const aBase = acc.base.clone(), aBright = acc.bright.clone(), aDark = acc.dark.clone();
    const reduced = !!ctx.reduced;
    const group = new THREE.Group(); group.name = 'world-site';
    const own = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const dummy = new THREE.Object3D();
    // one InstancedMesh from [x, y, z, ry, sx, sy, sz, colour?] (unit-size geometry scaled per instance)
    const inst = (geo, material, list, parent = group, cast = true) => {
      const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((a, i) => {
        dummy.position.set(a[0], a[1], a[2]); dummy.rotation.set(0, a[3] || 0, 0); dummy.scale.set(a[4] || 1, a[5] || 1, a[6] || 1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
        if (a[7] !== undefined) m.setColorAt(i, new THREE.Color(a[7]));
      });
      m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
    };
    const unitBox = kit.geo('site|unitbox', () => new THREE.BoxGeometry(1, 1, 1));
    const glowK = mood.glow, lampK = mood.lamp;
    const steelCol = 0xf0a51e;

    // ---------- ground: warm dirt out to the fog, a gravel work pad under the stage, accent + hazard edging ----------
    const dirt = tex(256, 256, (g, w, h) => {
      const r = look.rng(21); g.fillStyle = dusk ? '#a98a70' : '#b79c76'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3200; i++) { const v = 124 + (r() * 60 | 0); g.fillStyle = `rgba(${v + 30},${v + 6},${v - 30},.42)`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2); }
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(110,80,50,.12)'; g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 30, 8 + r() * 12, r() * 3, 0, 7); g.fill(); }
    }, {repeat: [13, 11], aniso: 8});
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 56), mat({map: dirt, color: night ? 0x56627f : 0xffffff, roughness: 1, metalness: 0}));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -14); ground.receiveShadow = true; group.add(ground);
    const accHex = '#' + aBase.getHexString();
    const slabTex = tex(512, 704, (g, w, h) => {
      const r = look.rng(5); g.fillStyle = dusk ? '#a79aa0' : '#aaa296'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5200; i++) { const v = 150 + (r() * 60 | 0); g.fillStyle = `rgba(${v},${v - 4},${v - 12},.35)`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2); }
      g.strokeStyle = 'rgba(70,60,50,.35)'; g.lineWidth = 3;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); }
      for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); }
      for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(60,50,40,.10)'; g.beginPath(); g.ellipse(r() * w, r() * h, 26 + r() * 40, 5 + r() * 8, 0, 0, 7); g.fill(); }
      // painted accent edge band and chevrons along the sides
      g.fillStyle = accHex; g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h); g.fillRect(0, 0, w, 18);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(28, 0, 6, h); g.fillRect(w - 34, 0, 6, h);
      g.fillStyle = 'rgba(255,255,255,.55)'; for (let y = 60; y < h - 60; y += 96) { g.beginPath(); g.moveTo(w / 2 - 34, y + 34); g.lineTo(w / 2, y); g.lineTo(w / 2 + 34, y + 34); g.lineTo(w / 2 + 34, y + 48); g.lineTo(w / 2, y + 14); g.lineTo(w / 2 - 34, y + 48); g.fill(); }
    }, {aniso: 8});
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 10.2), mat({map: slabTex, color: night ? 0x7480a0 : 0xffffff, roughness: .9, metalness: 0}));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, .004, -1.9); pad.receiveShadow = true; group.add(pad);
    const tape = tex(128, 32, (g, w, h) => { g.fillStyle = '#f5c518'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; for (let x = -h; x < w; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); } }, {repeat: [18, 1]});
    const tapeM = mat({map: tape, roughness: .6});
    const accStrip = mat({color: aBase, emissive: aBright, emissiveIntensity: .5 * glowK, roughness: .5});
    [-1, 1].forEach((s) => {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(.16, 9.8), tapeM); t.rotation.x = -Math.PI / 2; t.position.set(s * 3.82, .008, -2); group.add(t);
      const a = new THREE.Mesh(new THREE.PlaneGeometry(.2, 9.8), accStrip); a.rotation.x = -Math.PI / 2; a.position.set(s * 3.58, .009, -2); group.add(a);
    });
    const farStrip = new THREE.Mesh(new THREE.PlaneGeometry(7.4, .2), accStrip); farStrip.rotation.x = -Math.PI / 2; farStrip.position.set(0, .009, -6.85); group.add(farStrip);
    // tyre ruts, mud patches, painted site road to the gate
    const rutM = mat({color: night ? 0x3c465e : 0x8c7358, roughness: 1});
    [[-9.5, -4, 1.5, 14], [9.2, -2, 1.5, 12], [0, -15, 3.2, 8]].forEach(([x, z, w, d]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), rutM); p.rotation.x = -Math.PI / 2; p.position.set(x, .006, z); group.add(p); });

    // ---------- far skyline in the fog (one instanced mesh) ----------
    const bTex = tex(64, 128, (g, w, h) => {
      g.fillStyle = '#7f8da3'; g.fillRect(0, 0, w, h);
      for (let y = 6; y < h - 4; y += 12) for (let x = 6; x < w - 4; x += 12) { g.fillStyle = (x * 7 + y * 3) % 5 < 2 ? '#e9f2ff' : '#5f6d84'; g.fillRect(x, y, 6, 7); }
    }, {aniso: 2});
    const sky = new THREE.InstancedMesh(unitBox, mat({map: bTex, emissiveMap: night ? bTex : null, emissive: night ? 0xffc870 : 0x000000, emissiveIntensity: night ? .7 : 0, roughness: .9, color: night ? 0x2a3350 : dusk ? 0x9a86a8 : 0xc7d3e2}), 30);
    const rs = look.rng(33);
    for (let i = 0; i < 30; i++) {
      const x = -34 + i * 2.35 + rs() * .8, h = 5 + rs() * 12, w = 1.6 + rs() * 1.8;
      dummy.position.set(x, h / 2, -29 - rs() * 5); dummy.rotation.set(0, 0, 0); dummy.scale.set(w, h, w); dummy.updateMatrix(); sky.setMatrixAt(i, dummy.matrix);
    }
    group.add(sky);

    // ---------- the half-built tower (tall back dressing): concrete columns, floor slabs, lit and unlit panels ----------
    const concrete = mat({color: dusk ? 0xb4a8b0 : 0xc4c3bf, roughness: .92});
    const tw = {x0: -9, x1: 9, z0: -15.4, z1: -12.2};
    const colList = [], slabList = [], winList = [], panelList = [];
    for (let i = 0; i <= 6; i++) { const x = tw.x0 + i * 3; [tw.z0, tw.z1].forEach((z) => colList.push([x, 4.2, z, 0, .42, 8.4, .42])); }
    [2.8, 5.6, 8.4].forEach((y, k) => slabList.push([0, y, (tw.z0 + tw.z1) / 2, 0, 18.6, .28, tw.z1 - tw.z0 + .5]));
    const lit = look.rng(8);
    for (let f = 0; f < 2; f++) for (let b = 0; b < 6; b++) {
      const x = tw.x0 + 1.5 + b * 3, y = 1.4 + f * 2.8;
      if (b === 1 && f === 1) continue;
      const clad = lit() > .45;
      (clad ? panelList : winList).push([x, y, tw.z1 + .05, 0, 2.5, 2.0, .08, clad ? [0xf4f0e6, aBase.getHex(), 0x6fb0d8, 0xffffff][(b + f) % 4] : undefined]);
    }
    inst(unitBox, concrete, colList, group, false); inst(unitBox, concrete, slabList, group, false);
    inst(unitBox, mat({color: 0xffffff, roughness: .6}), panelList, group, false);
    inst(unitBox, mat({color: 0x7fb6d8, roughness: .15, metalness: .1, emissive: night ? 0xffd48a : 0x000000, emissiveIntensity: night ? lampK * .8 : 0}), winList, group, false);

    // ---------- scaffold wall with an accent net and a banner (low band, centre-back) ----------
    const poleM = mat({color: 0xb7bdc6, roughness: .45, metalness: .6});
    const scaf = [];
    for (let i = 0; i <= 8; i++) scaf.push([-4.8 + i * 1.2, 2.2, -11.3, 0, .07, 4.4, .07]);
    [.55, 1.75, 2.95, 4.1].forEach((y) => scaf.push([0, y, -11.3, 0, 9.8, .06, .06], [0, y, -10.9, 0, 9.8, .06, .06]));
    inst(unitBox, poleM, scaf, group, false);
    [.4, 4.5].forEach((y) => { const st = new THREE.Mesh(unitBox, accStrip); st.scale.set(9.8, .09, .09); st.position.set(0, y, -10.82); group.add(st); });
    const planksS = []; [1.75, 2.95, 4.1].forEach((y) => planksS.push([0, y + .04, -11.1, 0, 9.6, .05, .5]));
    inst(unitBox, mat({color: 0xc59a5e, roughness: .8}), planksS, group, false);
    const netTex = tex(256, 128, (g, w, h) => { g.fillStyle = '#' + aBase.getHexString(); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.18)'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h); for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2); });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.5), mat({map: netTex, roughness: .8, side: THREE.DoubleSide})); net.position.set(0, 3.35, -11.36); group.add(net);
    const banTex = tex(512, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#' + aBase.getHexString(); g.fillRect(0, 0, w, 20); g.fillRect(0, h - 20, w, 20); g.fillStyle = '#1b2230'; g.font = '800 58px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SAFETY FIRST', w / 2, h / 2); });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), mat({map: banTex, roughness: .6, side: THREE.DoubleSide})); ban.position.set(-.2, 2.35, -10.74); group.add(ban);

    // ---------- tower crane (mast and jib in the half-light behind; load sways at about 2.6 high) ----------
    const craneM = mat({color: steelCol, roughness: .5, metalness: .2});
    const crane = new THREE.Group(); crane.position.set(4.6, 0, -9.0); crane.scale.setScalar(.6); group.add(crane);
    const mastBars = []; for (let i = 0; i < 12; i++) mastBars.push([0, .3 + i * .5, 0, 0, .62, .07, .62]);
    const mastCols = [[-.28, -.28], [.28, -.28], [-.28, .28], [.28, .28]].map(([x, z]) => [x, 3.1, z, 0, .07, 6.2, .07]);
    inst(unitBox, craneM, mastBars, crane, false); inst(unitBox, craneM, mastCols, crane, false);
    const jib = new THREE.Group(); jib.position.y = 6.3; crane.add(jib);
    const chord = [[-3.4, .0, -.18, 0, 7.6, .08, .08], [-3.4, .0, .18, 0, 7.6, .08, .08], [-3.4, .45, 0, 0, 7.6, .08, .08]];
    const struts = []; for (let i = 0; i < 14; i++) struts.push([-6.9 + i * .52, .22, 0, 0, .06, .46, .4]);
    inst(unitBox, craneM, chord, jib, false); inst(unitBox, craneM, struts, jib, false);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.6, .4, .46), mat({color: 0x808893, roughness: .8})); counter.position.set(2.0, -.05, 0); jib.add(counter);
    const cab = kit.box(.7, .6, .6, mat({color: 0xe6edf4, roughness: .4}), .6, -.62, 0, .08); jib.add(cab);
    const cabStripe = kit.box(.74, .12, .64, mat({color: aBase, roughness: .5}), .6, -.34, 0, .02); jib.add(cabStripe);
    const beaconM = mat({color: 0x551111, emissive: 0xff3322, emissiveIntensity: 1.2, roughness: .4});
    const beacon = new THREE.Mesh(kit.sphereGeo(.12, 10), beaconM); beacon.position.set(-0.2, .75, 0); jib.add(beacon);
    const trolley = new THREE.Group(); trolley.position.set(-2.6, -.1, 0); jib.add(trolley);
    trolley.add(kit.box(.34, .16, .3, craneM, 0, -.08, 0, .03));
    const cable = new THREE.Mesh(kit.cylGeo(.014, .014, 3.3, 5), mat({color: 0x222831})); cable.position.set(0, -1.75, 0); trolley.add(cable);
    const load = new THREE.Group(); load.position.set(0, -3.4, 0); trolley.add(load);
    load.add(kit.box(.4, .22, .4, mat({color: 0xc8372d, roughness: .6}), 0, 0, 0, .04));
    [-.2, 0, .2].forEach((dz, i) => load.add(kit.box(1.5, .1, .14, mat({color: i === 1 ? aBase : steelCol, roughness: .45, metalness: .3}), 0, -.2 - i * .02, dz, .02)));
    const jibBase = -.16; jib.rotation.y = jibBase;

    // ---------- steel frame going up on the left (instanced) ----------
    const steelM = mat({color: 0xe3891f, roughness: .5, metalness: .25});
    const frameG = new THREE.Group(); group.add(frameG);
    const cols = [], beams = [];
    const fx = [-8.2, -6.0], fz = [-10.0, -8.4, -6.8];
    fx.forEach((x) => fz.forEach((z) => cols.push([x, 2.35, z, 0, .26, 4.7, .26])));
    [2.0, 4.3].forEach((y) => {
      fx.forEach((x) => fz.forEach((z, i) => { if (i < 2) beams.push([x, y, (z + fz[i + 1]) / 2, 0, .2, .26, fz[i + 1] - z]); }));
      fz.forEach((z) => beams.push([(fx[0] + fx[1]) / 2, y, z, 0, fx[1] - fx[0], .26, .2]));
    });
    inst(unitBox, steelM, cols, frameG); inst(unitBox, steelM, beams, frameG);
    [0, 1].forEach((k) => { const d = new THREE.Mesh(new THREE.BoxGeometry(2.6, .1, .1), steelM); d.position.set(-7.1, 1.1 + k * 2.2, -6.8); d.rotation.z = k ? .8 : -.8; frameG.add(d); });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, .14, 3.2), mat({color: 0xb8b5ae, roughness: .9})); slab.position.set(-7.1, 2.14, -8.4); slab.castShadow = true; frameG.add(slab);
    group.add(kit.box(.05, .05, 3.2, mat({color: 0xf5c518, roughness: .5}), -8.15, 2.7, -8.4, .01));

    // ---------- the excavator (digging loop), low and close on the right ----------
    const yellow = mat({color: steelCol, roughness: .45, metalness: .15}), darkG = mat({color: 0x2a2f36, roughness: .7});
    const exc = new THREE.Group(); exc.position.set(6.6, 0, -7.6); exc.rotation.y = Math.PI + .35; group.add(exc);
    [-.52, .52].forEach((z) => { exc.add(kit.box(2.2, .38, .42, darkG, 0, 0, z, .12)); });
    const turret = new THREE.Group(); turret.position.y = .38; exc.add(turret);
    turret.add(kit.box(1.5, .5, 1.3, yellow, -.1, 0, 0, .1));
    turret.add(kit.box(.55, .12, 1.32, mat({color: aBase, roughness: .5}), -.62, .5, 0, .03));
    turret.add(kit.box(.8, .75, .9, mat({color: 0x9ed0ea, roughness: .1, metalness: .1, emissive: night ? 0xffe6a8 : 0x000000, emissiveIntensity: night ? lampK * .7 : 0}), .25, .5, -.1, .12));
    turret.add(kit.box(.9, .12, 1.0, yellow, .25, 1.22, -.1, .05));
    const boom = new THREE.Group(); boom.position.set(.7, .45, .45); turret.add(boom);
    const boomMesh = kit.box(2.0, .2, .22, yellow, 1.0, -.1, 0, .06); boom.add(boomMesh);
    const stick = new THREE.Group(); stick.position.set(2.0, 0, 0); boom.add(stick);
    stick.add(kit.box(.2, 1.4, .18, yellow, .1, -1.35, 0, .05));
    const bucket = new THREE.Group(); bucket.position.set(.1, -1.35, 0); stick.add(bucket);
    bucket.add(kit.box(.55, .34, .5, mat({color: 0x4b525c, roughness: .6, metalness: .3}), .22, -.3, 0, .06));
    boom.rotation.z = .45; stick.rotation.z = -.8; bucket.rotation.z = -.5;

    // ---------- steady props on the right: lumber, block stack, sand, shipping container, pipes, light tower ----------
    const lumberTex = tex(128, 64, (g, w, h) => { g.fillStyle = '#e0b97f'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(150,100,50,.45)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(0, 4 + i * 4.4); g.lineTo(w, 4 + i * 4.4 + (i % 3)); g.stroke(); } });
    const planks = [];
    for (let l = 0; l < 6; l++) for (let c = 0; c < 4; c++) planks.push([5.6, .18 + l * .17, -5.4 + c * .3 + (l % 2) * .02, .08, 3.2, .15, .28]);
    inst(unitBox, mat({map: lumberTex, roughness: .8}), planks);
    [4.2, 7.0].forEach((x) => group.add(kit.box(.14, .12, 1.4, mat({color: 0x6e5338, roughness: .9}), x, 0, -4.8, .01)));
    const blocks = [];
    for (let l = 0; l < 4; l++) for (let c = 0; c < 4; c++) for (let d = 0; d < 2; d++) blocks.push([5.3 + c * .42 - (l % 2) * .1, .22 + l * .21, -1.9 + d * .21, 0, .4, .2, .2]);
    inst(unitBox, mat({color: 0xa4a29c, roughness: .95}), blocks);
    group.add(kit.box(1.9, .12, .9, mat({color: 0xa97f4f, roughness: .9}), 5.9, 0, -1.8, .01));
    const sand = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.0, 14), mat({color: 0xe0c68e, roughness: 1})); sand.position.set(8.0, .5, -3.2); sand.castShadow = true; group.add(sand);
    const contTex = tex(256, 128, (g, w, h) => { g.fillStyle = '#' + aBase.getHexString(); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.2)'; for (let x = 0; x < w; x += 12) g.fillRect(x, 0, 4, h); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(14, 12, 86, 8); g.fillRect(14, 28, 56, 5); });
    const cont = new THREE.Mesh(kit.bevel(3.4, 1.5, 1.4, .05), mat({map: contTex, roughness: .55, metalness: .2})); cont.position.set(9.4, .75, -6.4); cont.rotation.y = -.25; cont.castShadow = true; group.add(cont);
    const cont2 = new THREE.Mesh(kit.bevel(3.4, 1.5, 1.4, .05), mat({color: 0x3f7ec4, roughness: .55, metalness: .2})); cont2.position.set(9.0, 2.27, -6.5); cont2.rotation.y = -.15; cont2.castShadow = true; group.add(cont2);
    const pipes = new THREE.InstancedMesh(kit.cylGeo(.13, .13, 2.4, 12), mat({color: 0x4a4f58, roughness: .5, metalness: .5}), 10);
    for (let i = 0; i < 10; i++) { const row = i < 4 ? 0 : i < 7 ? 1 : 2, col = i < 4 ? i : i < 7 ? i - 4 + .5 : i - 7 + 1; dummy.position.set(-5.0, .13 + row * .23, -3.6 + col * .27 - 0.0); dummy.rotation.set(0, 0, Math.PI / 2); dummy.rotation.order = 'YXZ'; dummy.rotation.y = 0.3; dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pipes.setMatrixAt(i, dummy.matrix); }
    dummy.rotation.order = 'XYZ'; pipes.castShadow = true; group.add(pipes);
    // floodlight tower (lit at night)
    const flood = new THREE.Group(); flood.position.set(3.7, 0, -8.6); group.add(flood);
    flood.add(kit.cyl(.06, .08, 3.4, mat({color: 0x6b727a, metalness: .6, roughness: .5}), 0, 0, 0, 8));
    const lampM = mat({color: 0xfff6d8, emissive: 0xfff0b8, emissiveIntensity: night ? lampK * 1.6 : dusk ? .9 : .35});
    flood.add(kit.box(1.0, .34, .14, lampM, 0, 3.4, 0, .02));
    if (night || dusk) kit.glow(flood, 0xfff0c0, 2.4, 0, 3.55, .15);

    // ---------- the left side and the centre: cones, barriers, site trailer, dumpster, barrow, portable toilets, hard hats ----------
    const coneGeo = kit.geo('site|cone', () => new THREE.ConeGeometry(.17, .6, 14));
    const coneBandGeo = kit.geo('site|coneband', () => new THREE.CylinderGeometry(.092, .12, .12, 14));
    const baseGeo = kit.geo('site|conebase', () => new THREE.BoxGeometry(.4, .04, .4));
    const zs = [1.4, -.6, -2.6, -4.6, -6.3];
    const conePos = []; zs.forEach((z) => [-4.15, 4.15].forEach((x) => conePos.push([x, .34, z])));
    inst(coneGeo, mat({color: 0xff6a13, roughness: .55}), conePos);
    inst(coneBandGeo, mat({color: 0xf6f6f6, roughness: .5}), conePos.map((p) => [p[0], .4, p[2]]));
    inst(baseGeo, mat({color: 0xe85d0c, roughness: .6}), conePos.map((p) => [p[0], .02, p[2]]));
    const barM = mat({map: tape, roughness: .6});
    [-1.75, 1.75].forEach((x) => { const b = new THREE.Group(); b.position.set(x, 0, -6.95); group.add(b); b.add(kit.box(3.0, .3, .06, barM, 0, .7, 0, .01)); [-1.35, 1.35].forEach((dx) => b.add(kit.box(.08, .96, .08, mat({color: 0xd8d8d8, roughness: .5}), dx, 0, 0, .01))); });
    const trailer = new THREE.Group(); trailer.position.set(1.7, 0, -9.7); trailer.rotation.y = -.12; group.add(trailer);
    trailer.add(kit.box(3.6, 1.5, 1.5, mat({color: 0xf4f1e8, roughness: .6}), 0, .3, 0, .06));
    trailer.add(kit.box(3.66, .14, 1.56, mat({color: aBase, roughness: .5}), 0, 1.15, 0, .02));
    trailer.add(kit.box(3.76, .08, 1.66, mat({color: 0x8c9199, roughness: .5, metalness: .4}), 0, 1.8, 0, .02));
    const winM = mat({color: 0x8fc4ea, roughness: .1, metalness: .2, emissive: night ? 0xffd890 : 0x000000, emissiveIntensity: night ? lampK * .8 : 0});
    [-1.1, .2].forEach((x) => trailer.add(kit.box(.8, .5, .04, winM, x, 1.0, .76, .01)));
    trailer.add(kit.box(.55, 1.0, .05, mat({color: 0x6b7683, roughness: .6}), 1.3, .3, .77, .01));
    [-1.4, 1.4].forEach((x) => [-.78, .78].forEach((z) => { const w = new THREE.Mesh(kit.cylGeo(.22, .22, .16, 14), mat({color: 0x1a1a1a, roughness: .9})); w.rotation.z = Math.PI / 2; w.position.set(x, .22, z); trailer.add(w); }));
    const signTex = tex(256, 96, (g, w, h) => { g.fillStyle = '#' + aBase.getHexString(); g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '800 42px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SITE OFFICE', w / 2, h / 2); });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .6), mat({map: signTex, roughness: .5})); sign.position.set(-.6, 1.55, .8); trailer.add(sign);
    const dump = new THREE.Group(); dump.position.set(-1.9, 0, -9.7); dump.rotation.y = -.1; group.add(dump);
    dump.add(kit.box(2.2, .9, 1.2, mat({color: 0x2f9a58, roughness: .6, metalness: .2}), 0, .1, 0, .05));
    dump.add(kit.box(2.3, .06, 1.3, mat({color: 0x24703f, roughness: .6}), 0, 1.0, 0, .01));
    const toi = [-5.3, -4.5].map((x, i) => { const t = new THREE.Group(); t.position.set(x, 0, -10.0); group.add(t); t.add(kit.box(.8, 1.9, .8, mat({color: [0x3f9fd0, aBase.getHex()][i], roughness: .55}), 0, 0, 0, .06)); t.add(kit.box(.84, .1, .84, mat({color: 0xf4f4f4, roughness: .5}), 0, 1.9, 0, .02)); t.add(kit.box(.4, .9, .04, mat({color: 0xf4f4f4, roughness: .5}), 0, .3, .41, .01)); return t; });
    void toi;
    const barrow = new THREE.Group(); barrow.position.set(-5.0, 0, -5.2); barrow.rotation.y = .5; group.add(barrow);
    barrow.add(kit.box(.8, .3, .5, mat({color: 0xd9531e, roughness: .6, metalness: .2}), 0, .3, 0, .06));
    const wheel = new THREE.Mesh(kit.cylGeo(.16, .16, .1, 12), mat({color: 0x1a1a1a, roughness: .9})); wheel.rotation.z = Math.PI / 2; wheel.position.set(.5, .16, 0); barrow.add(wheel);
    const hats = new THREE.Group(); hats.position.set(-3.95, 0, -7.7); group.add(hats);
    hats.add(kit.cyl(.03, .03, 1.5, mat({color: 0x6b727a, metalness: .6, roughness: .5}), 0, 0, 0, 8));
    const hatGeo = kit.geo('site|hat', () => new THREE.SphereGeometry(.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    [[0, 1.5, 0xf5c518], [.22, 1.38, 0xffffff], [-.22, 1.38, aBase.getHex()]].forEach(([x, y, c]) => { const h = new THREE.Mesh(hatGeo, mat({color: c, roughness: .4})); h.position.set(x, y, 0); h.castShadow = true; hats.add(h); });
    // foreground, just in front of the stage: sandbags, barrels and an A-frame sign (outside the stage volume)
    const bagGeo = kit.bevel(.7, .22, .36, .09);
    const bags = []; for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 3 - r2; c++) bags.push([4.4 + c * .72 + r2 * .36, .11 + r2 * .22, 3.7 + (c % 2) * .06, .1 * (c - 1)]);
    inst(bagGeo, mat({color: 0xcdb98f, roughness: 1}), bags);
    const barrelGeo = kit.cylGeo(.26, .26, .72, 16);
    inst(barrelGeo, mat({color: 0xff6a13, roughness: .5}), [[-4.2, .36, 3.4], [-4.8, .36, 3.0], [-4.5, 1.08, 3.2]]);
    inst(kit.cylGeo(.262, .262, .12, 16), mat({color: 0xf6f6f6, roughness: .5}), [[-4.2, .36, 3.4], [-4.8, .36, 3.0], [-4.5, 1.08, 3.2]]);
    const aSign = new THREE.Group(); aSign.position.set(-3.5, 0, 3.9); aSign.rotation.y = .3; group.add(aSign);
    [-1, 1].forEach((s2) => { const pl = kit.box(.6, .9, .05, mat({color: aBase, roughness: .5}), 0, 0, 0, .02); pl.position.set(0, .45, s2 * .16); pl.rotation.x = -s2 * .2; aSign.add(pl); });
    aSign.add(kit.box(.42, .42, .06, mat({color: 0xf5c518, roughness: .5}), 0, .3, .26, .02));
    // bunting on the light tower and the scaffold (instanced, waves in the wind)
    const flagGeo = kit.geo('site|flag', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-.13, 0, 0, .13, 0, 0, 0, -.26, 0]), 3)); g.computeVertexNormals(); return g; });
    const flags = new THREE.InstancedMesh(flagGeo, mat({color: 0xffffff, roughness: .7, side: THREE.DoubleSide}), 16);
    const fcol = [aBase.getHex(), 0xf5c518, 0xffffff, 0x3f9fd0];
    for (let i = 0; i < 16; i++) flags.setColorAt(i, new THREE.Color(fcol[i % 4]));
    const buntG = new THREE.Group(); buntG.position.set(0, 3.15, -8.6); group.add(buntG); buntG.add(flags);
    const buntLine = new THREE.Mesh(new THREE.BoxGeometry(7.8, .02, .02), mat({color: 0x8a8a8a})); buntLine.position.set(0, 3.15, -8.6); group.add(buntLine);
    const setFlags = (t) => { for (let i = 0; i < 16; i++) { const x = -3.8 + i * .5; dummy.position.set(x, -Math.sin((i / 15) * Math.PI) * 0.0, 0); dummy.rotation.set(0, 0, reduced ? 0 : Math.sin(t * 1.6 + i * .7) * .14); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); flags.setMatrixAt(i, dummy.matrix); } flags.instanceMatrix.needsUpdate = true; };
    setFlags(0);

    // contact shadows keep the low preset grounded
    [[-7.1, -8.4, 3.2, 4.2], [5.7, -5.0, 3.8, 1.8], [5.9, -1.8, 2.4, 1.4], [1.7, -9.7, 4.2, 2.2], [-1.9, -9.7, 2.6, 1.6], [8.0, -3.2, 2.4, 2.0], [9.2, -6.4, 4.2, 2.2], [6.6, -7.6, 3.2, 2.0], [-4.1, -9.6, 2.2, 1.2]].forEach(([x, z, w, d]) => { const b = look.makeBlob(w, d, .35); b.position.x = x; b.position.z = z; group.add(b); });
    group.traverse((o) => { if (o.isMesh && !o.userData.blob) o.receiveShadow = true; });
    [ground, pad, sky].forEach((o) => { o.castShadow = false; });
    // fewer shadow draw calls: no shadow from tiny pieces, the far band, or the crane
    crane.traverse((o) => { o.castShadow = false; });
    group.updateMatrixWorld(true);
    const bb = new THREE.Box3(), bs = new THREE.Vector3(), bp = new THREE.Vector3();
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.castShadow) return;
      bb.setFromObject(o); bb.getSize(bs); bb.getCenter(bp);
      if (Math.max(bs.x, bs.y, bs.z) < .6 || bp.z < -10) o.castShadow = false;
    });

    let t = 0;
    const base = {boom: boom.rotation.z, stick: stick.rotation.z, bucket: bucket.rotation.z};
    return {
      group,
      update(dt) {
        if (reduced || !(dt > 0)) return;
        t += dt;
        jib.rotation.y = jibBase + Math.sin(t * .1) * .1; trolley.position.x = -2.7 + Math.sin(t * .13) * .35;
        load.rotation.z = Math.sin(t * .8) * .05; load.rotation.x = Math.sin(t * .6 + 1) * .04; load.position.y = -3.4 + Math.sin(t * .5) * .1;
        beaconM.emissiveIntensity = .3 + (Math.sin(t * 3.2) > .3 ? 1.6 : 0);
        const k = (Math.sin(t * .55) + 1) / 2;
        boom.rotation.z = base.boom + k * .22; stick.rotation.z = base.stick + Math.sin(t * .55 + .8) * .45; bucket.rotation.z = base.bucket + Math.sin(t * 1.1) * .5;
        turret.rotation.y = Math.sin(t * .22) * .12;
        setFlags(t);
      },
      dispose() { kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
