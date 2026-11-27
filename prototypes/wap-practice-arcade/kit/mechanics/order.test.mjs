// Unit tests for the pure order rules. Run: node --test kit/mechanics/order.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import order, {rules, SECONDS_PER_STEP, LAYOUT, layoutFor} from './order.mjs';

const level = {
  id: 't1', order: 1, courseSlug: 'c1', courseTitle: 'Course', title: 'Test', skill: 'Testing', mechanic: 'order', takeaway: 'x',
  rounds: [
    {prompt: 'Make tea.', steps: ['Boil water', 'Add tea bag', 'Pour water', 'Wait', 'Drink'], why: 'why tea'},
    {prompt: 'Send mail.', steps: ['Write', 'Check', 'Send', 'File it'], why: 'why mail'}
  ]
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const total = 2; // two rounds: the top bar counts rounds

function playCorrect(s) {
  const evs = [];
  let guard = 0;
  while (!rules.done(s) && guard++ < 50) { const r = rules.act(s, rules.hint(s)); s = r.state; evs.push(...r.events); }
  return {s, evs};
}

test('plugin shape matches the frozen interface', () => {
  assert.equal(order.id, 'order');
  assert.equal(order.label, 'Order');
  for (const k of ['init', 'view', 'act', 'tick', 'hint', 'done']) assert.equal(typeof order.rules[k], 'function');
  assert.equal(typeof order.createView, 'function');
  const h = order.howTo(level);
  assert.ok(h.length >= 2 && h.length <= 3);
});

test('init is plain JSON, deterministic per seed, never pre-solved, does not mutate the level', () => {
  const before = clone(level);
  const a = rules.init(level, {seed: 42}), b = rules.init(level, {seed: 42});
  assert.deepEqual(a, b);
  assert.deepEqual(clone(a), a);
  assert.deepEqual(level, before);
  for (let seed = 1; seed <= 60; seed++) {
    const s = rules.init(level, {seed});
    s.rounds.forEach((r) => assert.notDeepEqual(r.order, r.steps.map((x) => x.id)));
  }
});

test('shuffle differs by seed and preserves content', () => {
  const orders = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const s = rules.init(level, {seed});
    orders.add(s.rounds[0].order.join(','));
    assert.deepEqual(s.rounds[0].order.slice().sort(), s.rounds[0].steps.map((x) => x.id).sort());
    assert.deepEqual(s.rounds[0].steps.map((x) => x.text), level.rounds[0].steps);
  }
  assert.ok(orders.size > 5);
});

test('view: card, prompt, shuffled choices with full text, progress, timer', () => {
  const s = rules.init(level, {seed: 3});
  const v = rules.view(s);
  assert.equal(v.card.title, 'Make tea.');
  assert.ok(v.card.lines.length <= 3);
  assert.equal(v.prompt, 'Which step comes first?');
  assert.equal(v.choices.length, 5);
  assert.deepEqual(v.choices.map((c) => c.label).sort(), level.rounds[0].steps.slice().sort());
  assert.ok(v.choices.every((c) => c.done === false));
  assert.deepEqual(v.progress, {done: 0, total});
  assert.equal(v.timer, null);
  const t = rules.view(rules.init(level, {seed: 3, timed: true}));
  assert.deepEqual(t.timer, {left: SECONDS_PER_STEP * 5, total: SECONDS_PER_STEP * 5});
});

test('card kicker says only the step; card lines stay short; no "Item N of M" style lines', () => {
  let s = rules.init(level, {seed: 7});
  let v = rules.view(s);
  assert.equal(v.card.kicker, 'Step 1 of 5');
  assert.deepEqual(v.card.lines, [], 'nothing placed yet: no card lines');
  s = rules.act(s, rules.hint(s)).state;
  v = rules.view(s);
  assert.equal(v.card.kicker, 'Step 2 of 5');
  assert.deepEqual(v.card.lines, ['Last placed: Boil water']);
  assert.ok(!v.card.lines.some((l) => /^Step \d/.test(l)), 'the step count lives in the kicker only');
  while (s.r === 0) s = rules.act(s, rules.hint(s)).state;
  v = rules.view(s);
  assert.equal(v.card.kicker, 'Step 1 of 4');
  assert.equal(v.card.title, 'Send mail.');
  assert.deepEqual(v.card.lines, [], 'a new round starts with a clean card');
  for (const line of v.card.lines) assert.ok(line.length <= 60);
  // a single-round level reads the same
  const one = {...level, rounds: [level.rounds[0]]};
  assert.equal(rules.view(rules.init(one, {seed: 1})).card.kicker, 'Step 1 of 5');
  // the kicker is a short string at every step of a full run
  let st = rules.init(level, {seed: 11});
  while (!rules.done(st)) { const k = rules.view(st).card.kicker; assert.equal(typeof k, 'string'); assert.ok(k.length <= 32, k); st = rules.act(st, rules.hint(st)).state; }
});

test('progress: rounds when there are several, steps when there is one; never a cross-round step total', () => {
  let s = rules.init(level, {seed: 4});
  const seen = [];
  while (!rules.done(s)) { const v = rules.view(s); seen.push(`${v.progress.done}/${v.progress.total} ${v.card.kicker}`); s = rules.act(s, rules.hint(s)).state; }
  assert.deepEqual(seen, ['0/2 Step 1 of 5', '0/2 Step 2 of 5', '0/2 Step 3 of 5', '0/2 Step 4 of 5',
    '1/2 Step 1 of 4', '1/2 Step 2 of 4', '1/2 Step 3 of 4']);
  assert.deepEqual(rules.view(s).progress, {done: 2, total: 2});
  // single round: the top bar and the kicker show the same step numbers
  const one = {...level, rounds: [level.rounds[1]]};
  let o = rules.init(one, {seed: 2});
  while (!rules.done(o)) {
    const v = rules.view(o);
    assert.equal(v.card.kicker, `Step ${Math.min(v.progress.total, v.progress.done + 1)} of ${v.progress.total}`);
    o = rules.act(o, rules.hint(o)).state;
  }
  assert.deepEqual(rules.view(o).progress, {done: 4, total: 4});
  // a timeout counts like a placement
  let t = rules.init(one, {seed: 2, timed: true});
  t = rules.tick(t, SECONDS_PER_STEP * 4 + 1).state;
  assert.equal(rules.view(t).progress.done, 1);
});

test('view events carry what the 3D view needs: slot of a right pick, round end with the auto-placed step', () => {
  let s = rules.init(level, {seed: 3});
  const evs = [];
  while (s.r === 0) { const r = rules.act(s, rules.hint(s)); r.events.forEach((e) => evs.push(e)); s = r.state; }
  const rights = evs.filter((e) => e.type === 'right');
  assert.deepEqual(rights.map((e) => e.slot), [0, 1, 2, 3]);
  assert.deepEqual(rights.map((e) => e.id), ['r0s0', 'r0s1', 'r0s2', 'r0s3']);
  const round = evs.find((e) => e.type === 'round');
  assert.deepEqual({round: round.round, auto: round.auto, slot: round.slot}, {round: 0, auto: 'r0s4', slot: 4});
  assert.equal(evs.indexOf(round), evs.length - 1, 'round comes right after the last right pick');
  const w = rules.act(s, rules.view(s).choices.find((c) => c.id !== rules.hint(s)).id).events[0];
  assert.equal(w.type, 'wrong');
  assert.equal(w.correct, 'r1s0');
  assert.match(w.choice, /^r1s[123]$/);
});

test('a right pick emits right, removes the choice, advances progress', () => {
  const s = rules.init(level, {seed: 5});
  const id = rules.hint(s);
  const r = rules.act(s, id);
  assert.deepEqual(r.events.map((e) => e.type), ['right']);
  assert.equal(r.events[0].why, 'why tea');
  assert.equal(r.events[0].slot, 0);
  const v = rules.view(r.state);
  assert.equal(v.choices.length, 4);
  assert.ok(!v.choices.some((c) => c.id === id));
  assert.equal(v.progress.done, 0, 'the top bar counts finished rounds; the kicker counts steps');
  assert.equal(v.card.kicker, 'Step 2 of 5');
  assert.equal(v.prompt, 'Which step comes next?');
  assert.match(v.card.lines.join(' '), /Boil water/);
  assert.equal(s.placed.length, 0, 'act does not mutate the old state');
});

test('a full correct run reaches done with only right events, auto-placing the last step of each round', () => {
  const {s, evs} = playCorrect(rules.init(level, {seed: 9}));
  assert.ok(rules.done(s));
  assert.deepEqual(evs.filter((e) => ['wrong', 'timeout'].includes(e.type)), []);
  assert.equal(evs.filter((e) => e.type === 'right').length, (5 - 1) + (4 - 1));
  assert.equal(evs.filter((e) => e.type === 'round').length, 2);
  assert.equal(evs.filter((e) => e.type === 'done').length, 1);
  assert.ok(evs.filter((e) => e.type === 'round').every((e) => typeof e.auto === 'string'));
  assert.equal(evs[evs.length - 1].type, 'done');
  const v = rules.view(s);
  assert.deepEqual(v.progress, {done: total, total});
  assert.equal(v.card, null);
  assert.deepEqual(v.choices, []);
  let st = rules.init(level, {seed: 9});
  while (!rules.done(st)) { assert.ok(rules.view(st).choices.length >= 2, 'always a real choice'); st = rules.act(st, rules.hint(st)).state; }
});

test('hint is always currently correct', () => {
  for (let seed = 1; seed <= 20; seed++) {
    let s = rules.init(level, {seed, timed: seed % 2 === 0});
    while (!rules.done(s)) {
      const h = rules.hint(s);
      assert.ok(rules.view(s).choices.some((c) => c.id === h));
      const r = rules.act(s, h);
      assert.equal(r.events[0].type, 'right');
      s = r.state;
    }
    assert.equal(rules.hint(s), null);
  }
});

test('every kind of wrong pick emits wrong with correctLabel, why and review, and changes nothing', () => {
  const s = rules.init(level, {seed: 4});
  const want = rules.hint(s);
  const wrongIds = rules.view(s).choices.map((c) => c.id).filter((id) => id !== want);
  assert.equal(wrongIds.length, 4);
  for (const id of wrongIds) {
    const r = rules.act(s, id);
    assert.equal(r.events.length, 1);
    const e = r.events[0];
    assert.equal(e.type, 'wrong');
    assert.equal(e.correctLabel, 'Boil water');
    assert.equal(e.why, 'why tea');
    assert.deepEqual(e.review, {title: 'Step 1 of 5: Make tea.', correct: 'Boil water'});
    assert.equal(e.choice, id);
    assert.equal(e.correct, want);
    assert.deepEqual(r.state, s);
  }
  const s2 = rules.act(s, want).state;
  const w2 = rules.view(s2).choices.map((c) => c.id).find((id) => id !== rules.hint(s2));
  const e2 = rules.act(s2, w2).events[0];
  assert.equal(e2.correctLabel, 'Add tea bag');
  assert.equal(e2.review.title, 'Step 2 of 5: Make tea.');
});

test('unknown or already placed ids are ignored', () => {
  const s = rules.init(level, {seed: 4});
  assert.deepEqual(rules.act(s, 'nope').events, []);
  const id = rules.hint(s), s2 = rules.act(s, id).state;
  assert.deepEqual(rules.act(s2, id).events, []);
  const fin = playCorrect(s).s;
  assert.deepEqual(rules.act(fin, 'r0s0').events, []);
});

test('timer: untimed never ticks; timed counts down and times out by placing the correct step', () => {
  const u = rules.init(level, {seed: 2});
  assert.deepEqual(rules.tick(u, 999).events, []);
  const t = rules.init(level, {seed: 2, timed: true});
  const a = rules.tick(t, 10);
  assert.deepEqual(a.events, []);
  assert.equal(a.state.left, 50);
  assert.deepEqual(rules.tick(a.state, 0).events, []);
  const b = rules.tick(a.state, 51);
  assert.equal(b.events.length, 1);
  const e = b.events[0];
  assert.equal(e.type, 'timeout');
  assert.equal(e.correctLabel, 'Boil water');
  assert.equal(e.why, 'why tea');
  assert.deepEqual(e.review, {title: 'Step 1 of 5: Make tea.', correct: 'Boil water'});
  assert.equal(b.state.placed.length, 1);
  assert.equal(b.state.left, SECONDS_PER_STEP * 4);
  assert.ok(rules.view(b.state).timer.left > 0);
});

test('timeouts roll rounds over and finish the level; a new round gets its full time', () => {
  let s = rules.init(level, {seed: 2, timed: true});
  const types = [];
  let guard = 0;
  while (!rules.done(s) && guard++ < 40) { const r = rules.tick(s, 1000); r.events.forEach((e) => types.push(e.type)); s = r.state; }
  assert.ok(rules.done(s));
  assert.equal(types.at(-1), 'done');
  assert.equal(types.filter((x) => x === 'round').length, 2);
  assert.equal(types.filter((x) => x === 'timeout').length, (5 - 1) + (4 - 1), 'the last step of each round is auto-placed, not timed out');
  let v = rules.init(level, {seed: 2, timed: true});
  for (let i = 0; i < 4; i++) v = rules.act(v, rules.hint(v)).state;
  assert.equal(v.r, 1);
  assert.equal(v.left, SECONDS_PER_STEP * 4);
  assert.equal(rules.view(v).timer.total, SECONDS_PER_STEP * 4);
});

test('3D layout: every rail and pile row sits at the same view distance, rows never overlap on screen, all inside the focus box', () => {
  for (let n = 4; n <= 6; n++) {
    const lay = layoutFor(n);
    // camera looks down at LAYOUT.PITCH: forward f = (0, -sinP, -cosP), screen up u = (0, cosP, -sinP)
    const depth = (p) => -p.y * lay.sinP - p.z * lay.cosP, up = (p) => p.y * lay.cosP - p.z * lay.sinP;
    const rows = [...Array(n).keys()].map((k) => lay.tileAt(lay.railX, k));
    for (const p of rows) assert.ok(Math.abs(depth(p) - depth(rows[0])) < 1e-9, 'same distance from the camera on every row');
    for (let k = 1; k < n; k++) {
      const gap = up(rows[k - 1]) - up(rows[k]);
      assert.ok(gap >= LAYOUT.TH + .08, `row ${k - 1} is above row ${k} on screen with room for a whole tile (gap ${gap.toFixed(3)})`);
    }
    assert.ok(up(rows[0]) > up(rows[n - 1]), 'slot 1 is at the top');
    const b = lay.box, half = LAYOUT.TW / 2;
    for (let k = 0; k < n; k++) for (const x of [lay.railX, lay.pileX]) {
      const p = lay.tileAt(x, k);
      assert.ok(p.x - half >= b.x0 && p.x + half <= b.x1, 'tile inside the box (x)');
      assert.ok(p.z >= b.z0 && p.z <= b.z1 && p.y >= b.y0 && p.y <= b.y1, 'tile inside the box (y, z)');
    }
    assert.ok(lay.badgeX - .27 >= b.x0, 'number badges inside the box');
    assert.ok(lay.railX + half <= lay.pileX - half, 'rail and pile columns do not overlap');
    assert.ok(b.x0 >= -3.5 && b.x1 <= 3.5 && b.z0 >= -6 && b.z1 <= 2, 'within the stage (with a little room for the badges)');
  }
});
