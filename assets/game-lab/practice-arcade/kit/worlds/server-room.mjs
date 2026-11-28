// World: a data-centre server room ("toy diorama"). The stage (x -3..3, z -6..2, up to y 2) is the cold aisle:
// perforated floor tiles framed by glowing accent strips. Two rows of racks with blinking status LEDs stand on each
// side, a network operations desk faces a big video wall at the back, cable trays and light panels hang overhead,
// cooling units stand in the back corners. Night turns it into a dark navy security operations room lit by screens,
// LEDs and accent strips (the "Firewall Defender" feeling).
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Only primitives, canvas textures and the look kit.
const PAL = {
  day: {wall: 0x4d6f96, wallLow: 0x34506f, floor: 0xaebdd0, aisle: 0x9fb4d2, rack: 0x262d38, trim: 0x1b2230, ceil: 0xdfe8f2, screen: .9, led: 1.1, strip: .55, glowFloor: .5},
  dusk: {wall: 0x5b5a86, wallLow: 0x403e66, floor: 0xa7a3bf, aisle: 0x9b9cc4, rack: 0x252a36, trim: 0x1c1e2c, ceil: 0xd8cfe0, screen: 1.15, led: 1.25, strip: 1.0, glowFloor: .9},
  night: {wall: 0x141d33, wallLow: 0x0e1526, floor: 0x2b3756, aisle: 0x34446a, rack: 0x1a202b, trim: 0x10141d, ceil: 0x2a3550, screen: 1.6, led: 1.6, strip: 2.0, glowFloor: 1.6}
};
const mq = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

const W = {
  id: 'server-room',
  label: 'Server room',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const moodId = PAL[theme.mood] ? theme.mood : (ctx.mood && PAL[ctx.mood.id] ? ctx.mood.id : 'day');
    const P = PAL[moodId], night = moodId === 'night', mood = look.moodOf(moodId);
    const A = ctx.accent && ctx.accent.bright ? ctx.accent : look.accentSet(theme.accent || '#2b7bb9');
    const accent = A.base.clone(), bright = A.bright.clone();
    const glowC = night ? bright : accent; // accent emissive colour for strips
    const still = () => !!ctx.reduced || mq();
    const group = new THREE.Group(); group.name = 'world-server-room';
    const own = [], inst = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const glowMat = (c, k) => (night ? kit.basic({color: c.clone().multiplyScalar(Math.min(1.4, k * .7)), toneMapped: false}) : mat({color: c, emissive: c, emissiveIntensity: k * .5, roughness: .4}));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    // list entries: [x, y, z, ry, sx, sy, sz, rx, rz]; colors: optional THREE.Color per instance
    function instanced(geo, material, list, colors, shadow = true) {
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((t, i) => {
        v.set(t[0], t[1], t[2]); e.set(t[7] || 0, t[3] || 0, t[8] || 0); q.setFromEuler(e); s.set(t[4] || 1, t[5] || 1, t[6] || 1);
        m4.compose(v, q, s); im.setMatrixAt(i, m4); if (colors) im.setColorAt(i, colors[i]);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; inst.push(im); group.add(im); return im;
    }
    const flat = (w, d, m, x, z, y = .006) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; p.userData.noShadow = true; group.add(p); return p; };

    // ---------- raised floor: 60 cm tiles; perforated tiles in the cold aisle (the stage) ----------
    const tileTex = (perf) => tex(256, 256, (g) => {
      const r = look.rng(perf ? 5 : 3);
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
        const x0 = tx * 128, y0 = ty * 128, holes = perf || (tx + ty * 3) % 4 === 3;
        g.fillStyle = holes ? '#e4e8ee' : '#f2f4f7'; g.fillRect(x0, y0, 128, 128);
        for (let i = 0; i < 160; i++) { const k = 215 + (r() * 30 | 0); g.fillStyle = `rgba(${k},${k},${k},.4)`; g.fillRect(x0 + r() * 128, y0 + r() * 128, 2, 2); }
        if (holes) { g.fillStyle = 'rgba(40,50,70,.3)'; for (let yy = 16; yy < 118; yy += 10) for (let xx = 16; xx < 118; xx += 10) g.fillRect(x0 + xx, y0 + yy, 5, 5); }
        g.strokeStyle = 'rgba(30,38,54,.34)'; g.lineWidth = 4; g.strokeRect(x0 + 2.5, y0 + 2.5, 123, 123);
      }
    }, {repeat: perf ? [6.4 / 1.2, 8.8 / 1.2] : [48 / 1.2, 48 / 1.2], aniso: 8});
    const floor = flat(48, 48, mat({map: tileTex(false), color: P.floor, roughness: .62, metalness: .05}), 0, -4, 0);
    flat(6.4, 8.8, mat({map: tileTex(true), color: P.aisle, roughness: .55, metalness: .08}), 0, -2.0, .004);
    // accent edge strips framing the cold aisle, and cool glow strips at the foot of each rack row
    const edgeM = glowMat(glowC, P.strip);
    instanced(new THREE.PlaneGeometry(.1, 13.6), edgeM, [[-3.3, .008, -3.6, 0, 1, 1, 1, -Math.PI / 2], [3.3, .008, -3.6, 0, 1, 1, 1, -Math.PI / 2]], null, false);
    const coolC = new THREE.Color(night ? 0x63b4ff : 0x8fc8ff);
    instanced(new THREE.PlaneGeometry(.06, 13.4), glowMat(coolC, P.glowFloor), [[-3.9, .009, -3.4, 0, 1, 1, 1, -Math.PI / 2], [3.9, .009, -3.4, 0, 1, 1, 1, -Math.PI / 2]], null, false);

    // ---------- walls: back wall with a big video wall; side walls far out ----------
    const wallZ = -11.2, WH = 7.2;
    const wallM = mat({color: P.wall, roughness: .8, metalness: .05}), lowM = mat({color: P.wallLow, roughness: .7, metalness: .1});
    const panelTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(0, 0, 4, h); g.fillRect(0, 0, w, 4); }, {repeat: [12, 2], aniso: 4});
    wallM.map = panelTex;
    const walls = [[0, WH / 2, wallZ, 0, 44, WH, .3], [-10.6, WH / 2, -3, 0, .3, WH, 16.6], [10.6, WH / 2, -3, 0, .3, WH, 16.6]];
    instanced(kit.bevel(1, 1, 1, .01), wallM, walls, null, false);
    instanced(kit.bevel(1, 1, 1, .01), lowM, [[0, .45, wallZ + .2, 0, 44, .9, .2], [-10.4, .45, -3, 0, .2, .9, 16.6], [10.4, .45, -3, 0, .2, .9, 16.6]], null, false);
    // accent light band along the top of the walls
    instanced(new THREE.BoxGeometry(1, 1, 1), glowMat(glowC, P.strip * .8), [[0, 5.75, wallZ + .2, 0, 21, .08, .06], [-10.42, 5.75, -3.4, 0, .06, .08, 15], [10.42, 5.75, -3.4, 0, .06, .08, 15]], null, false);

    // video wall: one texture spanning four big panels (map dots, graphs, bars, status ring; no text)
    const VW = 12.4, VH = 3.1, VY = 2.95;
    const vwTex = tex(1536, 384, (g, w, h) => {
      g.fillStyle = '#081221'; g.fillRect(0, 0, w, h);
      const r = look.rng(21), acc = '#' + bright.getHexString();
      for (let p = 0; p < 4; p++) {
        const x0 = p * 384;
        g.fillStyle = '#0d1b31'; g.fillRect(x0 + 6, 6, 372, h - 12);
        g.fillStyle = '#132844'; g.fillRect(x0 + 6, 6, 372, 30);
        g.fillStyle = acc; g.fillRect(x0 + 16, 15, 90, 12);
        g.fillStyle = '#4fd18b'; g.beginPath(); g.arc(x0 + 360, 21, 7, 0, 7); g.fill();
        if (p === 0 || p === 3) { // network map: dots and links
          const pts = []; for (let i = 0; i < 12; i++) pts.push([x0 + 40 + r() * 300, 70 + r() * 270]);
          g.strokeStyle = 'rgba(90,170,255,.55)'; g.lineWidth = 3;
          pts.forEach((a, i) => { const b = pts[(i * 5 + 3) % pts.length]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
          pts.forEach((a, i) => { g.fillStyle = i === 4 ? '#ffb02e' : i === 9 ? acc : '#5fd0ff'; g.beginPath(); g.arc(a[0], a[1], i === 4 || i === 9 ? 11 : 7, 0, 7); g.fill(); });
        } else if (p === 1) { // traffic graph
          g.strokeStyle = 'rgba(120,160,210,.25)'; g.lineWidth = 2; for (let y = 90; y < 350; y += 50) { g.beginPath(); g.moveTo(x0 + 24, y); g.lineTo(x0 + 360, y); g.stroke(); }
          [['#4fb3ff', 0], [acc, 1.7]].forEach(([c, ph]) => { g.strokeStyle = c; g.lineWidth = 7; g.beginPath(); for (let i = 0; i <= 24; i++) { const x = x0 + 26 + i * 14, y = 230 - Math.sin(i * .55 + ph) * 60 - r() * 30; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); });
        } else { // status ring + bars
          g.lineWidth = 26; g.strokeStyle = '#1c3556'; g.beginPath(); g.arc(x0 + 120, 200, 85, 0, 7); g.stroke();
          g.strokeStyle = '#4fd18b'; g.beginPath(); g.arc(x0 + 120, 200, 85, -1.57, 3.4); g.stroke();
          for (let i = 0; i < 6; i++) { g.fillStyle = i === 2 ? '#ffb02e' : i === 4 ? acc : '#2f8fd8'; g.fillRect(x0 + 240, 300 - i * 42, 40 + (i * 37 % 90), 26); }
        }
      }
    }, {aniso: 8});
    const scrM = mat({map: vwTex, emissiveMap: vwTex, emissive: 0xffffff, emissiveIntensity: P.screen, roughness: .35, toneMapped: !night});
    group.add(kit.box(VW + .5, VH + .45, .2, mat({color: P.trim, roughness: .45, metalness: .3}), 0, VY - VH / 2 - .22, wallZ + .25, .05));
    const vw = new THREE.Mesh(new THREE.PlaneGeometry(VW, VH), scrM); vw.position.set(0, VY, wallZ + .37); vw.userData.noShadow = true; group.add(vw);
    const scanM = kit.basic({color: night ? 0x9fd4ff : 0xd6ecff, transparent: true, opacity: night ? .28 : .18, depthWrite: false, toneMapped: false});
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(.22, VH), scanM); scan.position.set(-VW / 2, VY, wallZ + .39); scan.userData.noShadow = true; group.add(scan);
    // two smaller side screens on the back wall
    const sideTex = tex(256, 192, (g, w, h) => { g.fillStyle = '#0a1628'; g.fillRect(0, 0, w, h); g.fillStyle = '#' + bright.getHexString(); g.fillRect(0, 0, w, 20); const r = look.rng(8); for (let i = 0; i < 7; i++) { g.fillStyle = i % 3 ? '#2f8fd8' : '#4fd18b'; g.fillRect(16, 34 + i * 21, 60 + r() * 160, 12); } });
    const sideScrM = mat({map: sideTex, emissiveMap: sideTex, emissive: 0xffffff, emissiveIntensity: P.screen, roughness: .35, toneMapped: !night});
    instanced(new THREE.PlaneGeometry(2.0, 1.5), sideScrM, [[-8.0, 4.25, wallZ + .2], [8.0, 4.25, wallZ + .2]], null, false);

    // ---------- network operations desk in front of the video wall ----------
    const deskM = mat({color: night ? 0x2a3348 : 0x3c4a60, roughness: .5, metalness: .2}), topM = mat({color: night ? 0x56627c : 0xd6dde6, roughness: .45});
    group.add(kit.box(7.6, .72, .9, deskM, 0, 0, -8.7, .05));
    group.add(kit.box(7.8, .06, 1.0, topM, 0, .72, -8.72, .02));
    group.add(kit.box(7.6, .06, .04, glowMat(glowC, P.strip), 0, .55, -8.24, .01));
    const monTex = tex(192, 128, (g, w, h) => { g.fillStyle = '#0b1a2e'; g.fillRect(0, 0, w, h); g.fillStyle = '#4fb3ff'; g.lineWidth = 5; g.strokeStyle = '#4fb3ff'; g.beginPath(); for (let i = 0; i < 12; i++) { const x = 10 + i * 15, y = 80 - Math.sin(i) * 26; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.fillStyle = '#4fd18b'; g.fillRect(12, 104, 80, 12); g.fillStyle = '#ffb02e'; g.fillRect(100, 104, 40, 12); });
    const mons = [], monScr = [];
    [-3.0, -1.8, -.6, .6, 1.8, 3.0].forEach((x, i) => { const ry = (i - 2.5) * -.05; mons.push([x, 1.17, -8.95, ry]); monScr.push([x - Math.sin(ry) * .03, 1.17, -8.92, ry]); });
    instanced(kit.bevel(1.0, .62, .06, .02), mat({color: 0x161b24, roughness: .4, metalness: .3}), mons);
    instanced(new THREE.PlaneGeometry(.92, .54), mat({map: monTex, emissiveMap: monTex, emissive: 0xffffff, emissiveIntensity: P.screen, roughness: .3, toneMapped: !night}), monScr, null, false);
    instanced(kit.bevel(.08, .3, .08, .01), mat({color: 0x161b24, roughness: .4}), mons.map((m) => [m[0], .86, -9.0]));
    // chairs (seat + back), facing the wall
    const chairM = mat({color: night ? 0x3a4a6a : 0x2f5d8c, roughness: .75});
    const chairs = []; [-2.4, 0, 2.4].forEach((x) => { chairs.push([x, .5, -7.85, 0, .55, .1, .55], [x, .85, -7.55, 0, .55, .6, .08]); });
    instanced(kit.bevel(1, 1, 1, .03), chairM, chairs);
    instanced(kit.cylGeo(.03, .03, .45, 8), mat({color: 0x4b5160, roughness: .4, metalness: .6}), [[-2.4, .25, -7.85], [0, .25, -7.85], [2.4, .25, -7.85]]);

    // ---------- rack rows: two per side; instanced bodies, front doors, accent top strips and door stripes, LEDs ----------
    const RD = 1.0, RW = .74, RH = 2.55;
    const rows = [{x: 4.5, z0: -10.2, z1: 3.6}, {x: 7.4, z0: -9.0, z1: 3.6}];
    const bodies = [], faces = [], tops = [], stripes = [], slots = [];
    rows.forEach((row) => [-1, 1].forEach((side) => {
      for (let z = row.z0; z <= row.z1; z += RW + .03) {
        const fx = side * (row.x - RD / 2);
        bodies.push([side * row.x, RH / 2, z]);
        faces.push([fx - side * .006, RH / 2 + .02, z, -side * Math.PI / 2]);
        tops.push([fx - side * .02, RH - .04, z, -side * Math.PI / 2]);
        stripes.push([fx - side * .02, RH / 2, z + RW * .38 * side, -side * Math.PI / 2]);
        slots.push({fx, z, side});
      }
    }));
    instanced(kit.bevel(RD, RH, RW, .03), mat({color: P.rack, roughness: .45, metalness: .35}), bodies);
    const faceTex = tex(128, 384, (g, w, h) => {
      g.fillStyle = '#1a1f27'; g.fillRect(0, 0, w, h);
      const r = look.rng(9);
      for (let y = 16; y < h - 16;) {
        const u = r() < .3 ? 2 : 1, hh = u * 16;
        if (r() < .1) { y += hh + 3; continue; }
        const k = 58 + (r() * 34 | 0); g.fillStyle = `rgb(${k},${k + 6},${k + 14})`; g.fillRect(12, y, w - 24, hh);
        g.fillStyle = 'rgba(0,0,0,.5)'; for (let x = 18; x < w - 44; x += 5) g.fillRect(x, y + 3, 2, hh - 6);
        y += hh + 3;
      }
      g.strokeStyle = '#4a5463'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    }, {aniso: 8});
    instanced(new THREE.PlaneGeometry(RW - .08, RH - .16), mat({map: faceTex, roughness: .5, metalness: .3}), faces, null, false);
    instanced(new THREE.BoxGeometry(RW - .06, .07, .04), glowMat(glowC, P.strip), tops, null, false);
    instanced(new THREE.BoxGeometry(.035, RH - .4, .03), glowMat(glowC, P.strip * .7), stripes, null, false);
    // status LEDs: colours flicker in update()
    const LED_ON = [0x3ee08a, 0x3ee08a, 0x3ee08a, 0x52b8ff, 0x52b8ff, 0xffb02e].map((h) => new THREE.Color(h).multiplyScalar(P.led));
    const LED_OFF = new THREE.Color(0x10201a);
    const leds = [], ledColors = [], rr = look.rng(33);
    slots.forEach(({fx, z, side}) => {
      for (let k = 0; k < 8; k++) {
        const y = .32 + k * .27 + rr() * .05, dz = (rr() < .5 ? -1 : 1) * (.1 + rr() * .14);
        leds.push([fx - side * .02, y, z + dz]);
        ledColors.push(LED_ON[(rr() * LED_ON.length) | 0].clone());
      }
    });
    const ledMesh = instanced(new THREE.BoxGeometry(.05, .045, .05), kit.basic({color: 0xffffff, toneMapped: false}), leds, ledColors, false);
    const ledBase = ledColors.map((c) => c.clone()), ledOff = new Uint8Array(ledBase.length);
    // end caps of the near rack rows: a dark panel with an accent badge, so the row ends read cleanly
    const caps = []; rows.forEach((row) => [-1, 1].forEach((side) => caps.push([side * row.x, RH / 2, row.z1 + RW / 2 + .04, 0, RD + .04, RH + .02, .06])));
    instanced(kit.bevel(1, 1, 1, .01), mat({color: P.trim, roughness: .5, metalness: .3}), caps);

    // ---------- overhead: cable trays over the rack rows, ceiling beams and light panels ----------
    const trayM = mat({color: 0x9aa6b6, roughness: .35, metalness: .7});
    const TY = 3.05, TZ = -3.4, TL = 14.2;
    const trays = [], bundlesY = [], bundlesB = [], hangers = [];
    rows.forEach((row) => [-1, 1].forEach((side) => {
      const cx = side * (row.x - .1);
      trays.push([cx - .32, TY, TZ, 0, .05, .14, TL], [cx + .32, TY, TZ, 0, .05, .14, TL]);
      bundlesY.push([cx - .13, TY + .05, TZ, 0, .26, .12, TL - .1]);
      bundlesB.push([cx + .15, TY + .05, TZ, 0, .22, .1, TL - .1]);
      [-9, -3.4, 2.2].forEach((z) => hangers.push([cx, TY + 1.6, z, 0, .04, 3.1, .04]));
    }));
    trays.push([0, 5.1, -10.5, 0, 15.6, .14, .05], [0, 5.1, -9.9, 0, 15.6, .14, .05]);
    bundlesY.push([0, 5.15, -10.2, 0, 15.4, .12, .3]);
    instanced(kit.bevel(1, 1, 1, .01), trayM, [...trays, ...hangers]);
    instanced(kit.bevel(1, 1, 1, .02), mat({color: 0xf2c230, roughness: .55}), bundlesY);
    instanced(kit.bevel(1, 1, 1, .02), mat({color: 0x3f7fd0, roughness: .55}), bundlesB);
    // ceiling beams and light panels high up (they show at low camera pitches)
    const beams = [[0, 6.5, -10.6, 0, 21, .3, .3], [0, 6.5, -8.6, 0, 21, .3, .3]];
    instanced(kit.bevel(1, 1, 1, .02), mat({color: night ? 0x1d2538 : 0x6f849e, roughness: .6, metalness: .3}), beams, null, false);
    const panels = []; [-9.6].forEach((z) => [-6, -2, 2, 6].forEach((x) => panels.push([x, 6.3, z, 0, 1, 1, 1, Math.PI / 2])));
    instanced(new THREE.PlaneGeometry(2.4, .7), kit.basic({color: new THREE.Color(night ? 0x8fb0e8 : 0xfdfcf6).multiplyScalar(night ? .8 : 1), toneMapped: false, side: THREE.DoubleSide}), panels, null, false);

    // ---------- cooling units (CRAC) in the back corners, with a status panel and slowly turning fans ----------
    const cracM = mat({color: night ? 0x5d6b82 : 0xe6ebf2, roughness: .5, metalness: .15});
    const ventTex = tex(128, 128, (g, w, h) => { g.fillStyle = '#b8c0cc'; g.fillRect(0, 0, w, h); g.fillStyle = '#5d6674'; for (let y = 8; y < h; y += 11) g.fillRect(8, y, w - 16, 5); });
    const cracs = [[-7.4, -10.3], [7.4, -10.3], [-9.6, -6.6], [9.6, -6.6]];
    instanced(kit.bevel(1.7, 2.9, 1.0, .05), cracM, cracs.map(([x, z]) => [x, 1.45, z, Math.abs(x) > 9 ? -Math.sign(x) * Math.PI / 2 : 0]));
    instanced(new THREE.PlaneGeometry(1.3, 1.2), mat({map: ventTex, roughness: .5, metalness: .3}), cracs.map(([x, z]) => Math.abs(x) > 9 ? [x - Math.sign(x) * .51, 1.95, z, -Math.sign(x) * Math.PI / 2] : [x, 1.95, z + .51]), null, false);
    instanced(new THREE.PlaneGeometry(.5, .22), glowMat(new THREE.Color(0x3ee08a), 1.4), cracs.map(([x, z]) => Math.abs(x) > 9 ? [x - Math.sign(x) * .52, 1.0, z, -Math.sign(x) * Math.PI / 2] : [x, 1.0, z + .52]), null, false);
    // floor-standing UPS cabinets with an accent band near the front sides (fill the near side view)
    const ups = [[-9.2, -1.2], [-9.2, 1.0], [9.2, -1.2], [9.2, 1.0]];
    instanced(kit.bevel(1.0, 1.9, 1.6, .05), mat({color: night ? 0x3a465c : 0x5a6b82, roughness: .5, metalness: .2}), ups.map(([x, z]) => [x, .95, z]));
    instanced(new THREE.BoxGeometry(.03, .12, 1.4), glowMat(glowC, P.strip), ups.map(([x, z]) => [x - Math.sign(x) * .51, 1.55, z]), null, false);

    // contact shadows under the rows and units
    [[-4.5, -3.3, 1.6, 14.4], [4.5, -3.3, 1.6, 14.4], [-7.4, -3.4, 1.6, 14.4], [7.4, -3.4, 1.6, 14.4], [0, -8.7, 8.4, 1.6]].forEach(([x, z, w, d]) => { const b = look.makeBlob(w, d, .38); b.position.x = x; b.position.z = z; group.add(b); });

    group.traverse((o) => { if ((o.isMesh) && !o.userData.blob && !o.isInstancedMesh) { o.castShadow = !o.userData.noShadow && o !== floor; o.receiveShadow = true; } });

    let t = 0, blinkT = 0;
    const blinkR = look.rng(77);
    return {
      group,
      update(dt) {
        if (still() || !(dt > 0)) return;
        t += dt; blinkT += dt;
        scan.position.x = -VW / 2 + ((t * 1.8) % VW);
        scrM.emissiveIntensity = P.screen * (1 + .07 * Math.sin(t * 2.1));
        if (blinkT > .11) {
          blinkT = 0;
          for (let n = 0; n < 22; n++) {
            const i = (blinkR() * ledBase.length) | 0;
            ledOff[i] ^= 1; ledMesh.setColorAt(i, ledOff[i] ? LED_OFF : ledBase[i]);
          }
          ledMesh.instanceColor.needsUpdate = true;
        }
      },
      dispose() { inst.forEach((m) => m.dispose()); kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
