// Unit tests for the pure match rules. Run: node --test kit/mechanics/match.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import match, {rules, PER_PAIR, BACK_ID, lowerFirst, pairLine, boardLayout} from './match.mjs';

const level = {
  id: 't1', order: 1, courseSlug: 'c1', courseTitle: 'Course', title: 'Test', skill: 'Testing', mechanic: 'match', takeaway: 'x',
  rounds: [
    {prompt: 'Match round one.', pairs: [['A', 'a-partner'], ['B', 'b-partner'], ['C', 'c-partner'], ['D', 'd-partner']], why: 'Round one why.'},
    {prompt: 'Match round two.', pairs: [['E', 'e-partner'], ['F', 'f-partner'], ['G', 'g-partner'], ['H', 'h-partner'], ['I', 'i-partner']], why: 'Round two why.'}
  ]
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const TOTAL = 9;

function playAll(s) {
  const events = [];
  while (!rules.done(s)) { const r = rules.act(s, rules.hint(s)); events.push(...r.events); s = r.state; }
  return {state: s, events};
}
// Matches one pair correctly (pick the hinted left, then its partner).
function matchOne(s) {
  s = rules.act(s, rules.hint(s)).state;
  return rules.act(s, rules.hint(s));
}

test('plugin shape matches the frozen interface', () => {
  assert.equal(match.id, 'match');
  assert.equal(match.label, 'Connect');
  for (const k of ['init', 'view', 'act', 'tick', 'hint', 'done']) assert.equal(typeof match.rules[k], 'function');
  assert.equal(typeof match.createView, 'function');
  const steps = match.howTo(level);
  assert.ok(steps.length >= 2 && steps.length <= 3);
});

test('init shape: deterministic, plain JSON, does not mutate the level', () => {
  const before = clone(level);
  const a = rules.init(level, {seed: 42, timed: false}), b = rules.init(level, {seed: 42, timed: false});
  assert.deepEqual(a, b);
  assert.deepEqual(clone(a), a);
  assert.deepEqual(level, before);
  assert.equal(a.rounds.length, 2);
  assert.equal(a.round, 0);
  assert.equal(a.sel, null);
  assert.deepEqual(a.rounds[0].leftOrder.slice().sort(), [0, 1, 2, 3]);
  assert.deepEqual(a.rounds[1].rightOrder.slice().sort(), [0, 1, 2, 3, 4]);
});

test('shuffle differs by seed and content is preserved', () => {
  const orders = new Set(), rights = new Set();
  for (let s = 1; s <= 30; s++) {
    const st = rules.init(level, {seed: s});
    orders.add(st.rounds[0].leftOrder.join(''));
    rights.add(st.rounds[0].rightOrder.join(''));
    assert.deepEqual(st.rounds[0].pairs.map((p) => p.left).sort(), ['A', 'B', 'C', 'D']);
    assert.deepEqual(st.rounds[0].pairs.map((p) => p.right).sort(), ['a-partner', 'b-partner', 'c-partner', 'd-partner']);
    assert.notDeepEqual(st.rounds[0].leftOrder, st.rounds[0].rightOrder, 'columns are never in matching order');
  }
  assert.ok(orders.size > 5 && rights.size > 5);
});

test('view with nothing selected lists the lefts; with a left selected lists the rights', () => {
  let s = rules.init(level, {seed: 3});
  let v = rules.view(s);
  assert.equal(v.choices.length, 4);
  assert.deepEqual(v.choices.map((c) => c.label), s.rounds[0].leftOrder.map((k) => s.rounds[0].pairs[k].left));
  assert.ok(v.choices.every((c) => c.done === false));
  assert.equal(v.prompt, 'Match round one.');
  assert.deepEqual(v.progress, {done: 0, total: 9});
  assert.equal(v.timer, null);
  assert.ok(v.card && v.card.title && Array.isArray(v.card.lines));
  const r = rules.act(s, rules.hint(s));
  assert.deepEqual(r.events.map((e) => e.type), ['step']);
  s = r.state;
  v = rules.view(s);
  const prim = v.choices.filter((c) => c.kind !== 'secondary');
  assert.deepEqual(prim.map((c) => c.label), s.rounds[0].rightOrder.map((k) => s.rounds[0].pairs[k].right));
  assert.equal(v.card.title, `${s.rounds[0].pairs[s.sel].left} →`);
});

test('a full correct run reaches done with only right/step/round/done events and no wrong ones', () => {
  const {state, events} = playAll(rules.init(level, {seed: 11}));
  assert.ok(rules.done(state));
  assert.equal(events.filter((e) => e.type === 'right').length, TOTAL);
  assert.equal(events.filter((e) => e.type === 'wrong' || e.type === 'timeout').length, 0);
  assert.equal(events.filter((e) => e.type === 'round').length, 1);
  assert.equal(events.filter((e) => e.type === 'done').length, 1);
  assert.equal(events[events.length - 1].type, 'done');
  assert.deepEqual(rules.view(state).progress, {done: 9, total: 9});
  assert.equal(rules.hint(state), null);
  assert.deepEqual(rules.view(state).choices, []);
  assert.deepEqual(rules.act(state, 'l0-0').events, []);
});

test('progress counts pairs across rounds and the round advances after the last pair', () => {
  let s = rules.init(level, {seed: 4});
  for (let i = 0; i < 4; i++) {
    const before = rules.view(s).progress.done;
    const r = matchOne(s);
    s = r.state;
    assert.equal(rules.view(s).progress.done, before + 1);
    assert.equal(r.events.map((e) => e.type).join(), i < 3 ? 'right' : 'right,round');
  }
  assert.equal(s.round, 1);
  assert.equal(rules.view(s).prompt, 'Match round two.');
  assert.equal(rules.view(s).choices.length, 5);
});

test('right events carry the pair but no repeated why; the last pair of a round carries the round why', () => {
  let s = rules.init(level, {seed: 4});
  s = rules.act(s, rules.hint(s)).state;
  const sel = s.rounds[0].pairs[s.sel];
  const first = rules.act(s, rules.hint(s));
  assert.equal(first.events[0].why, '', 'the shell note already names the picked meaning; a pair note would repeat it');
  assert.equal(first.events[0].pair, `${sel.left}: ${sel.right}`);
  let st = first.state, last;
  for (let i = 0; i < 3; i++) { last = matchOne(st); st = last.state; }
  assert.equal(last.events[0].why, 'Round one why.');
});

test('wrong right pick: wrong event with correctLabel, why and review; selection clears; nothing matched', () => {
  let s = rules.init(level, {seed: 5});
  s = rules.act(s, rules.hint(s)).state;
  const rd = s.rounds[0], sel = s.sel, pair = rd.pairs[sel];
  const wrongK = rd.rightOrder.find((k) => k !== sel);
  const {state, events} = rules.act(s, `r0-${wrongK}`);
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.type, 'wrong');
  assert.equal(e.correctLabel, `${pair.left}: ${pair.right}`);
  assert.equal(e.why, 'Round one why.');
  assert.deepEqual(e.review, {title: pair.left, correct: pair.right});
  assert.equal(state.sel, null);
  assert.equal(s.sel, sel, 'act does not mutate input state');
  assert.equal(rules.view(state).progress.done, 0);
  assert.equal(rules.view(state).choices.length, 4, 'back to the lefts');
  const again = rules.act(rules.act(state, `l0-${sel}`).state, `r0-${sel}`);
  assert.equal(again.events[0].type, 'right', 'the same left can be retried');
});

test('switching or clearing the selected left is a free step; stray picks are no-ops', () => {
  const s = rules.init(level, {seed: 6});
  const r0 = rules.act(s, 'l0-0'); assert.equal(r0.state.sel, 0);
  const r1 = rules.act(r0.state, 'l0-1'); assert.equal(r1.state.sel, 1); assert.equal(r1.events[0].type, 'step');
  const r2 = rules.act(r1.state, 'l0-1'); assert.equal(r2.state.sel, null); assert.equal(r2.events[0].type, 'step');
  const stray = rules.act(s, 'r0-0');
  assert.equal(stray.state, s); assert.deepEqual(stray.events, []);
  const unknown = rules.act(s, 'nope');
  assert.equal(unknown.state, s); assert.deepEqual(unknown.events, []);
  assert.deepEqual(rules.act(s, 'l1-0').events, [], 'ids from another round are ignored');
  const m = rules.act(rules.act(s, 'l0-2').state, 'r0-2').state;
  assert.deepEqual(rules.act(m, 'l0-2').events, [], 'a matched node cannot be picked again');
});

test('hint is always currently correct: a left when nothing is selected, its partner when selected', () => {
  let s = rules.init(level, {seed: 8});
  while (!rules.done(s)) {
    const h = rules.hint(s);
    assert.ok(rules.view(s).choices.some((c) => c.id === h), 'hint is one of the offered choices');
    assert.notEqual(h, BACK_ID, 'hint never returns the back choice');
    if (s.sel === null) assert.match(h, /^l\d+-\d+$/);
    else assert.equal(h, `r${s.round}-${s.sel}`);
    const r = rules.act(s, h);
    assert.ok(!r.events.some((e) => e.type === 'wrong'));
    s = r.state;
  }
});

test('timed: timer is per round (10 s per pair), counts down and resets for the next round', () => {
  let s = rules.init(level, {seed: 2, timed: true});
  assert.deepEqual(rules.view(s).timer, {left: 4 * PER_PAIR, total: 4 * PER_PAIR});
  const r = rules.tick(s, 5);
  assert.equal(r.events.length, 0);
  assert.equal(rules.view(r.state).timer.left, 4 * PER_PAIR - 5);
  s = r.state;
  for (let i = 0; i < 4; i++) s = matchOne(s).state;
  assert.equal(s.round, 1);
  assert.deepEqual(rules.view(s).timer, {left: 5 * PER_PAIR, total: 5 * PER_PAIR});
});

test('timed: timeout emits timeout with the remaining pairs, reveals them, and moves to the next round', () => {
  let s = rules.init(level, {seed: 2, timed: true});
  s = matchOne(s).state; // one pair matched
  const r = rules.tick(s, 999);
  assert.deepEqual(r.events.map((e) => e.type), ['timeout', 'round']);
  const e = r.events[0];
  assert.equal(e.reveal.length, 3);
  assert.equal(e.correctLabel.split('; ').length, 3);
  assert.equal(e.why, 'Round one why.');
  assert.ok(e.review.title && e.review.correct);
  assert.equal(r.state.round, 1);
  assert.equal(rules.view(r.state).progress.done, 4);
  assert.equal(r.state.sel, null);
});

test('timing out the last round emits done; a whole run can end on timeouts', () => {
  let s = rules.init(level, {seed: 9, timed: true});
  s = rules.tick(s, 999).state;
  const r = rules.tick(s, 999);
  assert.deepEqual(r.events.map((e) => e.type), ['timeout', 'done']);
  assert.ok(rules.done(r.state));
  assert.equal(rules.view(r.state).progress.done, 9);
  assert.equal(rules.tick(r.state, 5).events.length, 0);
});

test('untimed: tick never changes state; bad dt is ignored', () => {
  const s = rules.init(level, {seed: 2, timed: false});
  assert.equal(rules.tick(s, 999).state, s);
  const t = rules.init(level, {seed: 2, timed: true});
  assert.equal(rules.tick(t, NaN).state, t);
  assert.equal(rules.tick(t, -1).state, t);
  assert.equal(rules.tick(t, 0).state, t);
});

test('a selected left survives a tick; a timeout clears it', () => {
  let s = rules.init(level, {seed: 2, timed: true});
  s = rules.act(s, rules.hint(s)).state;
  assert.notEqual(s.sel, null);
  assert.notEqual(rules.tick(s, 1).state.sel, null);
  assert.equal(rules.tick(s, 999).state.sel, null);
});

test('card: kicker names the round; the title is the instruction, then the picked item with an arrow', () => {
  let s = rules.init(level, {seed: 3});
  let v = rules.view(s);
  assert.equal(v.card.kicker, 'Round 1 of 2');
  assert.equal(v.card.title, 'Pick one on the left');
  s = rules.act(s, rules.hint(s)).state;
  v = rules.view(s);
  assert.equal(v.card.kicker, 'Round 1 of 2');
  assert.ok(v.card.title.endsWith('\u2192'));
  s = rules.act(s, rules.hint(s)).state; // finish the first link
  for (let i = 0; i < 3; i++) s = matchOne(s).state;
  assert.equal(rules.view(s).card.kicker, 'Round 2 of 2');
});

test('back: offered only while a left is selected, as the last, secondary choice; deselects at no cost', () => {
  let s = rules.init(level, {seed: 7});
  assert.ok(!rules.view(s).choices.some((c) => c.id === BACK_ID), 'no back choice with nothing selected');
  assert.deepEqual(rules.act(s, BACK_ID), {state: s, events: []}, 'back with nothing selected is a no-op');
  s = rules.act(s, rules.hint(s)).state;
  const sel = s.sel;
  const v = rules.view(s);
  const back = v.choices[v.choices.length - 1];
  assert.deepEqual(back, {id: BACK_ID, label: 'Pick a different one', kind: 'secondary', done: false});
  assert.equal(v.choices.filter((c) => c.kind === 'secondary').length, 1);
  const r = rules.act(s, BACK_ID);
  assert.equal(r.state.sel, null);
  assert.deepEqual(r.events, [{type: 'step', leftId: `l0-${sel}`, cleared: true}]);
  assert.equal(rules.view(r.state).progress.done, 0, 'nothing matched');
  assert.equal(rules.view(r.state).choices.length, 4, 'back to the four lefts');
  assert.equal(s.sel, sel, 'act does not mutate input state');
  assert.ok(!r.events.some((e) => e.type === 'wrong' || e.type === 'right'), 'no score change');
  // a whole run with a back before every link still ends perfect
  let t = rules.init(level, {seed: 7}), mistakes = 0;
  while (!rules.done(t)) {
    t = rules.act(t, rules.hint(t)).state;
    t = rules.act(t, BACK_ID).state;
    t = rules.act(t, rules.hint(t)).state;
    const out = rules.act(t, rules.hint(t));
    mistakes += out.events.filter((e) => e.type === 'wrong').length;
    t = out.state;
  }
  assert.equal(mistakes, 0);
});

test('wording: meanings after a colon start in lower case unless they start with an acronym or a name', () => {
  assert.equal(lowerFirst('How much data can move at once'), 'how much data can move at once');
  assert.equal(lowerFirst('A number that names a device'), 'a number that names a device');
  assert.equal(lowerFirst('IP address of the printer'), 'IP address of the printer');
  assert.equal(lowerFirst('Wi-Fi signal through the air'), 'Wi-Fi signal through the air');
  assert.equal(lowerFirst('MFA code from your phone'), 'MFA code from your phone');
  assert.equal(lowerFirst('I check it first'), 'I check it first');
  assert.equal(lowerFirst('already lower'), 'already lower');
  assert.equal(pairLine({left: 'Bandwidth', right: 'How much data can move at once.'}), 'Bandwidth: how much data can move at once');
  const lv = {...level, rounds: [{prompt: 'p', pairs: [['Bandwidth', 'How much data can move at once'], ['Latency', 'The delay before data arrives'], ['Upload', 'Send a file from you'], ['Download', 'Copy a file to you']], why: 'Round why here.'}, level.rounds[1]]};
  let s = rules.init(lv, {seed: 1});
  s = rules.act(s, 'l0-0').state;
  const right = rules.act(s, 'r0-0').events[0];
  assert.equal(right.pair, 'Bandwidth: how much data can move at once');
  const wrong = rules.act(s, 'r0-1').events[0];
  assert.equal(wrong.correctLabel, 'Bandwidth: how much data can move at once');
  assert.equal(wrong.why, 'Round why here.');
  assert.deepEqual(wrong.review, {title: 'Bandwidth', correct: 'How much data can move at once'});
  const to = rules.tick(rules.init(lv, {seed: 1, timed: true}), 999).events[0];
  assert.ok(to.correctLabel.includes('Latency: the delay before data arrives'));
});

test('board layout: the meaning column is wider, rows never overlap on screen, and the board stays in the stage', () => {
  for (const aspect of [.8, 1, 1.15, 1.8]) for (const n of [4, 5]) {
    const L = boardLayout(n, aspect);
    assert.equal(L.wide, aspect >= 1.3);
    assert.ok(L.H >= .95 && L.H <= 1.3, 'plate depth stays in range');
    if (aspect < 1) assert.ok(L.H >= boardLayout(n, 1.8).H, 'tall canvases get plates at least as deep');
    assert.ok(L.RW > L.LW * 1.4, 'meanings get more width');
    const W = boardLayout(n, aspect, 11);
    assert.ok(W.LW > L.LW && W.RW > W.LW * 1.3 && W.total - L.total < .4, 'a long unbreakable term widens the term column a little');
    assert.equal(boardLayout(n, aspect, 8).LW, L.LW, 'short words keep the default columns');
    for (let i = 1; i < n; i++) {
      const gap = (L.zOf(i) - L.zOf(i - 1)) * Math.sin(L.pitch * Math.PI / 180);
      assert.ok(gap >= (L.hOf(i - 1) + L.hOf(i)) / 2 + .08, 'row spacing on screen covers a plate (frames may just overlap)');
    }
    if (L.wide) {
      assert.ok(L.hOf(0) > L.H && L.hOf(n - 1) < L.H, 'wide: far rows get deeper plates, near rows shallower (perspective)');
      assert.ok(Math.abs([...Array(n).keys()].reduce((a, i) => a + L.hOf(i), 0) / n - L.H) < 1e-9, 'H stays the mean depth');
      assert.ok(boardLayout(n, 1.8).RW >= boardLayout(n, 1.3).RW, 'wider canvases widen the meaning plates');
    } else assert.ok([...Array(n).keys()].every((i) => L.hOf(i) === L.H), 'tall: every row the same depth');
    assert.ok(L.pitch >= 25 && L.pitch <= 65 && Math.abs(L.tilt - (L.pitch - 14) * Math.PI / 180) < 1e-9, 'board pitch inside the engine range, plates lean a little less than the view');
    if (L.wide) assert.ok(L.pitch > boardLayout(n, .8).pitch, 'short wide canvases look down more (less perspective shrink on the far row)');
    assert.ok(L.zOf(0) - L.H > -6.5 && L.zOf(n - 1) < 2, 'rows inside the stage depth');
    assert.ok(Math.abs(L.xl - L.LW / 2 + L.total / 2) < 1e-9 && Math.abs(L.xr + L.RW / 2 - L.total / 2) < 1e-9);
    assert.ok(L.gapR - L.gapL === L.GAP || Math.abs(L.gapR - L.gapL - L.GAP) < 1e-9);
  }
});
