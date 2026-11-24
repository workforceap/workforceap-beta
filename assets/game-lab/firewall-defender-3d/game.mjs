import {META, SAVE_KEY, STAGES, REDUCED_SPEED, ACTION_LABEL, fresh, tick, decide, mostUrgent, cycleTarget, goals, stars, xpFor, emptySave, loadSave, record, score, evidence, actionsFor, evaluatePolicy, describeRule, explain, POLICY_SOURCES} from './rules.mjs';
import {createScene, webglAvailable} from './scene.mjs';

const $ = (id) => document.getElementById(id);
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
const starsText = (n) => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n);
// Only items judged bad are called "threats"; items that can be legitimate are called "traffic".
const cleanGoal = (t) => String(t).replace(/Make a call on all (\d+) threats/, 'Make a call on all $1 traffic items');

let save = emptySave();
try { save = loadSave(localStorage.getItem(SAVE_KEY)); } catch { save = emptySave(); }
let s = fresh(0), stageIdx = 0, selectedId = null, paused = false, textMode = false, glOk = false, sound = false, ended = false, logShown = 0, scene = null;
let reduced = mq.matches, raf = 0, lastT = 0, feedbackMsg = '', feedbackKind = '', lastResolvedLabel = '';
let quality = 'medium', qualityNote = '';

function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage blocked: session only */ } }

let actx = null;
function beep(freq, ms = 90) {
  if (!sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; g.gain.value = .05; o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + ms / 1000);
  } catch { /* audio unavailable */ }
}

function setQualityUI(level, note) {
  quality = level; qualityNote = note || '';
  document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === level)));
  const q = $('qnote');
  if (q) q.textContent = `Graphics: ${level}${note ? ' (' + note + ')' : ''}. ${level === 'low' ? 'No shadows, no glow.' : level === 'medium' ? 'Soft shadows, LED glow.' : 'Large soft shadows, sharpest.'}`;
}

function say(msg) {
  const li = document.createElement('li'); li.textContent = msg;
  const log = $('log'); log.appendChild(li);
  while (log.children.length > 40) log.removeChild(log.firstChild);
}
function flushEngineLog() { while (logShown < s.log.length) say(s.log[logShown++]); }

function feedback(msg, kind, prevLabel = '') {
  feedbackMsg = msg; feedbackKind = kind;
  const fb = $('feedback'); fb.className = kind; fb.innerHTML = '';
  if (kind === 'good' || kind === 'bad') {
    const tag = document.createElement('span'); tag.className = 'prevtag';
    tag.textContent = `Previous packet${prevLabel ? ' (' + prevLabel + ')' : ''}`;
    const body = document.createElement('span'); body.textContent = ' ' + msg;
    fb.append(tag, body);
  } else {
    fb.textContent = msg;
  }
}

const timed = () => !textMode;
const speed = () => (reduced ? REDUCED_SPEED : 1);
const modal = () => !$('title').classList.contains('hidden') || !$('end').classList.contains('hidden') || paused;

function ensureSelection() {
  if (!s.items.some((i) => i.id === selectedId)) selectedId = mostUrgent(s);
}
const selected = () => s.items.find((i) => i.id === selectedId) || null;
const shortItem = (it) => (it ? `${it.label.l1} \u2022 ${it.label.l2}` : '');

function syncPromptIfIdle() {
  if (feedbackKind) return;
  const it = selected();
  const guide = it && it.data.kind !== 'packet' ? 'check the highlighted content/identity rule' : 'check the highlighted policy rule';
  const text = it
    ? `Selected: ${shortItem(it)} \u2014 ${guide}, then choose Allow (A)${actionsFor(stageIdx).includes('reset') ? ', Block (B) or Reset (R).' : ' or Block (B).'}`
    : 'Pick an incoming traffic item, check the highlighted policy rule, then decide.';
  feedbackMsg = text; $('feedback').className = ''; $('feedback').textContent = text;
}

// ---- rendering of the DOM side ----
function renderEvidence() {
  const it = selected(), dl = $('ev'); dl.innerHTML = '';
  if (!it) { const a = document.createElement('dt'), b = document.createElement('dd'); a.textContent = 'None'; b.textContent = 'Waiting for incoming traffic'; dl.append(a, b); return; }
  for (const [k, v] of evidence(it.data)) { const a = document.createElement('dt'), b = document.createElement('dd'); a.textContent = k; b.textContent = v; dl.append(a, b); }
}
function renderPolicy() {
  const st = STAGES[stageIdx], ol = $('policy'); ol.innerHTML = '';
  const showPolicy = !!st.policy || st.mode === 'mixed';
  const ccBox = $('contentChecksBox'), ccList = $('contentChecks');
  $('policy').hidden = !showPolicy; $('how').hidden = showPolicy;
  if (ccBox) ccBox.hidden = st.mode !== 'mixed';
  if (showPolicy) {
    $('rulesTitle').textContent = 'Firewall policy (packet rules \u2014 first match wins)';
    const pol = st.policy || POLICY_SOURCES, it = selected();
    const hit = it && it.data.kind === 'packet' ? evaluatePolicy(pol, it.data).ruleIndex : -2;
    pol.forEach((r, i) => { const li = document.createElement('li'); li.className = i === hit ? 'hit' : ''; li.innerHTML = ''; const c = document.createElement('code'); c.textContent = describeRule(r); li.append(c, ` - ${r.note}`); if (i === hit) li.append(' \u2190 matches the selected packet'); ol.appendChild(li); });
    if (st.mode === 'mixed' && ccList) {
      ccList.innerHTML = '';
      const checks = [
        {kind: 'email', text: 'Email check: compare sender domain vs claimed brand and real link target (urgent wording alone is not proof).'},
        {kind: 'login', text: 'Login check: inspect failed attempts, location/device and MFA \u2014 Allow normal sign-in, Block attacks, or Reset stolen accounts.'}
      ];
      checks.forEach((chk) => {
        const li = document.createElement('li');
        const isHit = !!(it && it.data.kind === chk.kind);
        li.dataset.check = chk.kind;
        li.className = isHit ? 'hit' : '';
        li.textContent = chk.text + (isHit ? ` \u2190 matches the selected ${chk.kind}` : '');
        ccList.appendChild(li);
      });
    }
  } else {
    $('rulesTitle').textContent = 'Content and identity checks (how to judge an email)';
    $('how').innerHTML = '';
    const it = selected(), isEmail = !!(it && it.data.kind === 'email');
    ['Does the sender domain match the real company domain?', 'Does the link text match where the link really goes?', 'Urgent wording alone is not proof either way.'].forEach((t, idx) => { const li = document.createElement('li'); if (isEmail && idx === 0) li.className = 'hit'; li.textContent = t; $('how').appendChild(li); });
  }
}
function renderThreatList() {
  const box = $('threats'); box.innerHTML = '';
  const list = s.items.slice().sort((a, b) => b.p - a.p);
  if (!list.length) { const p = document.createElement('p'); p.style.margin = '0'; p.textContent = s.spawned < s.total ? 'Next traffic item arriving...' : 'Clear.'; box.appendChild(p); return; }
  for (const it of list) {
    const b = document.createElement('button'); b.className = 'threat'; b.dataset.id = it.id; b.setAttribute('aria-pressed', String(it.id === selectedId));
    const pct = Math.round(it.p * 100);
    b.innerHTML = '';
    const a = document.createElement('span'); a.textContent = `${it.label.l1} \u2022 ${it.label.l2}`;
    const m = document.createElement('span'); m.className = 'meter'; m.title = `Time to firewall: ${pct}% of the way to the barrier`;
    const i = document.createElement('i'); i.style.width = pct + '%'; if (it.p > .7) i.className = 'hot'; m.appendChild(i);
    b.append(a, m);
    b.setAttribute('aria-label', `${it.label.l1} ${it.label.l2}, ${textMode ? 'waiting for your call' : pct + ' percent of the way to the firewall'}${it.id === selectedId ? ', selected' : ''}`);
    b.addEventListener('click', () => { selectedId = it.id; syncPromptIfIdle(); if (scene) scene.sync(s.items, selectedId); renderSide(); renderHud(); });
    box.appendChild(b);
  }
}
function renderSide() {
  renderEvidence(); renderPolicy(); renderThreatList(); syncPromptIfIdle();
  const acts = actionsFor(stageIdx), locked = paused || s.status !== 'play' || !selected();
  for (const a of ['allow', 'block', 'reset']) { const b = $('act-' + a); b.hidden = !acts.includes(a); b.disabled = locked; }
}
function renderHud() {
  const st = STAGES[stageIdx], sel = selected();
  $('stageName').textContent = `${st.title}: ${st.name}`;
  $('lives').textContent = `Lives: ${'\u2665'.repeat(Math.max(0, s.hp))}${'\u2661'.repeat(3 - Math.max(0, s.hp))} (${Math.max(0, s.hp)}/3)`;
  $('xp').textContent = `XP: ${xpFor(s)}`;
  $('stars').textContent = `Best stars: ${save.best.join(' / ')}`;
  $('brief').textContent = st.brief;
  $('prog').textContent = `Handled ${s.handled}/${s.total}`;
  $('goals').innerHTML = '';
  goals(s).forEach((g) => { const li = document.createElement('li'); li.className = g.failed ? 'failed' : ''; li.textContent = `${g.done ? '\u2611 Done:' : g.failed ? '\u2612 Missed:' : '\u2610 To do:'} ${cleanGoal(g.text)}`; $('goals').appendChild(li); });
  $('mute').textContent = `Sound: ${sound ? 'on' : 'off'} (M)`; $('mute').setAttribute('aria-pressed', String(sound));
  $('pause').setAttribute('aria-pressed', String(paused));
  $('textMode').setAttribute('aria-pressed', String(textMode));
  document.body.classList.toggle('textmode', textMode);
  $('modeTag').textContent = textMode ? 'Text mode: no timer' : (sel ? `Selected: ${shortItem(sel)} \u2022 click a pad` : (reduced ? 'Reduced motion: traffic is slower' : 'Click a traffic item, then a pad'));
  $('tip').textContent = textMode ? 'Text mode: nothing moves and there is no timer. Take your time; the decisions are the same.' : 'Decide before an item reaches the firewall. Selected traffic items have a yellow ring.';
}
function stepSim(dt) {
  if (s.status !== 'play' || modal()) return s;
  const hp0 = s.hp;
  const beforeMap = new Map(s.items.map((i) => [i.id, shortItem(i)]));
  s = tick(s, dt, {speed: speed(), timed: true});
  if (s.events.length) { flushEngineLog(); handleEvents(s.events, beforeMap); if (s.hp !== hp0 || s.status !== 'play') afterAction(); }
  ensureSelection();
  if (scene) scene.sync(s.items, selectedId);
  renderHud(); renderSide();
  return s;
}
function renderAll() {
  ensureSelection(); renderHud(); renderSide();
  if (scene && !textMode) scene.sync(s.items, selectedId);
  window.__fd = {get state() { return s; }, get selectedId() { return selectedId; }, step: stepSim, glOk, textMode, paused, reduced, scene, quality, qualityNote, get save() { return save; }, stageIdx, feedbackMsg, feedbackKind, lastResolvedLabel, get ended() { return ended; }};
}

// ---- game flow ----
function loadStage(i) {
  stageIdx = i; s = fresh(i); selectedId = null; ended = false; logShown = 0; feedbackKind = ''; lastResolvedLabel = '';
  $('log').innerHTML = ''; $('learned').hidden = true;
  if (!timed()) s = tick(s, 0, {timed: false});
  if (scene) { scene.setStage(i); scene.setPads(actionsFor(i)); }
  say(`Stage ${i + 1}: ${STAGES[i].name}. ${STAGES[i].brief}`);
  ensureSelection(); syncPromptIfIdle();
  renderAll(); syncLoop();
}
function handleEvents(events, labelById = new Map()) {
  for (const ev of events) {
    const lbl = labelById.get(ev.id) || lastResolvedLabel || `#${ev.id}`;
    if (scene && !textMode) scene.effect(ev);
    if (ev.type === 'missed') { feedback(ev.message, 'bad', lbl); beep(160, 200); }
    else { feedback(ev.message, ev.good ? 'good' : 'bad', lbl); beep(ev.good ? 760 : 170, ev.good ? 120 : 220); }
  }
}
function applyDecision(action) {
  if (paused || s.status !== 'play' || modal()) return false;
  const it = selected(); if (!it || !actionsFor(stageIdx).includes(action)) return false;
  lastResolvedLabel = shortItem(it);
  const map = new Map([[it.id, lastResolvedLabel]]);
  s = decide(s, it.id, action);
  if (!timed()) s = tick(s, 0, {timed: false});
  flushEngineLog(); handleEvents(s.events, map); afterAction(); return true;
}
function afterAction() {
  renderAll();
  if (s.status === 'win' && !ended) { ended = true; save = record(save, s); persist(); renderHud(); showEnd(true); }
  else if (s.status === 'lose' && !ended) { ended = true; showEnd(false); }
}
function showEnd(win) {
  const st = STAGES[stageIdx];
  $('eTitle').textContent = win ? (stageIdx === STAGES.length - 1 ? 'Boss defeated!' : 'Stage clear!') : 'Out of lives';
  $('eStars').textContent = win ? starsText(stars(s)) : starsText(0);
  $('eStars').setAttribute('aria-label', win ? `${stars(s)} of 3 stars` : '0 of 3 stars');
  const last = s.log.length ? s.log[s.log.length - 1] : '';
  $('eText').textContent = win ? `What you learned: ${st.learn}` : `Retry is free. ${last ? 'Last call: ' + last + ' ' : ''}Hint: ${st.learn}`;
  if (win) { $('learned').hidden = false; $('learned').textContent = `What you learned: ${st.learn}`; }
  $('eNext').hidden = !win || stageIdx >= STAGES.length - 1;
  $('end').classList.remove('hidden');
  say(win ? `Stage clear with ${stars(s)} stars. What you learned: ${st.learn}` : 'No lives left. Retry is free.');
  beep(win ? 880 : 140, 250);
  ($('eNext').hidden ? $('eRetry') : $('eNext')).focus();
}
function closeEnd() { $('end').classList.add('hidden'); }

// ---- loop ----
function loop(now) {
  if (!scene || textMode || paused || document.hidden) { raf = 0; return; }
  raf = requestAnimationFrame(loop);
  const realMs = Math.max(0, now - lastT) || 16;
  const dt = Math.min(.1, realMs / 1000); lastT = now;
  if (s.status === 'play' && !modal()) {
    const hp0 = s.hp;
    const beforeMap = new Map(s.items.map((i) => [i.id, shortItem(i)]));
    s = tick(s, dt, {speed: speed(), timed: true});
    if (s.events.length) { flushEngineLog(); handleEvents(s.events, beforeMap); if (s.hp !== hp0 || s.status !== 'play') afterAction(); }
    ensureSelection();
    if (scene) scene.sync(s.items, selectedId);
    renderThreatLiveEvery(now);
  }
  if (scene) scene.render(dt, realMs);
}
let lastListT = 0, lastSig = '';
function renderThreatLiveEvery(now) {
  const sig = s.items.map((i) => i.id).join() + '|' + selectedId;
  if (now - lastListT > 250 || sig !== lastSig) { lastListT = now; lastSig = sig; renderHud(); renderSide(); }
}
function syncLoop() {
  const wantLoop = !!scene && !textMode && !paused && !document.hidden;
  if (!wantLoop) { cancelAnimationFrame(raf); raf = 0; if (scene) scene.stop(); return; }
  lastT = performance.now();
  if (!raf) raf = requestAnimationFrame(loop);
  scene.resize();
}

// ---- UI wiring ----
function buildTitle() {
  STAGES.forEach((st, i) => {
    const b = document.createElement('button'); b.id = 's' + i;
    b.addEventListener('click', () => { $('title').classList.add('hidden'); closeEnd(); loadStage(i); focusFirst(); });
    $('stageList').appendChild(b);
  });
  refreshTitle();
}
function focusFirst() { const b = $('act-allow'); if (b && !b.disabled) b.focus(); }
function refreshTitle() {
  STAGES.forEach((st, i) => { $('s' + i).textContent = `${st.title}: ${st.name}  ${starsText(save.best[i])}`; });
  $('tStars').textContent = `Saved best: ${save.best.map(starsText).join('  ')}`;
}
function toMenu() { closeEnd(); setPaused(false); refreshTitle(); $('title').classList.remove('hidden'); $('s0').focus(); renderAll(); }
function setPaused(p) {
  if (paused === p) return;
  paused = p; $('pauseScreen').classList.toggle('hidden', !p); say(p ? 'Paused. Incoming traffic is frozen.' : 'Resumed.');
  renderAll(); syncLoop(); if (p) $('resume').focus();
}
function setTextMode(on) {
  textMode = on; say(on ? 'Text mode on. Nothing moves and there is no timer.' : 'Text mode off. Incoming traffic moves again.');
  if (on) s = tick(s, 0, {timed: false});
  renderAll(); syncLoop(); if (scene && !on) scene.resize();
}
function wire() {
  $('pause').onclick = () => setPaused(!paused);
  $('resume').onclick = () => setPaused(false);
  $('mute').onclick = () => { sound = !sound; if (sound) beep(660, 80); say(`Sound ${sound ? 'on' : 'off'}.`); renderHud(); };
  $('textMode').onclick = () => setTextMode(!textMode);
  $('retry').onclick = () => { closeEnd(); setPaused(false); loadStage(stageIdx); say('Retry: fresh stage, 3 lives.'); focusFirst(); };
  $('eRetry').onclick = () => $('retry').click();
  $('eNext').onclick = () => { closeEnd(); loadStage(stageIdx + 1); focusFirst(); };
  $('eMenu').onclick = toMenu; $('menu').onclick = toMenu;
  for (const a of ['allow', 'block', 'reset']) $('act-' + a).onclick = () => applyDecision(a);
  document.querySelectorAll('[data-q]').forEach((b) => {
    b.onclick = () => { if (!scene) return; scene.setQuality(b.dataset.q, 'you chose this'); say(`Graphics quality: ${b.dataset.q}.`); renderAll(); };
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'p') { if (!$('title').classList.contains('hidden') || !$('end').classList.contains('hidden')) return; e.preventDefault(); setPaused(!paused); return; }
    if (modal()) return;
    if (k === 'a') { e.preventDefault(); applyDecision('allow'); }
    else if (k === 'b') { e.preventDefault(); applyDecision('block'); }
    else if (k === 'r') { e.preventDefault(); applyDecision('reset'); }
    else if (k === 't') { e.preventDefault(); setTextMode(!textMode); }
    else if (k === 'm') { e.preventDefault(); $('mute').click(); }
    else if (k === 'arrowright' || k === 'arrowdown' || (k === 'n' && !e.shiftKey)) { e.preventDefault(); selectedId = cycleTarget(s, selectedId, 1); syncPromptIfIdle(); renderAll(); }
    else if (k === 'arrowleft' || k === 'arrowup' || (k === 'n' && e.shiftKey)) { e.preventDefault(); selectedId = cycleTarget(s, selectedId, -1); syncPromptIfIdle(); renderAll(); }
  });
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); syncLoop(); });
  mq.addEventListener && mq.addEventListener('change', () => { reduced = mq.matches; if (scene) scene.setReduced(reduced); renderAll(); });
}
function showGlNotice(msg) {
  glOk = false; $('glNotice').hidden = false; $('glNotice').textContent = msg; textMode = true;
  document.querySelectorAll('[data-q]').forEach((b) => { b.disabled = true; });
  const q = $('qnote'); if (q) q.textContent = 'Graphics quality needs 3D, which is off here.';
  s = tick(s, 0, {timed: false}); renderAll();
}
function initGL() {
  if (!webglAvailable()) { showGlNotice('WebGL is not available in this browser, so the 3D view is off. Text mode plays every stage with the same decisions and no timer.'); return; }
  try {
    scene = createScene($('gl'), {reduced, onQuality: setQualityUI, onLost: () => { cancelAnimationFrame(raf); scene = null; showGlNotice('The 3D graphics context was lost. Switched to text mode, which plays every stage. Reload to try 3D again.'); }});
    glOk = true;
    const canvas = $('gl');
    canvas.addEventListener('click', (e) => {
      if (modal() || !scene || s.status !== 'play') return;
      const hit = scene.pick(e.clientX, e.clientY); if (!hit) return;
      if (hit.pad) applyDecision(hit.pad);
      else if (hit.threat !== undefined) { selectedId = hit.threat; syncPromptIfIdle(); renderAll(); }
    });
    new ResizeObserver(() => scene && scene.resize()).observe(canvas);
    scene.setPads(actionsFor(0));
  } catch (err) {
    scene = null; showGlNotice('The 3D view could not start (' + (err && err.message ? err.message : 'unknown error') + '). Text mode plays every stage.');
  }
}

buildTitle(); wire(); initGL(); loadStage(0);
$('s0').focus();
void META; void explain;
