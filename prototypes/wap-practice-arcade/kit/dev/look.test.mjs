// Unit tests for the pure parts of the v1.1 engine and look kit: solveFocus (camera fit) and accentSet.
// Run: node --test kit/dev/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {solveFocus, fovFor, DEFAULT_FOCUS, insetBand} from '../engine.mjs';
import {accentSet, MOODS, moodOf} from '../look.mjs';

const D2R = Math.PI / 180;

// Project the eight corners of box from the camera that solveFocus describes; return the largest
// |right/forward| and |up/forward| ratios (screen extents in tan units) and the smallest forward depth.
function project(box, sol, fov, aspect) {
  const p = sol.pitch * D2R, y = sol.yaw * D2R; // solveFocus returns degrees
  const f = [-Math.sin(y) * Math.cos(p), -Math.sin(p), -Math.cos(y) * Math.cos(p)];
  const r = [Math.cos(y), 0, -Math.sin(y)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const cam = [sol.tx - f[0] * sol.dist, sol.ty - f[1] * sol.dist, sol.tz - f[2] * sol.dist];
  let maxR = 0, maxU = 0, minF = Infinity, sumR = 0, sumU = 0;
  const xs = [box.x0, box.x1], ys = [box.y0 ?? 0, box.y1 ?? 1.2], zs = [box.z0, box.z1];
  const rs = [], us = [];
  for (const X of xs) for (const Y of ys) for (const Z of zs) {
    const v = [X - cam[0], Y - cam[1], Z - cam[2]];
    const pf = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
    const pr = (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / pf;
    const pu = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / pf;
    maxR = Math.max(maxR, Math.abs(pr)); maxU = Math.max(maxU, Math.abs(pu)); minF = Math.min(minF, pf);
    rs.push(pr); us.push(pu);
  }
  sumR = Math.max(...rs) + Math.min(...rs); sumU = Math.max(...us) + Math.min(...us);
  const ty = Math.tan(fov * D2R / 2);
  return {maxR, maxU, minF, limR: ty * aspect, limU: ty, sumR, sumU};
}

const CASES = [
  {name: 'whole stage, tall phone', box: DEFAULT_FOCUS, opts: {pitch: 40, margin: .035}, aspect: 390 / 420},
  {name: 'whole stage, wide desktop', box: DEFAULT_FOCUS, opts: {pitch: 40, margin: .035}, aspect: 860 / 740},
  {name: 'small near box, phone', box: {x0: -1.5, x1: 1.5, z0: -1, z1: 1.5, y0: 0, y1: 1.2}, opts: {pitch: 40}, aspect: .75},
  {name: 'wide flat strip, very tall canvas', box: {x0: -3, x1: 3, z0: -2, z1: -1, y0: 0, y1: .4}, opts: {pitch: 55, margin: .1}, aspect: .5},
  {name: 'deep column, yawed', box: {x0: -.5, x1: .5, z0: -6, z1: 2, y0: 0, y1: 1}, opts: {pitch: 30, yaw: 15}, aspect: 1.6},
  {name: 'steep and yawed the other way', box: {x0: -2, x1: 1, z0: -4, z1: 0}, opts: {pitch: 65, yaw: -20, margin: .2}, aspect: 1}
];

for (const c of CASES) {
  test(`solveFocus fits every corner inside the margin: ${c.name}`, () => {
    const fov = fovFor(c.aspect);
    const m = c.opts.margin ?? .06;
    const sol = solveFocus(c.box, c.opts, fov, c.aspect);
    for (const k of ['tx', 'ty', 'tz', 'dist']) assert.ok(Number.isFinite(sol[k]), `${k} is finite`);
    assert.ok(sol.dist > 0);
    const pr = project(c.box, sol, fov, c.aspect);
    assert.ok(pr.minF > 0, 'every corner is in front of the camera');
    const eps = 1e-6;
    assert.ok(pr.maxR <= pr.limR * (1 - 2 * m) + eps, `horizontal extent ${pr.maxR} within ${pr.limR * (1 - 2 * m)}`);
    assert.ok(pr.maxU <= pr.limU * (1 - 2 * m) + eps, `vertical extent ${pr.maxU} within ${pr.limU * (1 - 2 * m)}`);
    // As large as possible: one axis touches its margin.
    const fillR = pr.maxR / (pr.limR * (1 - 2 * m)), fillU = pr.maxU / (pr.limU * (1 - 2 * m));
    assert.ok(Math.max(fillR, fillU) > .995, `binding axis is tight (fill ${fillR.toFixed(3)}, ${fillU.toFixed(3)})`);
    // Centred: projected extents are symmetric on both axes.
    assert.ok(Math.abs(pr.sumR) < 1e-3, `centred horizontally (${pr.sumR})`);
    assert.ok(Math.abs(pr.sumU) < 1e-3, `centred vertically (${pr.sumU})`);
  });
}

test('solveFocus: a smaller box puts the camera closer', () => {
  const big = solveFocus(DEFAULT_FOCUS, {pitch: 40}, 45, .8);
  const small = solveFocus({x0: -1, x1: 1, z0: -1, z1: 1, y0: 0, y1: 1}, {pitch: 40}, 45, .8);
  assert.ok(small.dist < big.dist * .6, `${small.dist} vs ${big.dist}`);
});

test('solveFocus: a larger margin moves the camera back', () => {
  const a = solveFocus(DEFAULT_FOCUS, {pitch: 40, margin: .02}, 45, 1);
  const b = solveFocus(DEFAULT_FOCUS, {pitch: 40, margin: .2}, 45, 1);
  assert.ok(b.dist > a.dist);
});

test('fovFor stays in 39..50 degrees and is wider on tall canvases', () => {
  for (const a of [.2, .5, .75, 1, 1.5, 3]) { const f = fovFor(a); assert.ok(f >= 39 && f <= 50, `${a} -> ${f}`); }
  assert.ok(fovFor(.6) > fovFor(1.6));
});

test('accentSet returns normalised hex and THREE.Color fields', () => {
  const a = accentSet('#AD2C4D');
  assert.equal(a.hex, '#ad2c4d');
  for (const k of ['base', 'bright', 'dark', 'soft']) {
    assert.ok(a[k] && a[k].isColor, `${k} is a THREE.Color`);
    for (const ch of ['r', 'g', 'b']) assert.ok(a[k][ch] >= 0 && a[k][ch] <= 1);
  }
});

test('accentSet: bright is lighter than base, dark is darker, soft is a pale tint, hue is kept', () => {
  for (const hex of ['#ad2c4d', '#2b7bb9', '#1f8a5b', '#e0a020', '#6a3fb5', '#111111']) {
    const a = accentSet(hex);
    const hsl = (c) => { const o = {}; c.getHSL(o); return o; };
    const b = hsl(a.base), br = hsl(a.bright), dk = hsl(a.dark), sf = hsl(a.soft);
    assert.ok(br.l >= .6 - 1e-6 && br.l <= .7 + 1e-6, `${hex} bright l ${br.l}`);
    assert.ok(dk.l >= .16 - 1e-6 && dk.l <= .3 + 1e-6, `${hex} dark l ${dk.l}`);
    assert.ok(Math.abs(sf.l - .9) < .01, `${hex} soft l ${sf.l}`);
    assert.ok(br.l > dk.l);
    if (b.s > .1) {
      const dh = (x, y) => Math.min(Math.abs(x - y), 1 - Math.abs(x - y));
      assert.ok(dh(br.h, b.h) < .02 && dh(dk.h, b.h) < .02, `${hex} hue kept`);
    }
  }
});

test('accentSet falls back to the default blue on bad input', () => {
  assert.equal(accentSet(undefined).hex, '#2b7bb9');
  assert.equal(accentSet('').hex, '#2b7bb9');
});

test('moods: three distinct presets, night is darker than day', () => {
  assert.deepEqual(Object.keys(MOODS).sort(), ['day', 'dusk', 'night']);
  assert.equal(moodOf('nope').id, 'day');
  assert.equal(moodOf(MOODS.night).id, 'night');
  const lum = (hex) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return .2126 * r + .7152 * g + .0722 * b; };
  assert.ok(lum(MOODS.night.bg) < lum(MOODS.dusk.bg) && lum(MOODS.dusk.bg) < lum(MOODS.day.bg));
  assert.ok(MOODS.night.lamp > MOODS.day.lamp && MOODS.night.glow > MOODS.day.glow);
});

test('insetBand: no insets keeps the full canvas', () => {
  const b = insetBand(390, 420, 0, 0, 46);
  assert.equal(b.h, 420); assert.equal(b.fov, 46); assert.ok(Math.abs(b.aspect - 390 / 420) < 1e-9);
});

test('insetBand: a bottom sheet narrows the fov in proportion to the visible height', () => {
  const b = insetBand(390, 420, 0, 210, 46);
  assert.equal(b.h, 210); assert.equal(b.b, 210);
  assert.ok(Math.abs(Math.tan(b.fov * D2R / 2) - Math.tan(23 * D2R) / 2) < 1e-9);
  assert.ok(Math.abs(b.aspect - 390 / 210) < 1e-9);
});

test('insetBand: the band never drops below 30% of the canvas (or 80 px), bad input is ignored', () => {
  const b = insetBand(390, 400, 100, 900, 45);
  assert.ok(Math.abs(b.h - 120) < 1e-9, `band ${b.h}`);
  assert.ok(Math.abs(b.t / b.b - 100 / 900) < 1e-9, 'insets shrink together');
  const s = insetBand(390, 200, 0, 500, 45);
  assert.ok(Math.abs(s.h - 80) < 1e-9);
  const n = insetBand(390, 400, NaN, -20, 45);
  assert.equal(n.h, 400);
});

test('insetBand + solveFocus: the box fits inside the band and the camera backs off', () => {
  const full = solveFocus(DEFAULT_FOCUS, {pitch: 40, margin: .04}, 46, 390 / 420);
  const b = insetBand(390, 420, 0, 180, 46);
  const sol = solveFocus(DEFAULT_FOCUS, {pitch: 40, margin: .04}, b.fov, b.aspect);
  const pr = project(DEFAULT_FOCUS, sol, b.fov, b.aspect);
  assert.ok(pr.maxU <= pr.limU * .92 + 1e-6 && pr.maxR <= pr.limR * .92 + 1e-6);
  assert.ok(sol.dist > full.dist, 'smaller band, camera further back');
});
