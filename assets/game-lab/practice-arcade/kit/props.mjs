// Procedural item props (core set). Each builder is (ctx) -> THREE.Group, about 0.6 units wide,
// origin at the bottom centre, front facing +z (toward the camera).
// ctx = {THREE, kit, accent: THREE.Color}. Use kit.box / kit.cyl (cached geometry) and kit.own (per-item material,
// disposed with the group by kit.disposeTree) so props never leak GPU memory.
// The shell merges this registry with props2.mjs and falls back to 'block' for an unknown id.

const paper = (kit) => kit.cmat('pr-paper', {color: 0xf7f4ec, roughness: .7, metalness: 0});
const ink = (kit) => kit.cmat('pr-ink', {color: 0x8a909a, roughness: .6, metalness: 0});
const dark = (kit) => kit.cmat('pr-dark', {color: 0x2a2e35, roughness: .45, metalness: .25});
const metal = (kit) => kit.cmat('pr-metal', {color: 0xc9ced6, roughness: .3, metalness: .85});
const gold = (kit) => kit.cmat('pr-gold', {color: 0xd9b25a, roughness: .3, metalness: .9});
const acc = (kit, c, k = 0) => kit.own({color: c.clone().offsetHSL(0, 0, k), roughness: .42, metalness: .08});

function ticket({THREE, kit, accent}) {
  // A help-desk ticket: a stiff card standing on a small base, accent header band, text lines and a status dot.
  const g = new THREE.Group();
  const card = new THREE.Group(); card.position.y = .08; card.rotation.x = -.32; g.add(card);
  card.add(kit.box(.6, .44, .035, paper(kit), 0, 0, 0, .014));
  card.add(kit.box(.6, .17, .04, acc(kit, accent), 0, .27, 0, .014));
  card.add(kit.box(.07, .27, .04, acc(kit, accent, -.05), -.265, 0, 0, .014));
  [[.36, .2], [.42, .13], [.3, .06]].forEach(([w, y]) => card.add(kit.box(w, .04, .012, ink(kit), -.17 + w / 2, y, .02, .006)));
  const dot = kit.cyl(.045, .045, .02, acc(kit, accent, .1), .2, 0, 0, 18); dot.rotation.x = Math.PI / 2; dot.position.set(.2, .06, .025); card.add(dot);
  g.add(kit.box(.36, .08, .2, dark(kit), 0, 0, -.02, .02));
  return g;
}
function packet({THREE, kit, accent}) {
  // A data packet: a rounded block with an accent header, a dark payload window and indicator dots.
  const g = new THREE.Group();
  g.add(kit.box(.6, .3, .42, kit.cmat('pr-shell', {color: 0xe9ecf1, roughness: .35, metalness: .2}), 0, 0, 0, .05));
  g.add(kit.box(.62, .07, .44, acc(kit, accent), 0, .25, 0, .03));
  g.add(kit.box(.36, .12, .02, dark(kit), -.05, .08, .21, .02));
  [0, 1, 2].forEach((i) => { const d = kit.cyl(.022, .022, .02, i === 0 ? acc(kit, accent, .15) : ink(kit), .18 + i * 0, .2 - i * .05 - .05, .215, 12); d.rotation.x = Math.PI / 2; d.position.set(.21, .2 - i * .055, .215); g.add(d); });
  return g;
}
function envelope({THREE, kit, accent}) {
  // A letter: cream body, folded flap (two angled strips) and an accent seal.
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = .06; body.rotation.x = -.3; g.add(body);
  body.add(kit.box(.62, .42, .04, kit.cmat('pr-cream', {color: 0xf3e9d2, roughness: .68}), 0, 0, 0, .012));
  body.add(kit.box(.62, .07, .045, acc(kit, accent), 0, -.175, .002, .01));
  [1, -1].forEach((s) => { const f = kit.box(.4, .025, .012, kit.cmat('pr-flap', {color: 0xd9ccaf, roughness: .7}), 0, 0, 0, .005); f.position.set(s * .15, .29, .024); f.rotation.z = s * -.52; body.add(f); });
  const seal = kit.cyl(.095, .095, .03, acc(kit, accent), 0, 0, 0, 20); seal.rotation.x = Math.PI / 2; seal.position.set(0, .2, .03); body.add(seal);
  g.add(kit.box(.3, .06, .16, dark(kit), 0, 0, -.02, .02));
  return g;
}
function crate({THREE, kit, accent}) {
  // A shipping crate: wooden box with darker slats and an accent label.
  const g = new THREE.Group();
  const wood = kit.cmat('pr-wood', {color: 0xc8955a, roughness: .72}), slat = kit.cmat('pr-slat', {color: 0x9c6c3a, roughness: .78});
  g.add(kit.box(.56, .46, .5, wood, 0, 0, 0, .02));
  [.02, .4].forEach((y) => g.add(kit.box(.58, .05, .52, slat, 0, y, 0, .01)));
  [-.25, .25].forEach((x) => g.add(kit.box(.06, .46, .52, slat, x, 0, 0, .01)));
  g.add(kit.box(.4, .24, .02, acc(kit, accent), 0, .11, .255, .01));
  [-.25, .25].forEach((x) => g.add(kit.box(.07, .5, .535, acc(kit, accent, -.04), x, 0, 0, .01)));
  g.add(kit.box(.26, .035, .012, paper(kit), 0, .2, .268, .004));
  return g;
}
function folder({THREE, kit, accent}) {
  // A file folder: back panel with a tab, sheets peeking out, accent front panel.
  const g = new THREE.Group();
  const f = new THREE.Group(); f.position.y = .07; f.rotation.x = -.3; g.add(f);
  const manila = kit.cmat('pr-manila', {color: 0xe2c27a, roughness: .7});
  f.add(kit.box(.62, .42, .025, manila, 0, 0, -.02, .01));
  f.add(kit.box(.22, .07, .025, manila, -.16, .41, -.02, .01));
  f.add(kit.box(.56, .4, .012, paper(kit), .01, .04, 0, .004));
  f.add(kit.box(.62, .36, .025, acc(kit, accent), 0, 0, .022, .01));
  f.add(kit.box(.24, .06, .012, paper(kit), .12, .25, .04, .004));
  g.add(kit.box(.3, .07, .16, dark(kit), 0, 0, -.04, .02));
  return g;
}
function chip({THREE, kit, accent}) {
  // A computer chip: dark square with gold pins on all sides and an accent die.
  const g = new THREE.Group();
  g.add(kit.box(.46, .1, .46, kit.cmat('pr-chip', {color: 0x22262c, roughness: .4, metalness: .3}), 0, .04, 0, .02));
  for (let i = 0; i < 6; i++) {
    const t = -.19 + i * .076;
    g.add(kit.box(.05, .03, .1, gold(kit), t, .06, .27, .006)); g.add(kit.box(.05, .03, .1, gold(kit), t, .06, -.27, .006));
    g.add(kit.box(.1, .03, .05, gold(kit), .27, .06, t, .006)); g.add(kit.box(.1, .03, .05, gold(kit), -.27, .06, t, .006));
  }
  g.add(kit.box(.22, .03, .22, acc(kit, accent), 0, .14, 0, .015));
  const d = kit.cyl(.025, .025, .01, metal(kit), -.15, .14, -.15, 12); g.add(d);
  g.rotation.y = Math.PI / 4 * 0;
  return g;
}
function clipboard({THREE, kit, accent}) {
  // A clipboard: board, metal clip, paper with check lines in the accent colour.
  const g = new THREE.Group();
  const c = new THREE.Group(); c.position.y = .06; c.rotation.x = -.32; g.add(c);
  c.add(kit.box(.5, .62, .03, acc(kit, accent, -.12), 0, 0, 0, .015));
  c.add(kit.box(.42, .5, .012, paper(kit), 0, .03, .02, .004));
  c.add(kit.box(.24, .09, .05, acc(kit, accent, -.05), 0, .54, .02, .015));
  [.4, .3, .2, .1].forEach((y, i) => {
    c.add(kit.box(.07, .07, .012, i < 3 ? acc(kit, accent) : ink(kit), -.14, y, .03, .008));
    c.add(kit.box(.22, .025, .01, ink(kit), .03, y + .012, .03, .004));
  });
  g.add(kit.box(.3, .06, .16, dark(kit), 0, 0, -.03, .02));
  return g;
}
function block({THREE, kit, accent}) {
  // A generic rounded block in the accent colour with a light face plate.
  const g = new THREE.Group();
  g.add(kit.box(.54, .46, .46, acc(kit, accent), 0, 0, 0, .08));
  g.add(kit.box(.3, .2, .02, paper(kit), 0, .13, .23, .04));
  g.add(kit.box(.16, .04, .012, acc(kit, accent, -.1), 0, .21, .242, .01));
  return g;
}

export default {ticket, packet, envelope, crate, folder, chip, clipboard, block};
