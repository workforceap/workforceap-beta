// node --test kit/worlds/react.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {createReactor, withReactions} from './react.mjs';

function accentSet(hex) {
  const base = new THREE.Color(hex), h = {}; base.getHSL(h);
  return {base, bright: new THREE.Color().setHSL(h.h, Math.min(1, h.s * 1.1 + .15), .65), dark: new THREE.Color().setHSL(h.h, h.s, .2)};
}
function scene(acc) {
  const g = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1);
  const strip = new THREE.MeshStandardMaterial({color: acc.base, emissive: acc.base, emissiveIntensity: .4});
  const night = new THREE.MeshBasicMaterial({color: acc.bright.clone().multiplyScalar(1.3)});
  const wall = new THREE.MeshStandardMaterial({color: 0x808890});
  const lamp = new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0xfff0c0, emissiveIntensity: 1});
  [strip, night, wall, lamp].forEach((m) => g.add(new THREE.Mesh(box, m)));
  const im = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({color: 0xffffff}), 3);
  im.setColorAt(0, acc.base); im.setColorAt(1, new THREE.Color(0x777777)); im.setColorAt(2, acc.bright);
  g.add(im);
  return {g, strip, night, wall, lamp, im};
}
const run = (r, secs) => { for (let t = 0; t < secs; t += 1 / 60) r.update(1 / 60); };

test('finds accent materials and instance colours, not neutral or lamp ones', () => {
  const acc = accentSet('#ad2c4d'), s = scene(acc);
  const r = createReactor(THREE, s.g, acc);
  assert.equal(r.count, 4); // strip, night basic, two instance cells
});

test('right flashes toward green and settles back exactly', () => {
  const acc = accentSet('#2b7bb9'), s = scene(acc);
  const base = s.strip.emissive.clone(), baseNight = s.night.color.clone(), wall = s.wall.color.clone();
  const r = createReactor(THREE, s.g, acc);
  r.event({type: 'right', streak: 1});
  run(r, .1);
  assert.ok(s.strip.emissive.g > base.g, 'emissive moves toward green');
  assert.ok(s.strip.emissiveIntensity > .4);
  run(r, 2);
  assert.ok(s.strip.emissive.equals(base));
  assert.ok(Math.abs(s.strip.emissiveIntensity - .4) < 1e-9);
  assert.ok(s.night.color.equals(baseNight));
  assert.ok(s.wall.color.equals(wall));
  assert.equal(r.state().dirty, false);
});

test('streak keeps the glow brighter; wrong flashes red and resets it', () => {
  const acc = accentSet('#2b7bb9'), s = scene(acc);
  const r = createReactor(THREE, s.g, acc);
  r.event({type: 'right', streak: 4}); run(r, 2);
  assert.ok(s.strip.emissiveIntensity > .45, 'boosted at streak 4');
  const c = new THREE.Color(); s.im.getColorAt(0, c);
  assert.ok(c.r + c.g + c.b > acc.base.r + acc.base.g + acc.base.b, 'glow instances brighter');
  r.event({type: 'wrong'}); run(r, .1);
  assert.ok(s.strip.emissive.r > s.strip.emissive.g, 'red flash');
  run(r, 3);
  assert.ok(Math.abs(s.strip.emissiveIntensity - .4) < 1e-6);
  s.im.getColorAt(1, c); assert.equal(c.getHex(), 0x777777);
});

test('reduced motion: plain colour change that clears', () => {
  const acc = accentSet('#2b7bb9'), s = scene(acc);
  const r = createReactor(THREE, s.g, acc, {reduced: true});
  r.event({type: 'timeout'}); r.update(1 / 60);
  assert.ok(s.strip.emissive.r > acc.base.r);
  run(r, 1);
  assert.ok(Math.abs(s.strip.emissiveIntensity - .4) < 1e-9);
});

test('bad dt and unknown events are harmless', () => {
  const acc = accentSet('#2b7bb9'), s = scene(acc);
  const r = createReactor(THREE, s.g, acc);
  r.event(null); r.event({type: 'resume'}); r.event({type: 'done'});
  assert.equal(r.state().dirty, false);
  r.event({type: 'right', streak: 1}); r.update(NaN); r.update(-1);
  assert.ok(Number.isFinite(s.strip.emissiveIntensity));
});

test('withReactions adds event, keeps own update/dispose', () => {
  const acc = accentSet('#2b7bb9');
  let updated = 0, disposed = 0;
  const W = withReactions({id: 'x', label: 'X', build: () => ({group: scene(acc).g, update() { updated++; }, dispose() { disposed++; }})});
  const w = W.build({THREE, accent: acc, reduced: false, theme: {}});
  assert.equal(typeof w.event, 'function');
  w.event({type: 'right', streak: 3}); w.update(1 / 60);
  assert.equal(updated, 1);
  assert.ok(w.reactor && w.reactor.count > 0);
  w.dispose(); assert.equal(disposed, 1);
  assert.equal(withReactions(W), W, 'idempotent');
});
