// Firewall Defender 3D: pure rules engine (plain ES module, no DOM, no network).
// Fictional data only. Addresses use documentation ranges (RFC 5737); domains use the reserved .test TLD.
export const META = Object.freeze({id: 'firewall-defender-3d-v1', providerLessonId: null, credit: false, reviewed: false});
export const SAVE_KEY = 'wap-practice-3d-security-save-v1';
export const MAX_HP = 3;
export const REDUCED_SPEED = 0.4;      // reduced motion: threats move at 40% speed, decisions identical
export const MAX_IN_FLIGHT = 4;
export const UNTIMED_IN_FLIGHT = 3;
export const ACTIONS = Object.freeze(['allow', 'block', 'reset']);

// ---------- address and rule matching ----------
export function parseIPv4(text) {
  if (typeof text !== 'string') return null;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] * 2 ** 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}
export function inCidr(ip, cidr) {
  if (cidr === 'any') return true;
  const [base, bitsText] = String(cidr).split('/');
  const bits = Number(bitsText);
  const a = parseIPv4(ip), b = parseIPv4(base);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xFFFFFFFF << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}
// A rule: {action:'allow'|'deny', proto:'TCP'|'UDP'|'any', port:number|'any', from:'any'|cidr}
export function ruleMatches(rule, pkt) {
  return (rule.proto === 'any' || rule.proto === pkt.proto) &&
    (rule.port === 'any' || rule.port === pkt.port) &&
    inCidr(pkt.src, rule.from);
}
// First match wins. The last rule is always the explicit default (deny any).
export function evaluatePolicy(policy, pkt) {
  for (let i = 0; i < policy.length; i++) {
    if (ruleMatches(policy[i], pkt)) return {action: policy[i].action === 'allow' ? 'allow' : 'block', ruleIndex: i, rule: policy[i]};
  }
  return {action: 'block', ruleIndex: -1, rule: null};
}
export function describeRule(r) {
  const proto = r.proto === 'any' ? 'any protocol' : r.proto;
  const port = r.port === 'any' ? 'any port' : `port ${r.port}`;
  return `${r.action.toUpperCase()} ${proto} ${port} from ${r.from === 'any' ? 'anywhere' : r.from}`;
}

export const POLICY_PORTS = Object.freeze([
  {action: 'allow', proto: 'TCP', port: 443, from: 'any', note: 'HTTPS web'},
  {action: 'allow', proto: 'TCP', port: 587, from: 'any', note: 'staff mail submission'},
  {action: 'deny', proto: 'any', port: 'any', from: 'any', note: 'default: deny everything else'}
]);
export const POLICY_SOURCES = Object.freeze([
  {action: 'deny', proto: 'any', port: 'any', from: '203.0.113.0/24', note: 'known bad range'},
  {action: 'allow', proto: 'TCP', port: 22, from: '192.0.2.0/24', note: 'admin SSH from the office only'},
  {action: 'allow', proto: 'TCP', port: 443, from: 'any', note: 'HTTPS web'},
  {action: 'deny', proto: 'any', port: 'any', from: 'any', note: 'default: deny everything else'}
]);

// ---------- phishing and login judgement (evidence, not vibes) ----------
// Email: {from, fromDomain, claims, expectDomain, linkShown, linkHost, urgent}
export function judgeEmail(e) {
  const flags = [];
  if (e.fromDomain !== e.expectDomain) flags.push('sender-domain');
  if (e.linkHost && e.linkShown && e.linkShown.split('/')[0] !== e.linkHost) flags.push('link-target');
  return {phish: flags.length > 0, flags, urgentOnly: e.urgent && flags.length === 0};
}
// Login: {user, usualCountry, country, attempts, success, note, compromised}
export function judgeLogin(l) {
  const unusual = l.country !== l.usualCountry;
  const sprayed = l.failedBefore >= 10;
  return {compromised: l.success && (unusual || sprayed), unusual, sprayed};
}

const pk = (proto, port, src, extra = {}) => ({kind: 'packet', proto, port, src, ...extra});
const em = (o) => ({kind: 'email', ...o});
const lg = (o) => ({kind: 'login', ...o});

export function correctAction(t, policy) {
  if (t.kind === 'packet') return evaluatePolicy(policy, t).action;
  if (t.kind === 'email') return judgeEmail(t).phish ? 'block' : 'allow';
  if (t.kind === 'login') return judgeLogin(t).compromised ? 'reset' : 'allow';
  throw Error('Unknown threat kind');
}

export function explain(t, policy) {
  if (t.kind === 'packet') {
    const r = evaluatePolicy(policy, t);
    const what = `${t.proto} ${t.port} from ${t.src}`;
    if (r.rule && r.action === 'allow') return `${what} matches rule ${r.ruleIndex + 1} (${describeRule(r.rule)}), so it is allowed.`;
    if (r.rule && r.ruleIndex !== policy.length - 1) return `${what} hits rule ${r.ruleIndex + 1} first (${describeRule(r.rule)}). The first matching rule wins, so it is blocked.`;
    return `${what} matches no allow rule, so the default deny blocks it.`;
  }
  if (t.kind === 'email') {
    const j = judgeEmail(t);
    if (j.flags.includes('sender-domain')) return `The sender domain ${t.fromDomain} is not ${t.expectDomain}, the real domain of ${t.claims}. A lookalike domain is evidence of phishing.`;
    if (j.flags.includes('link-target')) return `The link text says ${t.linkShown} but it really goes to ${t.linkHost}. A link that goes elsewhere than it shows is evidence of phishing.`;
    if (t.urgent) return `It sounds urgent, but the sender domain and the link both check out. Urgency alone is not proof, so it is delivered.`;
    return `Sender domain and link both match ${t.claims}, so it is delivered.`;
  }
  const j = judgeLogin(t);
  if (j.compromised) return `${t.user}'s login succeeded with valid credentials but looks stolen (${t.note}). The firewall allows web logins, and blocking the port would not remove the attacker's access. Reset the password and end the sessions.`;
  return `${t.user}'s login looks normal (${t.note}). Allow it; resetting would lock out a real user.`;
}

export function labelFor(t) {
  if (t.kind === 'packet') return {l1: `${t.proto} ${t.port}`, l2: t.src};
  if (t.kind === 'email') return {l1: 'EMAIL', l2: t.fromDomain};
  return {l1: 'LOGIN', l2: `user ${t.user}`};
}

// ---------- stages ----------
const S1 = [pk('TCP', 443, '198.51.100.20'), pk('TCP', 23, '198.51.100.9'), pk('TCP', 587, '198.51.100.44'), pk('TCP', 3389, '198.51.100.61'), pk('UDP', 443, '198.51.100.12'), pk('TCP', 80, '198.51.100.30')];
const S2 = [pk('TCP', 443, '198.51.100.20'), pk('TCP', 443, '203.0.113.50'), pk('TCP', 22, '192.0.2.15'), pk('TCP', 22, '198.51.100.77'), pk('TCP', 22, '203.0.113.9'), pk('TCP', 443, '192.0.2.200'), pk('UDP', 53, '198.51.100.5')];
const S3 = [
  em({from: 'payroll@acme.test', fromDomain: 'acme.test', claims: 'AcmeCorp Payroll', expectDomain: 'acme.test', linkShown: 'acme.test/benefits', linkHost: 'acme.test', urgent: true, subject: 'Pick your benefits by Friday'}),
  em({from: 'payroll@acme-pay.test', fromDomain: 'acme-pay.test', claims: 'AcmeCorp Payroll', expectDomain: 'acme.test', linkShown: 'acme.test/payroll', linkHost: 'acme.test', urgent: false, subject: 'Your payslip is ready'}),
  em({from: 'hr@acme.test', fromDomain: 'acme.test', claims: 'AcmeCorp HR', expectDomain: 'acme.test', linkShown: 'acme.test/hr', linkHost: 'evil.test', urgent: false, subject: 'Update your HR profile'}),
  em({from: 'it@acme.test', fromDomain: 'acme.test', claims: 'AcmeCorp IT', expectDomain: 'acme.test', linkShown: '', linkHost: '', urgent: false, subject: 'Printer maintenance Tuesday'}),
  em({from: 'it@acrne.test', fromDomain: 'acrne.test', claims: 'AcmeCorp IT', expectDomain: 'acme.test', linkShown: 'acrne.test/reset', linkHost: 'acrne.test', urgent: true, subject: 'ACT NOW: password expires'}),
  em({from: 'orders@parcel.test', fromDomain: 'parcel.test', claims: 'Parcel Co', expectDomain: 'parcel.test', linkShown: 'parcel.test/track', linkHost: 'parcel.test', urgent: false, subject: 'Your package is on the way'})
];
const BOSS = [
  em({from: 'it@acrne.test', fromDomain: 'acrne.test', claims: 'AcmeCorp IT', expectDomain: 'acme.test', linkShown: 'acrne.test/reset', linkHost: 'acrne.test', urgent: true, subject: 'ACT NOW: password expires'}),
  pk('TCP', 443, '198.51.100.31'),
  lg({user: 'jlee', usualCountry: 'US', country: 'US', failedBefore: 0, success: true, note: 'usual country, first try'}),
  pk('TCP', 3389, '203.0.113.77'),
  lg({user: 'jlee', usualCountry: 'US', country: 'XX', failedBefore: 0, success: true, note: 'valid password, new country 3 minutes after a normal login'}),
  em({from: 'payroll@acme.test', fromDomain: 'acme.test', claims: 'AcmeCorp Payroll', expectDomain: 'acme.test', linkShown: 'acme.test/benefits', linkHost: 'acme.test', urgent: true, subject: 'Pick your benefits by Friday'}),
  pk('TCP', 22, '192.0.2.15'),
  em({from: 'hr@acme.test', fromDomain: 'acme.test', claims: 'AcmeCorp HR', expectDomain: 'acme.test', linkShown: 'acme.test/hr', linkHost: 'evil.test', urgent: false, subject: 'Update your HR profile'}),
  lg({user: 'mpatel', usualCountry: 'US', country: 'US', failedBefore: 40, success: true, note: 'succeeded after 40 failed tries from one address'}),
  pk('UDP', 53, '198.51.100.5')
];

export const STAGES = Object.freeze([
  {title: '01 / PORT PATROL', name: 'Ports and protocols', brief: 'Threats stream toward the network. The firewall policy lists what is allowed. Anything not on the list is denied by default. Allow or block each one before it arrives.', policy: POLICY_PORTS, threats: S1, spawnEvery: 4.5, travel: 15, learn: 'A firewall rule matches by port and protocol, and anything not on the allow list is blocked (deny by default).', mode: 'packet'},
  {title: '02 / SOURCE CONTROL', name: 'Who is it from?', brief: 'Rules are checked from the top and the first match wins. A block rule for a bad range can beat a port allow below it.', policy: POLICY_SOURCES, threats: S2, spawnEvery: 4.5, travel: 15, learn: 'Firewall rules are checked top to bottom and the first match wins, so source and order matter as much as the port.', mode: 'packet'},
  {title: '03 / PHISH FILTER', name: 'Judge the evidence', brief: 'Envelopes arrive. Deliver or quarantine each one. Judge by evidence: does the sender domain match the real one, and does the link go where it says? Urgency alone is not proof.', policy: null, threats: S3, spawnEvery: 5, travel: 17, learn: 'Judge a message by its evidence (sender domain, where the link really goes), not by how urgent it sounds.', mode: 'email'},
  {title: '04 / BOSS: STOLEN KEYS', name: 'Compromised account', brief: 'Everything at once: packets, envelopes and logins. Some traffic is allowed by the firewall and still bad. Blocking a port does not fix a compromised account.', policy: POLICY_SOURCES, threats: BOSS, spawnEvery: 4.5, travel: 16, learn: 'Blocking a port does not fix a compromised account: reset the password and end the sessions.', mode: 'mixed'}
]);

// ---------- state ----------
export function fresh(stage = 0) {
  if (!Number.isInteger(stage) || stage < 0 || stage >= STAGES.length) throw Error('Invalid stage');
  const st = STAGES[stage];
  return {stage, hp: MAX_HP, errors: 0, status: 'play', time: 0, nextSpawn: 0.6, spawned: 0, total: st.threats.length, handled: 0, nextId: 1, items: [], events: [], log: [], stats: {correct: 0, badIn: 0, goodBlocked: 0, wrongReset: 0, missed: 0, resets: 0}};
}
export const policyFor = (stage) => STAGES[stage].policy;
export function expectedFor(stage, item) { return correctAction(item.data, policyFor(stage) || POLICY_SOURCES); }
function spawn(s) {
  const st = STAGES[s.stage], idx = s.spawned, data = st.threats[idx];
  const lane = ((idx * 2 + 1) % 3) - 1;
  s.items.push({id: s.nextId++, idx, lane, p: 0, data, label: labelFor(data), correct: correctAction(data, st.policy || POLICY_SOURCES)});
  s.spawned++;
}
function hurt(s, message) {
  s.hp -= 1; s.errors += 1;
  s.log.push(message);
  if (s.hp <= 0) s.status = 'lose';
}
function finishCheck(s) {
  if (s.status === 'play' && s.spawned === s.total && s.items.length === 0) s.status = 'win';
}
// Advance time. opts: {speed (1 = normal), timed (false = turn-based text mode)}
export function tick(state, dt, opts = {}) {
  const s = structuredClone(state); s.events = [];
  if (s.status !== 'play') return s;
  const st = STAGES[s.stage], timed = opts.timed !== false;
  const speed = Number.isFinite(opts.speed) && opts.speed > 0 ? opts.speed : 1;
  const step = Math.max(0, Math.min(dt, 0.1));
  if (timed) {
    s.time += step;
    for (const it of s.items) it.p = Math.min(1, it.p + step * speed / st.travel);
    // no dead air: when the lane is empty, the next threat comes within 1.2 game-seconds
    if (s.items.length === 0 && s.spawned < s.total && s.nextSpawn > s.time * speed + 1.2) s.nextSpawn = s.time * speed + 1.2;
    while (s.spawned < s.total && s.time * speed >= s.nextSpawn && s.items.length < MAX_IN_FLIGHT) {
      spawn(s); s.nextSpawn += st.spawnEvery;
      if (s.nextSpawn < s.time * speed) s.nextSpawn = s.time * speed + st.spawnEvery;
    }
    for (const it of s.items.filter((i) => i.p >= 1)) {
      s.items = s.items.filter((i) => i.id !== it.id); s.handled++; s.stats.missed++;
      if (it.correct !== 'allow') s.stats.badIn++;
      const msg = `Too slow: ${it.label.l1} (${it.label.l2}) reached the network with no decision. ${explain(it.data, st.policy || POLICY_SOURCES)}`;
      s.events.push({type: 'missed', id: it.id, lane: it.lane, p: 1, correct: it.correct, message: msg});
      hurt(s, msg);
      if (s.status !== 'play') break;
    }
  } else {
    while (s.spawned < s.total && s.items.length < UNTIMED_IN_FLIGHT) spawn(s);
  }
  finishCheck(s);
  return s;
}
export function decide(state, id, action) {
  const s = structuredClone(state); s.events = [];
  if (s.status !== 'play' || !ACTIONS.includes(action)) return s;
  const it = s.items.find((i) => i.id === id);
  if (!it) return s;
  const st = STAGES[s.stage], pol = st.policy || POLICY_SOURCES;
  s.items = s.items.filter((i) => i.id !== id); s.handled++;
  const good = action === it.correct, why = explain(it.data, pol);
  let message;
  if (good) {
    s.stats.correct++; if (action === 'reset') s.stats.resets++;
    message = `Correct: ${why}`;
  } else {
    if (action === 'allow') s.stats.badIn++;
    else if (action === 'reset' && it.correct === 'allow') s.stats.wrongReset++;
    else if (it.correct === 'allow') s.stats.goodBlocked++;
    const doing = {allow: 'Allowing', block: 'Blocking', reset: 'Resetting'}[action];
    const should = {allow: 'allowed', block: 'blocked', reset: 'handled with an account reset'}[it.correct];
    message = `Wrong, -1 life. ${doing} that was a mistake: it should be ${should}. ${why}`;
  }
  s.events.push({type: 'resolve', id, lane: it.lane, p: it.p, action, correct: it.correct, good, message});
  s.log.push(message);
  if (!good) hurt(s, message), s.log.pop(); // hurt logs again; keep one log line per decision
  finishCheck(s);
  return s;
}
export function mostUrgent(state) {
  return state.items.length ? state.items.reduce((a, b) => (b.p > a.p ? b : a)).id : null;
}
export function cycleTarget(state, currentId, dir = 1) {
  const list = state.items.slice().sort((a, b) => b.p - a.p || a.id - b.id);
  if (!list.length) return null;
  const i = list.findIndex((x) => x.id === currentId);
  return list[(i + dir + list.length * 2) % list.length].id;
}
export function goals(s) {
  const win = s.status === 'win', st = STAGES[s.stage];
  const out = [
    {text: `Make a call on all ${s.total} threats (${s.handled}/${s.total})`, done: s.handled === s.total && s.status !== 'lose'},
    {text: 'Let no bad traffic into the network', done: win && s.stats.badIn === 0, failed: s.stats.badIn > 0},
    {text: st.mode === 'email' ? 'Deliver every legitimate email' : 'Keep legitimate traffic flowing', done: win && s.stats.goodBlocked === 0 && s.stats.wrongReset === 0, failed: s.stats.goodBlocked + s.stats.wrongReset > 0}
  ];
  if (st.mode === 'mixed') out.push({text: `Reset the compromised accounts (${s.stats.resets}/2)`, done: s.stats.resets >= 2, failed: false});
  return out;
}
export function stars(s) { return Math.max(1, 3 - s.errors); }
export function xpFor(s) { return s.stats.correct * 10; }

// ---------- save ----------
export const emptySave = () => ({version: 1, best: [0, 0, 0, 0], evidence: [[], [], [], []]});
export function validateSave(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return false;
  if (Object.keys(v).sort().join() !== 'best,evidence,version' || v.version !== 1) return false;
  if (!Array.isArray(v.best) || v.best.length !== 4 || !v.best.every((x) => Number.isInteger(x) && x >= 0 && x <= 3)) return false;
  if (!Array.isArray(v.evidence) || v.evidence.length !== 4) return false;
  return v.evidence.every((logs, i) => Array.isArray(logs) && logs.length <= 80 && (v.best[i] > 0 || logs.length === 0) && logs.every((x) => typeof x === 'string' && x.length <= 600));
}
export function loadSave(raw) {
  try { const v = JSON.parse(raw); return validateSave(v) ? v : emptySave(); } catch { return emptySave(); }
}
export function record(save, s) {
  if (s.status !== 'win') return save;
  const next = structuredClone(save);
  if (stars(s) >= next.best[s.stage]) { next.best[s.stage] = stars(s); next.evidence[s.stage] = s.log.slice(-80).map((x) => String(x).slice(0, 600)); }
  return next;
}
export const score = (save) => save.best.reduce((a, n) => a + n * 100, 0);

// Plain-text evidence lines the player judges by (shown in the Selected card and in text mode).
export function evidence(t) {
  if (t.kind === 'packet') return [['Protocol', t.proto], ['Port', String(t.port)], ['Source', t.src]];
  if (t.kind === 'email') return [['Claims to be', t.claims], ['Sender domain', t.fromDomain], ['Subject', t.subject || '(none)'], ['Link text shows', t.linkShown || '(no link)'], ['Link really goes to', t.linkHost || '(no link)'], ['Sounds urgent', t.urgent ? 'yes' : 'no']];
  if (t.kind === 'login') return [['User', t.user], ['Usual country', t.usualCountry], ['Logging in from', t.country], ['Failed tries before', String(t.failedBefore)], ['Result', t.success ? 'valid password accepted' : 'failed'], ['Note', t.note]];
  return [];
}
export const ACTION_LABEL = Object.freeze({allow: 'Allow', block: 'Block', reset: 'Reset account'});
export function actionsFor(stage) { return STAGES[stage].mode === 'mixed' ? ['allow', 'block', 'reset'] : STAGES[stage].mode === 'email' ? ['allow', 'block'] : ['allow', 'block']; }
