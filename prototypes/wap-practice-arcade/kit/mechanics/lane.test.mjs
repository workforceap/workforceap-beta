// Unit tests for the pure lane rules. Run: node --test kit/mechanics/lane.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import lane, {rules, TRAVEL_SECONDS, LANES, STEER_PROMPT, HOLD_LIMIT, approachProgress, celebrate, lossShake, holdOver, signText, gateBlocksSpawn, SIGN, signFontEstimate, evenSignFont} from './lane.mjs';

const level = {
  id: 't1', order: 1, courseSlug: 'c1', courseTitle: 'Course', title: 'Test', skill: 'Testing', mechanic: 'lane', takeaway: 'x',
  questions: [
    {prompt: 'Q-A', options: ['A0', 'A1', 'A2'], answer: 0, why: 'why A'},
    {prompt: 'Q-B', options: ['B0', 'B1', 'B2'], answer: 1, why: 'why B'},
    {prompt: 'Q-C', options: ['C0', 'C1', 'C2'], answer: 2, why: 'why C'},
    {prompt: 'Q-D', options: ['D0', 'D1', 'D2'], answer: 0, why: 'why D'},
    {prompt: 'Q-E', options: ['E0', 'E1', 'E2'], answer: 1, why: 'why E'},
    {prompt: 'Q-F', options: ['F0', 'F1', 'F2'], answer: 2, why: 'why F'}
  ]
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const byPrompt = Object.fromEntries(level.questions.map((q) => [q.prompt, q]));
const rightText = (q) => q.options[q.answer];

test('plugin shape matches the frozen interface', () => {
  assert.equal(lane.id, 'lane');
  assert.equal(lane.label, 'Steer');
  assert.ok(!lane.stub);
  for (const k of ['init', 'view', 'act', 'tick', 'hint', 'done']) assert.equal(typeof lane.rules[k], 'function');
  assert.equal(typeof lane.createView, 'function');
  const steps = lane.howTo(level);
  assert.ok(steps.length >= 2 && steps.length <= 3);
  for (const s of steps) assert.ok(s.length <= 90, `short step: ${s}`);
});

test('init shape: plain JSON, deterministic, all questions and options preserved', () => {
  const a = rules.init(level, {seed: 42, timed: false}), b = rules.init(level, {seed: 42, timed: false});
  assert.deepEqual(a, b);
  assert.deepEqual(clone(a), a);
  assert.equal(a.mechanic, 'lane');
  assert.equal(a.i, 0);
  assert.equal(a.timed, false);
  assert.equal(a.left, TRAVEL_SECONDS);
  assert.equal(a.questions.length, 6);
  assert.deepEqual(a.questions.map((q) => q.prompt).sort(), level.questions.map((q) => q.prompt).sort());
  for (const q of a.questions) {
    const src = byPrompt[q.prompt];
    assert.deepEqual([...q.options].sort(), [...src.options].sort(), 'options preserved');
    assert.equal(q.options[q.answer], rightText(src), 'answer follows its option through the shuffle');
    assert.equal(q.why, src.why);
  }
});

test('init does not mutate the level', () => {
  const before = clone(level);
  rules.init(level, {seed: 7, timed: true});
  assert.deepEqual(level, before);
});

test('shuffle differs by seed (question order and option order) but content is preserved', () => {
  const qOrders = new Set(), optOrders = new Set();
  for (let s = 1; s <= 40; s++) {
    const st = rules.init(level, {seed: s});
    qOrders.add(st.questions.map((q) => q.prompt).join('|'));
    const qa = st.questions.find((q) => q.prompt === 'Q-A');
    optOrders.add(qa.options.join('|'));
    for (const q of st.questions) assert.equal(q.options[q.answer], rightText(byPrompt[q.prompt]));
  }
  assert.ok(qOrders.size > 10, 'different seeds give different question orders');
  assert.ok(optOrders.size >= 4, 'different seeds give different option orders');
});

test('the right lane never repeats three times in a row, and it varies', () => {
  for (let s = 1; s <= 200; s++) {
    const ans = rules.init(level, {seed: s}).questions.map((q) => q.answer);
    for (let i = 2; i < ans.length; i++) assert.ok(!(ans[i] === ans[i - 1] && ans[i] === ans[i - 2]), `seed ${s}: ${ans}`);
    assert.ok(new Set(ans).size >= 2);
  }
});

test('view: question is the card, three lane choices in lane order, progress, no timer when untimed', () => {
  const s = rules.init(level, {seed: 3});
  const v = rules.view(s), q = s.questions[0];
  assert.deepEqual(v.card, {title: q.prompt, lines: []});
  assert.equal(v.prompt, STEER_PROMPT);
  assert.deepEqual(v.choices, LANES.map((id, k) => ({id, label: q.options[k], done: false})));
  assert.deepEqual(v.choices.map((c) => c.id), ['left', 'middle', 'right']);
  assert.deepEqual(v.progress, {done: 0, total: 6});
  assert.equal(v.timer, null);
});

test('a full correct run reaches done with only right events, then done once', () => {
  let s = rules.init(level, {seed: 11});
  const all = [];
  while (!rules.done(s)) {
    const h = rules.hint(s);
    assert.ok(LANES.includes(h));
    const r = rules.act(s, h); all.push(...r.events); s = r.state;
  }
  assert.equal(all.filter((e) => e.type === 'right').length, 6);
  assert.equal(all.filter((e) => e.type === 'wrong' || e.type === 'timeout').length, 0);
  assert.equal(all.filter((e) => e.type === 'done').length, 1);
  assert.equal(all[all.length - 1].type, 'done');
  for (const e of all.filter((x) => x.type === 'right')) assert.ok(e.why && e.why.startsWith('why'));
  assert.deepEqual(rules.view(s).progress, {done: 6, total: 6});
  assert.equal(rules.view(s).card, null);
  assert.equal(rules.hint(s), null);
});

test('right event carries why and the lane ids; act does not mutate input', () => {
  const s = rules.init(level, {seed: 5});
  const h = rules.hint(s);
  const {state, events} = rules.act(s, h);
  assert.deepEqual(events[0], {type: 'right', why: s.questions[0].why, index: 0, choice: h, correct: h});
  assert.equal(state.i, 1);
  assert.equal(s.i, 0);
});

test('each kind of wrong pick (both wrong lanes) gives a wrong event with correctLabel, why and review', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = rules.init(level, {seed});
    const q = s.questions[0], h = rules.hint(s);
    const wrongs = LANES.filter((l) => l !== h);
    assert.equal(wrongs.length, 2);
    for (const w of wrongs) {
      const {state, events} = rules.act(s, w);
      const e = events[0];
      assert.equal(e.type, 'wrong');
      assert.equal(e.correctLabel, q.options[q.answer]);
      assert.equal(e.correctLabel, rightText(byPrompt[q.prompt]));
      assert.equal(e.why, q.why);
      assert.deepEqual(e.review, {title: q.prompt, correct: e.correctLabel});
      assert.equal(e.choice, w);
      assert.equal(e.correct, h);
      assert.equal(state.i, 1, 'a wrong pick moves on to the next question');
    }
  }
});

test('unknown choice or acting after done is a no-op', () => {
  const s = rules.init(level, {seed: 5});
  for (const bad of ['nope', 0, 1, '1', null, undefined]) {
    const r = rules.act(s, bad);
    assert.equal(r.state, s); assert.deepEqual(r.events, []);
  }
  let st = s;
  while (!rules.done(st)) st = rules.act(st, rules.hint(st)).state;
  assert.deepEqual(rules.act(st, 'left').events, []);
  assert.deepEqual(rules.tick({...st, timed: true}, 30).events, []);
});

test('timed: view has a timer, tick counts down, timeout gives the review and moves on', () => {
  const s = rules.init(level, {seed: 2, timed: true});
  assert.deepEqual(rules.view(s).timer, {left: TRAVEL_SECONDS, total: TRAVEL_SECONDS});
  let r = rules.tick(s, 5);
  assert.equal(r.events.length, 0);
  assert.equal(r.state.left, TRAVEL_SECONDS - 5);
  assert.equal(rules.view(r.state).timer.left, TRAVEL_SECONDS - 5);
  r = rules.tick(r.state, TRAVEL_SECONDS);
  const e = r.events[0], q = s.questions[0];
  assert.equal(e.type, 'timeout');
  assert.equal(e.correctLabel, q.options[q.answer]);
  assert.equal(e.why, q.why);
  assert.deepEqual(e.review, {title: q.prompt, correct: e.correctLabel});
  assert.equal(r.state.i, 1);
  assert.equal(r.state.left, TRAVEL_SECONDS, 'timer resets for the next gate');
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

test('answering resets the timer; timing out the last question emits done', () => {
  let s = rules.init(level, {seed: 9, timed: true});
  s = rules.tick(s, 12).state;
  s = rules.act(s, rules.hint(s)).state;
  assert.equal(s.left, TRAVEL_SECONDS);
  for (let i = 0; i < 4; i++) s = rules.act(s, rules.hint(s)).state;
  const r = rules.tick(s, TRAVEL_SECONDS + 1);
  assert.deepEqual(r.events.map((e) => e.type), ['timeout', 'done']);
  assert.ok(rules.done(r.state));
});

test('hint() is always currently correct, through a mixed run of right, wrong and timeouts', () => {
  for (let seed = 1; seed <= 25; seed++) {
    let s = rules.init(level, {seed, timed: true});
    let step = 0;
    while (!rules.done(s)) {
      const h = rules.hint(s);
      // the hint must be judged right if played right now
      assert.equal(rules.act(s, h).events[0].type, 'right');
      const mode = (seed + step) % 3;
      if (mode === 0) s = rules.act(s, h).state;
      else if (mode === 1) s = rules.act(s, LANES.find((l) => l !== h)).state;
      else s = rules.tick(rules.tick(s, 7).state, TRAVEL_SECONDS).state;
      step++;
    }
    assert.equal(rules.hint(s), null);
  }
});

test('the prompt under the card is one short constant, not the question', () => {
  assert.equal(STEER_PROMPT, 'Pick a door');
  const s = rules.init(level, {seed: 4});
  const seen = new Set();
  for (let i = 0; i < 6; i++) { const v = rules.view(s.i === i ? s : {...s, i}); seen.add(v.prompt); assert.ok(v.prompt.length <= 24); assert.notEqual(v.prompt, v.card.title); }
  assert.equal(seen.size, 1);
  assert.equal(rules.view({...s, i: 6}).prompt, '', 'no prompt once the run is over');
});

test('approachProgress: 0 on arrival, 1 at timeout, rising and tolerant of bad input', () => {
  assert.equal(approachProgress(TRAVEL_SECONDS, TRAVEL_SECONDS), 0);
  assert.equal(approachProgress(0, TRAVEL_SECONDS), 1);
  let prev = -1;
  for (let left = TRAVEL_SECONDS; left >= 0; left -= .5) { const p = approachProgress(left, TRAVEL_SECONDS); assert.ok(p >= prev && p >= 0 && p <= 1); prev = p; }
  assert.equal(approachProgress(-3, TRAVEL_SECONDS), 1);
  assert.equal(approachProgress(99, TRAVEL_SECONDS), 0);
  for (const bad of [NaN, undefined, null]) { const p = approachProgress(bad, TRAVEL_SECONDS); assert.ok(p >= 0 && p <= 1); }
  assert.ok(approachProgress(5, 0) >= 0, 'a missing travel time falls back to the default');
  // the end is tighter than a straight line: the last quarter of the clock moves the gate more than the first quarter
  assert.ok(approachProgress(5, 20) - approachProgress(10, 20) > approachProgress(15, 20) - approachProgress(20, 20));
});

test('celebrate grows with the streak, levels off, and only a streak of 3 or more gets the aura', () => {
  const c = [1, 2, 3, 4, 5, 6, 7, 20].map(celebrate);
  for (let i = 1; i < 6; i++) { assert.ok(c[i].chunks > c[i - 1].chunks); assert.ok(c[i].flash > c[i - 1].flash); assert.ok(c[i].ring > c[i - 1].ring); }
  assert.deepEqual(c[5], c[6]); assert.deepEqual(c[5], c[7]);
  assert.equal(c[0].aura, 0); assert.equal(c[1].aura, 0); assert.ok(c[2].aura > 0); assert.ok(c[5].aura <= 1);
  assert.ok(c[5].chunks <= 80, 'fits the particle pool');
  for (const bad of [0, -1, NaN, undefined, 'x']) assert.equal(celebrate(bad).level, 1);
});

test('lossShake: a lost streak shakes harder, within limits', () => {
  assert.equal(lossShake(0), .7);
  assert.ok(lossShake(3) > lossShake(1));
  assert.equal(lossShake(6), lossShake(50));
  assert.equal(lossShake(NaN), .7);
});

test('holdOver: a wrong pick holds until resume (after a beat), with a long safety limit', () => {
  assert.equal(holdOver(0, false), false);
  assert.equal(holdOver(3, false), false, 'never leaves by itself within the limit');
  assert.equal(holdOver(.2, true), false, 'resume before the right door has shown: wait a beat');
  assert.equal(holdOver(.5, true), true);
  assert.equal(holdOver(HOLD_LIMIT + 1, false), true, 'safety net');
  assert.equal(holdOver(NaN, true), false);
});

test('signText breaks long single tokens after a hyphen, slash or dot and leaves short ones alone', () => {
  assert.equal(signText('00-1A-2B-3C-4D-5E'), '00-1A-2B-\n3C-4D-5E');
  assert.equal(signText('portal.example'), 'portal.\nexample');
  for (const t of ['192.0.2.15', 'DNS', 'Password123', 'LAN', '']) assert.equal(signText(t), t);
  assert.equal(signText(undefined), '');
  assert.equal(signText(null), '');
  // never loses a character
  for (const t of ['a-b-c-d-e-f-g-h', 'one/two/three/four', 'www.longname.example']) assert.equal(signText(t).replace('\n', ''), t);
});

test('signText splits phrases into at most three lines, keeps every word in order, and avoids a lone tiny word', () => {
  const phrases = [];
  for (const lv of ['safe-habits', 'first-step']) phrases.push(...[
    'End it in Task Manager', 'Check the power cable', 'Turn off the monitor', 'Heat sink and fan', 'Close it, tell IT', 'Verify, then reset it',
    'Plug it in to look', 'They fix security gaps', 'Reset laptop Wi-Fi', 'Share your password', 'A firewall', 'Buy more RAM']);
  for (const t of phrases) {
    const out = signText(t), lines = out.split('\n');
    assert.ok(lines.length >= 1 && lines.length <= 3, t);
    assert.equal(lines.join(' '), t, 'same words, same order');
    if (lines.length > 1) for (const l of lines) assert.ok(l.length >= 3, `no lone tiny word: ${JSON.stringify(out)}`);
  }
  for (const t of ['LAN', 'A name', 'Router']) assert.equal(signText(t), t, 'short text is left as it is');
  assert.equal(signText('  Lock   the screen '), 'Lock the\nscreen', 'whitespace is normalised');
  assert.equal(signText('Buy more RAM'), 'Buy more\nRAM', 'two lines when that allows much bigger letters');
});

test('every demo-lane option fits a three-line door sign (22 characters at most per option)', async () => {
  const game = (await import('../../games/demo-lane/game.mjs')).default;
  for (const lv of game.levels.filter((l) => l.mechanic === 'lane')) for (const q of lv.questions) {
    assert.equal(q.options.length, 3);
    for (const o of q.options) assert.ok(o.length <= 22, o);
  }
});

test('every demo-lane door sign gets letters at or above the font floor (about 11 CSS px at 390 px)', async () => {
  const game = (await import('../../games/demo-lane/game.mjs')).default;
  for (const lv of game.levels.filter((l) => l.mechanic === 'lane')) for (const q of lv.questions) {
    const sizes = q.options.map((o) => signFontEstimate(signText(o)));
    for (let k = 0; k < sizes.length; k++) assert.ok(sizes[k] >= SIGN.minFont, `${q.options[k]}: ${sizes[k].toFixed(3)}`);
    assert.ok(evenSignFont(sizes) >= SIGN.minFont);
  }
  assert.ok(SIGN.textW < SIGN.w && SIGN.textH < SIGN.h && SIGN.minFont < SIGN.maxFont);
});

test('evenSignFont: the smallest positive size, never below the floor, 0 when nothing is known', () => {
  assert.equal(evenSignFont([.3, .22, .4]), .22);
  assert.equal(evenSignFont([.3, .1, .4], .19), .19);
  assert.equal(evenSignFont([.3, 0, NaN, undefined, .25]), .25);
  assert.equal(evenSignFont([]), 0);
  assert.equal(evenSignFont(undefined), 0);
});

test('signText never leaves a lone tiny word on its own line', () => {
  for (const t of ['Restart it', 'A modem', 'The internet', 'Turn it off', 'Fix it now please']) {
    const lines = signText(t).split('\n');
    if (lines.length > 1) for (const l of lines) assert.ok(l.length >= 4, JSON.stringify(signText(t)));
  }
  assert.equal(signText('The internet'), 'The internet');
});

test('gateBlocksSpawn: a held gate always blocks; a right answer frees the next gate once it has slid past', () => {
  assert.equal(gateBlocksSpawn('approach', null, false, 0), false);
  assert.equal(gateBlocksSpawn('idle', null, false, 0), false);
  for (const t of [0, .3, 5, 99]) assert.equal(gateBlocksSpawn('held', 'wrong', true, t), true, 'wrong gate held');
  assert.equal(gateBlocksSpawn('resolve', 'right', false, 9), true, 'not yet at the runner');
  assert.equal(gateBlocksSpawn('resolve', 'right', true, .2), true);
  assert.equal(gateBlocksSpawn('resolve', 'right', true, .31), false, 'early rise after a right answer');
  assert.equal(gateBlocksSpawn('resolve', 'right', true, .4, true), true, 'reduced motion waits longer');
  assert.equal(gateBlocksSpawn('resolve', 'right', true, .51, true), false);
  assert.equal(gateBlocksSpawn('resolve', 'wrong', true, 9), true);
  assert.equal(gateBlocksSpawn('resolve', 'timeout', true, 9), true);
});
