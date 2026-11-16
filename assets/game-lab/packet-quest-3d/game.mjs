import {META, STAGES, fresh, act, goals, stars, emptySave, loadSave, record, score} from './rules.mjs';
import {createScene, webglAvailable} from './scene.mjs';

const SAVE_KEY = 'wap-practice-3d-save-v1';
const $ = (id) => document.getElementById(id);
const NODES = ['client', 'switch', 'router', 'dns', 'server'];
const NAMES = {client: 'Client PC', switch: 'Switch', router: 'Router', dns: 'DNS server', server: 'Web server'};
const ICON = {client: '\u25A3', switch: '\u25A4', router: '\u25C6', dns: '\u25CF', server: '\u25B2'};
const LEGEND = [
  ['client|switch', 'Client PC \u2192 Switch', '#35d0ff', 'cyan chevrons \u276F', '\u276F\u276F'],
  ['switch|router', 'Switch \u2192 Router', '#5eeaa5', 'green dots \u25CF', '\u25CF \u25CF'],
  ['router|server', 'Router \u2192 Web server', '#ffa24d', 'orange stripes \u2571', '\u2571\u2571\u2571'],
  ['switch|server', 'Switch \u2192 Web server (same subnet)', '#ff6fb5', 'pink diamonds \u25C6', '\u25C6 \u25C6'],
  ['switch|dns', 'Switch \u2192 DNS server (side path)', '#b28cff', 'violet dashes \u2501', '\u2501 \u2501']
];
const PURPOSE_LABEL = {dns: 'DNS lookup', page: 'page request', ping: 'ping'};
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

let save = emptySave();
try { save = loadSave(localStorage.getItem(SAVE_KEY)); } catch { save = emptySave(); }
let s = fresh(0), stageIdx = 0, tool = 'route', paused = false, busy = false, textMode = false, glOk = false, sound = false, focusNode = 'client';
let logShown = 0, scene = null, ended = false, quality = 'medium', qualityNote = '';

function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage blocked: progress is session only */ } }

// ---- sound (default OFF) ----
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

// ---- log (aria-live) ----
function setQualityUI(level, note) {
  quality = level; qualityNote = note || '';
  document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === level)));
  const q = $('qnote'); if (q) q.textContent = `Graphics: ${level}${note ? ' (' + note + ')' : ''}. ${level === 'low' ? 'No shadows, no glow.' : level === 'medium' ? 'Soft shadows, LED glow.' : 'Large soft shadows, sharpest.'}`;
}
function buildLegend() {
  const dl = $('legend'); dl.innerHTML = '';
  for (const [, name, color, shape, glyph] of LEGEND) {
    const i = document.createElement('i');
    i.style.background = color;
    i.textContent = glyph;
    i.setAttribute('aria-hidden', 'true');
    const t = document.createElement('span');
    t.textContent = `${name}: ${shape}`;
    dl.append(i, t);
  }
}
function say(msg) {
  const li = document.createElement('li'); li.textContent = msg;
  const log = $('log'); log.appendChild(li);
  while (log.children.length > 40) log.removeChild(log.firstChild);
}
function flushEngineLog() { while (logShown < s.log.length) say(s.log[logShown++]); }

// ---- view model ----
function faults() {
  const f = {};
  if (s.stage === 0 && !s.cable) f.switch = {text: 'PORT UNPLUGGED', icon: '\u2716'};
  if (s.stage === 1 && !s.dns) f.dns = {text: 'OFFLINE', icon: '\u2716'};
  if (s.stage === 2 && !s.gateway) f.router = {text: 'WRONG GATEWAY', icon: '\u2716'};
  if (s.stage === 2 && !s.web) f.server = {text: 'HTTP DOWN', icon: '\u2716'};
  return f;
}
function render() {
  const st = STAGES[stageIdx], f = faults();
  $('stageName').textContent = `\u2022 ${st.title}: ${st.name}`;
  $('lives').textContent = `Lives: ${'\u2665'.repeat(s.hp)}${'\u2661'.repeat(3 - s.hp)} (${s.hp}/3)`;
  $('xp').textContent = `XP: ${score(save)}`;
  $('stars').textContent = `Best stars: ${save.best.join(' / ')}`;
  $('brief').textContent = st.brief; $('target').textContent = `Target: ${st.target}`;
  $('goals').innerHTML = '';
  goals(s).forEach((g) => { const li = document.createElement('li'); li.textContent = `${g.done ? '\u2611 Done:' : '\u2610 To do:'} ${g.text}`; $('goals').appendChild(li); });
  for (const n of NODES) {
    const b = $('dev-' + n); if (!b) continue;
    const fl = f[n], hopIdx = s.route.indexOf(n);
    b.dataset.state = fl ? 'fault' : 'ok';
    b.classList.toggle('onroute', hopIdx !== -1);
    b.querySelector('.st').textContent = fl ? `${fl.icon} FAULT: ${fl.text}` : `\u2714 OK${hopIdx !== -1 ? ' \u00B7 Hop ' + (hopIdx + 1) : ''}`;
    b.setAttribute('aria-label', `${NAMES[n]}, ${fl ? 'fault: ' + fl.text : 'healthy'}${hopIdx !== -1 ? ', on route hop ' + (hopIdx + 1) : ''}`);
  }
  $('route').textContent = `Route: ${s.route.length ? s.route.map((n, idx) => `${idx === 0 ? 'Start' : 'Hop ' + idx}: ${NAMES[n]}`).join(' \u2192 ') : '(empty)'}  \u2022 Purpose: ${PURPOSE_LABEL[s.purpose]}`;
  document.querySelectorAll('[data-purpose]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.purpose === s.purpose)));
  $('repair').setAttribute('aria-pressed', String(tool === 'repair'));
  $('repair').textContent = tool === 'repair' ? 'Repair tool: ON (W \u2192 Route)' : 'Switch to Repair tool (W)';
  $('tool').textContent = tool === 'repair'
    ? 'Active tool: REPAIR (W switches to Route) \u00B7 Yellow ring = focused device'
    : 'Active tool: ROUTE (W switches to Repair) \u00B7 Yellow ring = focused device \u00B7 \u2460 \u2461 = hop order';
  const locked = busy || paused || s.status !== 'play';
  ['repair', 'launch', 'clear'].forEach((id) => { $(id).disabled = locked; });
  document.querySelectorAll('.dev,[data-purpose]').forEach((b) => { b.disabled = locked; });
  $('tip').textContent = tool === 'repair'
    ? 'Repair tool is ON: Enter or click on a faulted device repairs it. Press W to switch back to Route tool.'
    : 'Route tool is ON: Enter or click on a device adds it to the route (numbered badges 1, 2 show hop order). Yellow floor ring shows the focused device.';
  $('mute').textContent = `Sound: ${sound ? 'on' : 'off'} (M)`; $('mute').setAttribute('aria-pressed', String(sound));
  $('pause').setAttribute('aria-pressed', String(paused));
  $('textMode').setAttribute('aria-pressed', String(textMode));
  document.body.classList.toggle('textmode', textMode);
  if (scene) scene.setView({faults: f, routeNodes: s.route, focus: focusNode, cable: s.stage !== 0 || s.cable});
  window.__pq = {state: s, glOk, textMode, paused, busy, scene, focusNode, tool, save, quality, qualityNote};
}

function loadStage(i) {
  stageIdx = i; s = fresh(i); logShown = 0; tool = 'route'; busy = false; ended = false;
  $('log').innerHTML = ''; $('learned').hidden = true;
  if (scene) scene.setStage(i);
  say(`Stage ${i + 1}: ${STAGES[i].name}. ${STAGES[i].brief}`);
  render(); syncLoop();
}

// ---- gameplay ----
async function doLaunch() {
  if (busy || paused || s.status !== 'play') return;
  const route = s.route.slice(), hpBefore = s.hp;
  const next = act(s, {type: 'launch'});
  const failed = next.hp < hpBefore;
  busy = true; render();
  if (route.length > 1 && scene && !textMode) {
    say(`Packet launched along ${route.map((n) => NAMES[n]).join(', ')}.`);
    beep(520);
    await scene.launch(route, failed ? 'fail' : 'ok', route[route.length - 1]);
  } else {
    say(`Packet launched along ${route.map((n) => NAMES[n]).join(', ') || 'no route'}.`);
  }
  s = next; busy = false; flushEngineLog(); beep(failed ? 180 : 740, 140);
  if (failed && scene) scene.shakeNode(route[route.length - 1] || 'client');
  afterAction();
}
function select(n) {
  if (busy || paused || s.status !== 'play') return;
  focusNode = n;
  if (tool === 'repair') {
    const before = s.hp, hadFault = !!faults()[n];
    s = act(s, {type: 'repair', node: n}); flushEngineLog(); beep(hadFault ? 620 : 200);
    if (s.hp < before && scene) scene.shakeNode(n);
  } else {
    const before = s.hp;
    const prev = s.route.length;
    s = act(s, {type: 'hop', node: n}); flushEngineLog();
    if (s.hp < before) { beep(180); if (scene) scene.shakeNode(n); }
    else if (s.route.length > prev) { say(`Selected ${NAMES[n]}. Route length ${s.route.length}.`); beep(440, 60); }
  }
  afterAction();
}
function afterAction() {
  render();
  if (s.status === 'win' && !ended) { ended = true; if (!(s.hp < 0)) { save = record(save, s); persist(); } render(); showEnd(true); }
  else if (s.status === 'lose' && !ended) { ended = true; showEnd(false); }
}
function showEnd(win) {
  const st = STAGES[stageIdx];
  $('eTitle').textContent = win ? 'Stage clear!' : 'Out of lives';
  $('eStars').textContent = win ? '\u2605'.repeat(stars(s)) + '\u2606'.repeat(3 - stars(s)) : '\u2606\u2606\u2606';
  $('eStars').setAttribute('aria-label', win ? `${stars(s)} of 3 stars` : '0 of 3 stars');
  $('eText').textContent = win ? `What you learned: ${st.learn}` : `Retry is free. Hint: ${st.learn}`;
  if (win) { $('learned').hidden = false; $('learned').textContent = `What you learned: ${st.learn}`; }
  $('eNext').hidden = !win || stageIdx >= 2;
  $('end').classList.remove('hidden');
  say(win ? `Stage clear with ${stars(s)} stars. What you learned: ${st.learn}` : 'No lives left. Retry is free.');
  beep(win ? 880 : 140, 250);
  ($('eNext').hidden ? $('eRetry') : $('eNext')).focus();
}
function closeEnd() { $('end').classList.add('hidden'); }

// ---- UI wiring ----
function buildPanel() {
  for (const n of NODES) {
    const b = document.createElement('button'); b.className = 'dev'; b.id = 'dev-' + n; b.dataset.node = n;
    b.innerHTML = `<span>${ICON[n]} ${NAMES[n]}</span><span class="st"></span>`;
    b.addEventListener('click', () => select(n));
    b.addEventListener('focus', () => { focusNode = n; if (scene) scene.setView({focus: n}); });
    $('devs').appendChild(b);
  }
  STAGES.forEach((st, i) => {
    const b = document.createElement('button'); b.id = 's' + i;
    b.textContent = `${st.title}: ${st.name}  ${'\u2605'.repeat(save.best[i])}${'\u2606'.repeat(3 - save.best[i])}`;
    b.addEventListener('click', () => { $('title').classList.add('hidden'); closeEnd(); loadStage(i); $('dev-client').focus(); });
    $('stageList').appendChild(b);
  });
  $('tStars').textContent = `Saved best: ${save.best.map((n) => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n)).join('  ')}`;
}
function refreshTitle() {
  STAGES.forEach((st, i) => { $('s' + i).textContent = `${st.title}: ${st.name}  ${'\u2605'.repeat(save.best[i])}${'\u2606'.repeat(3 - save.best[i])}`; });
  $('tStars').textContent = `Saved best: ${save.best.map((n) => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n)).join('  ')}`;
}
function toMenu() { closeEnd(); setPaused(false); refreshTitle(); $('title').classList.remove('hidden'); $('s0').focus(); render(); }
function setPaused(p) {
  paused = p; $('pauseScreen').classList.toggle('hidden', !p); say(p ? 'Paused.' : 'Resumed.');
  render(); syncLoop(); if (p) $('resume').focus(); else if (!$('title').classList.contains('hidden')) $('s0').focus();
}
function setTextMode(on) {
  textMode = on; say(on ? 'Text mode on. 3D view hidden; all actions remain available.' : 'Text mode off.');
  render(); syncLoop(); if (scene && !on) scene.resize();
}
function syncLoop() {
  if (!scene) return;
  if (paused || document.hidden || textMode) scene.stop(); else { scene.start(); scene.resize(); }
}
function cycle(dir) {
  const act0 = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.node;
  const i = NODES.indexOf(act0 || focusNode);
  const n = NODES[(i + dir + NODES.length) % NODES.length];
  focusNode = n; $('dev-' + n).focus();
}
function setPurpose(p) {
  if (busy || paused || s.status !== 'play') return;
  s = act(s, {type: 'purpose', value: p}); say(`Purpose: ${PURPOSE_LABEL[p]}. Route cleared.`); render();
}

function wire() {
  $('pause').onclick = () => setPaused(!paused);
  $('resume').onclick = () => setPaused(false);
  $('mute').onclick = () => { sound = !sound; if (sound) beep(660, 80); say(`Sound ${sound ? 'on' : 'off'}.`); render(); };
  $('textMode').onclick = () => setTextMode(!textMode);
  $('retry').onclick = () => { closeEnd(); loadStage(stageIdx); say('Retry: fresh stage, 3 lives.'); $('dev-client').focus(); };
  $('eRetry').onclick = () => $('retry').click();
  $('eNext').onclick = () => { closeEnd(); loadStage(stageIdx + 1); $('dev-client').focus(); };
  $('eMenu').onclick = toMenu; $('menu').onclick = toMenu;
  $('repair').onclick = () => { tool = tool === 'repair' ? 'route' : 'repair'; say(`Tool: ${tool}.`); render(); };
  $('launch').onclick = doLaunch;
  $('clear').onclick = () => { if (busy || paused || s.status !== 'play') return; s = {...s, route: []}; say('Route cleared. No life lost.'); render(); };
  document.querySelectorAll('[data-purpose]').forEach((b) => { b.onclick = () => setPurpose(b.dataset.purpose); });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const modal = !$('title').classList.contains('hidden') || !$('end').classList.contains('hidden') || paused;
    if (k === 'p') { if (!$('title').classList.contains('hidden')) return; e.preventDefault(); setPaused(!paused); return; }
    if (modal) return;
    if (k === 'w') { e.preventDefault(); $('repair').click(); }
    else if (k === 'l') { e.preventDefault(); doLaunch(); }
    else if (k === 't') { e.preventDefault(); setTextMode(!textMode); }
    else if (k === 'm') { e.preventDefault(); $('mute').click(); }
    else if (k === 'arrowright' || k === 'arrowdown') { e.preventDefault(); cycle(1); }
    else if (k === 'arrowleft' || k === 'arrowup') { e.preventDefault(); cycle(-1); }
  });
  document.addEventListener('visibilitychange', syncLoop);
  mq.addEventListener && mq.addEventListener('change', () => { if (scene) scene.setReduced(mq.matches); });
}

function showGlNotice(msg) {
  glOk = false; $('glNotice').hidden = false; $('glNotice').textContent = msg;
  textMode = true; render();
}
function initGL() {
  if (!webglAvailable()) { showGlNotice('WebGL is not available in this browser, so the 3D view is off. Text mode plays every stage with the same actions.'); return; }
  try {
    scene = createScene($('gl'), {reduced: mq.matches, onQuality: setQualityUI, onLost: () => { if (scene) scene.stop(); scene = null; showGlNotice('The 3D graphics context was lost. Switched to text mode, which plays every stage. Reload to try 3D again.'); }});
    glOk = true;
    const canvas = $('gl');
    canvas.addEventListener('click', (e) => { const n = scene && scene.pick(e.clientX, e.clientY); if (n) select(n); });
    new ResizeObserver(() => scene && scene.resize()).observe(canvas);
    scene.setStage(0);
  } catch (err) {
    scene = null; showGlNotice('The 3D view could not start (' + (err && err.message ? err.message : 'unknown error') + '). Text mode plays every stage.');
  }
}

document.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { if (!scene) return; scene.setQuality(b.dataset.q, 'you chose this'); say(`Graphics quality: ${b.dataset.q}.`); render(); }; });
buildLegend(); buildPanel(); wire(); initGL(); loadStage(0);
if (!scene) { document.querySelectorAll('[data-q]').forEach((b) => { b.disabled = true; }); const q = $('qnote'); if (q) q.textContent = 'Graphics quality needs 3D, which is off here.'; }
$('s0').focus();
void META;
