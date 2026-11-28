// World: a bright design and media studio ("toy diorama"). Set dressing only; the stage (x -3..3, z -6..2, y up to 2) stays empty.
// ctx = {THREE, look, kit, theme, quality, mood, reduced, accent}. Primitives, instanced repeats and canvas textures only.
// Layout: mood boards, leaning canvases and colour bins in the low band behind the stage, a photo corner (paper roll,
// softboxes, camera on a tripod) and drafting desks to the right, an easel and swatch rack to the left, paint splashes on
// the oak floor, pendant lamps, bunting and a turning mobile overhead, paper planes gliding past.
const W = {
  id: 'studio',
  label: 'Studio',
  build(ctx) {
    const {THREE, look, kit, theme} = ctx;
    const mood = look.moodOf(ctx.mood || theme.mood);
    const night = mood.id === 'night', dusk = mood.id === 'dusk';
    const acc = ctx.accent || look.accentSet(theme.accent || '#ad2c4d');
    const aBase = acc.base.clone(), aBright = acc.bright.clone();
    const accHex = '#' + aBase.getHexString();
    const reduced = !!ctx.reduced;
    const group = new THREE.Group(); group.name = 'world-studio';
    const own = [];
    const tex = (w, h, draw, opts) => { const t = look.canvasTexture(w, h, draw, opts); own.push(t); return t; };
    const mat = (p) => kit.own(p);
    const dummy = new THREE.Object3D(), m4 = new THREE.Matrix4();
    const glowK = mood.glow, lampK = mood.lamp;
    const unitBox = kit.geo('studio|unit', () => new THREE.BoxGeometry(1, 1, 1));
    const palette = ['#f2c14e', '#4aa3c7', accHex, '#6bbf74', '#f08a5d', '#8a6fd1'];
    const inst = (geo, material, list, parent = group, cast = true) => {
      const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((a, i) => {
        dummy.position.set(a[0], a[1], a[2]); dummy.rotation.set(a[8] || 0, a[3] || 0, a[9] || 0); dummy.scale.set(a[4] || 1, a[5] || 1, a[6] || 1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
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

    // ---------- floor: warm oak planks to the fog, an indigo stage rug with an accent edge, paint splashes ----------
    const planks = tex(256, 256, (g, w, h) => {
      const r = look.rng(9);
      for (let i = 0; i < 8; i++) { const v = 196 + (r() * 24 | 0); g.fillStyle = `rgb(${v},${v - 40},${v - 92})`; g.fillRect(0, i * 32, w, 31); g.fillStyle = 'rgba(120,70,30,.4)'; g.fillRect(0, i * 32 + 31, w, 1); g.fillRect(r() * w, i * 32, 1, 31); }
      for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(140,90,50,.14)'; g.fillRect(r() * w, r() * h, 18, 1); }
    }, {repeat: [12, 11], aniso: 8});
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 56), mat({map: planks, roughness: .7, metalness: 0}));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -14); floor.receiveShadow = true; group.add(floor);
    const rugTex = tex(256, 352, (g, w, h) => {
      g.fillStyle = '#4a527c'; g.fillRect(0, 0, w, h);
      const r = look.rng(4); for (let i = 0; i < 2000; i++) { const v = 70 + (r() * 40 | 0); g.fillStyle = `rgba(${v},${v + 4},${v + 40},.35)`; g.fillRect(r() * w, r() * h, 2, 2); }
      g.fillStyle = accHex; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); g.fillRect(0, 0, w, 10);
      palette.forEach((c, i) => { g.fillStyle = c; g.globalAlpha = .55; g.fillRect(18, 20 + i * 54, 6, 30); g.fillRect(w - 24, 20 + i * 54, 6, 30); }); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3; g.strokeRect(30, 30, w - 60, h - 60);
    }, {aniso: 8});
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 10.0), mat({map: rugTex, roughness: .95, metalness: 0}));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, .004, -2); rug.receiveShadow = true; group.add(rug);
    const rs = look.rng(22); const splash = [];
    for (let i = 0; i < 26; i++) { const side = i % 2 ? 1 : -1, x = side * (4.2 + rs() * 7), z = -12 + rs() * 16; { const k = .25 + rs() * .8; splash.push([x, .007, z, 0, k, k * (.7 + rs() * .6), 1, palette[i % 6], -Math.PI / 2]); } }
    const splashM = inst(kit.geo('studio|disc', () => new THREE.CircleGeometry(.5, 18)), mat({color: 0xffffff, roughness: .8}), splash, group, false);
    splashM.receiveShadow = true;

    // ---------- back wall with two tall windows, skirting, accent stripe ----------
    const wallZ = -12.6;
    group.add(kit.box(40, 9, .3, mat({color: dusk ? 0xf0dcd0 : 0xf6efe4, roughness: .9}), 0, 0, wallZ, .02));
    group.add(kit.box(40, .55, .34, mat({color: 0xd8cbb8, roughness: .8}), 0, 0, wallZ + .02, .02));
    group.add(kit.box(40, .16, .08, mat({color: aBase, emissive: aBright, emissiveIntensity: .3 * glowK, roughness: .5}), 0, 1.6, wallZ + .2, .01));
    const view = tex(512, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#' + new THREE.Color(mood.sky[0]).lerp(new THREE.Color(0xffffff), night ? .05 : .25).getHexString()); gr.addColorStop(1, '#' + new THREE.Color(mood.sky[1]).getHexString()); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = look.rng(15);
      if (night) { g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 40; i++) g.fillRect(r() * w, r() * h * .6, 2, 2); }
      else { g.fillStyle = dusk ? 'rgba(255,214,190,.7)' : 'rgba(255,255,255,.88)'; for (let i = 0; i < 4; i++) { const cx = r() * w, cy = 30 + r() * 70; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(cx + k * 30, cy + (k % 2) * 7, 38, 16, 0, 0, 7); g.fill(); } } }
      g.fillStyle = night ? '#18203a' : dusk ? '#6a5a7a' : '#86b583'; for (let x = 0; x < w; x += 60) { g.beginPath(); g.arc(x + 30, h + 20, 60 + (x % 120) * .3, Math.PI, 0); g.fill(); }
    }, {aniso: 4});
    const paneM = kit.basic({map: view, toneMapped: false, fog: false});
    const frameM = mat({color: 0xf8f8f6, roughness: .5});
    const fl = [];
    [-6.2, 6.2].forEach((x) => {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 4.4), paneM); pane.position.set(x, 4.2, wallZ + .17); group.add(pane);
      fl.push([x, 1.95, wallZ + .2, 0, 8.9, .14, .16], [x, 6.45, wallZ + .2, 0, 8.9, .14, .16]);
      [-4.4, -1.45, 1.45, 4.4].forEach((dx) => fl.push([x + dx, 4.2, wallZ + .2, 0, .1, 4.6, .16]));
    });
    inst(unitBox, frameM, fl, group, false);

    // ---------- leaning canvases along the wall (low band), each a flat piece with a thin frame ----------
    const artTex = (seed) => tex(128, 160, (g, w, h) => {
      const r = look.rng(seed); g.fillStyle = ['#fbf6ec', '#fff', '#f4efe3'][seed % 3]; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) { g.fillStyle = palette[(seed + i * 2) % 6]; const k = r(); if (k > .5) { g.beginPath(); g.arc(20 + r() * 88, 20 + r() * 110, 12 + r() * 30, 0, 7); g.fill(); } else g.fillRect(8 + r() * 70, 14 + r() * 100, 24 + r() * 50, 20 + r() * 60); }
      g.strokeStyle = '#2b3140'; g.lineWidth = 4; g.beginPath(); g.moveTo(10, 130 - r() * 40); g.quadraticCurveTo(64, 20 + r() * 90, 118, 100 + r() * 40); g.stroke();
    });
    const arts = [[-8.7, 1.5, 2.0], [-6.4, 1.2, 1.5], [-4.9, 1.9, 2.5], [-2.9, 1.2, 1.6], [3.2, 1.5, 2.1], [5.0, 1.15, 1.5], [6.6, 1.7, 2.3], [8.6, 1.3, 1.7]];
    arts.forEach(([x, w, h], i) => {
      const p = new THREE.Group(); p.position.set(x, 0, wallZ + .5 + (i % 2) * .12); p.rotation.x = -.1; group.add(p);
      p.add(kit.box(w + .1, h + .1, .06, mat({color: i % 3 === 0 ? aBase : 0x3a3f4a, roughness: .5}), 0, 0, 0, .02));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat({map: artTex(i + 1), roughness: .85})); face.position.set(0, h / 2 + .05, .04); p.add(face);
    });

    // ---------- mood boards on stands (low), colour bins, drafting desks ----------
    const cork = tex(512, 256, (g, w, h) => {
      g.fillStyle = '#c99a62'; g.fillRect(0, 0, w, h);
      const r = look.rng(3); for (let i = 0; i < 2500; i++) { const v = r() * 60 | 0; g.fillStyle = `rgba(${120 + v},${80 + v / 2},40,.35)`; g.fillRect(r() * w, r() * h, 3, 3); }
      for (let c = 0; c < 4; c++) for (let rr = 0; rr < 3; rr++) { const x = 34 + c * 122, y = 28 + rr * 72, col = palette[((c * 3 + rr * 5) % 6)]; g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 4, y + 5, 100, 56); g.fillStyle = col; g.fillRect(x, y, 100, 56); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x + 10, y + 14, 60, 6); g.fillRect(x + 10, y + 28, 78, 5); g.fillRect(x + 10, y + 40, 44, 5); g.fillStyle = '#d33'; g.beginPath(); g.arc(x + 50, y + 6, 5, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(190,40,60,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(84, 34); g.lineTo(206, 106); g.lineTo(328, 34); g.lineTo(450, 178); g.stroke();
    }, {aniso: 4});
    const corkM = mat({map: cork, roughness: .9});
    [[-2.6, -9.6, .12], [2.4, -10.2, -.1]].forEach(([x, z, ry], i) => {
      const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = ry; group.add(b);
      b.add(kit.box(3.4, 2.1, .1, mat({color: 0x6b4d31, roughness: .6}), 0, .55, 0, .03));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), corkM); face.position.set(0, 1.6, .06); b.add(face);
      [-1.3, 1.3].forEach((dx) => b.add(kit.box(.08, .6, .08, mat({color: 0x6b4d31, roughness: .6}), dx, 0, -.1, .01)));
    });
    // colour bins: a low unit with coloured boxes (instanced)
    const binUnit = (x, z, ry) => {
      const u = new THREE.Group(); u.position.set(x, 0, z); u.rotation.y = ry; group.add(u);
      u.add(kit.box(3.4, 1.25, .6, mat({color: 0xf3efe6, roughness: .6}), 0, 0, 0, .04));
      return u;
    };
    binUnit(7.6, -11.6, 0); binUnit(-7.8, -11.6, 0);
    const binList = [];
    [7.6, -7.8].forEach((bx) => { for (let r2 = 0; r2 < 2; r2++) for (let c = 0; c < 5; c++) binList.push([bx - 1.38 + c * .69, .38 + r2 * .55, -11.28, 0, .56, .42, .1, palette[(c + r2 * 2) % 6]]); });
    inst(kit.bevel(1, 1, 1, .12), mat({color: 0xffffff, roughness: .55}), binList);
    const woodTop = mat({color: 0xe8d4ac, roughness: .55}), legM = mat({color: 0xffffff, roughness: .4}), darkM = mat({color: 0x2c3138, roughness: .4, metalness: .2});
    const scr = tex(256, 160, (g, w, h) => {
      g.fillStyle = night ? '#1e2638' : '#f6f8fb'; g.fillRect(0, 0, w, h);
      palette.slice(0, 4).forEach((c, i) => { g.fillStyle = c; g.fillRect(14 + (i % 2) * 118, 16 + ((i / 2) | 0) * 66, 106, 56); });
      g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 4; i++) g.fillRect(24 + (i % 2) * 118, 30 + ((i / 2) | 0) * 66, 60, 6);
    });
    const screenM = mat({map: scr, emissiveMap: scr, emissive: 0xffffff, emissiveIntensity: .85, roughness: .3});
    const topG = kit.bevel(2.2, .07, 1.1, .02), monG = kit.bevel(1.0, .6, .05, .03), seatG = kit.bevel(.56, .1, .52, .05), backG = kit.bevel(.5, .5, .08, .05);
    const desks = [[1.0, -8.3, -.05], [5.6, -8.0, -.4], [-6.6, -8.4, .35]];
    rig(desks, [
      [topG, woodTop, [[0, .775, 0]]],
      [unitBox, legM, [[-1.0, .37, -.45, 0, .06, .74, .06], [1.0, .37, -.45, 0, .06, .74, .06], [-1.0, .37, .45, 0, .06, .74, .06], [1.0, .37, .45, 0, .06, .74, .06]]],
      [kit.bevel(.9, .06, .5, .02), darkM, [[-.4, .84, -.1]]],
      [unitBox, darkM, [[.3, .96, -.32, 0, .08, .36, .06]]],
      [monG, darkM, [[.3, 1.42, -.34]]],
      [unitBox, mat({color: 0xf2c14e, roughness: .5}), [[-.8, .82, .2, .3, .2, .02, .2]]],
      [kit.cylGeo(.05, .045, .11, 12), mat({color: aBase, roughness: .5}), [[.85, .855, .15]]],
      [seatG, mat({color: 0xf08a5d, roughness: .75}), [[.2, .51, .95, .2]]],
      [backG, mat({color: 0xf08a5d, roughness: .75}), [[.2, .86, 1.2, .2]]],
      [kit.cylGeo(.035, .035, .4, 10), legM, [[.2, .26, .95]]]
    ]);
    rig(desks, [[new THREE.PlaneGeometry(.92, .52), screenM, [[.3, 1.42, -.31]]]], false);

    // ---------- photo corner (right): paper roll, two softboxes, a camera on a tripod ----------
    const photo = new THREE.Group(); photo.position.set(9.4, 0, -4.4); photo.rotation.y = -.7; group.add(photo);
    const paperM = mat({color: aBase, roughness: .8, side: THREE.DoubleSide});
    const sweep = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.0), paperM); sweep.position.set(0, 1.5, -.5); photo.add(sweep);
    const roll = new THREE.Mesh(kit.cylGeo(.1, .1, 3.5, 14), mat({color: 0xf0f0f0, roughness: .6})); roll.rotation.z = Math.PI / 2; roll.position.set(0, 3.0, -.5); photo.add(roll);
    const floorSweep = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.8), paperM); floorSweep.rotation.x = -Math.PI / 2; floorSweep.position.set(0, .01, .4); photo.add(floorSweep);
    const boxM = mat({color: 0xfffaf0, emissive: 0xfff4d8, emissiveIntensity: night ? lampK * 1.3 : .35, roughness: .5});
    const soft = [-2.2, 2.2].map((x) => { const s = new THREE.Group(); s.position.set(x, 0, 1.0); s.rotation.y = x < 0 ? .5 : -.5; photo.add(s); s.add(kit.cyl(.03, .03, 1.7, darkM, 0, 0, 0, 8)); s.add(kit.box(.95, .95, .3, darkM, 0, 1.55, 0, .05)); const f = kit.box(.85, .85, .04, boxM, 0, 1.6, .16, .02); s.add(f); s.add(kit.box(.5, .04, .5, darkM, 0, 0, 0, .01)); return f; });
    const tri = new THREE.Group(); tri.position.set(-.2, 0, 1.6); photo.add(tri);
    [0, 1, 2].forEach((i) => { const a = i * Math.PI * 2 / 3; const leg = new THREE.Mesh(new THREE.BoxGeometry(.04, 1.1, .04), darkM); leg.position.set(Math.sin(a) * .22, .55, Math.cos(a) * .22); leg.rotation.set(Math.cos(a) * .2, 0, -Math.sin(a) * .2); tri.add(leg); });
    tri.add(kit.box(.34, .22, .22, mat({color: 0xe9ecef, roughness: .4}), 0, 1.05, 0, .04)); const lens = kit.cyl(.08, .08, .2, darkM, 0, 1.08, -.2, 14); lens.rotation.x = Math.PI / 2; tri.add(lens);

    // ---------- left: an easel with a painting and a swatch rack ----------
    const easel = new THREE.Group(); easel.position.set(-9.2, 0, -5.0); easel.rotation.y = .6; group.add(easel);
    const wd = mat({color: 0xb98a55, roughness: .7});
    [[-.35, .12], [.35, .12], [0, -.25]].forEach(([x, z], i) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.95, .06), wd); leg.position.set(x, .97, z); leg.rotation.x = i === 2 ? -.12 : .1; easel.add(leg); });
    const art = tex(128, 160, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = palette[1]; g.beginPath(); g.arc(46, 54, 30, 0, 7); g.fill(); g.fillStyle = accHex; g.fillRect(58, 70, 54, 62); g.fillStyle = palette[0]; g.beginPath(); g.moveTo(14, 140); g.lineTo(54, 96); g.lineTo(94, 140); g.fill(); });
    const canvasM = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.25), mat({map: art, roughness: .8})); canvasM.position.set(0, 1.25, .2); easel.add(canvasM);
    const sw = tex(128, 256, (g, w, h) => { g.fillStyle = '#f4efe6'; g.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = palette[(x + y * 2) % 6]; g.globalAlpha = .55 + ((x * 3 + y * 5) % 5) * .11; g.fillRect(8 + x * 29, 8 + y * 30, 25, 26); } g.globalAlpha = 1; });
    const rack = new THREE.Group(); rack.position.set(-5.3, 0, -10.8); group.add(rack);
    rack.add(kit.box(1.3, 2.2, .1, mat({color: 0xe9e1d3, roughness: .6}), 0, .0, 0, .03));
    const swFace = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.0), mat({map: sw, roughness: .8})); swFace.position.set(0, 1.1, .06); rack.add(swFace);

    // ---------- plants (pots and leaves instanced) ----------
    const plantAt = [[-4.4, -8.6, 1.35], [4.6, -4.2, 1.1], [-4.8, -3.2, 1.0], [8.8, -9.0, 1.3], [-10.3, -9.0, 1.4], [3.8, -10.8, 1.2]];
    rig(plantAt.map(([x, z, s]) => [x, z, 0, s]), [[kit.cylGeo(.26, .2, .5, 16), mat({color: 0xf6f1e8, roughness: .6}), [[0, .25, 0]]]]);
    const rl = look.rng(6); const leafL = [];
    for (let i = 0; i < 9; i++) leafL.push([(rl() - .5) * .5, .75 + rl() * .7, (rl() - .5) * .5, 0, 1 + rl() * .5, 1.3 + rl() * .5, 1 + rl() * .5, i % 2 ? 0x4f9a52 : 0x6bb36a]);
    rig(plantAt.map(([x, z, s]) => [x, z, 0, s]), [[kit.sphereGeo(.2, 10), mat({color: 0xffffff, roughness: .7}), leafL]]);

    // ---------- overhead: pendant lamps, bunting, a turning mobile ----------
    const pend = [[-7.0, -8.6, 0], [-3.2, -9.2, 1], [1.2, -9.6, 2], [5.0, -9.2, 3], [8.4, -8.6, 4]].map(([x, z, k]) => {
      const p = new THREE.Group(); p.position.set(x, 4.5, z); group.add(p);
      p.add(kit.cyl(.012, .012, 1.4, darkM, 0, 0, 0, 5));
      const shadeM = mat({color: new THREE.Color(palette[k % 6]), emissive: new THREE.Color(palette[k % 6]), emissiveIntensity: night ? lampK * .9 : dusk ? .35 : .12, roughness: .5, side: THREE.DoubleSide});
      const shade = new THREE.Mesh(kit.geo('studio|shade', () => new THREE.ConeGeometry(.42, .42, 18, 1, true)), shadeM); shade.position.y = -.2; shade.castShadow = true; p.add(shade);
      if (night || dusk) kit.glow(p, 0xffe2a8, 2.2, 0, -.55, 0);
      return p;
    });
    const flagGeo = kit.geo('studio|flag', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-.14, 0, 0, .14, 0, 0, 0, -.28, 0]), 3)); g.computeVertexNormals(); return g; });
    const flags = new THREE.InstancedMesh(flagGeo, mat({color: 0xffffff, roughness: .7, side: THREE.DoubleSide}), 20);
    for (let i = 0; i < 20; i++) flags.setColorAt(i, new THREE.Color(palette[i % 6]));
    const bunting = new THREE.Group(); bunting.position.set(0, 3.5, -7.6); group.add(bunting); bunting.add(flags);
    const string = new THREE.Mesh(new THREE.BoxGeometry(11, .02, .02), mat({color: 0x8a8a8a})); string.position.set(0, 3.5, -7.6); group.add(string);
    const setFlags = (t) => { for (let i = 0; i < 20; i++) { dummy.position.set(-5.2 + i * .55, 0, 0); dummy.rotation.set(0, 0, reduced ? 0 : Math.sin(t * 1.4 + i * .8) * .13); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); flags.setMatrixAt(i, dummy.matrix); } flags.instanceMatrix.needsUpdate = true; };
    setFlags(0);
    const mobile = new THREE.Group(); mobile.position.set(-7.6, 4.2, -5.6); group.add(mobile);
    mobile.add(kit.cyl(.01, .01, .9, darkM, 0, 0, 0, 5)); mobile.children[0].position.y = .45;
    const mobParts = new THREE.InstancedMesh(kit.sphereGeo(.16, 10), mat({color: 0xffffff, roughness: .5}), 5);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; dummy.position.set(Math.sin(a) * .7, -.3 - (i % 2) * .25, Math.cos(a) * .7); dummy.rotation.set(0, 0, 0); dummy.scale.set(1 + (i % 3) * .2, 1 + (i % 3) * .2, 1 + (i % 3) * .2); dummy.updateMatrix(); mobParts.setMatrixAt(i, dummy.matrix); mobParts.setColorAt(i, new THREE.Color(palette[i])); }
    mobile.add(mobParts);
    // paper planes gliding on a slow loop (instanced triangles)
    const planeG = kit.geo('studio|plane', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -.3, -.16, .02, .12, .16, .02, .12, 0, 0, -.3, 0, -.1, .12, .0, .0, .12]), 3)); g.computeVertexNormals(); return g; });
    const paperPlanes = new THREE.InstancedMesh(planeG, mat({color: 0xffffff, roughness: .6, side: THREE.DoubleSide}), 3);
    for (let i = 0; i < 3; i++) paperPlanes.setColorAt(i, new THREE.Color(palette[(i * 2 + 1) % 6]));
    group.add(paperPlanes);
    const setPlanes = (t) => { for (let i = 0; i < 3; i++) { const u = t * .08 + i / 3, a = u * Math.PI * 2; dummy.position.set(Math.cos(a) * 9.5, 3.4 + Math.sin(a * 2 + i) * .4, -6.5 + Math.sin(a) * 4.5); dummy.rotation.set(0, -a + Math.PI, Math.sin(a * 3) * .3); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); paperPlanes.setMatrixAt(i, dummy.matrix); } paperPlanes.instanceMatrix.needsUpdate = true; };
    setPlanes(0);

    [[1.0, -8.3, 3.2, 2.2], [5.6, -8.0, 3.0, 2.0], [-6.6, -8.4, 3.0, 2.0], [-2.6, -9.6, 3.6, 1.0], [2.4, -10.2, 3.6, 1.0], [9.4, -4.4, 3.4, 3.0], [-9.2, -5.0, 1.6, 1.4], [7.6, -11.6, 3.6, 1.0], [-7.8, -11.6, 3.6, 1.0]].forEach(([x, z, w, d]) => { const b = look.makeBlob(w, d, .3); b.position.x = x; b.position.z = z; group.add(b); });
    group.traverse((o) => { if (o.isMesh && !o.userData.blob) o.receiveShadow = true; });
    [floor, rug].forEach((o) => { o.castShadow = false; });

    let t = 0;
    return {
      group,
      update(dt) {
        if (reduced || !(dt > 0)) return;
        t += dt; setFlags(t); setPlanes(t);
        pend.forEach((p, i) => { p.rotation.z = Math.sin(t * .6 + i * 1.3) * .035; p.rotation.x = Math.cos(t * .5 + i) * .025; });
        mobile.rotation.y = t * .35;
        screenM.emissiveIntensity = .82 + Math.sin(t * 9) * .03;
        boxM.emissiveIntensity = (night ? lampK * 1.3 : .35) * (.94 + Math.sin(t * .7) * .06);
      },
      dispose() { kit.disposeTree(group); own.forEach((x) => x.dispose()); }
    };
  }
};
export default W;
