// Unit tests for the pure sort rules. Run: node --test kit/mechanics/sort.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import sort, {rules, TRAVEL_SECONDS} from './sort.mjs';
import {validateGame} from '../schema.mjs';

const level = {
  id: 's1', order: 1, courseSlug: 'c1', courseTitle: 'Course', title: 'Sort test', skill: 'Sorting things', mechanic: 'sort', takeaway: 'x',
  prompt: 'Where does it go?',
  bins: [{id: 'in', label: 'Input'}, {id: 'out', label: 'Output'}, {id: 'store', label: 'Storage'}],
  items: [
    {label: 'Keyboard', answer: 'in', why: 'why keyboard'},
    {label: 'Monitor', note: 'Shows pictures', answer: 'out', why: 'why monitor'},
    {label: 'SSD', answer: 'store', why: 'why ssd'},
    {label: 'Mouse', answer: 'in', why: 'why mouse'},
    {label: 'Printer', note: 'Makes paper copies', answer: 'out', why: 'why printer'},
    {label: 'USB stick', answer: 'store', why: 'why usb'},
    {label: 'Webcam', answer: 'in', why: 'why webcam'},
    {label: 'Speakers', answer: 'out', why: 'why speakers'}
  ]
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const LABEL = {in: 'Input', out: 'Output', store: 'Storage'};

test('plugin shape matches the frozen interface', () => {
  assert.equal(sort.id, 'sort');
  assert.equal(sort.label, 'Sort');
  assert.ok(!sort.stub);
  for (const k of ['init', 'view', 'act', 'tick', 'hint', 'done']) assert.equal(typeof sort.rules[k], 'function');
  assert.equal(typeof sort.createView, 'function');
  const steps = sort.howTo(level);
  assert.ok(steps.length >= 2 && steps.length <= 3);
  assert.match(steps.join(' '), /3 bins/);
});

test('init shape: plain JSON, all items and bins, cursor at 0, untimed by default', () => {
  const s = rules.init(level, {seed: 42});
  assert.deepEqual(clone(s), s);
  assert.equal(s.mechanic, 'sort');
  assert.equal(s.timed, false);
  assert.equal(s.i, 0);
  assert.equal(s.left, TRAVEL_SECONDS);
  assert.equal(s.prompt, 'Where does it go?');
  assert.deepEqual(s.bins, level.bins);
  assert.equal(s.items.length, 8);
  for (const it of s.items) assert.deepEqual(Object.keys(it).sort(), ['answer', 'label', 'note', 'prop', 'why']);
  assert.equal(rules.done(s), false);
});

test('init is deterministic for a seed; shuffle differs by seed but content is preserved', () => {
  const a = rules.init(level, {seed: 42}), b = rules.init(level, {seed: 42});
  assert.deepEqual(a, b);
  const key = (it) => `${it.label}|${it.note}|${it.answer}|${it.why}|${it.prop}`;
  const want = level.items.map((it) => key({note: '', prop: '', ...it})).sort();
  const orders = new Set();
  for (let s = 1; s <= 30; s++) {
    const st = rules.init(level, {seed: s});
    assert.deepEqual(st.items.map(key).sort(), want, `seed ${s} keeps every item intact`);
    assert.deepEqual(st.bins.map((x) => x.id), ['in', 'out', 'store'], 'bin order is stable');
    orders.add(st.items.map((i) => i.label).join(','));
  }
  assert.ok(orders.size > 10, 'different seeds give different orders');
});

test('init does not mutate the level', () => {
  const before = clone(level);
  rules.init(level, {seed: 7});
  assert.deepEqual(level, before);
});

test('view: card from label + note, prompt, bins as choices, progress; no timer when untimed', () => {
  let s = rules.init(level, {seed: 3});
  for (let k = 0; k < s.items.length; k++) {
    const v = rules.view(s), it = s.items[s.i];
    assert.equal(v.card.title, it.label);
    assert.deepEqual(v.card.lines, it.note ? [it.note] : []);
    assert.equal(v.prompt, 'Where does it go?');
    assert.deepEqual(v.choices, [{id: 'in', label: 'Input', done: false}, {id: 'out', label: 'Output', done: false}, {id: 'store', label: 'Storage', done: false}]);
    assert.deepEqual(v.progress, {done: k, total: 8});
    assert.equal(v.timer, null);
    s = rules.act(s, rules.hint(s)).state;
  }
  const end = rules.view(s);
  assert.equal(end.card, null);
  assert.equal(end.prompt, '');
  assert.deepEqual(end.progress, {done: 8, total: 8});
});

test('a full correct run reaches done with only right events, then one done at the end', () => {
  for (const seed of [1, 11, 99]) {
    let s = rules.init(level, {seed});
    const all = [];
    while (!rules.done(s)) {
      const it = s.items[s.i];
      const r = rules.act(s, rules.hint(s));
      assert.equal(r.events[0].type, 'right');
      assert.equal(r.events[0].why, it.why);
      all.push(...r.events); s = r.state;
    }
    assert.equal(all.filter((e) => e.type === 'right').length, 8);
    assert.equal(all.filter((e) => e.type === 'done').length, 1);
    assert.equal(all[all.length - 1].type, 'done');
    assert.deepEqual(all.map((e) => e.type).filter((t) => t !== 'right' && t !== 'done'), []);
  }
});

test('every kind of wrong pick produces a wrong event with correctLabel, why and review', () => {
  const s = rules.init(level, {seed: 5});
  const it = s.items[0];
  const wrongs = level.bins.map((b) => b.id).filter((id) => id !== it.answer);
  assert.equal(wrongs.length, 2);
  for (const w of wrongs) {
    const {state, events} = rules.act(s, w);
    assert.equal(events.length, 1);
    const e = events[0];
    assert.equal(e.type, 'wrong');
    assert.equal(e.correctLabel, LABEL[it.answer]);
    assert.equal(e.why, it.why);
    assert.deepEqual(e.review, {title: it.label, correct: LABEL[it.answer]});
    assert.equal(e.choice, w);
    assert.equal(e.correct, it.answer);
    assert.equal(state.i, 1, 'a miss still moves on to the next item');
    assert.equal(s.i, 0, 'act does not mutate input state');
  }
  // wrong answers for every item, each bin used as the wrong pick somewhere
  let st = rules.init(level, {seed: 8}); const usedWrong = new Set();
  while (!rules.done(st)) {
    const ans = rules.hint(st), w = level.bins.map((b) => b.id).find((id) => id !== ans && !usedWrong.has(id)) || level.bins.find((b) => b.id !== ans).id;
    usedWrong.add(w);
    const r = rules.act(st, w);
    assert.equal(r.events[0].type, 'wrong');
    assert.equal(r.events[0].correctLabel, LABEL[ans]);
    st = r.state;
  }
  assert.equal(usedWrong.size, 3);
});

test('unknown choice or acting after done is a no-op; hint is null at the end', () => {
  const s = rules.init(level, {seed: 5});
  const r = rules.act(s, 'nope');
  assert.equal(r.state, s); assert.deepEqual(r.events, []);
  let st = s;
  while (!rules.done(st)) st = rules.act(st, rules.hint(st)).state;
  assert.deepEqual(rules.act(st, 'in').events, []);
  assert.equal(rules.hint(st), null);
  assert.deepEqual(rules.tick({...st, timed: true}, 30).events, []);
});

test('hint() is always currently correct, also after misses and timeouts', () => {
  let s = rules.init(level, {seed: 21, timed: true});
  let k = 0;
  while (!rules.done(s)) {
    const h = rules.hint(s);
    assert.equal(h, s.items[s.i].answer);
    assert.ok(rules.view(s).choices.some((c) => c.id === h), 'hint is one of the choices');
    const probe = rules.act(s, h);
    assert.equal(probe.events[0].type, 'right');
    // advance in a mixed way: right, wrong, timeout
    if (k % 3 === 0) s = probe.state;
    else if (k % 3 === 1) s = rules.act(s, level.bins.find((b) => b.id !== h).id).state;
    else s = rules.tick(s, TRAVEL_SECONDS + 1).state;
    k++;
  }
});

test('timed: view has a timer, tick counts down, times out with correctLabel/why/review and moves on', () => {
  const s = rules.init(level, {seed: 2, timed: true});
  assert.deepEqual(rules.view(s).timer, {left: TRAVEL_SECONDS, total: TRAVEL_SECONDS});
  let r = rules.tick(s, 5);
  assert.equal(r.events.length, 0);
  assert.equal(r.state.left, TRAVEL_SECONDS - 5);
  assert.equal(rules.view(r.state).timer.left, TRAVEL_SECONDS - 5);
  r = rules.tick(r.state, TRAVEL_SECONDS);
  const e = r.events[0], it = s.items[0];
  assert.equal(e.type, 'timeout');
  assert.equal(e.correctLabel, LABEL[it.answer]);
  assert.equal(e.why, it.why);
  assert.deepEqual(e.review, {title: it.label, correct: LABEL[it.answer]});
  assert.equal(r.state.i, 1);
  assert.equal(r.state.left, TRAVEL_SECONDS, 'timer resets for the next item');
});

test('untimed: tick never changes state; bad dt is ignored', () => {
  const s = rules.init(level, {seed: 2, timed: false});
  assert.equal(rules.tick(s, 999).state, s);
  assert.deepEqual(rules.tick(s, 999).events, []);
  const t = rules.init(level, {seed: 2, timed: true});
  assert.equal(rules.tick(t, NaN).state, t);
  assert.equal(rules.tick(t, -1).state, t);
  assert.equal(rules.tick(t, 0).state, t);
});

test('answering resets the timer; timing out the last item emits timeout then done', () => {
  let s = rules.init(level, {seed: 2, timed: true});
  s = rules.tick(s, 12).state;
  s = rules.act(s, rules.hint(s)).state;
  assert.equal(s.left, TRAVEL_SECONDS);
  while (s.i < s.items.length - 1) s = rules.act(s, rules.hint(s)).state;
  const r = rules.tick(s, TRAVEL_SECONDS + 1);
  assert.deepEqual(r.events.map((e) => e.type), ['timeout', 'done']);
  assert.ok(rules.done(r.state));
});

test('four-bin levels with notes work end to end', () => {
  const l4 = {...level, bins: [...level.bins, {id: 'cpu', label: 'Processing'}], items: [...level.items, {label: 'CPU', note: 'Runs instructions', answer: 'cpu', why: 'why cpu'}]};
  let s = rules.init(l4, {seed: 1});
  assert.equal(rules.view(s).choices.length, 4);
  let rights = 0;
  while (!rules.done(s)) { const r = rules.act(s, rules.hint(s)); rights += r.events.filter((e) => e.type === 'right').length; s = r.state; }
  assert.equal(rights, 9);
});

test('the demo-sort game passes the validator and every sort level plays through', async () => {
  const def = (await import('../../games/demo-sort/game.mjs')).default;
  const res = validateGame(def);
  assert.deepEqual(res.errors, []);
  assert.equal(def.id, 'demo-sort');
  const sorts = def.levels.filter((l) => l.mechanic === 'sort');
  assert.ok(sorts.length >= 4);
  for (const lv of sorts) {
    let s = rules.init(lv, {seed: 3, timed: true});
    while (!rules.done(s)) s = rules.act(s, rules.hint(s)).state;
    assert.equal(rules.view(s).progress.done, lv.items.length);
  }
});

test('an item may carry its own prop id; it survives the shuffle and defaults to an empty string', () => {
  const l = clone(level);
  l.items[0].prop = 'database-cylinder'; l.items[1].prop = 'chip';
  for (const seed of [1, 4, 9]) {
    const s = rules.init(l, {seed});
    const byLabel = Object.fromEntries(s.items.map((it) => [it.label, it.prop]));
    assert.equal(byLabel.Keyboard, 'database-cylinder');
    assert.equal(byLabel.Monitor, 'chip');
    assert.equal(byLabel.SSD, '');
    assert.deepEqual(clone(s), s, 'state stays plain JSON');
  }
  assert.deepEqual(validateGame({id: 'x', title: 'X', tagline: 't', role: 'r', program: 'p', theme: {world: 'office', accent: '#2b7bb9', mood: 'day'}, levels: [l]}).errors.filter((e) => /prop/.test(e.message || String(e))), []);
});

test('demo-sort: every sort item has its own prop, none is a stand-in chip for a device, and the phishing clue is visible text', async () => {
  const def = (await import('../../games/demo-sort/game.mjs')).default;
  const parts = def.levels.find((l) => l.id === 'computer-parts');
  const chips = parts.items.filter((it) => it.prop === 'chip').map((it) => it.label);
  assert.deepEqual(chips.sort(), ['CPU', 'Graphics processor (GPU)'], 'only processors get the chip prop');
  for (const lv of def.levels.filter((l) => l.mechanic === 'sort')) for (const it of lv.items) assert.ok(it.prop, `${lv.id}: ${it.label} has a prop`);
  const text = JSON.stringify(def.levels[0]);
  assert.doesNotMatch(text, /[a-z]I[a-z-]*\.test/, 'no look-alike capital I in an address');
  assert.match(text, /maple-row-helpdesk\.test/, 'the phishing address differs from the real one by a visible word');
});
