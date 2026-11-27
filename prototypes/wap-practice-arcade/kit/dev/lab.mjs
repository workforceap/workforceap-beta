// DEV ONLY: a small preview page for worlds, moods, accents, props, kit.label signs and engine.setFocus boxes.
// Not used by the games. See lab.html for the URL parameters.
import * as THREE from '../vendor/three.module.min.js';
import * as look from '../look.mjs';
import {createEngine, STAGE} from '../engine.mjs';
import WORLDS from '../worlds/index.mjs';
import PROPS1 from '../props.mjs';
import PROPS2 from '../props2.mjs';

const P = new URLSearchParams(location.search);
const nums = (s) => (s || '').split(',').map(Number).filter((n) => Number.isFinite(n));
const opt = (k) => (P.has(k) && P.get(k) !== '' && Number.isFinite(Number(P.get(k))) ? Number(P.get(k)) : undefined);
const worldId = WORLDS[P.get('world')] ? P.get('world') : 'office';
const mood = ['day', 'dusk', 'night'].includes(P.get('mood')) ? P.get('mood') : 'day';
const accentHex = /^[0-9a-f]{6}$/i.test(P.get('accent') || '') ? '#' + P.get('accent') : '#2b7bb9';
const quality = ['low', 'medium', 'high'].includes(P.get('quality')) ? P.get('quality') : null;
const reduced = P.get('reduced') === '1';
const hud = document.getElementById('hud');
const canvas = document.getElementById('gl');
const size = (P.get('canvas') || '').match(/^(\d+)x(\d+)$/);
if (size) { document.getElementById('wrap').classList.remove('fill'); canvas.style.width = size[1] + 'px'; canvas.style.height = size[2] + 'px'; }

const lab = {ready: false, error: null, THREE, look};
window.__lab = lab;
try {
  const engine = createEngine(canvas, {mood, accent: accentHex, quality, reduced, onPick: (id) => { flash(`picked ${id}`); engine.punch(1); }});
  const kit = engine.kit, accent = look.accentSet(accentHex), theme = {world: worldId, mood, accent: accentHex};
  const world = WORLDS[worldId].build({THREE, look, kit, theme, quality: engine.quality, mood: look.moodOf(mood), reduced, accent});
  engine.scene.add(world.group);

  // ---------- sample play pieces (props=none hides them) ----------
  const stage = new THREE.Group(); stage.name = 'lab-sample'; engine.scene.add(stage);
  const labels = [];
  const propList = (P.get('props') || 'ticket').split(',').filter(Boolean);
  if (P.get('props') !== 'none') {
    const body = kit.cmat('lab-pad', {color: accent.dark, roughness: .5, metalness: .1});
    const rim = kit.cmat('lab-rim', {color: accent.base, emissive: accent.bright, emissiveIntensity: look.moodOf(mood).glow, roughness: .4});
    ['Fix it now', 'Ask first', 'Escalate'].forEach((t, i) => {
      const pad = new THREE.Group(); pad.position.set((i - 1) * 2, 0, .9); pad.userData.choiceId = 'pad' + (i + 1);
      pad.add(kit.box(1.75, .2, 1.2, body, 0, 0, 0, .06));
      pad.add(kit.box(1.85, .06, 1.3, rim, 0, 0, 0, .02));
      const sign = kit.label(t, {w: 1.6, h: .6, accent: accent.base}); sign.position.set(0, .62, .1); sign.rotation.x = -.18; pad.add(sign);
      labels.push(sign); stage.add(pad);
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .06, 10, 48), kit.basic({color: accent.bright, toneMapped: false}));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, .03, -1.6); stage.add(ring);
    const blob = look.makeBlob(2, 2, .55); blob.position.set(0, .012, -1.6); stage.add(blob);
    const all = {...PROPS1, ...PROPS2};
    propList.forEach((id, i) => {
      const build = all[id] || PROPS1.block;
      const g = build({THREE, kit, accent: accent.base.clone()});
      const lead = i === 0;
      g.scale.setScalar(lead ? 2 : 1.3);
      g.position.set(lead ? 0 : (i % 2 ? -1 : 1) * (1 + Math.floor((i - 1) / 2)), 0, lead ? -1.6 : -4);
      stage.add(g);
    });
    const tag = kit.label(P.get('text') || 'Printer jams on every job after the driver update', {w: 3.2, h: .9, billboard: true, maxLines: 2});
    tag.position.set(0, 1.85, -1.6); stage.add(tag); labels.push(tag);
    let t = 0;
    engine.onFrame((dt) => { t += dt; if (!engine.reduced) { stage.children.forEach((c) => { if (c.userData.choiceId === undefined && c.isGroup && c.name !== 'label') c.rotation.y = Math.sin(t * .8) * .25; }); } });
  }

  // ---------- focus box ----------
  const f = nums(P.get('focus'));
  let helper = null;
  function setFocus(box, o = {}) {
    if (helper) { stage.remove(helper); helper.geometry.dispose(); helper.material.dispose(); helper = null; }
    engine.setFocus(box, o);
    if (box && P.get('box') === '1') {
      helper = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(box.x0, box.y0 ?? 0, box.z0), new THREE.Vector3(box.x1, box.y1 ?? 1.2, box.z1)), 0xff00aa);
      stage.add(helper);
    }
  }
  const o = {pitch: opt('pitch'), yaw: opt('yaw'), margin: opt('margin'), ease: 0};
  if (f.length >= 4) setFocus({x0: f[0], x1: f[1], z0: f[2], z1: f[3], y0: f[4], y1: f[5]}, o);
  else if (o.pitch !== undefined || o.yaw !== undefined || o.margin !== undefined) setFocus({...STAGE, y0: 0, y1: 1.3}, o);

  // ---------- demo motion and HUD ----------
  if (P.get('demo') === '1') {
    let n = 0;
    setInterval(() => { n++; if (n % 3 === 0) engine.shake(1); else engine.punch(1 + (n % 4) * .2); }, 2200);
  }
  let flashMsg = '', flashT = 0;
  function flash(s) { flashMsg = s; flashT = 1.5; }
  const v = new THREE.Vector3();
  engine.onFrame((dt) => {
    if (P.get('hud') === '0') return;
    flashT = Math.max(0, flashT - dt);
    const vw = engine.view;
    const px = labels.map((l) => { l.getWorldPosition(v); return Math.round(l.fontSize * engine.pxPerUnit(v) * 10) / 10; });
    hud.textContent = `${worldId} ${mood} ${engine.quality}  canvas ${engine.size.w}x${engine.size.h}  pitch ${vw.pitch.toFixed(0)} yaw ${vw.yaw.toFixed(0)} dist ${vw.dist.toFixed(2)} fov ${vw.fov.toFixed(1)}\nlabel font px: ${px.join(', ')}${flashT > 0 ? '\n' + flashMsg : ''}`;
  });
  Object.assign(lab, {
    engine, kit, world, labels, setFocus,
    punch: (n) => engine.punch(n), shake: (n) => engine.shake(n),
    setMood: (m) => engine.setMood(m), setAccent: (h) => engine.setAccent(h),
    labelPx: () => labels.map((l) => { l.getWorldPosition(v); return l.fontSize * engine.pxPerUnit(v); })
  });
  engine.resize();
  engine.start();
  lab.ready = true;
} catch (e) {
  console.error(e); lab.error = String(e && e.message || e); hud.textContent = 'Lab failed: ' + lab.error;
}
