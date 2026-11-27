// Extra procedural item props (extra set). Same contract as props.mjs: id -> (ctx) => THREE.Group, about 0.6 units wide,
// origin at the bottom centre, front facing +z (toward the camera). ctx = {THREE, kit, accent: THREE.Color}.
// Built from kit.box / kit.cyl / kit.geo (cached geometry), kit.cmat (shared neutral materials) and kit.own (per-item
// accent materials, disposed with the group). Small canvas textures go through kit.tex (cached, keyed by accent).
// Ids here must not repeat ids in props.mjs.

const paper = (kit) => kit.cmat('pr-paper', {color: 0xf7f4ec, roughness: .7, metalness: 0});
const ink = (kit) => kit.cmat('pr-ink', {color: 0x8a909a, roughness: .6, metalness: 0});
const dark = (kit) => kit.cmat('pr-dark', {color: 0x2a2e35, roughness: .45, metalness: .25});
const metal = (kit) => kit.cmat('pr2-metal', {color: 0xc9ced6, roughness: .32, metalness: .45});
const wood = (kit) => kit.cmat('pr2-wood', {color: 0xc8955a, roughness: .75});
const card = (kit) => kit.cmat('pr2-card', {color: 0xc49a63, roughness: .8});
const yellow = (kit) => kit.cmat('pr2-yellow', {color: 0xf0b000, roughness: .38, metalness: .05});
const acc = (kit, c, k = 0) => kit.own({color: c.clone().offsetHSL(0, 0, k), roughness: .42, metalness: .08});
const hex = (c) => '#' + c.getHexString();
const disc = (kit, r, h, m, x, y, z, seg = 20) => { const d = kit.cyl(r, r, h, m, 0, 0, 0, seg); d.rotation.x = Math.PI / 2; d.position.set(x, y, z); return d; };
// A tilted card on a small dark base (same pose as the ticket prop), returns {g, c} where c is the card group.
function tilted(THREE, kit, tilt = -.32) {
  const g = new THREE.Group(); const c = new THREE.Group(); c.position.y = .08; c.rotation.x = tilt; g.add(c);
  g.add(kit.box(.34, .08, .2, dark(kit), 0, 0, -.04, .02));
  return {g, c};
}
// A textured face: a plane with a cached canvas texture.
function face(THREE, kit, key, w, h, pw, ph, draw) {
  const t = kit.tex(key, w, h, draw, {aniso: 8});
  return new THREE.Mesh(kit.geo(`pl|${pw}|${ph}`, () => new THREE.PlaneGeometry(pw, ph)), kit.cmat('m|' + key, {map: t, roughness: .6, metalness: 0}));
}

function pallet({THREE, kit, accent}) {
  // A loaded pallet: slatted wooden deck on three blocks, with two shrink-wrapped cartons and an accent label.
  const g = new THREE.Group();
  const slat = kit.cmat('pr2-slat', {color: 0xa8743f, roughness: .8});
  [-.22, 0, .22].forEach((x) => g.add(kit.box(.1, .07, .6, slat, x, 0, 0, .01)));
  [-.24, -.12, 0, .12, .24].forEach((z) => g.add(kit.box(.62, .03, .09, wood(kit), 0, .07, z, .006)));
  g.add(kit.box(.5, .2, .46, card(kit), 0, .1, 0, .02));
  g.add(kit.box(.38, .16, .34, card(kit), -.02, .3, .02, .02));
  const wrap = kit.cmat('pr2-wrap', {color: 0xe8eef3, roughness: .2, metalness: 0, transparent: true, opacity: .3, depthWrite: false});
  g.add(kit.box(.53, .38, .49, wrap, 0, .1, 0, .03));
  // two accent straps over the load and a big white shipping label
  const strap = acc(kit, accent);
  [-.12, .12].forEach((x) => { g.add(kit.box(.04, .012, .5, strap, x, .482, 0, .004)); g.add(kit.box(.04, .38, .012, strap, x, .1, .247, .004)); });
  g.add(kit.box(.15, .11, .01, paper(kit), .06 - .06, .2, .252, .004));
  g.add(kit.box(.11, .02, .012, acc(kit, accent, -.1), 0, .27, .254, .003));
  return g;
}
function hardhat({THREE, kit, accent}) {
  // A safety hard hat: yellow dome, wide brim, raised centre ridge and an accent band.
  const g = new THREE.Group();
  const dome = new THREE.Mesh(kit.geo('pr2-dome', () => new THREE.SphereGeometry(.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), yellow(kit));
  dome.scale.set(1, .95, 1.12); dome.position.y = .07; g.add(dome);
  const brim = kit.cyl(.3, .3, .03, yellow(kit), 0, .05, .02, 28); brim.scale.z = 1.12; g.add(brim);
  const peak = kit.cyl(.2, .2, .03, yellow(kit), 0, .055, .2, 24); peak.scale.set(1.2, 1, .9); g.add(peak); // front visor
  // low raised ridge: a flattened half-ring over the crown
  const ridge = new THREE.Mesh(kit.geo('pr2-ridge', () => new THREE.TorusGeometry(.225, .028, 8, 20, Math.PI)), yellow(kit));
  ridge.rotation.y = Math.PI / 2; ridge.scale.set(1, 1.06, 1.12); ridge.position.y = .07; g.add(ridge);
  const band = kit.cyl(.245, .245, .06, acc(kit, accent), 0, .07, 0, 28); band.scale.z = 1.12; g.add(band);
  const logo = disc(kit, .065, .02, acc(kit, accent), 0, .2, .225, 20); logo.rotation.x = Math.PI / 2 - .55; g.add(logo);
  g.rotation.x = .12;
  return g;
}
function toolbox({THREE, kit, accent}) {
  // A toolbox: accent body, darker lid, metal handle and latches, a wrench lying on top.
  const g = new THREE.Group();
  g.add(kit.box(.62, .28, .32, acc(kit, accent), 0, 0, 0, .03));
  g.add(kit.box(.64, .07, .34, acc(kit, accent, -.12), 0, .28, 0, .02));
  [-.18, .18].forEach((x) => { g.add(kit.box(.04, .16, .04, metal(kit), x, .33, 0, .01)); g.add(kit.box(.06, .07, .02, metal(kit), x * 1.3, .2, .165, .008)); });
  g.add(kit.box(.42, .04, .05, dark(kit), 0, .48, 0, .015));
  const wr = new THREE.Group(); wr.position.set(.05, .36, .1); wr.rotation.y = .3; g.add(wr);
  wr.add(kit.box(.36, .025, .05, metal(kit), 0, 0, 0, .008));
  wr.add(kit.cyl(.045, .045, .025, metal(kit), .2, 0, 0, 14));
  return g;
}
function pillbottle({THREE, kit, accent}) {
  // A pharmacy pill bottle: translucent amber body, white child-proof cap, white label with accent stripe, two pills.
  const g = new THREE.Group();
  g.add(kit.cyl(.17, .17, .42, kit.cmat('pr2-amber', {color: 0xd9822b, roughness: .2, metalness: 0, transparent: true, opacity: .88}), 0, 0, 0, 24));
  g.add(kit.cyl(.185, .185, .12, kit.cmat('pr2-cap', {color: 0xf6f6f4, roughness: .45}), 0, .42, 0, 24));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const r = kit.box(.02, .1, .02, kit.cmat('pr2-cap', {color: 0xf6f6f4, roughness: .45}), Math.sin(a) * .185, .43, Math.cos(a) * .185, .005); g.add(r); }
  g.add(kit.cyl(.173, .173, .2, paper(kit), 0, .1, 0, 24));
  g.add(kit.cyl(.175, .175, .04, acc(kit, accent), 0, .25, 0, 24));
  const pill = kit.cmat('pr2-pill', {color: 0xf2f0ea, roughness: .4});
  [[.27, .08], [.22, .2]].forEach(([x, z]) => { const p = new THREE.Mesh(kit.sphereGeo(.05, 12), pill); p.scale.set(1.6, .7, 1); p.position.set(x, .035, z); p.rotation.y = x * 4; g.add(p); });
  return g;
}
function chartFolder({THREE, kit, accent}) {
  // A medical chart: a blue-grey hard binder with a coloured tab, a white plus badge and a pulse line on the sheet.
  const {g, c} = tilted(THREE, kit);
  c.add(kit.box(.56, .62, .03, kit.cmat('pr2-binder', {color: 0x5d7f94, roughness: .5}), 0, 0, 0, .015));
  c.add(kit.box(.12, .1, .03, acc(kit, accent), .2, .6, 0, .012));
  const sheet = face(THREE, kit, 'pr2-chart', 128, 144, .46, .5, (x, w, h) => {
    x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#d65a5a'; x.lineWidth = 5; x.lineJoin = 'round'; x.beginPath();
    [[8, 98], [40, 98], [52, 70], [64, 124], [76, 86], [86, 98], [120, 98]].forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
    x.fillStyle = '#b9c1ca'; [16, 30, 44].forEach((y, i) => x.fillRect(42, y, 70 - i * 14, 7));
  });
  sheet.position.set(0, .3, .02); c.add(sheet);
  const badge = disc(kit, .07, .02, kit.cmat('pr2-badge', {color: 0x2b7bb9, roughness: .4}), -.16, .5, .025, 20); c.add(badge);
  c.add(kit.box(.08, .022, .012, paper(kit), -.16, .489, .04, .004)); c.add(kit.box(.022, .08, .012, paper(kit), -.16, .46, .04, .004));
  c.add(kit.box(.2, .05, .04, metal(kit), 0, .6, .02, .01));
  return g;
}
function barcodeBox({THREE, kit, accent}) {
  // A shipping carton with packing tape and a big white barcode label facing the camera.
  const g = new THREE.Group();
  g.add(kit.box(.58, .44, .48, card(kit), 0, 0, 0, .02));
  g.add(kit.box(.1, .012, .5, kit.cmat('pr2-tape', {color: 0xe6d6b0, roughness: .5}), 0, .44, 0, .004));
  const lab = face(THREE, kit, 'pr2-barcode|' + hex(accent), 160, 112, .42, .29, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = hex(accent); x.fillRect(0, 0, w, 18);
    x.fillStyle = '#111111'; let px = 14; const bars = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 4, 1, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2];
    bars.forEach((b, i) => { if (i % 2 === 0) x.fillRect(px, 28, b * 3, 58); px += b * 3 + 1; });
    x.fillStyle = '#555'; for (let i = 0; i < 12; i++) x.fillRect(16 + i * 11, 94, 7, 8);
  });
  lab.position.set(0, .22, .245); g.add(lab);
  return g;
}
function gear({THREE, kit, accent}) {
  // A machine gear standing upright: toothed steel wheel with an accent hub and a dark axle hole, on a small stand.
  const g = new THREE.Group();
  const w = new THREE.Group(); w.position.y = .33; g.add(w);
  const steel = kit.cmat('pr2-steel', {color: 0xbcc4ce, roughness: .34, metalness: .4});
  w.add(disc(kit, .22, .1, steel, 0, 0, 0, 28));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const t = kit.box(.09, .08, .1, steel, 0, 0, 0, .012); t.position.set(Math.sin(a) * .25, Math.cos(a) * .25, 0); t.rotation.z = -a; w.add(t); }
  w.add(disc(kit, .1, .12, acc(kit, accent), 0, 0, 0, 20));
  w.add(disc(kit, .045, .13, dark(kit), 0, 0, 0, 14));
  [0, 1, 2, 3].forEach((i) => { const a = i / 4 * Math.PI * 2 + .78; w.add(disc(kit, .03, .11, kit.cmat('pr2-hole', {color: 0x6b727c, roughness: .45, metalness: .3}), Math.sin(a) * .16, Math.cos(a) * .16, 0, 10)); });
  g.add(kit.box(.36, .06, .2, dark(kit), 0, 0, 0, .02));
  return g;
}
function valve({THREE, kit, accent}) {
  // A pipe valve: horizontal pipe with flanges, a valve body, a stem and a round handwheel in the accent colour.
  const g = new THREE.Group();
  const pipeM = kit.cmat('pr2-pipe', {color: 0x9aa4ae, roughness: .38, metalness: .4});
  const pipe = kit.cyl(.07, .07, .64, pipeM, 0, 0, 0, 16); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, .12, 0); g.add(pipe);
  [-.2, .2].forEach((x) => { const f = kit.cyl(.11, .11, .04, pipeM, 0, 0, 0, 18); f.rotation.z = Math.PI / 2; f.position.set(x, .12, 0); g.add(f); });
  g.add(kit.box(.2, .2, .18, kit.cmat('pr2-vbody', {color: 0x4f5964, roughness: .42, metalness: .35}), 0, .03, 0, .04));
  g.add(kit.cyl(.03, .03, .22, metal(kit), 0, .22, 0, 10));
  // big accent handwheel, tilted toward the camera so its spokes read from the front and from above
  const wm = acc(kit, accent);
  const wheel = new THREE.Mesh(kit.geo('pr2-torus2', () => new THREE.TorusGeometry(.22, .036, 10, 32)), wm);
  wheel.rotation.x = Math.PI / 2 - .85; wheel.position.set(0, .46, .04); g.add(wheel);
  [0, 1, 2].forEach((i) => { const sp = kit.box(.42, .03, .03, wm, 0, 0, 0, .008); sp.position.set(0, .46, .04); sp.rotation.set(Math.PI / 2 - .85, 0, 0); sp.rotateZ(i * Math.PI / 3); g.add(sp); });
  const hub = disc(kit, .06, .06, dark(kit), 0, .46, .04, 16); hub.rotation.x = -.85 + Math.PI; g.add(hub);
  [-.27, .27].forEach((x) => g.add(kit.box(.1, .06, .16, dark(kit), x, 0, 0, .02)));
  // accent flow arrow on the valve body
  g.add(kit.box(.12, .03, .01, paper(kit), 0, .13, .095, .004));
  return g;
}
function blueprint({THREE, kit, accent}) {
  // A blueprint: a blue sheet with white plan lines on a tilted board, with a rolled tube lying in front.
  const {g, c} = tilted(THREE, kit, -.42);
  const sheet = face(THREE, kit, 'pr2-blueprint', 192, 144, .62, .46, (x, w, h) => {
    x.fillStyle = '#1f5f9e'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; for (let i = 0; i < w; i += 12) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let i = 0; i < h; i += 12) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.strokeRect(24, 22, 110, 90); x.beginPath(); x.moveTo(80, 22); x.lineTo(80, 70); x.lineTo(134, 70); x.moveTo(24, 60); x.lineTo(60, 60); x.stroke();
    x.lineWidth = 2; x.beginPath(); x.arc(80, 70, 18, Math.PI, Math.PI * 1.5); x.stroke();
    x.fillStyle = '#ffffff'; x.fillRect(146, 104, 36, 28);
  });
  sheet.position.set(0, .25, .02); c.add(sheet);
  c.add(kit.box(.66, .5, .02, kit.cmat('pr2-bpback', {color: 0x174a7c, roughness: .6}), 0, 0, 0, .006));
  const tube = kit.cyl(.05, .05, .5, kit.cmat('pr2-bproll', {color: 0x2f74b5, roughness: .55}), 0, 0, 0, 16); tube.rotation.z = Math.PI / 2; tube.position.set(0, .05, .2); g.add(tube);
  [-.25, .25].forEach((x) => { const cap = kit.cyl(.052, .052, .02, acc(kit, accent), 0, 0, 0, 16); cap.rotation.z = Math.PI / 2; cap.position.set(x, .05, .2); g.add(cap); });
  return g;
}
function codeBlock({THREE, kit, accent}) {
  // A code editor window: dark card with window dots, coloured code lines and an accent cursor bar.
  const {g, c} = tilted(THREE, kit);
  c.add(kit.box(.62, .46, .035, kit.cmat('pr2-editor', {color: 0x1e2430, roughness: .4}), 0, 0, 0, .014));
  const scr = face(THREE, kit, 'pr2-code|' + hex(accent), 192, 128, .58, .38, (x, w, h) => {
    x.fillStyle = '#1e2430'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2b3342'; x.fillRect(0, 0, w, 18);
    ['#ff6b6b', '#ffb02e', '#4fd18b'].forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.arc(12 + i * 14, 9, 4, 0, 7); x.fill(); });
    const rows = [[10, 40, '#c792ea'], [54, 60, '#82aaff'], [22, 34, '#c3e88d'], [60, 46, '#f78c6c'], [22, 70, '#82aaff'], [10, 24, '#c792ea']];
    rows.forEach(([x0, wd, col], i) => { x.fillStyle = col; x.fillRect(x0 + 10, 28 + i * 16, wd, 8); if (i % 2) { x.fillStyle = '#89ddff'; x.fillRect(x0 + wd + 16, 28 + i * 16, 30, 8); } });
    x.fillStyle = hex(accent); x.fillRect(118, 92, 5, 14);
    x.fillStyle = '#ffffff'; x.font = '700 30px system-ui, sans-serif'; x.textAlign = 'right'; x.fillText('</>', w - 10, 52);
  });
  scr.position.set(0, .22, .02); c.add(scr);
  return g;
}
function databaseCylinder({THREE, kit, accent}) {
  // The classic database icon: three stacked discs with accent bands between them and a light top.
  const g = new THREE.Group();
  const body = kit.cmat('pr2-db', {color: 0xe7ebf0, roughness: .35, metalness: .2});
  [0, .17, .34].forEach((y, i) => {
    g.add(kit.cyl(.26, .26, .14, body, 0, y, 0, 28));
    if (i < 2) g.add(kit.cyl(.265, .265, .03, acc(kit, accent), 0, y + .14, 0, 28));
  });
  g.add(kit.cyl(.22, .22, .01, acc(kit, accent, .12), 0, .48, 0, 28));
  [.07, .24, .41].forEach((y) => { const d = disc(kit, .02, .02, kit.cmat('pr2-dbled', {color: 0x0b1410, emissive: 0x3ee08a, emissiveIntensity: 1.4}), .16, y, .21, 10); d.rotation.y = .6; g.add(d); });
  return g;
}
function cloudNode({THREE, kit, accent}) {
  // A cloud: puffy white spheres on a flat base, with an accent up-arrow badge in front.
  const g = new THREE.Group();
  const white = kit.cmat('pr2-cloud', {color: 0xf4f7fb, roughness: .55});
  [[-.17, .2, 0, .15], [0, .28, 0, .2], [.17, .21, 0, .15], [-.07, .17, .08, .13], [.09, .17, .08, .13]].forEach(([x, y, z, r]) => { const s = new THREE.Mesh(kit.sphereGeo(r, 18), white); s.position.set(x, y, z); g.add(s); });
  g.add(kit.box(.5, .1, .2, white, 0, .05, 0, .05));
  const badge = disc(kit, .09, .03, acc(kit, accent), 0, .2, .2, 22); g.add(badge);
  g.add(kit.box(.03, .09, .012, paper(kit), 0, .14, .218, .004)); // arrow shaft
  [-1, 1].forEach((s) => { const a = kit.box(.06, .022, .012, paper(kit), s * .02, .225, .219, .004); a.rotation.z = -s * .8; g.add(a); }); // arrow head
  g.add(kit.box(.34, .05, .2, dark(kit), 0, 0, -.02, .02));
  return g;
}
function robotHead({THREE, kit, accent}) {
  // A friendly robot head: rounded metal box, two glowing eyes, mouth grille, side ears and an antenna with an accent ball.
  const g = new THREE.Group();
  const shell = kit.cmat('pr2-robot', {color: 0xd3d9e0, roughness: .34, metalness: .3});
  g.add(kit.box(.16, .06, .14, dark(kit), 0, 0, 0, .02));
  const h = new THREE.Group(); h.position.y = .06; h.rotation.x = -.3; g.add(h); // tilted back so the face reads from the 3/4 camera
  h.add(kit.box(.5, .4, .4, shell, 0, 0, 0, .08));
  h.add(kit.box(.4, .26, .02, kit.cmat('pr2-visor', {color: 0x1d2330, roughness: .25}), 0, .08, .2, .04));
  const eyeM = kit.own({color: 0x0b1410, emissive: accent.clone().lerp(new THREE.Color(0xffffff), .35), emissiveIntensity: 1.8, roughness: .3});
  [-.09, .09].forEach((x) => h.add(disc(kit, .045, .02, eyeM, x, .26, .215, 16)));
  [-.06, 0, .06].forEach((x) => h.add(kit.box(.03, .05, .012, metal(kit), x, .11, .215, .005)));
  [-1, 1].forEach((s) => { const e = disc(kit, .07, .06, acc(kit, accent), s * .27, .2, 0, 16); e.rotation.set(0, 0, Math.PI / 2); h.add(e); });
  h.add(kit.cyl(.012, .012, .14, metal(kit), 0, .4, 0, 8));
  const ball = new THREE.Mesh(kit.sphereGeo(.04, 14), acc(kit, accent)); ball.position.set(0, .56, 0); h.add(ball);
  return g;
}
function megaphone({THREE, kit, accent}) {
  // A megaphone: a white flared cone angled toward the camera, accent rim band, dark pistol grip.
  const g = new THREE.Group();
  const m = new THREE.Group(); m.position.set(0, .3, 0); m.rotation.set(-.2, 1.05, 0); g.add(m); // 3/4 profile: cone and mouth both read
  const cone = kit.cyl(.08, .22, .44, kit.cmat('pr2-mega', {color: 0xf2f2ef, roughness: .45}), 0, 0, 0, 24); cone.rotation.x = Math.PI / 2; cone.position.set(0, 0, 0); m.add(cone);
  const rim = kit.cyl(.225, .225, .05, acc(kit, accent), 0, 0, 0, 24); rim.rotation.x = Math.PI / 2; rim.position.z = .2; m.add(rim);
  const throat = kit.cyl(.17, .17, .01, dark(kit), 0, 0, 0, 24); throat.rotation.x = Math.PI / 2; throat.position.z = .224; m.add(throat);
  const back = kit.cyl(.09, .09, .12, acc(kit, accent, -.1), 0, 0, 0, 18); back.rotation.x = Math.PI / 2; back.position.z = -.26; m.add(back);
  const grip = kit.box(.06, .16, .07, dark(kit), 0, 0, 0, .02); grip.position.set(0, -.14, -.12); grip.rotation.x = .3; m.add(grip);
  g.add(kit.box(.32, .06, .2, dark(kit), 0, 0, 0, .02));
  return g;
}
function shoppingBag({THREE, kit, accent}) {
  // A shopping bag: accent paper bag with a folded top band, two rope handles and a white tag.
  const g = new THREE.Group();
  g.add(kit.box(.46, .44, .24, acc(kit, accent), 0, 0, 0, .012));
  g.add(kit.box(.47, .06, .245, acc(kit, accent, -.1), 0, .4, 0, .008));
  const hM = kit.cmat('pr2-rope', {color: 0x2a2e35, roughness: .6});
  [-.06, .06].forEach((z) => { const h = new THREE.Mesh(kit.geo('pr2-handle', () => new THREE.TorusGeometry(.1, .02, 8, 16, Math.PI)), hM); h.position.set(0, .44, z); g.add(h); });
  g.add(kit.box(.16, .12, .01, paper(kit), .08, .16, .123, .004));
  g.add(kit.box(.1, .02, .012, ink(kit), .08, .18, .13, .003));
  return g;
}
function wireframeCard({THREE, kit, accent}) {
  // A UI wireframe: white card with a header bar, image placeholder (crossed box), text lines and an accent button.
  const {g, c} = tilted(THREE, kit);
  c.add(kit.box(.62, .46, .03, paper(kit), 0, 0, 0, .012));
  const f = face(THREE, kit, 'pr2-wire|' + hex(accent), 192, 144, .58, .43, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d5dae1'; x.fillRect(10, 8, w - 20, 16);
    x.strokeStyle = '#8a929c'; x.lineWidth = 3; x.strokeRect(12, 34, 76, 62); x.beginPath(); x.moveTo(12, 34); x.lineTo(88, 96); x.moveTo(88, 34); x.lineTo(12, 96); x.stroke();
    x.fillStyle = '#b9c0c9'; [38, 54, 70].forEach((y, i) => x.fillRect(100, y, 76 - i * 16, 8));
    x.fillStyle = hex(accent); x.beginPath(); x.roundRect(100, 104, 70, 24, 8); x.fill();
    x.setLineDash([6, 5]); x.strokeStyle = '#c5cbd3'; x.lineWidth = 2; x.strokeRect(12, 108, 76, 24);
  });
  f.position.set(0, .23, .017); c.add(f);
  return g;
}
function calendarCard({THREE, kit, accent}) {
  // A desk calendar: accent header with two binder rings, a grid of days with one day circled.
  const {g, c} = tilted(THREE, kit, -.28);
  c.add(kit.box(.56, .52, .03, paper(kit), 0, 0, 0, .012));
  const f = face(THREE, kit, 'pr2-cal|' + hex(accent), 160, 160, .54, .5, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = hex(accent); x.fillRect(0, 0, w, 36);
    x.fillStyle = '#c9ced6'; for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) x.fillRect(10 + k * 20.5, 48 + r * 22, 14, 14);
    x.strokeStyle = hex(accent); x.lineWidth = 4; x.beginPath(); x.arc(10 + 4 * 20.5 + 7, 48 + 2 * 22 + 7, 13, 0, 7); x.stroke();
    x.fillStyle = '#1a1a1a'; x.fillRect(10 + 4 * 20.5 + 2, 48 + 2 * 22 + 2, 10, 10);
  });
  f.position.set(0, .26, .017); c.add(f);
  [-.15, .15].forEach((xx) => { const r = new THREE.Mesh(kit.geo('pr2-ring', () => new THREE.TorusGeometry(.035, .01, 6, 14)), metal(kit)); r.position.set(xx, .52, .02); r.rotation.y = Math.PI / 2; c.add(r); });
  return g;
}
function stickyNote({THREE, kit, accent}) {
  // A sticky note: square yellow note with a curled corner, handwritten lines and an accent push pin.
  const {g, c} = tilted(THREE, kit, -.3);
  const note = kit.cmat('pr2-note', {color: 0xf7dc5c, roughness: .7});
  c.add(kit.box(.5, .5, .015, note, 0, 0, 0, .006));
  const curl = kit.box(.12, .12, .012, kit.cmat('pr2-note2', {color: 0xe3c447, roughness: .7}), 0, 0, 0, .004); curl.position.set(.19, .04, .02); curl.rotation.set(0, -.5, Math.PI / 4); c.add(curl);
  const scrib = kit.cmat('pr2-scribble', {color: 0x3a4250, roughness: .6});
  [[.3, .36], [.34, .27], [.22, .18]].forEach(([w, y]) => { const l = kit.box(w, .022, .006, scrib, -.18 + w / 2, y, .012, .004); l.rotation.z = .03; c.add(l); });
  const pin = new THREE.Mesh(kit.sphereGeo(.04, 12), acc(kit, accent)); pin.position.set(0, .46, .04); c.add(pin);
  return g;
}

export default {
  pallet, hardhat, toolbox, pillbottle, 'chart-folder': chartFolder, 'barcode-box': barcodeBox, gear, valve, blueprint,
  'code-block': codeBlock, 'database-cylinder': databaseCylinder, 'cloud-node': cloudNode, 'robot-head': robotHead,
  megaphone, 'shopping-bag': shoppingBag, 'wireframe-card': wireframeCard, 'calendar-card': calendarCard, 'sticky-note': stickyNote
};
