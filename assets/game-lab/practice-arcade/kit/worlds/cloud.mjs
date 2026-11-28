// World: the cloud ("toy diorama", the one abstract world). The stage is a floating tech platform in the sky; around it
// hang glowing service nodes joined by data links with packets running along them, dashed orbit rings turn behind, clouds
// drift below and small islands float far off. Set dressing only; the stage (x -3..3, z -6..2, y up to 2) stays empty.
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Primitives, instanced repeats and canvas textures only.
const W = {
  id: 'cloud',
  label: 'Cloud',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const mood = look.moodOf(ctx.mood || theme.mood);
    const night = mood.id === 'night', dusk = mood.id === 'dusk';
    const acc = ctx.accent || look.accentSet(theme.accent || '#ad2c4d');
    const aBase = acc.base.clone(), aBright = acc.bright.clone();
    const accHex = '#' + aBase.getHexString();
    const reduced = !!ctx.reduced;
    const group = new THREE.Group(); group.name = 'world-cloud';
    const own = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const dummy = new THREE.Object3D(), q = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const glowK = mood.glow, lampK = mood.lamp;
    const r = look.rng(17);
    const unitBox = kit.geo('cloud|unit', () => new THREE.BoxGeometry(1, 1, 1));

    // ---------- the cloud sea (faded by fog) and stars at night ----------
    const seaCol = night ? '#25345e' : dusk ? '#f1bfae' : '#d6e8f8';
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), new THREE.MeshBasicMaterial({color: new THREE.Color(seaCol)}));
    kit.tracked.add(sea.material);
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -4.6, -22); group.add(sea);
    if (night) {
      const n = 220, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (r() - .5) * 120; pos[i * 3 + 1] = 2 + r() * 38; pos[i * 3 + 2] = -50 - r() * 8; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const sm = new THREE.PointsMaterial({color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .85}); kit.tracked.add(sm);
      group.add(new THREE.Points(sg, sm));
    }

    // ---------- clouds: clusters of soft puffs that drift past (instanced) ----------
    const puff = kit.geo('cloud|puff', () => new THREE.SphereGeometry(1, 14, 10));
    const cloudCol = night ? 0x7f8fbf : dusk ? 0xffe2d2 : 0xffffff;
    const clusters = [];
    const cdef = [[-6.6, -1.6, 1.0], [6.8, -1.9, -.2], [-7.4, -2.4, -5.0], [7.6, -2.0, -7.5], [-10.5, -1.2, -9.0], [-3.4, -3.2, 5.6], [3.6, -3.0, 6.2], [0, -3.0, -13], [-13, -2.4, -2], [12.5, -2.6, -3], [-5.5, -2.0, -13], [5.6, -2.3, -14], [-14, -1.6, -11], [14, -1.4, -9]];
    cdef.forEach(([x, y, z], i) => { const n = 5 + (i % 3); const puffs = []; for (let k = 0; k < n; k++) puffs.push([(k - n / 2) * .95 + (r() - .5) * .5, (r() - .3) * .5, (r() - .5) * 1.2, 1.3 + r() * .9, .9 + r() * .5, 1.2 + r() * .6]); clusters.push({x, y, z, speed: .08 + r() * .1, phase: r() * 6, puffs}); });
    const totalPuffs = clusters.reduce((a, c) => a + c.puffs.length, 0);
    const clouds = new THREE.InstancedMesh(puff, mat({color: cloudCol, roughness: 1, metalness: 0, emissive: night ? 0x1a2240 : 0xffffff, emissiveIntensity: night ? .5 : .1}), totalPuffs);
    const setClouds = (t) => { let i = 0; for (const c of clusters) { const dx = reduced ? 0 : Math.sin(t * c.speed + c.phase) * 1.6; for (const p of c.puffs) { dummy.position.set(c.x + p[0] + dx, c.y + p[1], c.z + p[2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(p[3], p[4], p[5]); dummy.updateMatrix(); clouds.setMatrixAt(i++, dummy.matrix); } } clouds.instanceMatrix.needsUpdate = true; };
    setClouds(0); clouds.frustumCulled = false; group.add(clouds);

    // ---------- the platform: a rounded slab with circuit lines, glowing accent edges and a crystal underside ----------
    const gridTex = tex(256, 256, (g, w, h) => {
      g.fillStyle = night ? '#9fb0cc' : '#c3d3ea'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,90,130,.25)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
      g.fillStyle = 'rgba(70,90,130,.1)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) g.fillRect(i * 64, j * 64, 64, 64);
    }, {repeat: [6, 8], aniso: 8});
    const slabM = mat({map: gridTex, roughness: .5, metalness: .05});
    const slab = new THREE.Mesh(kit.bevel(7.6, .5, 14.6, .12), slabM); slab.position.set(0, -.25, -2.6); slab.receiveShadow = true; group.add(slab);
    const under = new THREE.Mesh(kit.geo('cloud|under', () => new THREE.ConeGeometry(3.6, 4.2, 6)), mat({color: night ? 0x3a4a78 : 0x9fb0cc, roughness: .6, flatShading: true})); under.rotation.x = Math.PI; under.rotation.y = Math.PI / 6; under.scale.set(1, 1, 2.0); under.position.set(0, -2.6, -2.6); group.add(under);
    const edgeM = kit.basic({color: aBright.clone().lerp(new THREE.Color(0xffffff), .1), toneMapped: false});
    [[-3.7, -2.6, .12, 14.4], [3.7, -2.6, .12, 14.4]].forEach(([x, z, w, d]) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, .08, d), edgeM); e.position.set(x, .01, z); group.add(e); });
    const farEdge = new THREE.Mesh(new THREE.BoxGeometry(7.4, .08, .12), edgeM); farEdge.position.set(0, .01, -9.75); group.add(farEdge);
    const nearEdge = new THREE.Mesh(new THREE.BoxGeometry(7.4, .08, .12), edgeM); nearEdge.position.set(0, .01, 4.45); group.add(nearEdge);
    const padTex = tex(128, 128, (g, w, h) => {
      g.fillStyle = night ? '#4b5f8e' : '#6f9bd2'; g.fillRect(0, 0, w, h);
      g.strokeStyle = accHex; g.globalAlpha = night ? .55 : .5; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      g.globalAlpha = .25; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = accHex; for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
    }, {repeat: [4, 6], aniso: 8});
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 9.6), mat({map: padTex, roughness: .55, metalness: 0}));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, .006, -2); pad.receiveShadow = true; group.add(pad);
    // data lanes along the platform edges: small bright pulses run toward the far end
    const laneX = [-3.15, -2.85, 2.85, 3.15];
    const pulses = new THREE.InstancedMesh(unitBox, kit.basic({color: night ? 0xffffff : 0xffc23a, toneMapped: false}), laneX.length * 5);
    const setPulses = (t) => { let i = 0; for (let l = 0; l < laneX.length; l++) for (let k = 0; k < 5; k++) { const u = ((t * (.07 + l * .01) + k / 5 + l * .13) % 1); dummy.position.set(laneX[l], .02, 4.2 - u * 13.6); dummy.rotation.set(0, 0, 0); dummy.scale.set(.07, .03, .4); dummy.updateMatrix(); pulses.setMatrixAt(i++, dummy.matrix); } pulses.instanceMatrix.needsUpdate = true; };
    setPulses(.2); pulses.frustumCulled = false; group.add(pulses);

    // ---------- service nodes: glowing rounded blocks with icons, floating on hex pads ----------
    const iconCols = ['#2b7bb9', '#1f9a8a', accHex, '#6b4fa0', '#3b8f4a'];
    const iconTex = (kind, col) => tex(128, 128, (g, w, h) => {
      g.fillStyle = col; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
      if (kind === 0) { for (let i = 0; i < 3; i++) g.fillRect(30, 28 + i * 24, 68, 16); g.fillStyle = col; for (let i = 0; i < 3; i++) g.fillRect(36, 33 + i * 24, 8, 6); }
      else if (kind === 1) { g.beginPath(); g.ellipse(64, 38, 34, 12, 0, 0, 7); g.fill(); g.fillRect(30, 38, 68, 46); g.beginPath(); g.ellipse(64, 84, 34, 12, 0, 0, 7); g.fill(); g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.ellipse(64, 56, 34, 10, 0, 0, Math.PI); g.stroke(); }
      else if (kind === 2) { g.beginPath(); g.arc(46, 72, 20, Math.PI * .5, Math.PI * 1.5); g.arc(68, 54, 22, Math.PI, Math.PI * 2); g.arc(88, 74, 18, Math.PI * 1.5, Math.PI * .5); g.closePath(); g.fill(); }
      else if (kind === 3) { g.beginPath(); g.moveTo(64, 24); g.lineTo(98, 44); g.lineTo(98, 84); g.lineTo(64, 104); g.lineTo(30, 84); g.lineTo(30, 44); g.closePath(); g.stroke(); g.beginPath(); g.arc(64, 64, 12, 0, 7); g.fill(); }
      else { g.beginPath(); g.arc(64, 64, 12, 0, 7); g.fill(); [[28, 34], [100, 34], [28, 94], [100, 94]].forEach(([x, y]) => { g.beginPath(); g.moveTo(64, 64); g.lineTo(x, y); g.stroke(); g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }); }
    }, {aniso: 4});
    const ndef = [[-8.4, 1.5, -8.2, 0, 1.5], [-5.2, 2.7, -11.2, 1, 1.5], [-2.0, 1.2, -9.8, 4, 1.3], [1.2, 2.8, -11.6, 2, 1.6], [4.2, 1.3, -9.2, 3, 1.4], [7.4, 2.5, -10.8, 0, 1.5], [9.4, 1.3, -6.6, 1, 1.4], [-9.2, 3.2, -4.4, 3, 1.3], [8.8, 3.4, -3.6, 4, 1.2]];
    const nodes = ndef.map(([x, y, z, k, s], i) => {
      const b = new THREE.Group(); b.position.set(x, y, z); b.userData.base = y; b.userData.phase = i * 1.3; group.add(b);
      const tx = iconTex(k, iconCols[k]);
      const m = mat({map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: night ? 1.1 : .5, roughness: .35, metalness: .05});
      const cube = new THREE.Mesh(k === 1 ? kit.cylGeo(.6, .6, 1.1, 24) : k === 3 ? kit.cylGeo(.62, .62, 1.1, 6) : kit.bevel(1.1, 1.1, 1.1, .16), m);
      if (k === 1 || k === 3) cube.rotation.y = k === 1 ? Math.PI : 0;
      cube.scale.setScalar(s / 1.1 * 1.0); cube.castShadow = true; b.add(cube);
      kit.glow(b, new THREE.Color(iconCols[k]).getHex(), 3.0 * s / 1.3, 0, 0, -.1);
      return b;
    });
    const padL = ndef.map(([x, y, z, , s]) => [x, y - 1.0 - s * .3, z]);
    const hexPads = new THREE.InstancedMesh(kit.cylGeo(.8, .8, .08, 6), mat({color: aBase, emissive: aBright, emissiveIntensity: .35 * glowK + .1, roughness: .4}), padL.length);
    padL.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(ndef[i][4] / 1.3); dummy.updateMatrix(); hexPads.setMatrixAt(i, dummy.matrix); });
    group.add(hexPads);
    // data links (static instanced cylinders) with packets running along them
    const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 2], [2, 4], [1, 3], [5, 6], [0, 7], [5, 8], [3, 5]];
    const linkM = mat({color: night ? 0x9fc4ff : 0x4f78b8, emissive: night ? 0x6fa0ff : 0x3a68b0, emissiveIntensity: .5, roughness: .4, transparent: true, opacity: .8});
    const linkMesh = new THREE.InstancedMesh(kit.cylGeo(.03, .03, 1, 6), linkM, links.length);
    const segs = links.map(([a, b], i) => {
      const A = nodes[a].position, B = nodes[b].position; const len = A.distanceTo(B);
      v1.copy(B).sub(A).normalize(); q.setFromUnitVectors(up, v1);
      dummy.position.copy(A).add(B).multiplyScalar(.5); dummy.quaternion.copy(q); dummy.scale.set(1, len, 1); dummy.updateMatrix(); linkMesh.setMatrixAt(i, dummy.matrix);
      return {A, B};
    });
    dummy.quaternion.identity(); linkMesh.frustumCulled = false; group.add(linkMesh);
    const packets = new THREE.InstancedMesh(kit.geo('cloud|packet', () => new THREE.SphereGeometry(.1, 8, 6)), kit.basic({color: night ? 0xffffff : 0xffb020, toneMapped: false}), segs.length * 2);
    const setPackets = (t) => { for (let i = 0; i < segs.length; i++) for (let k = 0; k < 2; k++) { const sg = segs[i]; const u = (t * (.14 + (i % 4) * .03) + i * .27 + k * .5) % 1; dummy.position.lerpVectors(sg.A, sg.B, u); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); packets.setMatrixAt(i * 2 + k, dummy.matrix); } packets.instanceMatrix.needsUpdate = true; };
    setPackets(.3); packets.frustumCulled = false; group.add(packets);

    // ---------- dashed orbit rings behind (they turn), floating islands, motes ----------
    const ringGroup = new THREE.Group(); ringGroup.position.set(0, 3.2, -13.4); group.add(ringGroup);
    const mkRing = (R, n, w, speed) => {
      const g = new THREE.Group(); ringGroup.add(g);
      const m = new THREE.InstancedMesh(unitBox, kit.basic({color: aBright.clone().lerp(new THREE.Color(0xffffff), night ? .1 : 0), toneMapped: false, transparent: true, opacity: .85}), n);
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; dummy.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); dummy.rotation.set(0, 0, a + Math.PI / 2); dummy.scale.set(w, .18, .12); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }
      m.frustumCulled = false; g.add(m); g.userData.speed = speed; return g;
    };
    const rings = [mkRing(5.4, 36, .5, .08), mkRing(4.2, 28, .38, -.12), mkRing(3.0, 20, .28, .18)];
    const islands = [[-14.5, 1.0, -17, 1.7], [15, 2.4, -15, 1.4], [-17, 4.6, -26, 2.2]].map(([x, y, z, s], i) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.userData.base = y; g.userData.phase = i * 2; group.add(g);
      const rock = new THREE.Mesh(kit.geo('cloud|rock', () => new THREE.ConeGeometry(1.6, 2.4, 7)), mat({color: night ? 0x38466e : 0x8d93a6, roughness: .8, flatShading: true})); rock.rotation.x = Math.PI; rock.position.y = -1.0; g.add(rock);
      const top = new THREE.Mesh(kit.cylGeo(1.6, 1.6, .22, 7), mat({color: night ? 0x2f6f55 : 0x5fbf72, roughness: .8})); g.add(top);
      const tree = new THREE.Mesh(kit.geo('cloud|tree', () => new THREE.ConeGeometry(.5, 1.2, 8)), mat({color: night ? 0x2a5a48 : 0x3f9d5a, roughness: .8})); tree.position.set(.3, .8, 0); g.add(tree);
      g.scale.setScalar(s); return g;
    });
    const motes = new THREE.InstancedMesh(kit.geo('cloud|mote', () => new THREE.BoxGeometry(.16, .16, .16)), mat({color: 0xffffff, roughness: .4, emissive: 0xffffff, emissiveIntensity: night ? .8 : .3}), 16);
    const moteBase = []; for (let i = 0; i < 16; i++) moteBase.push([(r() < .5 ? -1 : 1) * (3.8 + r() * 6), .8 + r() * 4, -4 - r() * 8, r() * 6]); // |x| > 3.8: never inside the stage volume
    const setMotes = (t) => { for (let i = 0; i < moteBase.length; i++) { const m = moteBase[i]; dummy.position.set(m[0], m[1] + (reduced ? 0 : Math.sin(t * .6 + m[3]) * .15), m[2]); dummy.rotation.set(reduced ? m[3] : t * .3 + m[3], reduced ? 0 : t * .4, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); motes.setMatrixAt(i, dummy.matrix); } motes.instanceMatrix.needsUpdate = true; };
    setMotes(0); motes.frustumCulled = false; group.add(motes);

    group.traverse((o) => { if (o.isMesh) o.receiveShadow = o === slab || o === pad; });
    [slab, pad, clouds, sea].forEach((o) => { o.castShadow = false; });
    let t = 0;
    return {
      group,
      update(dt) {
        if (reduced || !(dt > 0)) return;
        t += dt;
        for (let i = 0; i < nodes.length; i++) { const b = nodes[i]; b.rotation.y = Math.sin(t * .3 + b.userData.phase) * .3; b.position.y = b.userData.base + Math.sin(t * .7 + b.userData.phase) * .08; }
        for (let i = 0; i < islands.length; i++) { const g = islands[i]; g.position.y = g.userData.base + Math.sin(t * .25 + g.userData.phase) * .25; }
        for (let i = 0; i < rings.length; i++) rings[i].rotation.z += rings[i].userData.speed * dt;
        setClouds(t); setPackets(t); setPulses(t); setMotes(t);
      },
      dispose() { kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
