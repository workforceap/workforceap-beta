import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../assets/game-lab/firewall-defender-3d/rules.mjs';

const {parseIPv4, inCidr, ruleMatches, evaluatePolicy, judgeEmail, judgeLogin, correctAction, explain, fresh, tick, decide, STAGES} = R;
const clean = (stage) => fresh(stage);
const run = (s, secs, o) => { for (let i = 0; i < Math.round(secs * 10); i++) s = tick(s, 0.1, o); return s; };
const untimed = (s) => tick(s, 0, {timed: false});

// drive a stage perfectly (untimed) using the engine's own `correct`
function playPerfect(stage, mistakes = 0) {
  let s = untimed(clean(stage)), wrong = mistakes;
  for (let guard = 0; guard < 100 && s.status === 'play'; guard++) {
    const it = s.items[0];
    let act = it.correct;
    if (wrong > 0) { act = act === 'allow' ? 'block' : 'allow'; wrong--; }
    s = untimed(decide(s, it.id, act));
  }
  return s;
}

test('parseIPv4 accepts dotted quads and rejects junk', () => {
  assert.equal(parseIPv4('192.0.2.1'), 3221225985);
  for (const bad of ['', '1.2.3', '256.1.1.1', '1.2.3.4.5', 'a.b.c.d', null, undefined, 5, '1.2.3.-4']) assert.equal(parseIPv4(bad), null);
});
test('inCidr handles /24, /32, /0, any and bad input', () => {
  assert.equal(inCidr('203.0.113.50', '203.0.113.0/24'), true);
  assert.equal(inCidr('203.0.114.50', '203.0.113.0/24'), false);
  assert.equal(inCidr('1.2.3.4', '1.2.3.4/32'), true);
  assert.equal(inCidr('1.2.3.5', '1.2.3.4/32'), false);
  assert.equal(inCidr('9.9.9.9', '0.0.0.0/0'), true);
  assert.equal(inCidr('9.9.9.9', 'any'), true);
  assert.equal(inCidr('9.9.9.9', '1.2.3.0/33'), false);
  assert.equal(inCidr('bad', '1.2.3.0/24'), false);
});
test('rule matches by protocol, port and source independently', () => {
  const r = {action: 'allow', proto: 'TCP', port: 443, from: 'any'};
  assert.equal(ruleMatches(r, {proto: 'TCP', port: 443, src: '1.1.1.1'}), true);
  assert.equal(ruleMatches(r, {proto: 'UDP', port: 443, src: '1.1.1.1'}), false, 'protocol matters');
  assert.equal(ruleMatches(r, {proto: 'TCP', port: 80, src: '1.1.1.1'}), false, 'port matters');
  assert.equal(ruleMatches({...r, from: '10.0.0.0/8'}, {proto: 'TCP', port: 443, src: '11.0.0.1'}), false, 'source matters');
  assert.equal(ruleMatches({action: 'deny', proto: 'any', port: 'any', from: 'any'}, {proto: 'UDP', port: 1, src: '1.1.1.1'}), true);
});
test('deny by default: no matching rule blocks, even with an empty policy', () => {
  assert.equal(evaluatePolicy([], {proto: 'TCP', port: 443, src: '1.1.1.1'}).action, 'block');
  assert.equal(evaluatePolicy(R.POLICY_PORTS, {proto: 'TCP', port: 23, src: '1.1.1.1'}).action, 'block');
  assert.equal(evaluatePolicy(R.POLICY_PORTS, {proto: 'TCP', port: 23, src: '1.1.1.1'}).ruleIndex, 2);
});
test('first match wins: a deny range above an allow beats the allow', () => {
  const bad = {proto: 'TCP', port: 443, src: '203.0.113.50'};
  assert.equal(evaluatePolicy(R.POLICY_SOURCES, bad).action, 'block');
  assert.equal(evaluatePolicy(R.POLICY_SOURCES, bad).ruleIndex, 0);
  const flipped = [R.POLICY_SOURCES[2], R.POLICY_SOURCES[0], R.POLICY_SOURCES[3]];
  assert.equal(evaluatePolicy(flipped, bad).action, 'allow', 'order changes the outcome');
});
test('SSH is allowed from the office range only', () => {
  assert.equal(evaluatePolicy(R.POLICY_SOURCES, {proto: 'TCP', port: 22, src: '192.0.2.15'}).action, 'allow');
  assert.equal(evaluatePolicy(R.POLICY_SOURCES, {proto: 'TCP', port: 22, src: '198.51.100.77'}).action, 'block');
});
test('judgeEmail: lookalike domain, mismatched link, urgency alone, clean mail', () => {
  const base = {fromDomain: 'acme.test', expectDomain: 'acme.test', linkShown: 'acme.test/x', linkHost: 'acme.test', urgent: false};
  assert.deepEqual(judgeEmail(base).flags, []);
  assert.deepEqual(judgeEmail({...base, fromDomain: 'acrne.test'}).flags, ['sender-domain']);
  assert.deepEqual(judgeEmail({...base, linkHost: 'evil.test'}).flags, ['link-target']);
  assert.equal(judgeEmail({...base, urgent: true}).phish, false, 'urgency alone is not proof');
  assert.equal(judgeEmail({...base, urgent: true}).urgentOnly, true);
  assert.equal(judgeEmail({...base, linkShown: '', linkHost: ''}).phish, false, 'no link is fine');
  assert.deepEqual(judgeEmail({...base, fromDomain: 'x.test', linkHost: 'evil.test'}).flags, ['sender-domain', 'link-target']);
});
test('judgeLogin: valid-credential logins can still be compromised', () => {
  const ok = {usualCountry: 'US', country: 'US', failedBefore: 0, success: true};
  assert.equal(judgeLogin(ok).compromised, false);
  assert.equal(judgeLogin({...ok, country: 'XX'}).compromised, true);
  assert.equal(judgeLogin({...ok, failedBefore: 40}).compromised, true);
  assert.equal(judgeLogin({...ok, country: 'XX', success: false}).compromised, false, 'failed login is not an account takeover');
});
test('correctAction covers packets, emails and logins; unknown kinds throw', () => {
  assert.equal(correctAction({kind: 'packet', proto: 'TCP', port: 443, src: '1.1.1.1'}, R.POLICY_PORTS), 'allow');
  assert.equal(correctAction({kind: 'email', fromDomain: 'a.test', expectDomain: 'b.test'}, null), 'block');
  assert.equal(correctAction({kind: 'login', usualCountry: 'US', country: 'XX', failedBefore: 0, success: true}, null), 'reset');
  assert.throws(() => correctAction({kind: 'nope'}, null));
});
test('explanations are honest about each concept', () => {
  const pol = R.POLICY_SOURCES;
  assert.match(explain({kind: 'packet', proto: 'TCP', port: 23, src: '198.51.100.9'}, pol), /default deny/);
  assert.match(explain({kind: 'packet', proto: 'TCP', port: 443, src: '203.0.113.50'}, pol), /first matching rule wins/);
  assert.match(explain(STAGES[2].threats[0], null), /Urgency alone is not proof/);
  assert.match(explain(STAGES[2].threats[4], null), /lookalike/);
  assert.match(explain(STAGES[2].threats[2], null), /really goes to/);
  assert.match(explain(STAGES[3].threats[4], pol), /blocking the port would not remove/);
});
test('every stage item has exactly the intended answer and the boss needs all three actions', () => {
  for (let i = 0; i < STAGES.length; i++) {
    const st = STAGES[i];
    const acts = st.threats.map((t) => correctAction(t, st.policy || R.POLICY_SOURCES));
    assert.ok(acts.includes('allow') && acts.includes('block'), `stage ${i} needs both allow and block`);
    if (i === 3) assert.equal(acts.filter((a) => a === 'reset').length, 2);
    else assert.ok(!acts.includes('reset'));
    assert.ok(st.threats.length >= 6);
  }
});
test('fresh validates the stage and starts with 3 lives', () => {
  assert.equal(fresh(0).hp, 3);
  for (const bad of [-1, 4, 1.5, '0', NaN]) assert.throws(() => fresh(bad));
});
test('tick moves threats, spawns on schedule and caps in-flight', () => {
  let s = fresh(0);
  s = run(s, 0.7);
  assert.equal(s.items.length, 1);
  const p0 = s.items[0].p;
  s = tick(s, 0.1);
  assert.ok(s.items[0].p > p0);
  for (let i = 0; i < 80; i++) s = tick(s, 0.1);
  assert.ok(s.items.length <= R.MAX_IN_FLIGHT);
});
test('pause equals dt 0: nothing moves, nothing spawns', () => {
  let s = run(fresh(0), 0.8);
  const before = JSON.stringify(s);
  assert.equal(JSON.stringify(tick(s, 0)), before.replace(/"events":\[[^\]]*\]/, '"events":[]'));
});
test('reduced speed slows threats by the same factor and does not change answers', () => {
  let a = fresh(0), b = fresh(0);
  for (let i = 0; i < 30; i++) { a = tick(a, 0.1, {speed: 1}); b = tick(b, 0.1, {speed: R.REDUCED_SPEED}); }
  assert.ok(a.items[0].p > b.items[0].p);
  assert.equal(a.items[0].correct, b.items[0].correct);
});
test('large dt is clamped so a background tab cannot skip decisions', () => {
  let s = run(fresh(0), 0.8);
  const after = tick(s, 999);
  assert.equal(after.hp, 3);
});
test('a threat that arrives undecided costs a life with a reason, and is counted', () => {
  let s = run(fresh(0), 0.8);
  const first = s.items[0];
  for (let i = 0; i < 160 && s.hp === 3; i++) s = tick(s, 0.1);
  assert.equal(s.hp, 2);
  assert.equal(s.stats.missed, 1);
  assert.match(s.log.at(-1), /^Too slow/);
  assert.equal(first.correct, 'allow');
});
test('correct decision removes the threat without cost', () => {
  let s = untimed(fresh(0));
  const it = s.items[0];
  s = decide(s, it.id, it.correct);
  assert.equal(s.hp, 3); assert.equal(s.stats.correct, 1);
  assert.ok(!s.items.find((x) => x.id === it.id));
  assert.equal(s.events[0].good, true);
});
test('wrong decision costs one life, gives a clear reason, and logs once', () => {
  let s = untimed(fresh(0));
  const it = s.items[0];
  const logBefore = s.log.length;
  s = decide(s, it.id, it.correct === 'allow' ? 'block' : 'allow');
  assert.equal(s.hp, 2); assert.equal(s.errors, 1);
  assert.match(s.events[0].message, /^Wrong, -1 life\./);
  assert.equal(s.log.length, logBefore + 1);
});
test('allowing bad traffic and blocking good traffic are tracked separately', () => {
  let s = untimed(fresh(0));
  const bad = s.items.find((i) => i.correct === 'block'), good = s.items.find((i) => i.correct === 'allow');
  s = decide(s, bad.id, 'allow'); assert.equal(s.stats.badIn, 1);
  s = decide(s, good.id, 'block'); assert.equal(s.stats.goodBlocked, 1);
});
test('boss: blocking a compromised login is wrong; reset is right; resetting a normal login is wrong', () => {
  let s = fresh(3); s = untimed(s);
  const forceItem = (data) => { const t = structuredClone(s); t.items = [{id: 99, idx: 0, lane: 0, p: .2, data, label: R.labelFor(data), correct: correctAction(data, R.POLICY_SOURCES)}]; return t; };
  const stolen = STAGES[3].threats[4], normal = STAGES[3].threats[2];
  const a = decide(forceItem(stolen), 99, 'block'); assert.equal(a.hp, 2); assert.match(a.events[0].message, /should be handled with an account reset/);
  const b = decide(forceItem(stolen), 99, 'reset'); assert.equal(b.hp, 3); assert.equal(b.stats.resets, 1);
  const c = decide(forceItem(normal), 99, 'reset'); assert.equal(c.hp, 2); assert.equal(c.stats.wrongReset, 1);
});
test('decide ignores unknown ids, unknown actions and finished games', () => {
  const s = untimed(fresh(0));
  assert.equal(decide(s, 12345, 'allow').hp, 3);
  assert.deepEqual(decide(s, s.items[0].id, '__proto__').items, s.items);
  const done = {...s, status: 'lose'};
  assert.equal(decide(done, s.items[0].id, 'allow').hp, 3);
});
test('three wrong calls lose the stage, and retry (fresh) starts clean', () => {
  let s = untimed(fresh(0));
  for (let i = 0; i < 3; i++) { const it = s.items[0]; s = untimed(decide(s, it.id, it.correct === 'allow' ? 'block' : 'allow')); }
  assert.equal(s.status, 'lose'); assert.equal(s.hp, 0);
  assert.deepEqual(fresh(0), fresh(0));
  assert.equal(fresh(0).hp, 3);
});
test('perfect play wins every stage with 3 stars and all goals done', () => {
  for (let i = 0; i < STAGES.length; i++) {
    const s = playPerfect(i);
    assert.equal(s.status, 'win', `stage ${i}`); assert.equal(R.stars(s), 3);
    assert.equal(s.handled, s.total);
    assert.ok(R.goals(s).every((g) => g.done), `goals stage ${i}`);
    assert.equal(R.xpFor(s), s.total * 10);
  }
});
test('stars drop by errors and floor at 1; two mistakes still win', () => {
  assert.equal(R.stars(playPerfect(0, 1)), 2);
  const s = playPerfect(0, 2); assert.equal(s.status, 'win'); assert.equal(R.stars(s), 1);
  assert.equal(playPerfect(0, 3).status, 'lose');
});
test('cycleTarget and mostUrgent pick by arrival order', () => {
  let s = untimed(fresh(0));
  s.items[0].p = .2; s.items[1].p = .6; s.items[2].p = .4;
  assert.equal(R.mostUrgent(s), s.items[1].id);
  assert.equal(R.cycleTarget(s, s.items[1].id, 1), s.items[2].id);
  assert.equal(R.cycleTarget(s, s.items[1].id, -1), s.items[0].id);
  assert.equal(R.cycleTarget({items: []}, null), null);
  assert.equal(R.mostUrgent({items: []}), null);
});
test('input state is never mutated', () => {
  const s = fresh(0); const snap = JSON.stringify(s);
  tick(s, 5); decide(s, 1, 'allow');
  assert.equal(JSON.stringify(s), snap);
});
test('save: valid empty and played saves pass; corrupt, polluted and out-of-range saves reset', () => {
  assert.equal(R.validateSave(R.emptySave()), true);
  assert.equal(R.SAVE_KEY, 'wap-practice-3d-security-save-v1');
  assert.notEqual(R.SAVE_KEY, 'wap-practice-3d-save-v1');
  assert.deepEqual(R.loadSave('{').best, [0, 0, 0, 0]);
  assert.deepEqual(R.loadSave(null).best, [0, 0, 0, 0]);
  assert.equal(R.validateSave({version: 1, best: [4, 0, 0, 0], evidence: [[], [], [], []]}), false);
  assert.equal(R.validateSave({version: 1, best: [0, 0, 0], evidence: [[], [], []]}), false, 'old 3-stage shape');
  assert.equal(R.validateSave({version: 1, best: [1.5, 0, 0, 0], evidence: [[], [], [], []]}), false);
  assert.equal(R.validateSave({version: 1, best: [0, 0, 0, 0], evidence: [['x'], [], [], []]}), false, 'evidence without a win');
  assert.equal(R.validateSave({version: 1, best: [1, 0, 0, 0], evidence: [[5], [], [], []]}), false);
  assert.equal(R.validateSave({version: 1, best: [1, 0, 0, 0], evidence: [['x'.repeat(601)], [], [], []]}), false);
  assert.equal(R.validateSave([]), false); assert.equal(R.validateSave('x'), false); assert.equal(R.validateSave(null), false);
});
test('save: prototype pollution payloads are rejected and do not pollute', () => {
  const evil = '{"version":1,"best":[0,0,0,0],"evidence":[[],[],[],[]],"__proto__":{"admin":true}}';
  const parsed = JSON.parse(evil);
  assert.equal(R.validateSave(parsed), false);
  assert.deepEqual(R.loadSave(evil).best, [0, 0, 0, 0]);
  assert.equal(({}).admin, undefined);
  const viaCtor = JSON.parse('{"version":1,"best":[0,0,0,0],"evidence":[[],[],[],[]],"constructor":{"prototype":{"x":1}}}');
  assert.equal(R.validateSave(viaCtor), false);
  assert.equal(R.validateSave(Object.create({version: 1})), false);
  assert.equal(R.validateSave(Object.assign(Object.create(null), R.emptySave())), false, 'null-prototype objects rejected');
});
test('record keeps the best run, ignores non-wins, and caps stored text', () => {
  const win = (errors, log) => ({...fresh(0), status: 'win', errors, log});
  let save = R.record(R.emptySave(), {...fresh(0), status: 'lose'});
  assert.equal(save.best[0], 0);
  save = R.record(save, win(1, ['a'])); assert.equal(save.best[0], 2);
  save = R.record(save, win(2, ['b'])); assert.equal(save.best[0], 2, 'worse run does not replace');
  save = R.record(save, win(0, ['c'])); assert.equal(save.best[0], 3);
  assert.deepEqual(save.evidence[0], ['c']);
  assert.equal(R.score(save), 300);
  save = R.record(save, win(0, Array(200).fill('y'.repeat(900))));
  assert.equal(R.validateSave(save), true);
});
test('META keeps the pilot boundary', () => {
  assert.equal(R.META.providerLessonId, null); assert.equal(R.META.credit, false); assert.equal(R.META.reviewed, false);
  assert.ok(Object.isFrozen(R.META));
});
test('evidence lists the facts a player judges by, and actionsFor offers reset only on the boss', () => {
  assert.deepEqual(R.evidence(STAGES[0].threats[0]).map((x) => x[0]), ['Protocol', 'Port', 'Source']);
  const mail = R.evidence(STAGES[2].threats[2]); assert.ok(mail.some(([k, v]) => k === 'Link really goes to' && v === 'evil.test'));
  assert.ok(R.evidence(STAGES[3].threats[4]).some(([k]) => k === 'Usual country'));
  assert.deepEqual(R.evidence({kind: 'x'}), []);
  assert.deepEqual(R.actionsFor(0), ['allow', 'block']); assert.deepEqual(R.actionsFor(3), ['allow', 'block', 'reset']);
});
test('an empty lane brings the next threat within about 1.2 seconds (no dead air)', () => {
  let s = run(fresh(0), 0.8); const first = s.items[0];
  s = decide(s, first.id, first.correct);
  s = run(s, 1.4);
  assert.equal(s.spawned, 2);
  assert.equal(s.items.length, 1);
});
test('threats are never spawned out of script order', () => {
  let s = fresh(1); const seen = [];
  for (let i = 0; i < 600 && s.status === 'play'; i++) { s = tick(s, .1); for (const it of s.items) if (!seen.includes(it.idx)) seen.push(it.idx); if (s.items[0]) s = decide(s, s.items[0].id, s.items[0].correct); }
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
  assert.equal(s.status, 'win');
});
