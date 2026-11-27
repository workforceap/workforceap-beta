// WAP Practice hub: lists one practice game per training program. No 3D, no three.js.
// Missing or broken game files show as "Coming soon"; nothing here throws to the player.
const KEY = 'wap-arcade-v1:';
const DEMOS = ['help-desk-demo', 'demo-sort', 'demo-order', 'demo-lane', 'demo-match', 'demo-world-a', 'demo-world-b'];
const MECH = {gate: 'Decide', sort: 'Sort', order: 'Order', lane: 'Steer', match: 'Connect'};

const $ = (s) => document.querySelector(s);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
function svgEl(html) { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild; }
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8L12 2.8Z"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function starRow(n) {
  const wrap = h('span', {class: 'stars', 'aria-hidden': 'true'});
  for (let i = 1; i <= 3; i++) { const s = svgEl(STAR); if (i > n) s.classList.add('off'); wrap.append(s); }
  return wrap;
}
function oneStar(on) { const w = h('span', {class: 'stars', 'aria-hidden': 'true'}); const s = svgEl(STAR); if (!on) s.classList.add('off'); w.append(s); return w; }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const safeAccent = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
const str = (v, d = '') => (typeof v === 'string' ? v : d);

// ---------- storage (defensive) ----------
function readJSON(key) {
  try { const raw = localStorage.getItem(key); if (!raw) return null; const v = JSON.parse(raw); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
function bestMap(gameId) {
  const b = readJSON(KEY + gameId)?.best;
  const out = {};
  if (b && typeof b === 'object') for (const [k, v] of Object.entries(b)) { const n = Number(v); if (n >= 1 && n <= 3) out[k] = Math.floor(n); }
  return out;
}

// ---------- data ----------
async function loadIndex() {
  try {
    const r = await fetch('./data/source/_index.json', {cache: 'no-store'});
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const map = {};
    for (const p of j.programs || []) if (p && p.programSlug) map[p.programSlug] = p;
    return map;
  } catch { return {}; }
}
async function loadGame(id) {
  try {
    const mod = await import(`./games/${id}/game.mjs`);
    const g = mod.default;
    if (!g || typeof g !== 'object' || !Array.isArray(g.levels) || !g.levels.length) return null;
    return g;
  } catch { return null; }
}
async function loadRegistry() {
  try {
    const mod = await import('./games/registry.mjs');
    return {cats: Array.isArray(mod.CATEGORIES) ? mod.CATEGORIES : [], list: Array.isArray(mod.default) ? mod.default : []};
  } catch { return {cats: [], list: []}; }
}

function normalize(entry, game, index) {
  const meta = index[entry.id] || {};
  if (!game) {
    return {
      id: entry.id, category: entry.category, soon: true,
      program: str(meta.programTitle, entry.id), title: str(meta.programTitle, entry.id),
      courseCount: Number(meta.courseCount) || 0
    };
  }
  const levels = game.levels.filter((l) => l && typeof l.id === 'string').slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  return {
    id: entry.id, category: entry.category, soon: false,
    title: str(game.title, entry.id), program: str(game.program, str(meta.programTitle, entry.id)),
    tagline: str(game.tagline), accent: safeAccent(game.theme?.accent), mood: ['day', 'dusk', 'night'].includes(game.theme?.mood) ? game.theme.mood : 'day',
    levels, best: bestMap(entry.id)
  };
}
const starsOf = (g) => g.levels.reduce((s, l) => s + (g.best[l.id] || 0), 0);

// ---------- rendering ----------
function mechSet(g) {
  const seen = [];
  for (const l of g.levels) { const m = MECH[l.mechanic]; if (m && !seen.includes(m)) seen.push(m); }
  return seen;
}

function gameCard(g) {
  const card = h('article', {class: `card${g.soon ? ' soon' : ''}${g.mood && !g.soon ? ' ' + g.mood : ''}`, 'data-id': g.id});
  if (g.accent) card.style.setProperty('--a', g.accent);
  const strip = h('div', {class: 'strip'});
  if (g.soon) strip.append(h('span', {class: 'pill', text: 'Coming soon'}));
  else for (const m of mechSet(g)) strip.append(h('span', {class: 'pill', text: m}));
  const body = h('div', {class: 'body'});
  body.append(h('p', {class: 'prog', text: g.program}));
  const titleId = `t-${g.id}`;
  body.append(h('h3', {id: titleId, text: g.title}));

  if (g.soon) {
    card.setAttribute('aria-labelledby', titleId);
    body.append(h('p', {class: 'tag', text: g.courseCount ? `A practice level for each of the ${g.courseCount} courses is on its way.` : 'A practice game for this program is on its way.'}));
    body.append(h('p', {class: 'soon-note', text: 'Coming soon. Check back after your next course.'}));
    card.append(strip, body);
    return card;
  }

  card.setAttribute('aria-labelledby', titleId);
  if (g.tagline) body.append(h('p', {class: 'tag', text: g.tagline}));
  const earned = starsOf(g), total = g.levels.length * 3;
  const facts = h('div', {class: 'facts'},
    h('span', {class: 'lv', text: plural(g.levels.length, 'level')}),
    h('span', {class: 'starline'}, oneStar(earned > 0),
      h('span', {text: `${earned} of ${total} stars`})));
  body.append(facts);
  const bar = h('div', {class: 'bar-prog', 'aria-hidden': 'true'}, h('i'));
  bar.firstChild.style.width = `${total ? Math.round((earned / total) * 100) : 0}%`;
  body.append(bar);

  const started = earned > 0;
  const play = h('a', {class: 'btn primary', href: `play.html?game=${encodeURIComponent(g.id)}`}, started ? 'Continue' : 'Start',
    h('span', {class: 'sr', text: ` ${g.title}`}));
  const rowsId = `lv-${g.id}`;
  const toggle = h('button', {class: 'toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': rowsId}, h('span', {text: 'Levels by course'}), svgEl(CHEV));
  const rows = h('div', {class: 'rows', id: rowsId, hidden: true});
  rows.append(h('h4', {text: 'Levels by course'}));
  const ul = h('ul');
  for (const l of g.levels) {
    const n = g.best[l.id] || 0;
    const mech = MECH[l.mechanic] || str(l.mechanic);
    const a = h('a', {class: 'row', href: `play.html?game=${encodeURIComponent(g.id)}&level=${encodeURIComponent(l.id)}`},
      h('span', {class: 'after', text: `After course ${l.order}`}),
      h('span', {class: 'course', text: str(l.courseTitle)}),
      h('span', {class: 'lt', text: str(l.title)}),
      h('span', {class: 'meta'}, h('span', {text: mech}),
        h('span', {class: 'starline'}, starRow(n), h('span', {class: n ? '' : 'sr', text: n ? `${n} of 3` : 'Not played'}))));
    ul.append(h('li', null, a));
  }
  rows.append(ul);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    rows.hidden = !open;
  });
  body.append(h('div', {class: 'actions'}, play, toggle));
  card.append(strip, body, rows);
  return card;
}

function continueCard(games) {
  const last = readJSON(KEY + 'last');
  let g = last && games.find((x) => x.id === last.game && !x.soon);
  let level = g && g.levels.find((l) => l.id === last.level);
  if (!g) {
    // no last pointer: offer the game with the most recent-looking progress, first one with any stars
    g = games.find((x) => !x.soon && starsOf(x) > 0);
    if (!g) return null;
    level = null;
  }
  // next level to play: the first unstarred level from the last one onward, else the last one
  const from = level ? g.levels.indexOf(level) : 0;
  let target = g.levels.slice(from).find((l) => !g.best[l.id]) || g.levels.slice(0, from).find((l) => !g.best[l.id]) || level || g.levels[0];
  const allDone = g.levels.every((l) => g.best[l.id]);
  const sec = h('section', {class: 'cont', 'aria-labelledby': 'cont-h'});
  if (g.accent) sec.style.setProperty('--ca', g.accent);
  sec.append(h('div', null,
    h('h2', {id: 'cont-h', text: allDone ? 'Everything here is done. Play again?' : 'Pick up where you left off'}),
    h('p', {class: 'ct', text: g.title}),
    h('p', {class: 'cs', text: `After course ${target.order}: ${str(target.title)}`})));
  sec.append(h('a', {class: 'btn primary', href: `play.html?game=${encodeURIComponent(g.id)}&level=${encodeURIComponent(target.id)}`}, allDone ? 'Play again' : 'Continue',
    h('span', {class: 'sr', text: ` ${g.title}`})));
  return sec;
}

function section(label, items, idBase) {
  const sec = h('section', {class: 'cat', 'aria-labelledby': idBase});
  sec.append(h('h2', {id: idBase}, label, h('span', {class: 'num', text: plural(items.length, 'game')})));
  const grid = h('div', {class: 'grid'});
  for (const g of items) grid.append(gameCard(g));
  sec.append(grid);
  return sec;
}

async function main() {
  const demos = new URLSearchParams(location.search).get('demos') === '1';
  const [{cats, list}, index] = await Promise.all([loadRegistry(), loadIndex()]);
  const loaded = await Promise.all(list.map(async (e) => normalize(e, await loadGame(e.id), index)));
  let demoGames = [];
  if (demos) {
    const got = await Promise.all(DEMOS.map(async (id) => normalize({id, category: 'demos'}, await loadGame(id), index)));
    demoGames = got.filter((g) => !g.soon);
  }
  const all = loaded.concat(demoGames);

  const root = $('#games');
  const cont = continueCard(all);
  if (cont) $('#continue').append(cont);

  const groups = [];
  const catIds = new Set(cats.map((c) => c.id));
  for (const c of cats) {
    const items = loaded.filter((g) => g.category === c.id);
    if (items.length) groups.push({label: c.label, items, id: `cat-${c.id}`});
  }
  const stray = loaded.filter((g) => !catIds.has(g.category));
  if (stray.length) groups.push({label: 'More programs', items: stray, id: 'cat-more'});
  if (demoGames.length) groups.push({label: 'Kit demos', items: demoGames, id: 'cat-demos'});

  const frag = document.createDocumentFragment();
  const secs = groups.map((gr) => { const s = section(gr.label, gr.items, gr.id); frag.append(s); return {el: s, items: gr.items}; });
  root.replaceChildren(frag);
  root.setAttribute('aria-busy', 'false');
  if (!groups.length) {
    root.replaceChildren(h('p', {class: 'empty', text: 'The game list could not be loaded. Please refresh the page in a moment.'}));
    return;
  }

  // filter
  $('#finder').hidden = false;
  const q = $('#q'), count = $('#count'), empty = $('#empty');
  const hay = (g) => `${g.program} ${g.title} ${g.tagline || ''}`.toLowerCase();
  const catLabel = new Map(groups.map((gr) => [gr, gr.label.toLowerCase()]));
  const apply = () => {
    const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    secs.forEach((s, i) => {
      const cl = catLabel.get(groups[i]);
      let vis = 0;
      s.items.forEach((g, j) => {
        const text = hay(g) + ' ' + cl;
        const ok = terms.every((t) => text.includes(t));
        s.el.querySelectorAll('.card')[j].hidden = !ok;
        if (ok) vis++;
      });
      s.el.hidden = vis === 0;
      shown += vis;
    });
    empty.hidden = shown !== 0;
    count.textContent = terms.length ? `${plural(shown, 'game')} found` : '';
  };
  q.addEventListener('input', apply);
  q.addEventListener('search', apply);
}

main().catch(() => {
  const root = $('#games');
  if (root) { root.setAttribute('aria-busy', 'false'); root.replaceChildren(h('p', {class: 'empty', text: 'The game list could not be loaded. Please refresh the page in a moment.'})); }
});
