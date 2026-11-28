// Pure validator for WAP Practice Arcade game definitions. No DOM, no three.
// validateGame(def) -> { ok, errors: [{path, msg}], warnings: [{path, msg}] }

export const WORLD_IDS = ['office', 'server-room', 'warehouse', 'clinic', 'factory', 'site', 'studio', 'cloud', 'lab'];
export const MECHANIC_IDS = ['gate', 'sort', 'order', 'lane', 'match'];
export const MOODS = ['day', 'dusk', 'night'];
export const PROP_IDS = ['ticket', 'packet', 'envelope', 'crate', 'folder', 'chip', 'clipboard', 'block', 'pallet', 'hardhat', 'toolbox', 'pillbottle', 'chart-folder', 'barcode-box', 'gear', 'valve', 'blueprint', 'code-block', 'database-cylinder', 'cloud-node', 'robot-head', 'megaphone', 'shopping-bag', 'wireframe-card', 'calendar-card', 'sticky-note'];

export const LIMITS = {
  worlds: WORLD_IDS,
  mechanics: MECHANIC_IDS,
  moods: MOODS,
  props: PROP_IDS,
  game: { title: 28, tagline: 80, role: 110 },
  level: { title: 32, skill: 70, takeaway: 160, scene: 150 },
  gate: { prompt: 80, actions: [2, 3], actionLabel: 16, items: [6, 8], itemTitle: 40, facts: [1, 3], fact: 52, why: 150, maxAnswerShare: 0.7 },
  sort: { prompt: 80, bins: [3, 4], binLabel: 18, items: [8, 10], itemLabel: 34, note: 52, why: 150 },
  order: { rounds: [2, 3], prompt: 90, steps: [4, 6], step: 44, why: 170 },
  lane: { prompt: 90, questions: [6, 8], options: 3, option: 22, why: 150 },
  match: { rounds: [2, 3], prompt: 90, pairs: [4, 5], left: 24, right: 40, why: 170 },
  variety: { sixPlusLevels: 3, fourToFiveLevels: 2 },
  shortWhy: 25,
};

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function validateGame(def) {
  const errors = [];
  const warnings = [];
  const err = (path, msg) => errors.push({ path, msg });
  const warn = (path, msg) => warnings.push({ path, msg });

  // ---- helpers -------------------------------------------------------------
  function lint(path, s) {
    if (/!\s*!/.test(s) || (s.match(/!/g) || []).length >= 2) warn(path, 'exclamation-mark stack; use calm wording');
    const letters = s.replace(/[^A-Za-z]/g, '');
    const longCaps = s.split(/[^A-Za-z]+/).some((t) => t.length >= 6 && t === t.toUpperCase());
    if ((letters.length >= 6 && letters === letters.toUpperCase()) || longCaps) warn(path, 'text in ALL CAPS');
  }
  // required string with max length; returns the string or null
  function str(path, v, max, { optional = false, lintText = true } = {}) {
    if (v === undefined || v === null) {
      if (!optional) err(path, 'is required');
      return null;
    }
    if (typeof v !== 'string') { err(path, 'must be a string'); return null; }
    if (v.trim() === '') { err(path, 'must not be empty'); return null; }
    if (max && v.length > max) err(path, `is ${v.length} characters; limit is ${max}`);
    if (lintText) lint(path, v);
    return v;
  }
  function arr(path, v, [min, max]) {
    if (!Array.isArray(v)) { err(path, 'must be an array'); return null; }
    if (v.length < min || v.length > max) err(path, `has ${v.length} entries; needs ${min} to ${max}`);
    return v;
  }
  function unknownKeys(path, o, allowed) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) warn(`${path}.${k}`, 'unknown field (typo?)');
  }
  // optional prop id (level.prop, or a per-item override in gate and sort)
  function propId(path, v) {
    if (v === undefined) return;
    if (typeof v !== 'string' || !PROP_IDS.includes(v)) err(path, `must be one of the prop ids: ${PROP_IDS.join(', ')}`);
  }
  function whyStr(path, v, max, answerLabel) {
    const s = str(path, v, max);
    if (s === null) return;
    if (s.trim().length < LIMITS.shortWhy) warn(path, `very short why (${s.trim().length} chars); explain the reason`);
    if (answerLabel) {
      const w = norm(s);
      const a = norm(answerLabel);
      if (a && (w === a || (w.includes(a) && w.length - a.length <= 8))) warn(path, 'why merely repeats the answer label');
    }
  }
  function dupWarn(path, labels, what) {
    const seen = new Map();
    labels.forEach((l, i) => {
      if (typeof l !== 'string') return;
      const k = norm(l);
      if (seen.has(k)) warn(`${path}[${i}]`, `duplicate ${what} (same as [${seen.get(k)}])`);
      else seen.set(k, i);
    });
  }
  function uniqueStrings(path, list, what) {
    const seen = new Map();
    list.forEach((l, i) => {
      if (typeof l !== 'string') return;
      const k = l.trim().toLowerCase();
      if (seen.has(k)) err(`${path}[${i}]`, `duplicate ${what} (same as [${seen.get(k)}])`);
      else seen.set(k, i);
    });
  }

  // ---- mechanic validators -------------------------------------------------
  function validateGate(p, lv) {
    const L = LIMITS.gate;
    unknownKeys(p, lv, BASE_KEYS.concat(['prompt', 'actions', 'items']));
    str(`${p}.prompt`, lv.prompt, L.prompt);
    const actions = arr(`${p}.actions`, lv.actions, L.actions);
    const actionIds = [];
    const actionLabels = {};
    if (actions) {
      actions.forEach((a, i) => {
        const ap = `${p}.actions[${i}]`;
        if (!isObj(a)) return err(ap, 'must be an object {id, label}');
        const id = str(`${ap}.id`, a.id, 24);
        const label = str(`${ap}.label`, a.label, L.actionLabel);
        if (id !== null) {
          if (actionIds.includes(id)) err(`${ap}.id`, `duplicate action id "${id}"`);
          actionIds.push(id);
          if (label !== null) actionLabels[id] = label;
        }
      });
      uniqueStrings(`${p}.actions`, actions.map((a) => a && a.label), 'action label');
    }
    const items = arr(`${p}.items`, lv.items, L.items);
    if (!items) return;
    const counts = {};
    items.forEach((it, i) => {
      const ip = `${p}.items[${i}]`;
      if (!isObj(it)) return err(ip, 'must be an object');
      unknownKeys(ip, it, ['title', 'facts', 'answer', 'why', 'prop']);
      propId(`${ip}.prop`, it.prop);
      str(`${ip}.title`, it.title, L.itemTitle);
      const facts = arr(`${ip}.facts`, it.facts, L.facts);
      if (facts) facts.forEach((f, j) => str(`${ip}.facts[${j}]`, f, L.fact));
      if (typeof it.answer !== 'string' || !it.answer) err(`${ip}.answer`, 'is required (an action id)');
      else if (!actionIds.includes(it.answer)) err(`${ip}.answer`, `"${it.answer}" is not one of the action ids [${actionIds.join(', ')}]`);
      else counts[it.answer] = (counts[it.answer] || 0) + 1;
      whyStr(`${ip}.why`, it.why, L.why, actionLabels[it.answer]);
    });
    dupWarn(`${p}.items`, items.map((it) => it && it.title), 'item title');
    if (actionIds.length) {
      for (const id of actionIds) {
        if (!counts[id]) err(`${p}.actions`, `action "${id}" is never the answer`);
        else if (counts[id] / items.length > L.maxAnswerShare) {
          err(`${p}.items`, `action "${id}" is the answer for ${counts[id]} of ${items.length} items (more than ${L.maxAnswerShare * 100}%)`);
        }
      }
    }
  }

  function validateSort(p, lv) {
    const L = LIMITS.sort;
    unknownKeys(p, lv, BASE_KEYS.concat(['prompt', 'bins', 'items']));
    str(`${p}.prompt`, lv.prompt, L.prompt);
    const bins = arr(`${p}.bins`, lv.bins, L.bins);
    const binIds = [];
    const binLabels = {};
    if (bins) {
      bins.forEach((b, i) => {
        const bp = `${p}.bins[${i}]`;
        if (!isObj(b)) return err(bp, 'must be an object {id, label}');
        const id = str(`${bp}.id`, b.id, 24);
        const label = str(`${bp}.label`, b.label, L.binLabel);
        if (id !== null) {
          if (binIds.includes(id)) err(`${bp}.id`, `duplicate bin id "${id}"`);
          binIds.push(id);
          if (label !== null) binLabels[id] = label;
        }
      });
      uniqueStrings(`${p}.bins`, bins.map((b) => b && b.label), 'bin label');
    }
    const items = arr(`${p}.items`, lv.items, L.items);
    if (!items) return;
    const used = new Set();
    items.forEach((it, i) => {
      const ip = `${p}.items[${i}]`;
      if (!isObj(it)) return err(ip, 'must be an object');
      unknownKeys(ip, it, ['label', 'note', 'answer', 'why', 'prop']);
      propId(`${ip}.prop`, it.prop);
      str(`${ip}.label`, it.label, L.itemLabel);
      str(`${ip}.note`, it.note, L.note, { optional: true });
      if (typeof it.answer !== 'string' || !it.answer) err(`${ip}.answer`, 'is required (a bin id)');
      else if (!binIds.includes(it.answer)) err(`${ip}.answer`, `"${it.answer}" is not one of the bin ids [${binIds.join(', ')}]`);
      else used.add(it.answer);
      whyStr(`${ip}.why`, it.why, L.why, binLabels[it.answer]);
    });
    dupWarn(`${p}.items`, items.map((it) => it && it.label), 'item label');
    for (const id of binIds) if (!used.has(id)) err(`${p}.bins`, `bin "${id}" is never the answer`);
  }

  function validateOrder(p, lv) {
    const L = LIMITS.order;
    unknownKeys(p, lv, BASE_KEYS.concat(['rounds']));
    const rounds = arr(`${p}.rounds`, lv.rounds, L.rounds);
    if (!rounds) return;
    rounds.forEach((r, i) => {
      const rp = `${p}.rounds[${i}]`;
      if (!isObj(r)) return err(rp, 'must be an object');
      unknownKeys(rp, r, ['prompt', 'steps', 'why']);
      str(`${rp}.prompt`, r.prompt, L.prompt);
      const steps = arr(`${rp}.steps`, r.steps, L.steps);
      if (steps) {
        steps.forEach((s, j) => str(`${rp}.steps[${j}]`, s, L.step));
        uniqueStrings(`${rp}.steps`, steps, 'step');
      }
      whyStr(`${rp}.why`, r.why, L.why);
    });
    dupWarn(`${p}.rounds`, rounds.map((r) => r && r.prompt), 'round prompt');
  }

  function validateLane(p, lv) {
    const L = LIMITS.lane;
    unknownKeys(p, lv, BASE_KEYS.concat(['questions']));
    const qs = arr(`${p}.questions`, lv.questions, L.questions);
    if (!qs) return;
    const answers = [];
    qs.forEach((q, i) => {
      const qp = `${p}.questions[${i}]`;
      if (!isObj(q)) return err(qp, 'must be an object');
      unknownKeys(qp, q, ['prompt', 'options', 'answer', 'why']);
      str(`${qp}.prompt`, q.prompt, L.prompt);
      let opts = null;
      if (!Array.isArray(q.options)) err(`${qp}.options`, 'must be an array');
      else {
        opts = q.options;
        if (opts.length !== L.options) err(`${qp}.options`, `has ${opts.length} options; needs exactly ${L.options}`);
        opts.forEach((o, j) => str(`${qp}.options[${j}]`, o, L.option));
        uniqueStrings(`${qp}.options`, opts, 'option');
      }
      let label = null;
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 2) err(`${qp}.answer`, 'must be an integer 0, 1 or 2');
      else {
        answers.push(q.answer);
        if (opts && typeof opts[q.answer] === 'string') label = opts[q.answer];
      }
      whyStr(`${qp}.why`, q.why, L.why, label);
    });
    dupWarn(`${p}.questions`, qs.map((q) => q && q.prompt), 'question prompt');
    if (answers.length >= 2 && new Set(answers).size < 2) err(`${p}.questions`, 'the correct index is the same for every question; it must vary');
  }

  function validateMatch(p, lv) {
    const L = LIMITS.match;
    unknownKeys(p, lv, BASE_KEYS.concat(['rounds']));
    const rounds = arr(`${p}.rounds`, lv.rounds, L.rounds);
    if (!rounds) return;
    rounds.forEach((r, i) => {
      const rp = `${p}.rounds[${i}]`;
      if (!isObj(r)) return err(rp, 'must be an object');
      unknownKeys(rp, r, ['prompt', 'pairs', 'why']);
      str(`${rp}.prompt`, r.prompt, L.prompt);
      const pairs = arr(`${rp}.pairs`, r.pairs, L.pairs);
      if (pairs) {
        const lefts = [];
        const rights = [];
        pairs.forEach((pr, j) => {
          const pp = `${rp}.pairs[${j}]`;
          if (!Array.isArray(pr) || pr.length !== 2) return err(pp, 'must be a [left, right] pair');
          const l = str(`${pp}[0]`, pr[0], L.left);
          const rt = str(`${pp}[1]`, pr[1], L.right);
          lefts.push(l);
          rights.push(rt);
        });
        uniqueStrings(`${rp}.pairs.lefts`, lefts.map((x) => x || ''), 'left');
        uniqueStrings(`${rp}.pairs.rights`, rights.map((x) => x || ''), 'right');
      }
      whyStr(`${rp}.why`, r.why, L.why);
    });
  }

  const BASE_KEYS = ['id', 'order', 'courseSlug', 'courseTitle', 'title', 'skill', 'mechanic', 'prop', 'takeaway', 'scene'];
  const MECH = { gate: validateGate, sort: validateSort, order: validateOrder, lane: validateLane, match: validateMatch };

  // ---- game ------------------------------------------------------------------
  if (!isObj(def)) {
    err('', 'game definition must be an object');
    return { ok: false, errors, warnings };
  }
  unknownKeys('', def, ['id', 'title', 'tagline', 'role', 'program', 'theme', 'levels']);
  const gid = str('id', def.id, 60);
  if (gid !== null && !SLUG.test(gid)) err('id', 'must be a lowercase slug (a-z, 0-9, hyphens)');
  str('title', def.title, LIMITS.game.title);
  str('tagline', def.tagline, LIMITS.game.tagline);
  str('role', def.role, LIMITS.game.role);
  str('program', def.program, 120, { lintText: false });

  if (!isObj(def.theme)) err('theme', 'is required (object {world, accent, mood})');
  else {
    unknownKeys('theme', def.theme, ['world', 'accent', 'mood']);
    if (!WORLD_IDS.includes(def.theme.world)) err('theme.world', `must be one of: ${WORLD_IDS.join(', ')}`);
    if (typeof def.theme.accent !== 'string' || !HEX.test(def.theme.accent)) err('theme.accent', 'must be a color like #rrggbb');
    if (def.theme.mood !== undefined && !MOODS.includes(def.theme.mood)) err('theme.mood', `must be one of: ${MOODS.join(', ')}`);
  }

  if (!Array.isArray(def.levels) || def.levels.length === 0) {
    err('levels', 'must be a non-empty array');
  } else {
    const ids = new Map();
    const mechs = new Set();
    def.levels.forEach((lv, i) => {
      const p = `levels[${i}]`;
      if (!isObj(lv)) return err(p, 'must be an object');
      const id = str(`${p}.id`, lv.id, 40);
      if (id !== null) {
        if (!SLUG.test(id)) err(`${p}.id`, 'must be a lowercase slug (a-z, 0-9, hyphens)');
        if (ids.has(id)) err(`${p}.id`, `duplicate level id "${id}" (also levels[${ids.get(id)}])`);
        else ids.set(id, i);
      }
      if (!Number.isInteger(lv.order)) err(`${p}.order`, 'must be an integer');
      else if (lv.order !== i + 1) err(`${p}.order`, `is ${lv.order}; expected ${i + 1} (orders must run 1..n with no gaps, in array order)`);
      str(`${p}.courseSlug`, lv.courseSlug, 120);
      str(`${p}.courseTitle`, lv.courseTitle, 160);
      str(`${p}.title`, lv.title, LIMITS.level.title);
      str(`${p}.skill`, lv.skill, LIMITS.level.skill);
      str(`${p}.takeaway`, lv.takeaway, LIMITS.level.takeaway);
      str(`${p}.scene`, lv.scene, LIMITS.level.scene, { optional: true });
      propId(`${p}.prop`, lv.prop);
      if (!MECHANIC_IDS.includes(lv.mechanic)) {
        err(`${p}.mechanic`, `must be one of: ${MECHANIC_IDS.join(', ')}`);
      } else {
        mechs.add(lv.mechanic);
        MECH[lv.mechanic](p, lv);
      }
    });
    const n = def.levels.length;
    const V = LIMITS.variety;
    if (n >= 6 && mechs.size < V.sixPlusLevels) err('levels', `${n} levels use ${mechs.size} mechanic(s); games with 6+ levels need at least ${V.sixPlusLevels} different mechanics`);
    else if (n >= 4 && n <= 5 && mechs.size < V.fourToFiveLevels) err('levels', `${n} levels use ${mechs.size} mechanic(s); games with 4-5 levels need at least ${V.fourToFiveLevels} different mechanics`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

export default validateGame;
