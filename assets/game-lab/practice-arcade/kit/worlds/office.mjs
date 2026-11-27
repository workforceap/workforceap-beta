// World: a lively help-desk floor ("toy diorama"). Set dressing only; the stage (x -3..3, z -6..2, y up to 2) stays empty.
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Primitives, instanced repeats and canvas textures only.
// Layout: a row of help-desk pods, a reception counter and a queue totem in the low band behind the stage, support
// desks, a break corner and a whiteboard at the sides, a tall window wall with ceiling lights above, toy colleagues
// who bob at their desks, screens that flicker and a clock that ticks.
const W = {
  id: 'office',
  label: 'Office',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const mood = look.moodOf(ctx.mood || theme.mood);
    const night = mood.id === 'night', dusk = mood.id === 'dusk';
    const acc = ctx.accent || look.accentSet(theme.accent || '#ad2c4d');
    const aBase = acc.base.clone(), aBright = acc.bright.clone();
    const accHex = '#' + aBase.getHexString();
    const reduced = !!ctx.reduced;
    const group = new THREE.Group(); group.name = 'world-office';
    const own = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const dummy = new THREE.Object3D(), m4 = new THREE.Matrix4();
    const glowK = mood.glow, lampK = mood.lamp;
    const unitBox = kit.geo('office|unit', () => new THREE.BoxGeometry(1, 1, 1));
    // places [[x, z, ry, scale?]] x parts [[geo, material, [[lx, ly, lz, lry, sx, sy, sz, colour?]]]] -> one InstancedMesh per part
    const rig = (places, parts, cast = true) => parts.map(([geo, material, locals]) => {
      const m = new THREE.InstancedMesh(geo, material, places.length * locals.length); let i = 0;
      for (const [px, pz, pry = 0, ps = 1] of places) for (const l of locals) {
        dummy.position.set(l[0] * ps, l[1] * ps, l[2] * ps); dummy.rotation.set(0, l[3] || 0, 0); dummy.scale.set((l[4] || 1) * ps, (l[5] || 1) * ps, (l[6] || 1) * ps); dummy.updateMatrix();
        m4.makeRotationY(pry); m4.setPosition(px, 0, pz); m4.multiply(dummy.matrix); m.setMatrixAt(i, m4);
        if (l[7] !== undefined) m.setColorAt(i, new THREE.Color(l[7]));
        i++;
      }
      m.castShadow = cast; m.receiveShadow = true; group.add(m); return m;
    });

    // ---------- floor: blue-grey carpet to the fog, a darker stage runner with an accent border ----------
    const carpet = tex(256, 256, (g, w, h) => {
      const r = look.rng(7); const tones = ['#5d8e88', '#6a9a93', '#547f86', '#6f9990'];
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { g.fillStyle = tones[ty * 2 + tx]; g.fillRect(tx * 128, ty * 128, 128, 128); }
      for (let i = 0; i < 3200; i++) { const v = 120 + (r() * 40 | 0); g.fillStyle = `rgba(${v - 40},${v},${v - 6},.35)`; g.fillRect(r() * w, r() * h, 2, 2); }
      g.strokeStyle = 'rgba(20,50,50,.28)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, h); g.moveTo(0, 128); g.lineTo(w, 128); g.stroke();
    }, {repeat: [14, 12], aniso: 8});
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 56), mat({map: carpet, roughness: .95, metalness: 0}));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -14); floor.receiveShadow = true; group.add(floor);
    const runTex = tex(256, 352, (g, w, h) => {
      const r = look.rng(3); g.fillStyle = '#4c5a70'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2000; i++) { const v = 70 + (r() * 30 | 0); g.fillStyle = `rgba(${v},${v + 8},${v + 22},.4)`; g.fillRect(r() * w, r() * h, 2, 2); }
      g.fillStyle = accHex; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); g.fillRect(0, 0, w, 10);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(16, 0, 3, h); g.fillRect(w - 19, 0, 3, h);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2; for (let y = 0; y < h; y += 44) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    }, {aniso: 8});
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 10.0), mat({map: runTex, roughness: .9, metalness: 0}));
    runner.rotation.x = -Math.PI / 2; runner.position.set(0, .004, -2); runner.receiveShadow = true; group.add(runner);
    // wayfinding: an accent band leading from the runner toward the reception counter
    const way = new THREE.Mesh(new THREE.PlaneGeometry(.4, 5.2), mat({color: aBase, emissive: aBright, emissiveIntensity: .35 * glowK, roughness: .6}));
    way.rotation.set(-Math.PI / 2, 0, 1.34); way.position.set(4.8, .006, -7.0); group.add(way);

    // ---------- back wall with a window band, slate wainscot, accent stripe ----------
    const wallZ = -12.6;
    group.add(kit.box(40, 9, .3, mat({color: dusk ? 0xe8d6cc : 0xf0e7d6, roughness: .88}), 0, 0, wallZ, .02));
    group.add(kit.box(40, 1.1, .34, mat({color: 0x46566c, roughness: .7}), 0, 0, wallZ + .02, .02));
    group.add(kit.box(40, .14, .08, mat({color: aBase, emissive: aBright, emissiveIntensity: .3 * glowK, roughness: .5}), 0, 1.12, wallZ + .2, .01));
    const sky = tex(512, 256, (g, w, h) => {
      const top = new THREE.Color(mood.window).offsetHSL(0, 0, -.1), bot = new THREE.Color(mood.window).offsetHSL(0, 0, .08);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(1, '#' + bot.getHexString());
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = look.rng(11);
      for (let x = 0; x < w;) {
        const bw = 26 + r() * 46, bh = 50 + r() * 120;
        g.fillStyle = night ? 'rgba(10,14,26,.85)' : 'rgba(110,126,148,.4)'; g.fillRect(x, h - bh, bw - 4, bh);
        if (night) { g.fillStyle = 'rgba(255,214,140,.8)'; for (let wy = h - bh + 8; wy < h - 6; wy += 12) for (let wx = x + 5; wx < x + bw - 10; wx += 10) if (r() > .6) g.fillRect(wx, wy, 4, 5); }
        x += bw;
      }
    }, {aniso: 4});
    const paneM = mat({map: sky, emissiveMap: sky, emissive: 0xffffff, emissiveIntensity: mood.windowGlow, roughness: .2, metalness: 0});
    const frameM = mat({color: 0x3b3f46, roughness: .45, metalness: .4});
    const frameList = [];
    [-9.6, -3.2, 3.2, 9.6].forEach((x) => {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 2.8), paneM); pane.position.set(x, 2.9, wallZ + .17); group.add(pane);
      frameList.push([x, 1.5, wallZ + .2, 0, 6.1, .1, .12], [x, 4.3, wallZ + .2, 0, 6.1, .1, .12]);
      [-3, -1, 1, 3].forEach((dx) => frameList.push([x + dx, 2.9, wallZ + .2, 0, .08, 2.9, .12]));
    });
    const frames = new THREE.InstancedMesh(unitBox, frameM, frameList.length);
    frameList.forEach((a, i) => { dummy.position.set(a[0], a[1], a[2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(a[4], a[5], a[6]); dummy.updateMatrix(); frames.setMatrixAt(i, dummy.matrix); });
    group.add(frames);
    // wall clock (second hand ticks) and a ticket board
    const clock = new THREE.Group(); clock.position.set(7.2, 5.4, wallZ + .25); group.add(clock);
    const clockFace = tex(128, 128, (g, w) => { g.fillStyle = '#f8f6f0'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#2b2f36'; g.lineWidth = 6; g.stroke(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke(); } g.lineWidth = 7; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 28); g.moveTo(64, 64); g.lineTo(90, 70); g.stroke(); });
    clock.add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), mat({map: clockFace, roughness: .5})));
    const secHand = new THREE.Mesh(new THREE.BoxGeometry(.03, .5, .02), mat({color: aBase, roughness: .5})); secHand.position.z = .02; const secPivot = new THREE.Group(); secPivot.position.z = .02; secPivot.add(secHand); secHand.position.y = .2; clock.add(secPivot);

    // ---------- help-desk pods (instanced): desks with monitors, coloured partitions, chairs ----------
    const wood = mat({color: 0xdcc59e, roughness: .55}), legM = mat({color: 0x4b4f57, roughness: .4, metalness: .5}), plastic = mat({color: 0x2f3338, roughness: .45});
    const mkScreen = (seed) => tex(256, 160, (g, w, h) => {
      const r = look.rng(seed); g.fillStyle = night ? '#1b2436' : '#eef3f9'; g.fillRect(0, 0, w, h);
      g.fillStyle = accHex; g.fillRect(0, 0, w, 20);
      g.fillStyle = night ? '#5c7399' : '#c0ccdb'; for (let i = 0; i < 6; i++) g.fillRect(14, 34 + i * 20, 90 + (r() * 110 | 0), 10);
      g.fillStyle = night ? '#2d3d5a' : '#9fb2c6'; g.fillRect(172, 34, 70, 100); g.fillStyle = aBase.getStyle(); g.fillRect(180, 44, 54, 12);
    });
    const scrA = mat({map: mkScreen(1), emissiveMap: null, emissive: 0xffffff, emissiveIntensity: .85, roughness: .3});
    scrA.emissiveMap = scrA.map;
    const scrB = mat({map: mkScreen(7), emissive: 0xffffff, emissiveIntensity: .85, roughness: .3}); scrB.emissiveMap = scrB.map;
    const pods = [[-6.0, -9.6, .15], [-2.0, -9.9, 0], [2.0, -9.9, 0], [6.0, -9.6, -.15]];
    const topG = kit.bevel(2.2, .07, 1.0, .02), monG = kit.bevel(.96, .58, .06, .03), seatG = kit.bevel(.56, .1, .5, .04), backG = kit.bevel(.5, .6, .07, .04);
    rig(pods, [
      [topG, wood, [[0, .775, 0]]],
      [unitBox, legM, [[-1.02, .37, -.42, 0, .06, .74, .06], [1.02, .37, -.42, 0, .06, .74, .06], [-1.02, .37, .42, 0, .06, .74, .06], [1.02, .37, .42, 0, .06, .74, .06]]],
      [monG, plastic, [[-.2, 1.35, -.28]]],
      [unitBox, plastic, [[-.2, .95, -.24, 0, .08, .3, .06], [-.2, .815, .16, 0, .6, .02, .2], [.35, .815, .18, 0, .08, .03, .12]]],
      [kit.cylGeo(.05, .045, .11, 14), mat({color: aBase, roughness: .5}), [[.75, .865, -.12]]],
      [seatG, mat({color: 0x3d4a5c, roughness: .8}), [[-.1, .51, .9, .25]]],
      [backG, mat({color: 0x3d4a5c, roughness: .8}), [[-.1, .88, 1.14, .25]]],
      [kit.cylGeo(.035, .035, .4, 10), legM, [[-.1, .26, .9]]],
      [unitBox, mat({color: 0x9aa0a8, roughness: .7}), [[0, .24, -.44, 0, 2.0, .5, .04]]]
    ]);
    rig(pods, [[new THREE.PlaneGeometry(.88, .5), scrA, [[-.2, 1.35, -.245]]]], false);
    // partitions between and beside the pods: low coloured panels (instanced, one colour per panel)
    const partCols = [aBase.getHex(), 0x3fa7a0, 0xf0b13a, 0x7a6fd1, aBase.getHex()];
    const parts = []; [[-8.2, 0], [-4.0, 1], [4.0, 3], [8.2, 4]].forEach(([x, i]) => parts.push([x, .6, -9.9, 0, .12, 1.2, 1.6, partCols[i]]));
    const partM = new THREE.InstancedMesh(kit.bevel(1, 1, 1, .05), mat({color: 0xffffff, roughness: .6}), parts.length);
    parts.forEach((a, i) => { dummy.position.set(a[0], a[1], a[2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(a[4], a[5], a[6]); dummy.updateMatrix(); partM.setMatrixAt(i, dummy.matrix); partM.setColorAt(i, new THREE.Color(a[7])); });
    partM.castShadow = true; partM.receiveShadow = true; group.add(partM);

    // ---------- queue board hung above the pods: ticket numbers per desk ----------
    const qTex = tex(512, 112, (g, w, h) => {
      g.fillStyle = '#10151f'; g.fillRect(0, 0, w, h); g.fillStyle = accHex; g.fillRect(0, 0, w, 10);
      for (let i = 0; i < 4; i++) {
        const x = 14 + i * 124; g.fillStyle = '#1b2436'; g.fillRect(x, 22, 112, 80);
        g.fillStyle = '#9fb2c6'; g.font = '700 16px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('DESK ' + (i + 1), x + 56, 42);
        g.fillStyle = '#' + aBright.getHexString(); g.font = '800 44px system-ui, sans-serif'; g.fillText('A' + (41 + i), x + 56, 90);
      }
    });
    const qM = mat({map: qTex, emissiveMap: qTex, emissive: 0xffffff, emissiveIntensity: .8 + .3 * lampK, roughness: .3});
    const qBoard = new THREE.Group(); qBoard.position.set(0, 2.5, -10.6); group.add(qBoard);
    qBoard.add(kit.box(4.2, .98, .12, plastic, 0, 0, 0, .04));
    const qFace = new THREE.Mesh(new THREE.PlaneGeometry(4.0, .88), qM); qFace.position.set(0, .49, .065); qBoard.add(qFace);
    [-1.7, 1.7].forEach((x) => qBoard.add(kit.box(.04, 1.4, .04, legM, x, .98, 0, .005)));

    // ---------- reception counter (right back) and a queue totem (left back) ----------
    const rc = new THREE.Group(); rc.position.set(8.2, 0, -6.2); rc.rotation.y = -.55; group.add(rc);
    rc.add(kit.box(2.6, 1.0, .8, mat({color: aBase, roughness: .5}), 0, 0, 0, .06));
    rc.add(kit.box(2.8, .08, .95, mat({color: 0xf3efe8, roughness: .4}), 0, 1.0, 0, .02));
    rc.add(kit.cyl(.1, .1, .05, mat({color: 0xe8b84f, roughness: .3, metalness: .6}), -.6, 1.08, .1, 16)); // service bell
    rc.add(kit.box(.62, .4, .04, plastic, .5, 1.3, -.1, .02));
    const totTex = [0, 1].map((k) => tex(128, 256, (g, w, h) => {
      g.fillStyle = '#10151f'; g.fillRect(0, 0, w, h); g.fillStyle = '#9fb2c6'; g.font = '700 22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('NOW SERVING', w / 2, 40);
      g.fillStyle = '#' + aBright.getHexString(); g.font = '800 92px system-ui, sans-serif'; g.fillText(k ? '43' : '42', w / 2, 150);
      g.fillStyle = '#4a5a74'; for (let i = 0; i < 3; i++) g.fillRect(24, 178 + i * 22, 80 - i * 18, 8);
    }));
    const totM = mat({map: totTex[0], emissiveMap: totTex[0], emissive: 0xffffff, emissiveIntensity: .9 + .3 * lampK, roughness: .3});
    const totem = new THREE.Group(); totem.position.set(-8.0, 0, -6.2); totem.rotation.y = .5; group.add(totem);
    totem.add(kit.box(.9, 2.3, .22, plastic, 0, 0, 0, .06));
    const totFace = new THREE.Mesh(new THREE.PlaneGeometry(.78, 1.7), totM); totFace.position.set(0, 1.35, .12); totem.add(totFace);
    totem.add(kit.box(.9, .12, .26, mat({color: aBase, roughness: .5}), 0, 2.3, 0, .02));

    // ---------- left: support desks facing the stage; right: whiteboard, cabinet, printer, cooler, break sofa ----------
    const sd = [[-5.8, -4.2, .7], [-6.2, -.4, .75]];
    rig(sd, [
      [topG, wood, [[0, .775, 0]]],
      [unitBox, legM, [[-1.02, .37, -.42, 0, .06, .74, .06], [1.02, .37, -.42, 0, .06, .74, .06], [-1.02, .37, .42, 0, .06, .74, .06], [1.02, .37, .42, 0, .06, .74, .06]]],
      [monG, plastic, [[-.2, 1.35, -.28]]],
      [unitBox, plastic, [[-.2, .95, -.24, 0, .08, .3, .06], [-.2, .815, .16, 0, .6, .02, .2]]],
      [seatG, mat({color: 0xc65b4a, roughness: .8}), [[-.1, .51, .9, .25]]],
      [backG, mat({color: 0xc65b4a, roughness: .8}), [[-.1, .88, 1.14, .25]]],
      [kit.cylGeo(.035, .035, .4, 10), legM, [[-.1, .26, .9]]]
    ]);
    rig(sd, [[new THREE.PlaneGeometry(.88, .5), scrB, [[-.2, 1.35, -.245]]]], false);
    const wb = new THREE.Group(); wb.position.set(7.4, 0, -2.4); wb.rotation.y = -.7; group.add(wb);
    const wbTex = tex(512, 320, (g, w, h) => {
      g.fillStyle = '#fbfbfa'; g.fillRect(0, 0, w, h);
      g.strokeStyle = accHex; g.lineWidth = 6; g.beginPath(); g.moveTo(40, 60); g.lineTo(240, 60); g.stroke();
      g.strokeStyle = '#2b7bb9'; g.lineWidth = 4;
      [[60, 120], [60, 170], [60, 220]].forEach(([x, y], i) => { g.strokeRect(x, y - 16, 24, 24); g.beginPath(); g.moveTo(x + 40, y - 4); g.lineTo(x + 200 + i * 30, y - 4); g.stroke(); });
      g.strokeStyle = '#4a9b4f'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 108); g.lineTo(72, 116); g.lineTo(84, 98); g.stroke();
      g.strokeStyle = '#8a909a'; g.lineWidth = 3; g.beginPath(); g.arc(390, 170, 70, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(390, 170); g.lineTo(390, 100); g.moveTo(390, 170); g.lineTo(450, 200); g.stroke();
    });
    wb.add(kit.box(2.2, 1.35, .06, mat({color: 0xb8bec6, roughness: .4, metalness: .5}), 0, .85, 0, .02));
    const wbFace = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 1.23), mat({map: wbTex, roughness: .35})); wbFace.position.set(0, 1.525, .04); wb.add(wbFace);
    [-1, 1].forEach((x) => { wb.add(kit.box(.05, .9, .05, legM, x, 0, 0, .01)); wb.add(kit.box(.06, .03, .6, legM, x, 0, 0, .01)); });
    const cab = new THREE.Group(); cab.position.set(10.0, 0, -9.0); group.add(cab);
    const cabM = mat({color: 0x8d949c, roughness: .45, metalness: .5});
    cab.add(kit.box(.9, 1.4, .7, cabM, 0, 0, 0, .03));
    [.22, .66, 1.1].forEach((y) => { cab.add(kit.box(.8, .36, .02, mat({color: 0xa4abb3, roughness: .4, metalness: .4}), 0, y, .36, .01)); cab.add(kit.box(.22, .04, .04, legM, 0, y + .26, .38, .01)); });
    const pr = new THREE.Group(); pr.position.set(8.6, 0, -.2); pr.rotation.y = -.5; group.add(pr);
    pr.add(kit.box(1.0, .72, .6, mat({color: 0xd4d0c8, roughness: .6}), 0, 0, 0, .03));
    pr.add(kit.box(.8, .32, .55, mat({color: 0xf1f1ef, roughness: .5}), 0, .72, 0, .05));
    const prLed = mat({color: 0x4a9b4f, emissive: 0x4a9b4f, emissiveIntensity: 1.2});
    pr.add(kit.box(.12, .06, .02, prLed, .25, .9, .28, .01));
    const wc = new THREE.Group(); wc.position.set(9.6, 0, -4.8); group.add(wc);
    wc.add(kit.box(.42, 1.0, .42, mat({color: 0xf0f0ee, roughness: .5}), 0, 0, 0, .05));
    wc.add(kit.cyl(.17, .17, .46, mat({color: 0x9cc7e6, roughness: .08, transparent: true, opacity: .7}), 0, 1.0, 0, 18));
    // break corner: rug, sofa, coffee table (left, outside the stage)
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), mat({color: aBase, roughness: 1})); rug.rotation.x = -Math.PI / 2; rug.position.set(-9.0, .006, -2.8); group.add(rug);
    const sofa = new THREE.Group(); sofa.position.set(-9.8, 0, -2.8); sofa.rotation.y = Math.PI / 2 - .1; group.add(sofa);
    const sofaM = mat({color: 0xf0b13a, roughness: .8});
    sofa.add(kit.box(2.2, .45, .9, sofaM, 0, .0, 0, .12)); sofa.add(kit.box(2.2, .7, .26, sofaM, 0, .3, -.34, .12)); [-1.05, 1.05].forEach((x) => sofa.add(kit.box(.2, .62, .9, sofaM, x, .0, 0, .1)));
    group.add(kit.cyl(.5, .5, .05, mat({color: 0xf3efe8, roughness: .5}), -8.3, .36, -2.8, 24)); group.add(kit.cyl(.05, .05, .36, legM, -8.3, 0, -2.8, 8));

    // plants (all leaves and pots instanced)
    const plantAt = [[-4.4, -8.0, 1.2], [4.5, -7.9, 1.1], [-3.9, -3.4, .95], [9.7, -7.2, 1.2], [-10.8, -6.2, 1.3], [6.0, 2.4, .9]];
    rig(plantAt.map(([x, z, s]) => [x, z, 0, s]), [[kit.cylGeo(.26, .2, .44, 16), mat({color: 0xf2efe9, roughness: .6}), [[0, .22, 0]]]]);
    const rl = look.rng(4); const leafL = [];
    for (let i = 0; i < 7; i++) leafL.push([(rl() - .5) * .42, .72 + rl() * .55, (rl() - .5) * .42, 0, 1 + rl() * .3, 1.2 + rl() * .4, 1 + rl() * .3, i % 2 ? 0x4f9a52 : 0x6bb36a]);
    rig(plantAt.map(([x, z, s]) => [x, z, 0, s]), [[kit.sphereGeo(.22, 10), mat({color: 0xffffff, roughness: .7}), leafL]]);

    // ---------- overhead: ceiling light bars that sway a little, warm at dusk, bright at night ----------
    const barM = mat({color: 0xfffaf0, emissive: 0xfff2d0, emissiveIntensity: night ? lampK * 1.2 : dusk ? .9 : .5, roughness: .4});
    const lights = new THREE.Group(); group.add(lights);
    const lightBars = [[-6, -9.0], [-2, -9.0], [2, -9.0], [6, -9.0], [-7.5, -4], [7.5, -4]].map(([x, z]) => {
      const b = new THREE.Group(); b.position.set(x, 4.5, z); lights.add(b);
      b.add(kit.box(2.2, .12, .35, barM, 0, 0, 0, .03));
      [-.9, .9].forEach((dx) => b.add(kit.box(.02, 1.2, .02, legM, dx, .12, 0, .005)));
      return b;
    });
    if (night) lightBars.forEach((b) => kit.glow(b, 0xfff0c8, 3.2, 0, -.2, .3));

    // ---------- toy colleagues (instanced bodies and heads, bobbing) ----------
    // seated at the four back pods (headset in the accent colour), the two support desks, reception and the sofa
    const people = [[-5.97, .54, -8.7, 0x3fa7a0], [-2.1, .54, -9.0, 0xf0b13a], [1.9, .54, -9.0, 0x7a6fd1], [5.77, .54, -8.72, 0xc65b4a], [-5.3, .54, -3.45, 0x3f7ec4], [-5.66, .54, .33, 0x3fa7a0], [8.45, .45, -6.9, 0xf0b13a], [7.0, .3, -5.2, 0x7a6fd1], [-9.75, .43, -2.5, 0xc65b4a]];
    const nP = people.length;
    const bodies = new THREE.InstancedMesh(kit.cylGeo(.17, .21, .5, 14), mat({color: 0xffffff, roughness: .7}), nP);
    const heads = new THREE.InstancedMesh(kit.sphereGeo(.16, 14), mat({color: 0xf0c9a4, roughness: .6}), nP);
    const bands = new THREE.InstancedMesh(kit.geo('office|band', () => new THREE.TorusGeometry(.175, .022, 6, 16, Math.PI)), mat({color: aBase, emissive: aBright, emissiveIntensity: .25 * glowK, roughness: .5}), nP);
    const cups = new THREE.InstancedMesh(kit.sphereGeo(.055, 8), mat({color: aBase, emissive: aBright, emissiveIntensity: .25 * glowK, roughness: .5}), nP * 2);
    for (let i = 0; i < nP; i++) bodies.setColorAt(i, new THREE.Color(people[i][3]));
    bodies.castShadow = heads.castShadow = true; group.add(bodies); group.add(heads); group.add(bands); group.add(cups);
    const setPeople = (t) => {
      for (let i = 0; i < nP; i++) {
        const p = people[i];
        const bob = reduced ? 0 : Math.sin(t * 1.6 + i * 1.7) * .02, sway = reduced ? 0 : Math.sin(t * .8 + i) * .1;
        dummy.position.set(p[0], p[1] + .02 + .25 + bob, p[2]); dummy.rotation.set(0, sway, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
        const hy = p[1] + .02 + .66 + bob * 1.5;
        dummy.position.set(p[0], hy, p[2]); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
        dummy.position.set(p[0], hy + .02, p[2]); dummy.rotation.set(0, sway, 0); dummy.updateMatrix(); bands.setMatrixAt(i, dummy.matrix);
        for (let k = 0; k < 2; k++) { const sx = k ? .175 : -.175, cs = Math.cos(sway), sn = Math.sin(sway); dummy.position.set(p[0] + sx * cs, hy - .02, p[2] - sx * sn); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); cups.setMatrixAt(i * 2 + k, dummy.matrix); }
      }
    };
    const peopleDirty = () => { bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = bands.instanceMatrix.needsUpdate = cups.instanceMatrix.needsUpdate = true; };
    setPeople(0); peopleDirty();

    // soft contact shadows so the low preset still reads grounded
    [[-6, -9.6, 2.8, 2.2], [-2, -9.9, 2.8, 2.2], [2, -9.9, 2.8, 2.2], [6, -9.6, 2.8, 2.2], [8.2, -6.2, 3, 1.4], [-5.8, -4.2, 2.8, 2.0], [-6.2, -.4, 2.8, 2.0], [7.4, -2.4, 2.4, 1.0], [-9.8, -2.8, 2.6, 1.6]].forEach(([x, z, w, d]) => { const b = look.makeBlob(w, d, .36); b.position.x = x; b.position.z = z; group.add(b); });
    group.traverse((o) => { if (o.isMesh && !o.userData.blob) o.receiveShadow = true; });
    [floor, runner].forEach((o) => { o.castShadow = false; });

    let t = 0, tickAt = 0, flip = false;
    return {
      group,
      update(dt) {
        if (reduced || !(dt > 0)) return;
        t += dt;
        scrA.emissiveIntensity = .8 + Math.sin(t * 11) * .03 + (Math.sin(t * .9) > .985 ? -.3 : 0);
        scrB.emissiveIntensity = .78 + Math.sin(t * 7 + 1) * .04;
        prLed.emissiveIntensity = .5 + (Math.sin(t * 4) > 0 ? .9 : 0);
        if (t - tickAt > 1) { tickAt = t; secPivot.rotation.z -= Math.PI / 30 * 1; }
        const want = Math.floor(t / 4) % 2 === 1; if (want !== flip) { flip = want; totM.map = totM.emissiveMap = totTex[flip ? 1 : 0]; }
        for (let i = 0; i < lightBars.length; i++) lightBars[i].rotation.z = Math.sin(t * .5 + i) * .01;
        setPeople(t); peopleDirty();
      },
      dispose() { kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
