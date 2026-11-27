// World: a bright data lab ("toy diorama"). Set dressing only; the stage (x -3..3, z -6..2, y up to 2) stays empty.
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Primitives, instanced repeats and canvas textures only.
// Layout: a row of floor-standing dashboards low behind the stage (they stay in frame on wide canvases), a taller wall of
// charts above, benches with screens and glassware, a holographic bar chart table, a server tower, a whiteboard, ceiling
// light panels and a small drone overhead. Charts scroll, bars pulse, LEDs blink, data nodes bob.
const W = {
  id: 'lab',
  label: 'Data lab',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const mood = look.moodOf(ctx.mood || theme.mood);
    const night = mood.id === 'night', dusk = mood.id === 'dusk';
    const acc = ctx.accent || look.accentSet(theme.accent || '#ad2c4d');
    const aBase = acc.base.clone(), aBright = acc.bright.clone();
    const accHex = '#' + aBase.getHexString();
    const reduced = !!ctx.reduced;
    const group = new THREE.Group(); group.name = 'world-lab';
    const own = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const dummy = new THREE.Object3D(), m4 = new THREE.Matrix4();
    const glowK = mood.glow, lampK = mood.lamp;
    const unitBox = kit.geo('lab|unit', () => new THREE.BoxGeometry(1, 1, 1));
    const chartCols = ['#2b7bb9', '#4a9b4f', '#e0a43a', accHex];
    const inst = (geo, material, list, parent = group, cast = true) => {
      const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((a, i) => {
        dummy.position.set(a[0], a[1], a[2]); dummy.rotation.set(0, a[3] || 0, 0); dummy.scale.set(a[4] || 1, a[5] || 1, a[6] || 1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
        if (a[7] !== undefined) m.setColorAt(i, new THREE.Color(a[7]));
      });
      m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
    };
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

    // ---------- floor: cool teal tiles to the fog, a dark teal stage mat with an accent edge ----------
    const tiles = tex(256, 256, (g, w, h) => {
      const tones = ['#9cc3c6', '#a8cdd0', '#93bcc2', '#a2c8cb'];
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = tones[y * 2 + x]; g.fillRect(x * 128, y * 128, 128, 128); }
      const r = look.rng(12); for (let i = 0; i < 1400; i++) { const v = 150 + (r() * 60 | 0); g.fillStyle = `rgba(${v - 30},${v},${v + 4},.3)`; g.fillRect(r() * w, r() * h, 2, 2); }
      g.strokeStyle = 'rgba(40,80,90,.4)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, h); g.moveTo(0, 128); g.lineTo(w, 128); g.stroke();
    }, {repeat: [14, 12], aniso: 8});
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 56), mat({map: tiles, roughness: .45, metalness: .05}));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -14); floor.receiveShadow = true; group.add(floor);
    const matTex = tex(256, 352, (g, w, h) => {
      g.fillStyle = '#3f6475'; g.fillRect(0, 0, w, h);
      const r = look.rng(2); for (let i = 0; i < 1800; i++) { const v = 70 + (r() * 40 | 0); g.fillStyle = `rgba(${v - 20},${v + 30},${v + 40},.3)`; g.fillRect(r() * w, r() * h, 2, 2); }
      g.fillStyle = accHex; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); g.fillRect(0, 0, w, 10);
      g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 2; for (let y = 0; y < h; y += 44) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(16, 0, 3, h); g.fillRect(w - 19, 0, 3, h);
    }, {aniso: 8});
    const matpad = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 10.0), mat({map: matTex, roughness: .85}));
    matpad.rotation.x = -Math.PI / 2; matpad.position.set(0, .004, -2); matpad.receiveShadow = true; group.add(matpad);
    // glowing guide lines on the floor (accent), running to the benches
    const guideM = mat({color: aBase, emissive: aBright, emissiveIntensity: .35 * glowK, roughness: .5});
    [[-6.2, -8.6, 5.6, .12], [6.2, -8.4, 5.6, .12]].forEach(([x, z, d, w]) => { const g2 = new THREE.Mesh(new THREE.PlaneGeometry(w, d), guideM); g2.rotation.x = -Math.PI / 2; g2.position.set(x, .006, z); group.add(g2); });

    // ---------- back wall: pale cool wall, teal wainscot, accent stripe, tall chart wall ----------
    const wallZ = -12.4;
    group.add(kit.box(40, 9, .3, mat({color: dusk ? 0xe6dfe6 : 0xeaf0f3, roughness: .85}), 0, 0, wallZ, .02));
    group.add(kit.box(40, 1.0, .34, mat({color: 0x2f6b7a, roughness: .6}), 0, 0, wallZ + .02, .02));
    group.add(kit.box(40, .14, .08, mat({color: aBase, emissive: aBright, emissiveIntensity: .35 * glowK, roughness: .5}), 0, 1.05, wallZ + .2, .01));
    // scrolling seamless line chart + bars + tiles dashboards
    const bg = night ? '#0f1726' : '#f7f9fc', ink = night ? '#dbe6f5' : '#26303d', softc = night ? '#34445e' : '#d5dce6';
    const header = (g, w) => { g.fillStyle = ink; g.fillRect(24, 22, 150, 12); g.fillStyle = softc; g.fillRect(24, 44, 100, 8); g.strokeStyle = softc; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(24, 90 + i * 40); g.lineTo(w - 24, 90 + i * 40); g.stroke(); } };
    const lineTex = tex(512, 320, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); header(g, w);
      chartCols.slice(0, 3).forEach((c, k) => { g.strokeStyle = c; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath(); for (let x = 0; x <= w; x += 8) { const y = 175 - k * 12 + Math.sin(x / w * Math.PI * 2 * (1 + k)) * (42 + k * 8) + Math.sin(x / w * Math.PI * 2 * (3 + k * 2) + k) * 14; if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); });
    }, {aniso: 4});
    lineTex.wrapS = THREE.RepeatWrapping;
    const barTex = tex(512, 320, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); header(g, w); const r = look.rng(5); for (let i = 0; i < 12; i++) { const bh = 30 + r() * 150; g.fillStyle = chartCols[i % 4]; g.fillRect(34 + i * 38, 250 - bh, 26, bh); } });
    const mixTex = tex(512, 320, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); header(g, w); const r = look.rng(9);
      [[24, 90], [182, 90], [340, 90]].forEach(([x, y], i) => { g.fillStyle = softc; g.fillRect(x, y, 148, 62); g.fillStyle = chartCols[i]; g.fillRect(x + 10, y + 12, 60 + r() * 50, 14); g.fillStyle = ink; g.fillRect(x + 10, y + 36, 50, 10); });
      g.lineWidth = 26; [[0, .45], [.45, .75], [.75, 1]].forEach(([a, b], i) => { g.strokeStyle = chartCols[i]; g.beginPath(); g.arc(120, 215, 40, -Math.PI / 2 + a * Math.PI * 2, -Math.PI / 2 + b * Math.PI * 2); g.stroke(); });
      g.fillStyle = softc; for (let i = 0; i < 4; i++) g.fillRect(230, 175 + i * 18, 240 - i * 40, 9);
    });
    const dashMat = (map) => mat({map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: night ? 1.0 : .62, roughness: .3});
    const dMats = [dashMat(barTex), dashMat(lineTex), dashMat(mixTex)];
    const frame = mat({color: 0x2a3038, roughness: .4, metalness: .4});
    // floor-standing dashboards (low, in frame on wide canvases) and a tall wall above them
    [[-4.4, 0, -.14], [0, 1, 0], [4.4, 2, .14]].forEach(([x, k, ry], i) => {
      const s = new THREE.Group(); s.position.set(x, 0, -9.4 - Math.abs(x) * .04); s.rotation.y = ry; s.rotation.x = -.08; group.add(s);
      s.add(kit.box(3.7, 2.15, .12, frame, 0, .3, 0, .04));
      [-1.4, 1.4].forEach((dx) => s.add(kit.box(.1, .32, .1, frame, dx, 0, 0, .01)));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3.52, 2.0), dMats[k]); p.position.set(0, 1.37, .07); s.add(p);
      void i;
    });
    [[-6.4, 1], [-2.2, 2], [2.2, 0], [6.4, 1]].forEach(([x, k]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), dMats[k]); p.position.set(x, 4.3, wallZ + .2); group.add(p); group.add(kit.box(3.8, 2.4, .08, frame, x, 3.1, wallZ + .12, .03)); });
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(.1, 2.0), kit.basic({color: night ? 0xaad0ff : 0x2b7bb9, transparent: true, opacity: .4, toneMapped: false, depthWrite: false}));
    scan.position.set(0, 1.37, -9.4 + .1); scan.rotation.x = -.08; group.add(scan);

    // ---------- benches with screens and glassware (instanced), a tower of servers ----------
    const benchTop = mat({color: 0xf4f6f8, roughness: .35}), steel = mat({color: 0x8a95a3, roughness: .4, metalness: .5}), darkM = mat({color: 0x252a31, roughness: .4, metalness: .2});
    const wsTex = tex(256, 160, (g, w, h) => {
      g.fillStyle = '#0f1726'; g.fillRect(0, 0, w, h);
      const r = look.rng(8); for (let i = 0; i < 8; i++) { g.fillStyle = chartCols[i % 4]; const bh = 20 + r() * 70; g.fillRect(16 + i * 28, 140 - bh, 18, bh); }
      g.strokeStyle = '#dbe6f5'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 60); for (let i = 1; i < 9; i++) g.lineTo(14 + i * 28, 40 + r() * 50); g.stroke();
    });
    const wsM = mat({map: wsTex, emissiveMap: wsTex, emissive: 0xffffff, emissiveIntensity: .85, roughness: .3});
    const benches = [[-7.2, -7.4, .45], [7.4, -8.2, -.5], [-9.0, -2.2, Math.PI / 2 - .2]];
    rig(benches, [
      [kit.bevel(3.0, .06, .9, .02), benchTop, [[0, .89, 0]]],
      [kit.bevel(2.9, .82, .8, .04), mat({color: 0xc5d0d6, roughness: .5}), [[0, .43, 0]]],
      [kit.bevel(.62, .3, .02, .01), steel, [[-1.0, .45, .41], [-.2, .45, .41], [.6, .45, .41], [1.2, .45, .41]]],
      [unitBox, darkM, [[-.7, .98, -.1, 0, .08, .24, .06], [.7, .98, -.1, 0, .08, .24, .06], [-.7, .94, .22, 0, .5, .02, .18]]],
      [kit.bevel(.9, .56, .05, .02), darkM, [[-.7, 1.42, -.14], [.7, 1.42, -.14]]]
    ]);
    rig(benches, [[new THREE.PlaneGeometry(.84, .5), wsM, [[-.7, 1.42, -.11], [.7, 1.42, -.11]]]], false);
    const flaskGeo = kit.geo('lab|flask', () => new THREE.CylinderGeometry(.06, .12, .26, 12));
    const flaskList = []; for (let i = 0; i < 6; i++) flaskList.push([6.6 + i * .28, 1.05, -8.0 + (i % 2) * .15 - i * .1, 0, 1, 1, 1, new THREE.Color(chartCols[i % 4]).lerp(new THREE.Color(0xffffff), .3).getHex()]);
    inst(flaskGeo, mat({color: 0xffffff, roughness: .15, metalness: 0}), flaskList);
    const tower = new THREE.Group(); tower.position.set(10.6, 0, -10.2); group.add(tower);
    tower.add(kit.box(1.0, 2.2, .9, mat({color: 0x3a424d, roughness: .45, metalness: .35}), 0, 0, 0, .04));
    const ledA = kit.basic({color: 0x4a9b4f, toneMapped: false}), ledB = kit.basic({color: aBright, toneMapped: false});
    const ledPos = []; for (let i = 0; i < 8; i++) ledPos.push([-.28 + (i % 2) * .5, .35 + ((i / 2) | 0) * .42, .47, 0, .09, .09, .02]);
    const ledMeshA = inst(unitBox, ledA, ledPos.filter((_, i) => i % 3 !== 0), tower, false), ledMeshB = inst(unitBox, ledB, ledPos.filter((_, i) => i % 3 === 0), tower, false);
    void ledMeshA; void ledMeshB;

    // ---------- holographic bar chart table (right): bars grow and shrink ----------
    const holo = new THREE.Group(); holo.position.set(-8.6, 0, -5.8); group.add(holo);
    holo.add(kit.cyl(.9, 1.0, .9, mat({color: 0x2f3f52, roughness: .45, metalness: .3}), 0, 0, 0, 24));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.92, .035, 8, 40), kit.basic({color: aBright, toneMapped: false})); rim.rotation.x = Math.PI / 2; rim.position.y = .92; holo.add(rim);
    const holoBars = new THREE.InstancedMesh(unitBox, mat({color: aBase, emissive: aBright, emissiveIntensity: .5 + .5 * glowK, roughness: .3, transparent: true, opacity: .88}), 7);
    holo.add(holoBars);
    const setBars = (t) => { for (let i = 0; i < 7; i++) { const h = .35 + (reduced ? .5 : (Math.sin(t * .9 + i * .9) * .5 + .5)) * .9; dummy.position.set(-.6 + i * .2, .92 + h / 2, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(.13, h, .13); dummy.updateMatrix(); holoBars.setMatrixAt(i, dummy.matrix); } holoBars.instanceMatrix.needsUpdate = true; };
    setBars(0);
    // floating data nodes (instanced, bobbing)
    const nodes = new THREE.InstancedMesh(kit.geo('lab|node', () => new THREE.OctahedronGeometry(.16, 0)), mat({color: aBase, emissive: aBright, emissiveIntensity: .4 + .8 * glowK, roughness: .3}), 14);
    const nr = look.rng(31); const nodeBase = []; for (let i = 0; i < 14; i++) nodeBase.push([(nr() < .5 ? -1 : 1) * (4.4 + nr() * 5), 1.6 + nr() * 2.4, -4 - nr() * 6.5, nr() * 6]);
    const setNodes = (t) => { nodeBase.forEach((n, i) => { dummy.position.set(n[0], n[1] + (reduced ? 0 : Math.sin(t * .8 + n[3]) * .15), n[2]); dummy.rotation.set(0, (reduced ? 0 : t * .6) + n[3], 0); dummy.scale.setScalar(1); dummy.updateMatrix(); nodes.setMatrixAt(i, dummy.matrix); }); nodes.instanceMatrix.needsUpdate = true; };
    setNodes(0); group.add(nodes);

    // ---------- whiteboard (right) and plants ----------
    const wb = new THREE.Group(); wb.position.set(8.4, 0, -4.4); wb.rotation.y = -.7; group.add(wb);
    const wbTex = tex(512, 320, (g, w, h) => {
      g.fillStyle = '#fbfbfa'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#444'; g.lineWidth = 4; g.beginPath(); g.moveTo(50, 40); g.lineTo(50, 270); g.lineTo(300, 270); g.stroke();
      const r = look.rng(5); for (let i = 0; i < 26; i++) { const x = 70 + r() * 210, y = 250 - (x - 70) * .8 + (r() - .5) * 70; g.fillStyle = chartCols[i % 4]; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
      g.strokeStyle = accHex; g.lineWidth = 5; g.beginPath(); g.moveTo(70, 250); g.lineTo(290, 70); g.stroke();
      g.fillStyle = '#26303d'; for (let i = 0; i < 5; i++) g.fillRect(340, 60 + i * 34, 130 - (i % 3) * 30, 8);
    });
    wb.add(kit.box(2.2, 1.35, .06, steel, 0, .85, 0, .02));
    const wbFace = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 1.23), mat({map: wbTex, roughness: .35})); wbFace.position.set(0, 1.525, .04); wb.add(wbFace);
    [-1, 1].forEach((x) => { wb.add(kit.box(.05, .9, .05, steel, x, 0, 0, .01)); wb.add(kit.box(.06, .03, .6, steel, x, 0, 0, .01)); });
    const plantAt = [[5.0, -4.6, 1], [-4.6, -9.2, 1.2], [4.8, -10.4, 1.3], [-10.4, -8.8, 1.3]];
    rig(plantAt.map(([x, z, s]) => [x, z, 0, s]), [[kit.cylGeo(.26, .2, .5, 16), mat({color: 0xf2efe9, roughness: .6}), [[0, .25, 0]]]]);
    const rl = look.rng(6); const leafL = [];
    for (let i = 0; i < 7; i++) leafL.push([(rl() - .5) * .45, .78 + rl() * .55, (rl() - .5) * .45, 0, 1.1, 1.3, 1.1, i % 2 ? 0x4f8a4b : 0x62a35c]);
    rig(plantAt.map(([x, z, s]) => [x, z, 0, s]), [[kit.sphereGeo(.22, 10), mat({color: 0xffffff, roughness: .7}), leafL]]);

    // ---------- overhead: light panels, a cable tray, a little drone ----------
    const panelM = mat({color: 0xf6fbff, emissive: 0xe8f4ff, emissiveIntensity: night ? lampK * 1.1 : dusk ? .8 : .5, roughness: .4});
    inst(unitBox, panelM, [[-6, 4.6, -8.5, 0, 2.4, .08, 1.2], [-2, 4.6, -9, 0, 2.4, .08, 1.2], [2, 4.6, -9, 0, 2.4, .08, 1.2], [6, 4.6, -8.5, 0, 2.4, .08, 1.2], [-8.5, 4.6, -3, 0, 1.2, .08, 2.4], [8.5, 4.6, -3, 0, 1.2, .08, 2.4]], group, false);
    group.add(kit.box(26, .14, .5, mat({color: 0x7b8591, roughness: .6, metalness: .3}), 0, 4.9, -10.4, .02));
    const drone = new THREE.Group(); drone.position.set(-4, 3.3, -7.6); group.add(drone);
    drone.add(kit.box(.5, .16, .5, mat({color: 0xf3f6f8, roughness: .4}), 0, 0, 0, .05));
    drone.add(kit.box(.46, .05, .1, mat({color: aBase, roughness: .5}), 0, .08, .26, .01));
    const rotors = [[-.34, -.34], [.34, -.34], [-.34, .34], [.34, .34]].map(([x, z]) => { const r = new THREE.Mesh(kit.cylGeo(.2, .2, .015, 14), mat({color: 0x2b3138, roughness: .5, transparent: true, opacity: .55})); r.position.set(x, .17, z); drone.add(r); return r; });
    kit.glow(drone, aBright.getHex(), .5, 0, -.05, .28);

    [[-7.2, -7.4, 3.4, 2.4], [7.4, -8.2, 3.4, 2.4], [-9.0, -2.2, 1.6, 3.2], [8.4, -4.4, 2.4, 1.0], [10.6, -10.2, 1.4, 1.2], [-8.6, -5.8, 2.2, 2.2], [-4.4, -9.4, 4, 1.0], [0, -9.4, 4, 1.0], [4.4, -9.4, 4, 1.0]].forEach(([x, z, w, d]) => { const b = look.makeBlob(w, d, .3); b.position.x = x; b.position.z = z; group.add(b); });
    group.traverse((o) => { if (o.isMesh && !o.userData.blob) o.receiveShadow = true; });
    [floor, matpad].forEach((o) => { o.castShadow = false; });

    let t = 0;
    return {
      group,
      update(dt) {
        if (reduced || !(dt > 0)) return;
        t += dt;
        lineTex.offset.x = (t * .035) % 1;
        scan.position.x = Math.sin(t * .5) * 1.6;
        const pulse = (night ? 1.0 : .62) * (.95 + Math.sin(t * 2.2) * .05);
        dMats.forEach((m, i) => { m.emissiveIntensity = pulse * (.97 + Math.sin(t * 1.3 + i * 2) * .03); });
        ledA.color.setHex(Math.sin(t * 3) > .2 ? 0x4a9b4f : 0x2d6a31); ledB.color.setHex(Math.sin(t * 2.3 + 1) > 0 ? aBright.getHex() : aBase.getHex());
        setBars(t); setNodes(t);
        drone.position.set(-4 + Math.sin(t * .3) * 2.6, 3.3 + Math.sin(t * .9) * .12, -7.6 + Math.cos(t * .3) * .8); drone.rotation.y = Math.sin(t * .3) * .3;
        rotors.forEach((r, i) => { r.rotation.y = t * 40 * (i % 2 ? 1 : -1); });
      },
      dispose() { kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
