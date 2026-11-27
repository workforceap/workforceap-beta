// Unit tests for the pure gate rules. Run: node --test kit/mechanics/gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import gate, {rules, TRAVEL_SECONDS, outcomeOf, padLayout, gateFocus, GATE_LAYOUT, fitParts, fovGuess} from './gate.mjs';

const level = {
  id: 't1', order: 1, courseSlug: 'c1', courseTitle: 'Course', title: 'Test', skill: 'Testing', mechanic: 'gate', takeaway: 'x',
  prompt: 'What do you do?',
  actions: [{id: 'fix', label: 'Fix now'}, {id: 'esc', label: 'Escalate'}],
  items: [
    {title: 'A', facts: ['a1'], answer: 'fix', why: 'why A'},
    {title: 'B', facts: ['b1', 'b2'], answer: 'esc', why: 'why B'},
    {title: 'C', facts: ['c1'], answer: 'fix', why: 'why C'},
    {title: 'D', facts: ['d1'], answer: 'esc', why: 'why D'},
    {title: 'E', facts: ['e1'], answer: 'fix', why: 'why E'},
    {title: 'F', facts: ['f1'], answer: 'esc', why: 'why F'}
  ]
};
const clone = (x) => JSON.parse(JSON.stringify(x));

test('plugin shape matches the frozen interface', () => {
  assert.equal(gate.id, 'gate');
  assert.equal(gate.label, 'Decide');
  for (const k of ['init', 'view', 'act', 'tick', 'hint', 'done']) assert.equal(typeof gate.rules[k], 'function');
  assert.equal(typeof gate.createView, 'function');
  const steps = gate.howTo(level);
  assert.ok(steps.length >= 2 && steps.length <= 3);
  assert.match(steps.join(' '), /Fix now or Escalate/);
});

test('init is deterministic for a seed, shuffles items, and state is plain JSON', () => {
  const a = rules.init(level, {seed: 42, timed: false}), b = rules.init(level, {seed: 42, timed: false});
  assert.deepEqual(a, b);
  assert.deepEqual(clone(a), a);
  assert.equal(a.items.length, 6);
  assert.deepEqual(a.items.map((i) => i.title).sort(), ['A', 'B', 'C', 'D', 'E', 'F']);
  const orders = new Set();
  for (let s = 1; s <= 30; s++) orders.add(rules.init(level, {seed: s}).items.map((i) => i.title).join(''));
  assert.ok(orders.size > 5, 'different seeds give different orders');
  assert.deepEqual(a.actions.map((x) => x.id), ['fix', 'esc'], 'action order is stable');
});

test('init does not mutate the level', () => {
  const before = clone(level);
  rules.init(level, {seed: 7});
  assert.deepEqual(level, before);
});

test('view shows the current card, prompt, choices, progress; no timer when untimed', () => {
  const s = rules.init(level, {seed: 3});
  const v = rules.view(s);
  assert.equal(v.card.title, s.items[0].title);
  assert.deepEqual(v.card.lines, s.items[0].facts);
  assert.equal(v.prompt, 'What do you do?');
  assert.deepEqual(v.choices, [{id: 'fix', label: 'Fix now', done: false}, {id: 'esc', label: 'Escalate', done: false}]);
  assert.deepEqual(v.progress, {done: 0, total: 6});
  assert.equal(v.timer, null);
});

test('right answer emits right with why and advances', () => {
  const s = rules.init(level, {seed: 5});
  const ans = rules.hint(s);
  const {state, events} = rules.act(s, ans);
  assert.equal(events[0].type, 'right');
  assert.equal(events[0].why, s.items[0].why);
  assert.equal(state.i, 1);
  assert.equal(s.i, 0, 'act does not mutate input state');
});

test('wrong answer emits wrong with correct label and review', () => {
  const s = rules.init(level, {seed: 5});
  const ans = rules.hint(s), wrong = ans === 'fix' ? 'esc' : 'fix';
  const {state, events} = rules.act(s, wrong);
  const e = events[0];
  assert.equal(e.type, 'wrong');
  assert.equal(e.correctLabel, ans === 'fix' ? 'Fix now' : 'Escalate');
  assert.deepEqual(e.review, {title: s.items[0].title, correct: e.correctLabel});
  assert.equal(e.why, s.items[0].why);
  assert.equal(state.i, 1);
});

test('unknown choice or acting after done is a no-op', () => {
  const s = rules.init(level, {seed: 5});
  const r = rules.act(s, 'nope');
  assert.equal(r.state, s); assert.deepEqual(r.events, []);
  let st = s;
  while (!rules.done(st)) st = rules.act(st, rules.hint(st)).state;
  const r2 = rules.act(st, 'fix');
  assert.deepEqual(r2.events, []);
  assert.equal(rules.hint(st), null);
  assert.equal(rules.view(st).card, null);
});

test('playing every hint wins and emits done exactly once at the end', () => {
  let s = rules.init(level, {seed: 11});
  const all = [];
  while (!rules.done(s)) { const r = rules.act(s, rules.hint(s)); all.push(...r.events); s = r.state; }
  assert.equal(all.filter((e) => e.type === 'right').length, 6);
  assert.equal(all.filter((e) => e.type === 'done').length, 1);
  assert.equal(all[all.length - 1].type, 'done');
  assert.deepEqual(rules.view(s).progress, {done: 6, total: 6});
});

test('timed: view has a timer, tick counts down and times out to the next item', () => {
  let s = rules.init(level, {seed: 2, timed: true});
  assert.deepEqual(rules.view(s).timer, {left: TRAVEL_SECONDS, total: TRAVEL_SECONDS});
  let r = rules.tick(s, 5);
  assert.equal(r.events.length, 0);
  assert.equal(r.state.left, TRAVEL_SECONDS - 5);
  r = rules.tick(r.state, TRAVEL_SECONDS);
  assert.equal(r.events[0].type, 'timeout');
  assert.equal(r.events[0].review.title, s.items[0].title);
  assert.ok(r.events[0].correctLabel);
  assert.equal(r.state.i, 1);
  assert.equal(r.state.left, TRAVEL_SECONDS, 'timer resets for the next item');
});

test('untimed: tick never changes state; bad dt is ignored', () => {
  const s = rules.init(level, {seed: 2, timed: false});
  assert.equal(rules.tick(s, 999).state, s);
  const t = rules.init(level, {seed: 2, timed: true});
  assert.equal(rules.tick(t, NaN).state, t);
  assert.equal(rules.tick(t, -1).state, t);
});

test('answering resets the timer for the next item', () => {
  let s = rules.init(level, {seed: 2, timed: true});
  s = rules.tick(s, 12).state;
  s = rules.act(s, rules.hint(s)).state;
  assert.equal(s.left, TRAVEL_SECONDS);
});

test('timing out the last item emits done', () => {
  let s = rules.init(level, {seed: 9, timed: true});
  for (let i = 0; i < 5; i++) s = rules.act(s, rules.hint(s)).state;
  const r = rules.tick(s, TRAVEL_SECONDS + 1);
  assert.deepEqual(r.events.map((e) => e.type), ['timeout', 'done']);
  assert.ok(rules.done(r.state));
});

test('three-action levels work', () => {
  const l3 = {...level, actions: [...level.actions, {id: 'wait', label: 'Wait'}], items: [...level.items, {title: 'G', facts: ['g'], answer: 'wait', why: 'why G'}]};
  let s = rules.init(l3, {seed: 1});
  assert.equal(rules.view(s).choices.length, 3);
  while (!rules.done(s)) s = rules.act(s, rules.hint(s)).state;
  assert.ok(rules.done(s));
});

test('an item prop is kept in state; items without one stay prop-free', () => {
  const lv = {...level, items: level.items.map((it, i) => (i === 0 ? {...it, prop: 'chip'} : it))};
  const s = rules.init(lv, {seed: 4});
  const a = s.items.find((i) => i.title === 'A'), b = s.items.find((i) => i.title === 'B');
  assert.equal(a.prop, 'chip');
  assert.equal('prop' in b, false);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('outcomeOf: every effect belongs to the action just chosen', () => {
  const r = outcomeOf({type: 'right', choice: 'fix', correct: 'fix', streak: 1});
  assert.equal(r.pad, 'fix'); assert.equal(r.markPad, 'fix'); assert.equal(r.mark, 'right');
  assert.equal(r.glow, null); assert.equal(r.hold, false); assert.equal(r.big, false);
  assert.equal(outcomeOf({type: 'right', choice: 'esc', correct: 'esc', streak: 3}).big, true, 'bigger from a streak of 3');
  assert.equal(outcomeOf({type: 'right', choice: 'esc', correct: 'esc'}).streak, 1, 'missing streak counts as 1');
  const w = outcomeOf({type: 'wrong', choice: 'fix', correct: 'esc'});
  assert.equal(w.pad, 'fix'); assert.equal(w.markPad, 'fix'); assert.equal(w.mark, 'wrong');
  assert.equal(w.glow, 'esc', 'the correct pad glows'); assert.equal(w.hold, true, 'held until resume');
  const t = outcomeOf({type: 'timeout', correct: 'esc'});
  assert.equal(t.pad, null); assert.equal(t.markPad, null); assert.equal(t.glow, 'esc'); assert.equal(t.hold, true);
  assert.equal(outcomeOf({type: 'done'}), null);
  assert.equal(outcomeOf({type: 'resume'}), null);
  assert.equal(outcomeOf(null), null);
});

test('outcomeOf matches the rules events for every pick', () => {
  let s = rules.init(level, {seed: 8});
  const picks = ['fix', 'esc', 'esc', 'fix', 'fix', 'esc'];
  for (const pick of picks) {
    const {state, events} = rules.act(s, pick);
    const oc = outcomeOf(events[0]);
    assert.equal(oc.pad, pick, 'the effect sits on the picked pad');
    assert.equal(oc.type, pick === rules.hint(s) ? 'right' : 'wrong');
    if (oc.type === 'wrong') assert.equal(oc.glow, rules.hint(s));
    s = state;
  }
});

test('padLayout keeps 1-3 pads inside the stage, centred, without overlap', () => {
  for (const n of [1, 2, 3]) {
    const p = padLayout(n);
    assert.equal(p.xs.length, n);
    assert.ok(p.half <= 3, `n=${n} fits x -3..3`);
    assert.ok(Math.abs(p.xs.reduce((a, b) => a + b, 0)) < 1e-9, 'centred');
    for (let i = 1; i < n; i++) assert.ok(p.xs[i] - p.xs[i - 1] >= p.padW, 'no overlap');
  }
  assert.equal(padLayout(5).xs.length, 3, 'clamped to 3');
});

test('gateFocus frames the pads and arch inside the stage for tall and wide canvases', () => {
  for (const n of [2, 3]) for (const aspect of [.5, .76, 1, 1.3, 1.8, 2.6, NaN]) {
    const {box, opts} = gateFocus(n, aspect);
    const {half} = padLayout(n);
    assert.ok(box.x0 <= -half && box.x1 >= half, 'whole pad row');
    assert.ok(box.x0 >= -3.1 && box.x1 <= 3.1);
    assert.ok(box.z1 <= 2, 'the near edge is inside the stage');
    // the far edge stays on the stage, except on a very tall canvas, where it reaches back into the room (see below)
    if (aspect > 1.45) assert.ok(box.z0 >= -6, 'inside the stage depth on a wide canvas');
    assert.ok(box.z0 >= -19, 'a bounded reach');
    assert.ok(box.z0 <= GATE_LAYOUT.zArch - 1, 'includes the arch and some belt');
    assert.ok(box.z1 >= GATE_LAYOUT.zPads + GATE_LAYOUT.padD / 2, 'includes the front of the pads');
    assert.ok(box.y1 >= GATE_LAYOUT.archTop, 'includes the arch top');
    assert.ok(opts.pitch >= 25 && opts.pitch <= 65);
  }
  assert.ok(gateFocus(3, .7).box.z0 < gateFocus(3, 2.4).box.z0, 'a tall canvas shows more conveyor');
});

test('gateFocus leaves no empty band under the pads on a tall canvas, and never moves the camera back for it', () => {
  for (const n of [2, 3]) for (const aspect of [.5, .62, .76, .9]) {
    const {box, opts} = gateFocus(n, aspect);
    const fov = fovGuess(aspect);
    const f = fitParts(box, opts.pitch, fov, aspect, opts.margin);
    // both limits meet: the box fills the canvas up and down as well as across, so the solver has no slack to centre
    assert.ok(Math.abs(f.h - f.v) < .05 * Math.abs(f.h), `n=${n} aspect=${aspect}: across ${f.h.toFixed(2)} vs up-down ${f.v.toFixed(2)}`);
    const plain = {...box, z0: -6};
    const p = fitParts(plain, opts.pitch, fov, aspect, opts.margin);
    assert.ok(Math.min(f.h, f.v) >= Math.min(p.h, p.v) - 1e-3, 'reaching back costs no camera distance');
    assert.ok(box.z0 <= -6, 'the whole belt is still in');
  }
  // a wide canvas stays on the stage (the height already binds)
  assert.ok(gateFocus(3, 2.4).box.z0 >= -6);
});

test('padSign: taller plate on three pads, a font floor for phones, and the plate fits on its pad', async () => {
  const {padSign} = await import('./gate.mjs');
  for (const n of [1, 2, 3]) {
    const s = padSign(n), {padW} = padLayout(n);
    assert.ok(s.w < padW && s.w > padW - .3, `sign fits pad ${n}`);
    assert.ok(s.minFont >= .22, 'font floor about 11 px on a 390 px phone');
    assert.ok(s.maxFont >= s.minFont);
    // two lines at the floor size fit inside the plate's text area (kit.label pads about 12% top and bottom)
    assert.ok((1.14 + 1) * s.minFont <= s.h * .76, `two lines fit at the floor for ${n} pads`);
  }
  assert.ok(padSign(3).h > padSign(2).h, 'three narrow pads get a taller plate');
});

test('tagOf: names the chosen pad on a right answer, Not quite on a wrong one, Time\'s up on a timeout', async () => {
  const {tagOf} = await import('./gate.mjs');
  const actions = [{id: 'fix', label: 'Fix now'}, {id: 'esc', label: 'Escalate'}];
  assert.deepEqual(tagOf({type: 'right', choice: 'esc', streak: 2}, actions), {kind: 'right', pad: 'esc', text: 'Escalate'});
  assert.deepEqual(tagOf({type: 'wrong', choice: 'fix', correct: 'esc'}, actions), {kind: 'wrong', pad: 'fix', text: 'Not quite'});
  assert.deepEqual(tagOf({type: 'timeout', correct: 'esc'}, actions), {kind: 'wrong', pad: null, text: "Time's up"});
  assert.equal(tagOf({type: 'resume'}, actions), null);
  assert.equal(tagOf(null, actions), null);
  // the tag of a right pick always sits on the pad the outcome marks
  const ev = {type: 'right', choice: 'fix', streak: 1};
  assert.equal(tagOf(ev, actions).pad, outcomeOf(ev).pad);
});
