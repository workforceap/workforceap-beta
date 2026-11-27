// WAP Practice Arcade shell: game flow and all DOM UI (level map, coach card, play HUD, feedback, results,
// settings, text mode, saving) plus the window.__arcade test hook. Mechanics never touch the DOM; the shell builds
// the bottom sheet from rules.view(state).
//
// Saving: localStorage 'wap-arcade-v1:<game-id>' = {best: {<level-id>: stars 1-3}}; settings live in
// 'wap-arcade-v1:settings'; the last level started lives in 'wap-arcade-v1:last' = {game, level}.
// Blocked or corrupt storage is tolerated (progress just is not kept).
//
// Preview overrides (not saved): ?world=<id>&mood=<day|dusk|night>&accent=<rrggbb>&quality=<low|medium|high>.
import {validateGame} from './schema.mjs';
import MECHANICS from './mechanics/index.mjs';
import WORLDS from './worlds/index.mjs';
import PROPS_CORE from './props.mjs';
import PROPS_EXTRA from './props2.mjs';
import * as look from './look.mjs';
import * as THREE from './vendor/three.module.min.js';
import {createEngine, webglAvailable} from './engine.mjs';

const KEY_PREFIX = 'wap-arcade-v1:';
const MAX_HEARTS = 3;
const MAX_CHOICES = 6;
const GRACE_AFTER_EVENT = .9; // seconds before the clock starts on a new item
const RIGHT_TOAST_MS = 2600;
const STREAK_MIN = 3; // the "N in a row" chip shows from this streak up
const STREAK_CHIP_MS = 1900;
const ABOUT = 'Practice only. Not graded, not course credit. Progress is saved on this device only.';

// ---------- icons (inline SVG, no emoji) ----------
const svg = (path, extra = '') => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${extra}>${path}</svg>`;
const I = {
  gear: svg('<path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1l.4 2.5h4l.4-2.5c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  pause: svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/>'),
  heart: svg('<path fill="currentColor" d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"/>'),
  star: svg('<path fill="currentColor" d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8L12 2.8Z"/>'),
  check: svg('<path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  cross: svg('<path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  arrow: svg('<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  back: svg('<path d="M19 12H6M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  bolt: svg('<path fill="currentColor" d="M13.2 2.5 5 13.6h5.6L9.4 21.5l8.6-11.6h-5.7l.9-7.4Z"/>')
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const $ = (sel, root = document) => root.querySelector(sel);

// ---------- storage (tolerant) ----------
function readJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); if (!raw) return fallback; const v = JSON.parse(raw); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; }
}
function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function loadSettings() {
  const s = readJSON(KEY_PREFIX + 'settings', {});
  return {sound: s.sound === true, noTimer: s.noTimer === true, textMode: s.textMode === true, quality: look.LEVELS.includes(s.quality) ? s.quality : null};
}
function loadSave(gameId) {
  const s = readJSON(KEY_PREFIX + gameId, {});
  const best = {};
  if (s && s.best && typeof s.best === 'object') for (const [k, v] of Object.entries(s.best)) if (Number.isInteger(v) && v >= 1 && v <= 3) best[k] = v;
  return {best};
}

// ---------- sound (off by default; tiny synthesized tones, no audio files) ----------
let audio = null;
function tone(kind, streak = 1) {
  if (!S.settings.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended' && audio.resume) audio.resume();
    let notes, type = 'sine', vol = .12, len = .22;
    if (kind === 'tap') { notes = [[540, 0]]; vol = .06; len = .07; }
    else if (kind === 'right') {
      const f = 660 * Math.pow(2, Math.min(Math.max(0, streak - 1), 9) / 12); // rises a semitone per answer in a row
      notes = [[f, 0], [f * 1.335, .085]];
    } else if (kind === 'done') notes = [[523, 0], [659, .1], [784, .2], [1047, .32]];
    else { notes = [[220, 0], [180, .12]]; type = 'triangle'; }
    for (const [f, at] of notes) {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + at;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.001, t + len);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + len + .03);
    }
  } catch { /* audio blocked: stay silent */ }
}

// ---------- props registry: core + extra, unknown ids fall back to 'block' ----------
const PROPS = {...PROPS_CORE, ...PROPS_EXTRA};
function makeProps(kit) {
  return {
    ids: Object.keys(PROPS),
    has: (id) => !!PROPS[id],
    make(id, {accent} = {}) {
      const build = PROPS[id] || PROPS.block;
      const c = accent instanceof THREE.Color ? accent : new THREE.Color(accent || theme().accent || '#ad2c4d');
      try { return build({THREE, kit, accent: c}); } catch (e) { console.error('prop failed', id, e); return PROPS.block({THREE, kit, accent: c}); }
    }
  };
}

// ---------- app state ----------
const S = {
  app: null, game: null, gameId: '', settings: loadSettings(), save: {best: {}}, ov: {},
  screen: 'loading', error: null, ready: false,
  engine: null, glOk: false, glNote: '', world: null, worldFor: null, props: null,
  level: null, mech: null, view: null, run: null, prim: [],
  pausedFrom: null, toastTimer: 0, resultsTimer: 0, streakTimer: 0, confettiTimer: 0, fb: null, lastResult: null,
  reduced: false, lastKeyboard: false, forceText: false
};
const textMode = () => S.settings.textMode || S.forceText || !S.glOk;
const levelIndex = (id) => S.game.levels.findIndex((l) => l.id === id);
const isFirstLevel = (lv) => S.game.levels[0] && S.game.levels[0].id === lv.id;
// Side-by-side layout (canvas left, sheet right): wide screens, and a phone held sideways. Keep in step with ui.css.
const wideMQ = typeof matchMedia === 'function' ? matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1), (orientation: landscape) and (max-height: 520px)') : null;
const isWide = () => !!(wideMQ && wideMQ.matches);
// The game's theme with any preview overrides from the URL applied.
function theme() {
  const t = (S.game && S.game.theme) || {};
  return {world: S.ov.world || t.world, accent: S.ov.accent || t.accent || '#ad2c4d', mood: S.ov.mood || t.mood || 'day'};
}
function readOverrides(params) {
  const ov = {};
  const w = (params.get('world') || '').trim();
  if (w && WORLDS[w]) ov.world = w;
  const m = (params.get('mood') || '').trim();
  if (m && look.MOODS && look.MOODS[m]) ov.mood = m;
  const a = (params.get('accent') || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(a)) ov.accent = '#' + a.toLowerCase();
  const q = (params.get('quality') || '').trim();
  if (look.LEVELS.includes(q)) ov.quality = q;
  return ov;
}

// ---------- boot ----------
export async function boot(app) {
  S.app = app;
  installHook();
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  S.reduced = !!(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { S.reduced = mq.matches; if (S.engine) S.engine.setReduced(S.reduced); });
  app.innerHTML = `<div class="center-msg"><p class="loading" role="status">Loading practice...</p></div>`;

  const params = new URLSearchParams(location.search);
  S.forceText = params.get('text') === '1'; // session-only text mode (not saved), used by links and the smoke tool
  S.ov = readOverrides(params);
  const id = (params.get('game') || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(id)) return fail('No game was chosen.', id ? [`"${id}" is not a valid game id.`] : ['Open this page as play.html?game=<game-id>.']);
  let def;
  try { def = (await import(`../games/${id}/game.mjs`)).default; } catch (e) {
    // Learners get a plain message; the technical reason goes to the console and a collapsed details box.
    console.error(`games/${id}/game.mjs did not load`, e);
    return fail('This game could not be found.', [`games/${id}/game.mjs did not load: ${e && e.message ? e.message : e}`], {plain: 'Check the link, or pick a game from the list.'});
  }
  let res;
  try { res = validateGame(def); } catch (e) { return fail('This game could not be checked.', [String(e && e.message || e)]); }
  if (!res.ok) return fail('This game has problems and cannot start.', res.errors.map((er) => `${er.path || '(game)'}: ${er.msg}`));
  const missing = def.levels.filter((l) => !MECHANICS[l.mechanic]).map((l) => `${l.id}: mechanic "${l.mechanic}" is not installed`);
  if (missing.length) return fail('This game needs parts that are not installed yet.', missing);

  S.game = def; S.gameId = def.id; S.save = loadSave(def.id);
  document.title = `${def.title} - WAP Practice`;
  document.documentElement.style.setProperty('--accent', theme().accent);
  buildSkeleton();
  initGL();
  bindGlobal();
  showMap();
  S.ready = true;
  const want = params.get('level');
  if (want && levelIndex(want) >= 0) openLevel(want);
  else if (want) showMap('', 'That level was not found. Pick one below.');
}

function fail(title, lines, {plain = ''} = {}) {
  S.error = `${title} ${lines.join(' | ')}`.trim();
  S.screen = 'map';
  const list = `<ul class="errlist">${lines.map((l) => { const m = /^([^:]+): (.*)$/.exec(l); return `<li>${m ? `<code>${esc(m[1])}</code>: ${esc(m[2])}` : esc(l)}</li>`; }).join('')}</ul>`;
  S.app.innerHTML = `<div class="center-msg"><div class="box" role="alert">
    <h1>${esc(title)}</h1>
    ${plain ? `<p>${esc(plain)}</p><details class="tech"><summary>Technical details</summary>${list}</details>` : `<p>Here is what went wrong:</p>${list}`}
    <a class="btn secondary" href="./index.html">All games</a>
  </div></div>`;
}

function buildSkeleton() {
  S.app.innerHTML = `
  <div id="map" class="screen map" hidden></div>
  <div id="play" class="screen play" hidden>
    <header class="topbar dark">
      <button class="icon-btn" data-action="exit" aria-label="Back to all levels">${I.close}</button>
      <div class="progress"><span class="progress-text" id="progText"></span><span class="bar" aria-hidden="true"><i id="progBar"></i></span></div>
      <div class="hearts" id="hearts" role="img"></div>
      <button class="icon-btn" data-action="pause" aria-label="Pause">${I.pause}</button>
    </header>
    <div class="stage" id="stage"><canvas id="gl" aria-label="3D view of the current item. Every choice is also a button below." role="img"></canvas><div class="streak" id="streak" aria-hidden="true" hidden></div></div>
    <section class="sheet" id="sheet" aria-label="Your move">
      <div class="toast" id="toast" role="status" hidden></div>
      <p class="tm-badge" id="tmBadge" hidden>Text mode: no timer, no 3D.</p>
      <div class="timer" id="timer" hidden><span class="track"><i id="timerBar"></i></span><span class="secs" id="timerText"></span></div>
      <div class="card" id="card"><p class="card-kicker" id="cardKicker" hidden></p><h2 id="cardTitle" tabindex="-1"></h2><ul id="cardLines"></ul></div>
      <p class="prompt" id="prompt"></p>
      <ul class="choices" id="choices" role="list"></ul>
      <div class="choice-more" id="choiceMore" hidden></div>
      <p class="sheet-scene" id="sheetScene" hidden></p>
    </section>
  </div>
  <div id="results" class="screen results" hidden></div>
  <div id="overlay" class="overlay" hidden></div>
  <div id="dialog" class="overlay top" hidden></div>
  <div id="live" class="sr-only" aria-live="polite"></div>
  <div id="alert" class="sr-only" aria-live="assertive"></div>`;
  S.app.addEventListener('click', onClick);
}

function initGL() {
  if (!webglAvailable()) { S.glOk = false; S.glNote = '3D graphics are not available on this device, so the game runs in text mode.'; return; }
  try {
    S.engine = createEngine($('#gl'), {
      reduced: S.reduced, quality: S.ov.quality || S.settings.quality, mood: theme().mood, accent: theme().accent,
      onLost: onGLLost,
      onPick: (id) => { if (S.screen === 'play') choose(id); }
    });
    S.engineLook = theme().accent + '|' + theme().mood;
    S.props = makeProps(S.engine.kit);
    S.engine.onFrame(frame);
    S.glOk = true;
  } catch (e) {
    console.warn('WebGL failed', e);
    S.engine = null; S.glOk = false; S.glNote = '3D graphics could not start on this device, so the game runs in text mode.';
  }
}
function onGLLost() {
  S.glOk = false; S.glNote = '3D graphics stopped working, so the game switched to text mode. Your progress in this level is kept.';
  disposeView();
  if (S.level && ['coach', 'play', 'feedback', 'paused'].includes(S.screen)) { applyPlayMode(); renderSheet(); announce(S.glNote, true); }
  syncLoop();
}

// ---------- map ----------
function nextUpId() {
  const lv = S.game.levels.find((l) => !S.save.best[l.id]);
  return lv ? lv.id : null;
}
function starsHTML(n, cls = 'stars') {
  return `<span class="${cls}" role="img" aria-label="${n ? `Best: ${n} of 3 stars` : 'Not played yet'}">${[1, 2, 3].map((k) => `<span class="${k <= n ? 'on' : 'off'}">${I.star}</span>`).join('')}</span>`;
}
function showMap(notice = '', info = '') {
  const fromLevel = !!S.level || S.screen === 'results';
  clearTimers();
  unlockSheet();
  disposeView();
  S.level = null; S.run = null; S.mech = null;
  setScreen('map');
  const g = S.game, next = nextUpId(), first = next || g.levels[0].id, firstLv = g.levels[levelIndex(first)];
  const cards = g.levels.map((lv, i) => {
    const best = S.save.best[lv.id] || 0, m = MECHANICS[lv.mechanic];
    return `<li><button class="level-card${lv.id === next ? ' next' : ''}" data-action="open" data-level="${esc(lv.id)}">
      <span class="eyebrow">After course ${lv.order || i + 1}${lv.id === next ? ' <span class="badge">Next up</span>' : ''}</span>
      <span class="course">${esc(lv.courseTitle)}</span>
      <span class="ltitle">${esc(lv.title)}</span>
      <span class="skill">${esc(lv.skill)}</span>
      <span class="meta"><span class="chip">${esc(m ? m.label : lv.mechanic)}</span>${starsHTML(best)}<span class="go">${best ? 'Play again' : 'Play'} ${I.arrow}</span></span>
    </button></li>`;
  }).join('');
  const allDone = !next;
  const got = g.levels.reduce((n, lv) => n + (S.save.best[lv.id] || 0), 0), max = g.levels.length * 3;
  $('#map').innerHTML = `
    <header class="mapbar dark"><div class="mapbar-in">
      <a class="nav-link" href="./index.html">${I.back}<span>All games</span></a>
      <div class="brand"><span class="brand-mark">WAP</span><span>Practice</span></div>
      <button class="icon-btn" data-action="settings" aria-label="Settings">${I.gear}</button>
    </div></header>
    <main class="map-main">
      ${notice ? `<div class="notice warn" role="alert"><strong>This level is not ready yet.</strong> ${esc(notice)}</div>` : ''}
      ${info && !notice ? `<div class="notice" role="status">${esc(info)}</div>` : ''}
      ${!S.glOk ? `<p class="notice">${esc(S.glNote)}</p>` : ''}
      <section class="hero">
        <p class="program">${esc(g.program)}</p>
        <h1 id="mapTitle" tabindex="-1">${esc(g.title)}</h1>
        <p class="role">${esc(g.role)}</p>
        <div class="tally">
          <span class="total" role="img" aria-label="${got} of ${max} stars collected">${I.star}<span>${got} of ${max} stars</span></span>
          ${allDone ? `<span class="complete">${I.check}<span>All levels complete</span></span>` : ''}
        </div>
        <div class="cta-wrap">
          <button class="btn primary big cta" data-action="open" data-level="${esc(first)}">${allDone ? 'Play again' : 'Start'}: ${esc(firstLv.title)}</button>
          <p class="how">${allDone ? 'Replay any level to keep your skills fresh or to earn 3 stars.' : 'Finished a course? Play its level for a short practice break.'}</p>
        </div>
      </section>
      <h2 class="section-title">Levels, in course order</h2>
      <ol class="levels">${cards}</ol>
    </main>
    <footer class="about">${esc(ABOUT)}</footer>`;
  // Focus never falls back to <body>: a warning first, else the next-up button after leaving a level, else the title.
  const n = notice && $('#map .notice.warn');
  if (n) { n.tabIndex = -1; n.focus({preventScroll: true}); }
  else { const t = (fromLevel && $('#map .cta')) || $('#mapTitle'); if (t) t.focus({preventScroll: true}); }
  syncLoop();
}

// ---------- level flow ----------
function openLevel(id) {
  const lv = S.game.levels[levelIndex(id)];
  if (!lv) return false;
  clearTimers();
  closeOverlay(); closeDialog();
  unlockSheet();
  disposeView();
  const mech = MECHANICS[lv.mechanic];
  const timed = !isFirstLevel(lv) && !S.settings.noTimer && !textMode();
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  let state;
  try { state = mech.rules.init(lv, {seed, timed}); } catch (e) {
    // Nothing of the failed level is kept: back to a clean map with a readable message.
    console.error('level init failed', lv.id, e);
    S.level = null; S.mech = null; S.run = null; S.fb = null; S.pausedFrom = null;
    $('#play').hidden = true; $('#results').hidden = true;
    showMap(`"${lv.title}" could not start: ${e && e.message ? e.message : e}. Pick another level, or try again later.`);
    return false;
  }
  S.level = lv; S.mech = mech;
  S.run = {state, seed, timed, mistakes: 0, review: [], grace: GRACE_AFTER_EVENT, finished: false, failed: false, started: false, streak: 0, bestStreak: 0, density: 0};
  writeJSON(KEY_PREFIX + 'last', {game: S.gameId, level: lv.id});
  setScreen('coach');
  $('#results').hidden = true;
  $('#play').hidden = false;
  applyPlayMode();
  const sc = $('#sheetScene'); sc.textContent = lv.scene || ''; sc.hidden = !lv.scene; // shown on wide layouts only (CSS)
  buildView();
  renderSheet(true);
  renderHUD();
  showCoach();
  syncLoop();
  return true;
}
function buildView() {
  if (textMode() || !S.engine) return;
  const th = theme();
  const accent = typeof look.accentSet === 'function' ? safe(() => look.accentSet(th.accent)) : undefined;
  // Keep the engine's lights (accent pool, rim) in the game's own accent and mood.
  const lookKey = th.accent + '|' + th.mood;
  if (S.engineLook !== lookKey) {
    if (S.engine.setAccent) safe(() => S.engine.setAccent(th.accent));
    if (S.engine.setMood) safe(() => S.engine.setMood(th.mood));
    S.engineLook = lookKey;
  }
  if (!S.world || S.worldFor !== th.world) {
    if (S.world) { S.engine.scene.remove(S.world.group); S.world.dispose && S.world.dispose(); }
    const W = WORLDS[th.world] || WORLDS.office;
    try {
      // ctx.reduced is a live getter (and ctx.isReduced() a function) so a world that reads it per frame follows a
      // change of the OS reduced-motion setting without a rebuild.
      S.world = W.build({THREE, look, kit: S.engine.kit, theme: th, quality: S.engine.quality, mood: look.moodOf(th.mood), get reduced() { return S.reduced; }, isReduced: () => S.reduced, accent});
      S.engine.scene.add(S.world.group); S.worldFor = th.world;
      const bg = look.moodOf(th.mood).bg; document.documentElement.style.setProperty('--scene', '#' + new THREE.Color(bg).getHexString());
      document.documentElement.dataset.mood = th.mood;
    } catch (e) { console.error('world failed', e); S.world = null; }
  }
  try {
    S.view = S.mech.createView({THREE, engine: S.engine, look, world: S.world, theme: th, level: S.level, props: S.props, get reduced() { return S.reduced; }, isReduced: () => S.reduced, accent});
    S.view.sync(S.run.state);
  } catch (e) { console.error('view failed', e); S.view = null; }
  S.engine.resize();
}
function safe(fn) { try { return fn(); } catch (e) { console.error(e); return undefined; } }
function disposeView() {
  if (S.view) { try { S.view.dispose(); } catch (e) { console.error(e); } S.view = null; }
  if (S.engine && S.engine.setInsets) safe(() => S.engine.setInsets({}, {ease: 0}));
  if (S.engine && S.engine.setFocus) safe(() => S.engine.setFocus(null));
}
// While the blocking feedback sheet is open the bottom sheet keeps its height, so the canvas does not resize (and the
// camera does not jump) under the dialog when the next item's card renders behind it.
function lockSheet() {
  const sh = $('#sheet');
  if (!sh || sh.classList.contains('locked') || textMode() || isWide()) return;
  sh.style.minHeight = `${Math.round(sh.getBoundingClientRect().height)}px`; // min only: never clips if the next card is taller
  sh.classList.add('locked');
}
function unlockSheet() {
  const sh = $('#sheet');
  if (!sh || !sh.classList.contains('locked')) return false;
  sh.classList.remove('locked'); sh.style.minHeight = '';
  return true;
}
// Frame the action into the part of the canvas the feedback sheet leaves visible.
function insetForDialog() {
  if (!S.engine || !S.engine.setInsets || textMode()) return;
  const o = $('#overlay'), d = o && o.querySelector('.dialog'), c = $('#gl');
  if (!d || !c || o.hidden) return;
  const cr = c.getBoundingClientRect(), dTop = o.getBoundingClientRect().top + d.offsetTop; // offsetTop ignores the slide-in transform
  // only a bottom sheet across the canvas leaves a useful band above it (a centred dialog on wide or sideways layouts does not)
  const coversWidth = d.offsetWidth >= cr.width * .7 && dTop + d.offsetHeight >= window.innerHeight - 2;
  const bottom = coversWidth ? Math.max(0, Math.min(cr.height, cr.bottom - dTop)) : 0;
  safe(() => S.engine.setInsets({top: 0, bottom}, {ease: .35}));
}
function applyPlayMode() {
  const tm = textMode();
  $('#play').classList.toggle('text', tm);
  $('#tmBadge').hidden = !tm;
  if (!tm && S.engine) requestAnimationFrame(() => S.engine && S.engine.resize());
}
function showCoach() {
  const lv = S.level, i = levelIndex(lv.id), steps = S.mech.howTo(lv) || [];
  const timerNote = textMode() ? 'Text mode: no timer. Take your time.'
    : isFirstLevel(lv) ? 'Practice round: no timer. Take your time.'
    : S.run.timed ? 'About 20 seconds for each one. You can turn the timer off in Settings.' : 'No timer. Take your time.';
  showOverlay(`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="coach-t"${lv.scene ? ' aria-describedby="coach-scene"' : ''}>
    ${lv.scene ? `<p class="scene" id="coach-scene">${esc(lv.scene)}</p>` : ''}
    <p class="eyebrow">Level ${i + 1} of ${S.game.levels.length} &middot; After course ${lv.order || i + 1}</p>
    <h2 id="coach-t">${esc(lv.title)}</h2>
    <p class="lead">You will practice: <strong>${esc(lv.skill)}</strong></p>
    <ol class="steps">${steps.slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <ul class="notes">
      <li><span class="heart">${I.heart}</span><span>You have 3 hearts. A wrong answer costs one.</span></li>
      <li>${I.clock}<span>${esc(timerNote)}</span></li>
    </ul>
    <div class="actions">
      <button class="btn primary big block" data-action="begin" data-primary>Start</button>
      <button class="btn ghost block" data-action="map">Back to levels</button>
    </div>
  </div>`);
}
function begin() {
  if (S.screen !== 'coach' || !S.run) return false;
  closeOverlay();
  S.run.started = true; S.run.grace = GRACE_AFTER_EVENT;
  setScreen('play');
  renderSheet();
  focusItem();
  syncLoop();
  return true;
}
// A new item is on screen: keyboard and screen-reader users land on the card title (or the first choice if there is no card).
function focusItem() {
  if (!(S.lastKeyboard || textMode())) return;
  const h = $('#cardTitle');
  if (h && !$('#card').hidden && h.textContent) { h.focus({preventScroll: true}); return; }
  const b = $('#choices button:not([disabled])');
  if (b) b.focus({preventScroll: true});
}

function splitChoices(v) {
  const all = (v && v.choices) || [];
  return {prim: all.filter((c) => c.kind !== 'secondary').slice(0, MAX_CHOICES), sec: all.filter((c) => c.kind === 'secondary')};
}
function choose(choiceId) {
  if (S.screen !== 'play' || !S.run || S.run.finished) return false;
  const v = S.mech.rules.view(S.run.state);
  const c = (v.choices || []).find((x) => String(x.id) === String(choiceId));
  if (!c || c.done) return false;
  const r = S.mech.rules.act(S.run.state, c.id);
  S.run.state = r.state;
  if (!(r.events || []).some((ev) => ev.type === 'right' || ev.type === 'wrong' || ev.type === 'timeout')) tone('tap');
  handleEvents(r.events || [], c.label);
  return true;
}
// Streak tiers: 1 from 3 in a row (accent), 2 from 5 (gold), 3 from 8 (gold with a glow). 0 below 3.
const streakTier = (n) => (n >= 8 ? 3 : n >= 5 ? 2 : n >= STREAK_MIN ? 1 : 0);
function handleEvents(events, pickedLabel = '') {
  let feedback = null, done = false, scored = false, rightStreak = 0;
  if ((events || []).some((ev) => ev.type === 'wrong' || ev.type === 'timeout')) lockSheet(); // before the card changes
  for (const raw of events || []) {
    let ev = raw;
    if (ev.type === 'right') {
      S.run.streak += 1;
      S.run.bestStreak = Math.max(S.run.bestStreak, S.run.streak);
      ev = {...raw, streak: S.run.streak, tier: streakTier(S.run.streak)};
      rightStreak = S.run.streak;
    } else if (ev.type === 'wrong' || ev.type === 'timeout') S.run.streak = 0;
    if (S.view) { try { S.view.event(ev); } catch (e) { console.error(e); } }
    // The world answers too: its accent strips and lamps flash, and stay brighter as the streak climbs.
    if (S.world && typeof S.world.event === 'function') { try { S.world.event(ev); } catch (e) { console.error(e); } }
    if (ev.type === 'right') { scored = true; }
    else if (ev.type === 'wrong' || ev.type === 'timeout') {
      scored = true;
      S.run.mistakes += 1;
      if (ev.review) S.run.review.push({title: ev.review.title, correct: ev.review.correct, why: ev.why, timeout: ev.type === 'timeout'});
      feedback = ev;
    } else if (ev.type === 'done') done = true;
  }
  if (rightStreak && !feedback) {
    const last = [...events].reverse().find((e) => e.type === 'right');
    showToast(pickedLabel, last && last.why, rightStreak);
    tone('right', rightStreak);
    // about 8% push-in at the first right answer, growing to about 14% at 8 in a row
    if (S.engine && S.engine.punch && !S.reduced) safe(() => S.engine.punch(Math.min(1 + (rightStreak - 1) * .11, 1.75)));
    if (S.engine && S.engine.flash && !textMode()) safe(() => S.engine.flash(0x3ee08a, Math.min(1.4, .8 + rightStreak * .08)));
    showStreak(rightStreak);
  } else if (feedback) {
    tone('wrong'); hideStreak();
    if (S.engine && S.engine.flash && !textMode()) safe(() => S.engine.flash(0xff4a3d, 1));
  }
  if (scored) S.run.grace = GRACE_AFTER_EVENT;
  if (S.view) { try { S.view.sync(S.run.state); } catch (e) { console.error(e); } }
  if (S.run.mistakes >= MAX_HEARTS) { S.run.failed = true; S.run.finished = true; }
  if (done || S.mech.rules.done(S.run.state)) S.run.finished = true;
  renderSheet(true);
  renderHUD();
  if (feedback) openFeedback(feedback);
  else if (S.run.finished) {
    // The last answer was right: keep its confirmation on screen briefly, then show results.
    setScreen('feedback');
    S.resultsTimer = setTimeout(() => showResults(), 1100);
  }
}
function showStreak(n) {
  const el = $('#streak');
  clearTimeout(S.streakTimer);
  if (!el || n < STREAK_MIN) { hideStreak(); return; }
  el.innerHTML = `${I.bolt}<span>${n} in a row</span>`;
  el.hidden = false;
  el.className = `streak t${streakTier(n)}`;
  void el.offsetWidth; el.classList.add('pop'); // re-pops on every increment
  S.streakTimer = setTimeout(hideStreak, STREAK_CHIP_MS);
}
function hideStreak() { clearTimeout(S.streakTimer); const el = $('#streak'); if (el) el.hidden = true; }
function openFeedback(ev) {
  hideToast();
  S.fb = ev;
  setScreen('feedback');
  const left = MAX_HEARTS - S.run.mistakes;
  const heartsLine = S.run.failed ? 'That was your last heart.' : `You have ${left} ${left === 1 ? 'heart' : 'hearts'} left.`;
  showOverlay(`<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="fb-t" aria-describedby="fb-why">
    <div class="fb-head"><span class="fb-icon">${ev.type === 'timeout' ? I.clock : I.cross}</span><h2 id="fb-t">${ev.type === 'timeout' ? 'Out of time' : 'Not quite'}</h2></div>
    ${ev.review && ev.review.title && !includesText(ev.correctLabel, ev.review.title) ? `<p class="fb-for">${esc(ev.review.title)}</p>` : ''}
    <div class="fb-answer"><p class="lbl">The right answer</p><p class="val">${esc(ev.correctLabel)}</p></div>
    <p class="fb-why" id="fb-why">${esc(ev.why)}</p>
    <p class="fb-hearts">${esc(heartsLine)}</p>
    <div class="actions"><button class="btn primary big block" data-action="gotit" data-primary>Got it</button></div>
  </div>`);
  announce(`${ev.type === 'timeout' ? 'Out of time' : 'Not quite'}. The right answer: ${ev.correctLabel}. ${ev.why}`, true);
  requestAnimationFrame(insetForDialog);
}
// true when b's words appear in a (case and punctuation insensitive): used to avoid saying the same thing twice
function includesText(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const na = norm(a), nb = norm(b);
  return !!nb && (` ${na} `).includes(` ${nb} `);
}
function gotIt() {
  if (S.screen !== 'feedback') return false;
  const wasBlocking = !!S.fb;
  closeOverlay(); S.fb = null;
  if (S.run.finished) { showResults(); return true; }
  if (S.engine && S.engine.setInsets) safe(() => S.engine.setInsets({}, {ease: .35}));
  if (unlockSheet()) fitSheet();
  S.run.grace = GRACE_AFTER_EVENT;
  setScreen('play');
  if (wasBlocking && S.view) { try { S.view.event({type: 'resume'}); } catch (e) { console.error(e); } }
  focusItem();
  syncLoop();
  return true;
}
function confettiHTML() {
  const colors = ['#ad2c4d', '#c49a4a', '#2b7bb9', '#4a9b4f', 'var(--accent)', '#e8c46a'];
  let h = '';
  for (let k = 0; k < 34; k++) {
    const x = (k * 37 + 11) % 100, d = (k * 53) % 700, r = (k * 71) % 360, dx = ((k * 29) % 60) - 30, c = colors[k % colors.length];
    h += `<i style="--x:${x}%;--d:${d}ms;--r:${r}deg;--dx:${dx}px;--c:${c}"></i>`;
  }
  return `<div class="confetti" aria-hidden="true">${h}</div>`;
}
function showResults() {
  clearTimers();
  if (!S.run) return;
  closeOverlay(); hideToast(); hideStreak(); unlockSheet();
  const won = !S.run.failed;
  const stars = won ? Math.max(1, MAX_HEARTS - S.run.mistakes) : 0;
  const best = S.run.bestStreak;
  S.lastResult = {won, stars, mistakes: S.run.mistakes};
  if (won) {
    const prev = S.save.best[S.level.id] || 0;
    if (stars > prev) { S.save.best[S.level.id] = stars; writeJSON(KEY_PREFIX + S.gameId, {best: S.save.best}); }
    tone('done');
  }
  setScreen('results');
  syncLoop();
  const lv = S.level, i = levelIndex(lv.id), next = S.game.levels[i + 1];
  const review = S.run.review.length
    ? `<section class="review"><h2>Review what you missed</h2><ul>${S.run.review.map((r) => `<li><p class="rt">${esc(r.title)}</p><p class="ra">Right answer: ${esc(r.correct)}</p><p class="rw">${esc(r.why)}</p></li>`).join('')}</ul></section>`
    : `<p class="clean">No mistakes this time. Nicely done.</p>`;
  const primary = won ? (next ? `<button class="btn primary big block" data-action="open" data-level="${esc(next.id)}" data-primary>Next level: ${esc(next.title)}</button>` : `<button class="btn primary big block" data-action="map" data-primary>Back to all levels</button>`)
    : `<button class="btn primary big block" data-action="open" data-level="${esc(lv.id)}" data-primary>Try again: ${esc(lv.title)}</button>`;
  const secondary = won
    ? `<div class="row"><button class="btn secondary" data-action="open" data-level="${esc(lv.id)}">Replay</button>${next ? `<button class="btn secondary" data-action="map">All levels</button>` : ''}</div>`
    : `<button class="btn secondary block" data-action="map">All levels</button>`;
  const party = won && stars === 3 && !S.reduced;
  const el = $('#results');
  el.innerHTML = `<div class="res-in">
    <section class="res-head${won ? ' won' : ''}${party ? ' party' : ''}" aria-labelledby="res-t">
      ${party ? confettiHTML() : ''}
      <p class="eyebrow">Level ${i + 1} &middot; ${esc(lv.title)}</p>
      <h1 id="res-t" tabindex="-1">${won ? (stars === 3 ? 'Level complete. Perfect run.' : 'Level complete') : 'Out of hearts'}</h1>
      ${won ? `<div class="res-stars" role="img" aria-label="${stars} of 3 stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : 'off'}" style="--i:${k - 1}">${I.star}</span>`).join('')}</div>` : ''}
      <p class="practiced">You practiced: <strong>${esc(lv.skill)}</strong></p>
      ${best >= STREAK_MIN ? `<p class="best-streak">${I.bolt}<span>Best streak: ${best}</span></p>` : ''}
      ${won ? `<p class="lost">${S.run.mistakes ? `${S.run.mistakes} ${S.run.mistakes === 1 ? 'mistake' : 'mistakes'}. Replay any time for 3 stars.` : ''}</p>` : `<p class="lost">Three mistakes end a round. Read the review below, then try again. Retrying is free.</p>`}
    </section>
    <section class="takeaway"><p class="lbl">Remember</p><p>${esc(lv.takeaway)}</p></section>
    ${review}
    <div class="res-actions">${primary}${secondary}</div>
    <p class="set-note">${esc(ABOUT)}</p>
  </div>`;
  el.hidden = false; el.scrollTop = 0;
  $('#play').hidden = true;
  disposeView();
  if (party) S.confettiTimer = setTimeout(() => { const c = $('#results .confetti'); if (c) c.remove(); }, 3200);
  const h = $('#res-t'); if (h) h.focus({preventScroll: true});
  announce(won ? `Level complete. ${stars} of 3 stars.${best >= STREAK_MIN ? ` Best streak: ${best} in a row.` : ''}` : 'Out of hearts. Try again any time.');
}

// ---------- pause ----------
function pause() {
  if (S.screen !== 'play') return false; // coach and feedback sheets already freeze time
  S.pausedFrom = S.screen;
  hideToast(); hideStreak();
  showOverlay(`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="pz-t">
    <h2 id="pz-t">Paused</h2>
    <p class="lead">The clock is stopped. Pick up where you left off.</p>
    <div class="actions">
      <button class="btn primary big block" data-action="resume" data-primary>Resume</button>
      <button class="btn secondary block" data-action="open" data-level="${esc(S.level.id)}">Restart level</button>
      <button class="btn secondary block" data-action="settings">Settings</button>
      <button class="btn ghost block" data-action="map">All levels</button>
    </div></div>`);
  setScreen('paused');
  syncLoop();
  return true;
}
function resume() {
  if (S.screen !== 'paused') return false;
  closeOverlay();
  setScreen(S.pausedFrom || 'play');
  S.pausedFrom = null;
  if (S.run) S.run.grace = Math.max(S.run.grace, .4);
  renderSheet();
  focusItem();
  syncLoop();
  return true;
}

// ---------- rendering the sheet / HUD ----------
function renderHUD() {
  if (!S.run) return;
  const v = S.mech.rules.view(S.run.state), p = v.progress || {done: 0, total: 0};
  const cur = Math.min(p.total, p.done + 1);
  $('#progText').innerHTML = `<span class="pn">${cur} of ${p.total}</span><span class="lt"> &middot; ${esc(S.level.title)}</span>`;
  $('#progBar').style.width = `${p.total ? (p.done / p.total) * 100 : 0}%`;
  const left = Math.max(0, MAX_HEARTS - S.run.mistakes);
  const h = $('#hearts');
  h.innerHTML = [0, 1, 2].map((k) => `<span class="${k < left ? 'on' : 'off'}">${I.heart}</span>`).join('');
  h.setAttribute('aria-label', `${left} of 3 hearts left`);
  fitTitle();
}
// The level title in the top bar is shown whole or not at all (never cut mid-word).
function fitTitle() {
  const pt = $('#progText'), lt = pt && pt.querySelector('.lt');
  if (!lt || $('#play').hidden) return;
  lt.hidden = false;
  if (pt.scrollWidth > pt.clientWidth + 1) lt.hidden = true;
}
// Columns for the choice grid. density: 0 normal, 1 compact, 2 compact + wider use of two columns, 3 tightest.
function choiceCols(choices, density = 0) {
  const n = choices.length, longest = Math.max(0, ...choices.map((c) => String(c.label).length));
  // A single long word ("Accountability") cannot wrap, so in a half-width button it would break mid-word: use one column.
  const longWord = Math.max(0, ...choices.flatMap((c) => String(c.label).split(/s+/).map((w) => w.length)));
  if (n <= 1) return 'cols-1';
  if (longWord > 12 && density < 3) return 'cols-1';
  if (n === 2) return longest <= 22 ? 'cols-2' : 'cols-1';
  if (n === 3) return !isWide() && longest <= 12 ? 'cols-3' : 'cols-1'; // applyDensity() falls back to one column if a label would wrap
  if (density >= 3 || longest <= (density >= 2 ? 26 : 18)) return 'cols-2'; // tightest: two columns, labels wrap
  return 'cols-1';
}
function applyDensity(d) {
  const sheet = $('#sheet');
  for (let k = 1; k <= 3; k++) sheet.classList.toggle('d' + k, d >= k);
  $('#play').classList.toggle('slim', d >= 3);
  const ul = $('#choices'), cols = choiceCols(S.prim, d);
  ul.className = `choices ${cols}`;
  // Three in a row only when every label fits on one line (measured): never "Start / work" or a label past the edge.
  if (cols === 'cols-3' && ul.offsetParent) {
    const bad = [...ul.querySelectorAll('.choice .lbl')].some((l) => {
      const lh = parseFloat(getComputedStyle(l).lineHeight) || 20;
      return l.scrollWidth > l.clientWidth + 1 || l.offsetHeight > lh * 1.5;
    });
    if (bad) ul.className = 'choices cols-1';
  }
}
// B5: keep the 3D view usable on short phones. Step the sheet down (compact card, 44px buttons, two columns) until the
// canvas has its minimum height. Density only grows within a level so the layout does not jump back and forth.
function fitSheet(reset = false) {
  if (!S.run) return;
  if (textMode() || isWide()) { applyDensity(0); return; }
  if ($('#play').hidden || $('#sheet').classList.contains('locked')) return;
  if (reset) S.run.density = 0;
  let d = S.run.density || 0;
  const vh = window.innerHeight, need = Math.max(170, Math.round(vh * (vh >= 700 ? .38 : .3)));
  applyDensity(d);
  while (d < 3 && $('#stage').getBoundingClientRect().height < need) applyDensity(++d);
  S.run.density = d;
}
let lastCardKey = '';
function renderSheet(fresh = false) {
  if (!S.run) return;
  const v = S.mech.rules.view(S.run.state);
  const card = $('#card');
  let newItem = false;
  if (v.card) {
    card.hidden = false;
    const key = v.card.title + '|' + (v.card.lines || []).join('|');
    const kick = $('#cardKicker'), k = typeof v.card.kicker === 'string' ? v.card.kicker.trim() : '';
    kick.textContent = k; kick.hidden = !k;
    $('#cardTitle').textContent = v.card.title;
    $('#cardLines').innerHTML = (v.card.lines || []).slice(0, 3).map((l) => `<li>${esc(l)}</li>`).join('');
    if (fresh && key !== lastCardKey) {
      newItem = true;
      card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
      if (S.screen === 'play') announce(`${k ? k + '. ' : ''}${v.card.title}. ${(v.card.lines || []).join('. ')}`);
    }
    lastCardKey = key;
  } else { card.hidden = true; lastCardKey = ''; }
  $('#prompt').textContent = v.prompt || '';
  $('#prompt').hidden = !v.prompt;
  const {prim, sec} = splitChoices(v);
  S.prim = prim;
  const finished = S.run.finished;
  const ul = $('#choices');
  ul.innerHTML = prim.map((c, i) => `<li><button class="choice" data-choice="${esc(c.id)}" ${c.done || finished ? 'disabled' : ''} aria-keyshortcuts="${i + 1}"><span class="key" aria-hidden="true">${i + 1}</span><span class="lbl">${esc(c.label)}</span></button></li>`).join('');
  const more = $('#choiceMore');
  more.innerHTML = sec.map((c) => `<button class="choice-secondary" data-choice="${esc(c.id)}" ${c.done || finished ? 'disabled' : ''}>${esc(c.label)}</button>`).join('');
  more.hidden = !sec.length;
  renderTimer(v);
  fitSheet();
  if (newItem && S.screen === 'play' && !finished) focusItem();
}
function ticking() { return !!(S.run && S.run.timed && !S.settings.noTimer && !textMode()); }
function renderTimer(v = S.run && S.mech.rules.view(S.run.state)) {
  const el = $('#timer');
  if (!v || !v.timer || !ticking() || S.run.finished) { el.hidden = true; return; }
  el.hidden = false;
  const left = Math.max(0, v.timer.left), frac = v.timer.total ? left / v.timer.total : 0;
  $('#timerBar').style.width = `${(frac * 100).toFixed(1)}%`;
  const secs = Math.ceil(left);
  const txt = `${secs}s left`;
  const t = $('#timerText'); if (t.textContent !== txt) t.textContent = txt;
  el.classList.toggle('low', left <= 5);
}
function showToast(label, why, streak = 0) {
  const t = $('#toast');
  clearTimeout(S.toastTimer);
  const chip = streak >= STREAK_MIN ? `<span class="tstreak">${I.bolt}${streak} in a row</span>` : '';
  // "Right: <label>" unless the why already repeats a long label word for word (match: "Term: meaning."). Short labels
  // ("Software") always stay in the heading.
  const long = String(label || '').trim().split(/\s+/).length >= 3 || String(label || '').length >= 18;
  const head = label && !(long && includesText(why, label)) ? `Right: ${esc(label)}` : 'Right';
  t.innerHTML = `<span class="tic">${I.check}</span><span class="tbody"><strong>${head}</strong><span class="why">${esc(why || '')}</span>${chip}</span>`;
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  announce(`Right. ${why || ''}${streak >= STREAK_MIN ? ` ${streak} in a row.` : ''}`);
  S.toastTimer = setTimeout(hideToast, RIGHT_TOAST_MS);
}
function hideToast() { clearTimeout(S.toastTimer); const t = $('#toast'); if (t) t.hidden = true; }

// ---------- overlays ----------
function showOverlay(html) {
  const o = $('#overlay');
  o.innerHTML = html; o.hidden = false;
  const p = o.querySelector('[data-primary]') || o.querySelector('button');
  if (p) setTimeout(() => p.focus({preventScroll: true}), 30);
}
function closeOverlay() { const o = $('#overlay'); if (o) { o.hidden = true; o.innerHTML = ''; } }
function closeDialog() {
  const d = $('#dialog');
  if (!d || d.hidden) return;
  d.hidden = true; d.innerHTML = '';
  const back = $('#overlay:not([hidden]) [data-primary]') || $('[data-action="settings"]');
  if (back) back.focus({preventScroll: true});
}
function showSettings() {
  const s = S.settings, gl = S.glOk, q = S.engine ? S.engine.quality : (s.quality || 'medium');
  const d = $('#dialog');
  d.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="set-t">
    <h2 id="set-t">Settings</h2>
    <label class="set-row"><span class="txt"><strong>Sound</strong><small>Short tones for taps, right and wrong answers.</small></span><input type="checkbox" class="switch" role="switch" data-set="sound" ${s.sound ? 'checked' : ''}></label>
    <label class="set-row"><span class="txt"><strong>No timer</strong><small>Take as long as you need on every level.</small></span><input type="checkbox" class="switch" role="switch" data-set="noTimer" ${s.noTimer ? 'checked' : ''}></label>
    <div class="set-row set-graphics" role="radiogroup" aria-labelledby="gfx-t"><span class="txt"><strong id="gfx-t">Graphics</strong><small>${gl ? 'Lower is smoother on older phones.' : 'Not available in text mode.'}</small></span>
      <span class="seg">${look.LEVELS.map((lv) => `<label><input type="radio" name="gfx" value="${lv}" data-set="quality" ${q === lv ? 'checked' : ''} ${gl && !textMode() ? '' : 'disabled'}><span>${look.QUALITY[lv].label}</span></label>`).join('')}</span></div>
    <label class="set-row"><span class="txt"><strong>Text mode</strong><small>${gl ? 'Play with text and buttons only. No 3D, no timer.' : esc(S.glNote)}</small></span><input type="checkbox" class="switch" role="switch" data-set="textMode" ${textMode() ? 'checked' : ''} ${gl ? '' : 'disabled'}></label>
    <p class="set-note">${esc(ABOUT)}</p>
    <div class="actions"><button class="btn primary big block" data-action="close-settings" data-primary>Done</button></div>
  </div>`;
  d.hidden = false;
  d.querySelectorAll('[data-set]').forEach((inp) => inp.addEventListener('change', onSetting));
  setTimeout(() => { const f = d.querySelector('input:not([disabled])'); if (f) f.focus({preventScroll: true}); }, 30);
}
function onSetting(e) {
  const k = e.target.dataset.set;
  if (k === 'quality') { S.settings.quality = e.target.value; if (S.engine) S.engine.setQuality(e.target.value, 'chosen in settings'); }
  else S.settings[k] = !!e.target.checked;
  if (k === 'textMode' && !e.target.checked) S.forceText = false;
  writeJSON(KEY_PREFIX + 'settings', S.settings);
  if (k === 'sound' && S.settings.sound) tone('right');
  if (k === 'textMode') {
    if (S.level && ['coach', 'play', 'feedback', 'paused'].includes(S.screen)) {
      if (textMode()) disposeView(); else if (!S.view) buildView();
      applyPlayMode(); renderSheet();
    }
    if (S.screen === 'map') showMap();
    showSettings();
  }
  if (k === 'noTimer') renderTimer();
  syncLoop();
}

// ---------- loop ----------
function frame(dt) {
  if (!(dt >= 0) || !Number.isFinite(dt)) dt = 1 / 60; // never let a bad frame time reach the rules (0 stays 0)
  if (S.world && S.world.update) S.world.update(dt);
  if (S.run && S.screen === 'play' && ticking() && !S.run.finished) {
    if (S.run.grace > 0) S.run.grace -= dt;
    else {
      const r = S.mech.rules.tick(S.run.state, dt);
      S.run.state = r.state;
      if (r.events && r.events.length) handleEvents(r.events);
      else if (S.view) S.view.sync(S.run.state);
      renderTimer();
    }
  }
  if (S.view) S.view.update(dt);
}
function syncLoop() {
  if (!S.engine) return;
  const want = S.glOk && !textMode() && !!S.view && ['coach', 'play', 'feedback'].includes(S.screen) && !document.hidden;
  if (want) S.engine.start(); else S.engine.stop();
}
function clearTimers() { clearTimeout(S.resultsTimer); S.resultsTimer = 0; clearTimeout(S.confettiTimer); hideToast(); hideStreak(); }
function setScreen(s) {
  S.screen = s;
  $('#map').hidden = s !== 'map';
  if (s === 'map') { $('#play').hidden = true; $('#results').hidden = true; closeOverlay(); }
  document.body.dataset.screen = s;
}
function announce(msg, assertive = false) {
  const el = $(assertive ? '#alert' : '#live'); if (!el) return;
  el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 40);
}

// ---------- input ----------
function onClick(e) {
  const btn = e.target.closest('button, [data-action]');
  if (!btn || !S.app.contains(btn)) return;
  if (btn.dataset.choice !== undefined) { choose(btn.dataset.choice); return; }
  const a = btn.dataset.action;
  if (!a) return;
  if (a === 'open') openLevel(btn.dataset.level);
  else if (a === 'begin') begin();
  else if (a === 'gotit') gotIt();
  else if (a === 'map' || a === 'exit') showMap();
  else if (a === 'pause') pause();
  else if (a === 'resume') resume();
  else if (a === 'settings') showSettings();
  else if (a === 'close-settings') closeDialog();
}
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// Keeps Tab inside the open sheet (feedback, coach, pause, settings).
function trapTab(e) {
  const box = !$('#dialog').hidden ? $('#dialog') : !$('#overlay').hidden ? $('#overlay') : null;
  if (!box) return false;
  const items = [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
  if (!items.length) { e.preventDefault(); return true; }
  const first = items[0], last = items[items.length - 1], inside = box.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
  return true;
}
// Arrow keys move between the choice buttons (grid aware); the quiet secondary button comes last.
function moveChoice(key) {
  const grid = [...document.querySelectorAll('#choices button:not([disabled])')];
  const list = [...grid, ...document.querySelectorAll('#choiceMore button:not([disabled])')];
  if (!list.length) return false;
  const at = list.indexOf(document.activeElement);
  if (at < 0) { list[0].focus(); return true; }
  const cols = Math.max(1, (getComputedStyle($('#choices')).gridTemplateColumns || '').split(' ').filter(Boolean).length);
  let to = at;
  if (key === 'ArrowRight') to = at + 1;
  else if (key === 'ArrowLeft') to = at - 1;
  else if (key === 'ArrowDown') {
    if (at >= grid.length) to = at + 1;
    else {
      to = at + cols;
      const lastRow = Math.floor((grid.length - 1) / cols);
      if (to >= grid.length) to = Math.floor(at / cols) < lastRow ? grid.length - 1 : grid.length; // grid.length = the secondary button, if any
    }
  } else if (key === 'ArrowUp') to = at > grid.length ? at - 1 : at === grid.length ? grid.length - 1 : (at - cols >= 0 ? at - cols : at);
  to = Math.max(0, Math.min(list.length - 1, to));
  list[to].focus();
  return true;
}
function bindGlobal() {
  document.addEventListener('keydown', (e) => {
    S.lastKeyboard = true;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Tab' && trapTab(e)) return;
    const tag = (e.target && e.target.tagName) || '';
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (!$('#dialog').hidden) { if (e.key === 'Escape') { e.preventDefault(); closeDialog(); } return; }
    if (e.key === 'Escape' || (!inField && (e.key === 'p' || e.key === 'P'))) {
      if (S.screen === 'paused') { e.preventDefault(); resume(); return; }
      if (S.screen === 'play') { e.preventDefault(); pause(); return; }
      return;
    }
    if (S.screen === 'play' && !inField && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      if (moveChoice(e.key)) e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && !inField && !(tag === 'BUTTON' || tag === 'A')) {
      const p = S.screen === 'results' ? $('#results [data-primary]') : $('#overlay:not([hidden]) [data-primary]');
      if (p) { e.preventDefault(); p.click(); }
      return;
    }
    if (S.screen === 'play' && !inField && /^[1-6]$/.test(e.key)) {
      const c = splitChoices(S.mech.rules.view(S.run.state)).prim[Number(e.key) - 1];
      if (c && !c.done) { e.preventDefault(); choose(c.id); }
    }
  });
  document.addEventListener('pointerdown', () => { S.lastKeyboard = false; }, true);
  document.addEventListener('visibilitychange', syncLoop);
  let rt = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rt);
    rt = requestAnimationFrame(() => {
      if (!S.run || $('#play').hidden) return;
      const relock = unlockSheet();
      fitSheet(true); fitTitle();
      if (relock && S.screen === 'feedback' && S.fb) { lockSheet(); insetForDialog(); }
    });
  });
}

// ---------- test hook (frozen contract; additions only) ----------
function hookView() {
  if (!S.run || !S.mech) return null;
  const v = S.mech.rules.view(S.run.state);
  if (!v || !Array.isArray(v.choices)) return v;
  return {...v, choices: v.choices.map((c) => ({...c, kind: c.kind === 'secondary' ? 'secondary' : 'primary'}))};
}
function installHook() {
  window.__arcade = {
    get ready() { return S.ready; },
    get error() { return S.error; },
    screen: () => S.screen,
    levelIds: () => (S.game ? S.game.levels.map((l) => l.id) : []),
    startLevel: (id) => openLevel(id),
    begin: () => begin(),
    view: () => hookView(),
    hint: () => (S.run && S.mech && !S.run.finished ? S.mech.rules.hint(S.run.state) : null),
    choose: (id) => choose(id),
    dismiss: () => gotIt(),
    result: () => (S.screen === 'results' ? {...S.lastResult} : null),
    textMode: () => textMode(),
    glOk: () => S.glOk,
    // extras for debugging (not part of the frozen contract)
    pause: () => pause(),
    resume: () => resume(),
    quality: () => (S.engine ? S.engine.quality : null),
    stats: () => (S.engine ? S.engine.stats() : null),
    engine: () => S.engine,
    streak: () => (S.run ? S.run.streak : 0)
  };
}
