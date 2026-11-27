import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGame, LIMITS } from './schema.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const W = 'Because the ticket describes a clear and specific reason to act.';

function gate() {
  const items = [];
  const ans = ['fix', 'escalate', 'fix', 'escalate', 'close', 'fix'];
  ans.forEach((a, i) => items.push({ title: `Ticket ${i + 1}`, facts: [`Fact for ticket ${i + 1}`], answer: a, why: `${W} (${i})` }));
  return {
    id: 'gate-l', order: 1, courseSlug: 'c1', courseTitle: 'Course One', title: 'Triage tickets', skill: 'Choosing the right next step',
    mechanic: 'gate', takeaway: 'Match the action to the problem.', prompt: 'What should you do with this ticket?',
    actions: [{ id: 'fix', label: 'Fix it' }, { id: 'escalate', label: 'Escalate' }, { id: 'close', label: 'Close it' }], items,
  };
}
function sort() {
  const bins = [{ id: 'a', label: 'Hardware' }, { id: 'b', label: 'Software' }, { id: 'c', label: 'Network' }];
  const items = [];
  for (let i = 0; i < 9; i++) items.push({ label: `Thing ${i}`, note: 'A short note', answer: bins[i % 3].id, why: `${W} ${i}` });
  return { id: 'sort-l', order: 2, courseSlug: 'c2', courseTitle: 'Course Two', title: 'Sort the parts', skill: 'Grouping parts by type', mechanic: 'sort', takeaway: 'Group by function.', prompt: 'Where does it go?', bins, items };
}
function order() {
  const rd = (n) => ({ prompt: `Put round ${n} in order`, steps: ['Step one', 'Step two', 'Step three', 'Step four'], why: `${W} Order matters here.` });
  return { id: 'order-l', order: 3, courseSlug: 'c3', courseTitle: 'Course Three', title: 'Put steps in order', skill: 'Sequencing a process', mechanic: 'order', takeaway: 'Follow the sequence.', rounds: [rd(1), rd(2)] };
}
function lane() {
  const qs = [];
  for (let i = 0; i < 6; i++) qs.push({ prompt: `Question ${i}?`, options: ['Alpha', 'Beta', 'Gamma'], answer: i % 3, why: `${W} Q${i}` });
  return { id: 'lane-l', order: 4, courseSlug: 'c4', courseTitle: 'Course Four', title: 'Steer to answers', skill: 'Quick recall', mechanic: 'lane', takeaway: 'Recall quickly.', questions: qs };
}
function match() {
  const rd = (n) => ({ prompt: `Connect round ${n}`, pairs: [['One', 'First thing'], ['Two', 'Second thing'], ['Three', 'Third thing'], ['Four', 'Fourth thing']], why: `${W} They belong together.` });
  return { id: 'match-l', order: 5, courseSlug: 'c5', courseTitle: 'Course Five', title: 'Connect the pairs', skill: 'Pairing terms', mechanic: 'match', takeaway: 'Pair terms with meanings.', rounds: [rd(1), rd(2)] };
}
function game(levels = [gate(), sort(), order(), lane(), match()]) {
  return { id: 'sample-game', title: 'Sample Game', tagline: 'A tiny test tagline', role: 'You are a help desk trainee.', program: 'Sample Program', theme: { world: 'office', accent: '#ad2c4d', mood: 'day' }, levels };
}

test('valid sample for each mechanic', () => {
  for (const f of [gate, sort, order, lane, match]) {
    const g = game([{ ...f(), order: 1 }, { ...f(), id: 'second', order: 2 }]);
    const r = validateGame(g);
    assert.deepEqual(r.errors, [], f.name);
    assert.equal(r.ok, true);
  }
  const r = validateGame(game());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.warnings, []);
});

test('LIMITS exported', () => {
  assert.equal(LIMITS.gate.items[1], 8);
  assert.equal(LIMITS.worlds.length, 9);
});

// each case: [name, mutate(g), expected path substring, expected msg substring]
const failures = [
  ['not an object', () => null, '', 'object'],
  ['missing id', (g) => { delete g.id; }, 'id', 'required'],
  ['bad id slug', (g) => { g.id = 'Bad Id'; }, 'id', 'slug'],
  ['title too long', (g) => { g.title = 'x'.repeat(29); }, 'title', 'limit is 28'],
  ['tagline too long', (g) => { g.tagline = 'x'.repeat(81); }, 'tagline', 'limit is 80'],
  ['role too long', (g) => { g.role = 'x'.repeat(111); }, 'role', 'limit is 110'],
  ['title not string', (g) => { g.title = 5; }, 'title', 'string'],
  ['bad world', (g) => { g.theme.world = 'moon'; }, 'theme.world', 'one of'],
  ['bad accent', (g) => { g.theme.accent = 'red'; }, 'theme.accent', '#rrggbb'],
  ['bad mood', (g) => { g.theme.mood = 'noon'; }, 'theme.mood', 'one of'],
  ['no levels', (g) => { g.levels = []; }, 'levels', 'non-empty'],
  ['duplicate level id', (g) => { g.levels[1].id = g.levels[0].id; }, 'levels[1].id', 'duplicate'],
  ['order gap', (g) => { g.levels[2].order = 5; }, 'levels[2].order', 'expected 3'],
  ['order not integer', (g) => { g.levels[0].order = '1'; }, 'levels[0].order', 'integer'],
  ['level title too long', (g) => { g.levels[0].title = 'x'.repeat(33); }, 'levels[0].title', 'limit is 32'],
  ['skill too long', (g) => { g.levels[0].skill = 'x'.repeat(71); }, 'levels[0].skill', 'limit is 70'],
  ['takeaway missing', (g) => { delete g.levels[0].takeaway; }, 'levels[0].takeaway', 'required'],
  ['takeaway too long', (g) => { g.levels[0].takeaway = 'x'.repeat(161); }, 'levels[0].takeaway', 'limit is 160'],
  ['unknown mechanic', (g) => { g.levels[0].mechanic = 'dance'; }, 'levels[0].mechanic', 'one of'],
  ['courseSlug missing', (g) => { delete g.levels[0].courseSlug; }, 'levels[0].courseSlug', 'required'],
  ['variety: 5 levels one mechanic', (g) => { g.levels = [1, 2, 3, 4, 5].map((n) => ({ ...lane(), id: `l${n}`, order: n })); }, 'levels', 'at least 2'],
  ['variety: 6 levels two mechanics', (g) => { g.levels = [1, 2, 3, 4, 5, 6].map((n) => ({ ...(n % 2 ? lane() : sort()), id: `l${n}`, order: n })); }, 'levels', 'at least 3'],
  ['gate: one action', (g) => { g.levels[0].actions = [g.levels[0].actions[0]]; }, 'levels[0].actions', '2 to 3'],
  ['gate: action label too long', (g) => { g.levels[0].actions[0].label = 'x'.repeat(17); }, 'actions[0].label', 'limit is 16'],
  ['gate: answer not an action', (g) => { g.levels[0].items[0].answer = 'nope'; }, 'items[0].answer', 'not one of'],
  ['gate: too few items', (g) => { g.levels[0].items.length = 5; }, 'levels[0].items', '6 to 8'],
  ['gate: too many facts', (g) => { g.levels[0].items[0].facts = ['a', 'b', 'c', 'd']; }, 'items[0].facts', '1 to 3'],
  ['gate: fact too long', (g) => { g.levels[0].items[0].facts = ['x'.repeat(53)]; }, 'facts[0]', 'limit is 52'],
  ['gate: why too long', (g) => { g.levels[0].items[0].why = 'x'.repeat(151); }, 'items[0].why', 'limit is 150'],
  ['gate: action never the answer', (g) => { g.levels[0].items.forEach((i) => { if (i.answer === 'close') i.answer = 'fix'; }); }, 'actions', 'never the answer'],
  ['gate: 70% rule', (g) => { g.levels[0].items.push({ ...g.levels[0].items[0] , title: 'Ticket 7' }); g.levels[0].items.forEach((i, n) => { i.answer = n === 0 ? 'escalate' : n === 1 ? 'close' : 'fix'; }); }, 'items', 'more than 70'],
  ['gate: duplicate action id', (g) => { g.levels[0].actions[1].id = 'fix'; }, 'actions[1].id', 'duplicate'],
  ['sort: two bins', (g) => { g.levels[1].bins.length = 2; }, 'levels[1].bins', '3 to 4'],
  ['sort: bin unused', (g) => { g.levels[1].items.forEach((i) => { if (i.answer === 'c') i.answer = 'a'; }); }, 'bins', 'never the answer'],
  ['sort: item label too long', (g) => { g.levels[1].items[0].label = 'x'.repeat(35); }, 'items[0].label', 'limit is 34'],
  ['sort: note too long', (g) => { g.levels[1].items[0].note = 'x'.repeat(53); }, 'items[0].note', 'limit is 52'],
  ['sort: 7 items', (g) => { g.levels[1].items.length = 7; }, 'levels[1].items', '8 to 10'],
  ['sort: answer not a bin', (g) => { g.levels[1].items[0].answer = 'zzz'; }, 'items[0].answer', 'not one of'],
  ['order: one round', (g) => { g.levels[2].rounds.length = 1; }, 'levels[2].rounds', '2 to 3'],
  ['order: 3 steps', (g) => { g.levels[2].rounds[0].steps.length = 3; }, 'steps', '4 to 6'],
  ['order: duplicate steps', (g) => { g.levels[2].rounds[0].steps[1] = 'Step one'; }, 'steps[1]', 'duplicate'],
  ['order: step too long', (g) => { g.levels[2].rounds[0].steps[0] = 'x'.repeat(45); }, 'steps[0]', 'limit is 44'],
  ['order: why too long', (g) => { g.levels[2].rounds[0].why = 'x'.repeat(171); }, 'rounds[0].why', 'limit is 170'],
  ['lane: 5 questions', (g) => { g.levels[3].questions.length = 5; }, 'levels[3].questions', '6 to 8'],
  ['lane: 2 options', (g) => { g.levels[3].questions[0].options.length = 2; }, 'options', 'exactly 3'],
  ['lane: answer 3', (g) => { g.levels[3].questions[0].answer = 3; }, 'questions[0].answer', '0, 1 or 2'],
  ['lane: option too long', (g) => { g.levels[3].questions[0].options[0] = 'x'.repeat(23); }, 'options[0]', 'limit is 22'],
  ['lane: answer never varies', (g) => { g.levels[3].questions.forEach((q) => { q.answer = 1; }); }, 'questions', 'must vary'],
  ['lane: duplicate options', (g) => { g.levels[3].questions[0].options = ['Same', 'Same', 'Other']; }, 'options[1]', 'duplicate'],
  ['match: 3 pairs', (g) => { g.levels[4].rounds[0].pairs.length = 3; }, 'pairs', '4 to 5'],
  ['match: duplicate lefts', (g) => { g.levels[4].rounds[0].pairs[1][0] = 'One'; }, 'lefts', 'duplicate'],
  ['match: duplicate rights', (g) => { g.levels[4].rounds[0].pairs[1][1] = 'First thing'; }, 'rights', 'duplicate'],
  ['match: left too long', (g) => { g.levels[4].rounds[0].pairs[0][0] = 'x'.repeat(25); }, 'pairs[0][0]', 'limit is 24'],
  ['match: right too long', (g) => { g.levels[4].rounds[0].pairs[0][1] = 'x'.repeat(41); }, 'pairs[0][1]', 'limit is 40'],
  ['match: pair not a pair', (g) => { g.levels[4].rounds[0].pairs[0] = ['only']; }, 'pairs[0]', 'pair'],
  ['match: prompt too long', (g) => { g.levels[4].rounds[0].prompt = 'x'.repeat(91); }, 'rounds[0].prompt', 'limit is 90'],
];

test('failure cases', async (t) => {
  assert.ok(failures.length >= 25);
  for (const [name, mutate, pathPart, msgPart] of failures) {
    await t.test(name, () => {
      let g = clone(game());
      const replaced = mutate(g);
      if (replaced !== undefined) g = replaced;
      const r = validateGame(g);
      assert.equal(r.ok, false, `expected failure for ${name}`);
      const hit = r.errors.some((e) => e.path.includes(pathPart) && e.msg.includes(msgPart));
      assert.ok(hit, `no error matching path~"${pathPart}" msg~"${msgPart}" in ${JSON.stringify(r.errors)}`);
    });
  }
});

const warnCases = [
  ['duplicate item titles', (g) => { g.levels[0].items[1].title = g.levels[0].items[0].title; }, 'duplicate item title'],
  ['why repeats answer label', (g) => { g.levels[0].items[0].why = 'Fix it.'; }, 'repeats the answer label'],
  ['all caps', (g) => { g.levels[0].takeaway = 'NEVER SHARE YOUR PASSWORD'; }, 'ALL CAPS'],
  ['exclamation stack', (g) => { g.levels[0].takeaway = 'Great job!!! Keep going!'; }, 'exclamation'],
  ['short why', (g) => { g.levels[0].items[2].why = 'It breaks.'; }, 'very short why'],
  ['unknown field', (g) => { g.levels[0].colour = 'red'; }, 'unknown field'],
];

test('warnings are not errors', async (t) => {
  for (const [name, mutate, msgPart] of warnCases) {
    await t.test(name, () => {
      const g = clone(game());
      mutate(g);
      const r = validateGame(g);
      assert.equal(r.ok, true, JSON.stringify(r.errors));
      assert.ok(r.warnings.some((w) => w.msg.includes(msgPart)), JSON.stringify(r.warnings));
    });
  }
});

test('acronyms alone do not trigger all-caps', () => {
  const g = clone(game());
  g.levels[0].title = 'Spot a DNS issue';
  assert.deepEqual(validateGame(g).warnings, []);
});

test('optional scene and per-item prop are accepted', () => {
  const g = clone(game());
  g.levels[0].scene = 'A user at the front desk says their screen went black.';
  g.levels[0].prop = 'ticket';
  g.levels[0].items[0].prop = 'clipboard';
  const r = validateGame(g);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.warnings, []);
});

test('scene over the limit and unknown prop ids are errors', () => {
  const g = clone(game());
  g.levels[0].scene = 'x'.repeat(LIMITS.level.scene + 1);
  g.levels[0].prop = 'spaceship';
  g.levels[0].items[0].prop = 'banana';
  const r = validateGame(g);
  assert.equal(r.ok, false);
  const paths = r.errors.map((e) => e.path);
  assert.ok(paths.includes('levels[0].scene'), JSON.stringify(r.errors));
  assert.ok(paths.includes('levels[0].prop'), JSON.stringify(r.errors));
  assert.ok(paths.includes('levels[0].items[0].prop'), JSON.stringify(r.errors));
});
