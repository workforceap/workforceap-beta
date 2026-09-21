import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP_MAX_HISTORY_TURNS,
  HELP_MAX_QUESTION_CHARS,
  buildHelpSystemPrompt,
  buildHelpUserContent,
  canUsePersona,
  fallbackAnswer,
  linksForAnswer,
  normalizeHistory,
  normalizeQuestion,
  redirectAnswer,
  resolveHelpPersona,
  sanitizeAnswer,
  type HelpAccess,
} from './assistant';
import { HELP_KNOWLEDGE } from './knowledge';

const NONE: HelpAccess = { admin: false, counselor: false, employer: false, partner: false };
const ADMIN: HelpAccess = { ...NONE, admin: true };
const COUNSELOR: HelpAccess = { ...NONE, counselor: true };

test('resolveHelpPersona follows the route only when roles allow that portal', () => {
  assert.equal(resolveHelpPersona('/dashboard/jobs', NONE), 'member');
  // A member typing /counselor into the body is still helped as a member.
  assert.equal(resolveHelpPersona('/counselor/today', NONE), 'member');
  assert.equal(resolveHelpPersona('/admin/members', NONE), 'member');
  assert.equal(resolveHelpPersona('/counselor/today', COUNSELOR), 'counselor');
  // Admins may open the counselor portal, like the counselor layout allows.
  assert.equal(resolveHelpPersona('/counselor/today', ADMIN), 'counselor');
  assert.equal(resolveHelpPersona('/employer', { ...NONE, employer: true }), 'employer');
  assert.equal(resolveHelpPersona('/partner/exports', { ...NONE, partner: true }), 'partner');
});

test('resolveHelpPersona falls back to the highest portal the person holds', () => {
  assert.equal(resolveHelpPersona('/help', ADMIN), 'admin');
  assert.equal(resolveHelpPersona(null, COUNSELOR), 'counselor');
  assert.equal(resolveHelpPersona('/help', { ...NONE, partner: true, employer: true }), 'partner');
  assert.equal(resolveHelpPersona(undefined, NONE), 'member');
  // An employer on a member page is helped as a member: the route is allowed.
  assert.equal(resolveHelpPersona('/dashboard', { ...NONE, employer: true }), 'member');
});

test('canUsePersona mirrors the layout guards', () => {
  assert.equal(canUsePersona('member', NONE), true);
  assert.equal(canUsePersona('admin', COUNSELOR), false);
  assert.equal(canUsePersona('counselor', ADMIN), true);
  assert.equal(canUsePersona('employer', ADMIN), false);
});

test('normalizeQuestion trims, collapses whitespace and caps length', () => {
  assert.equal(normalizeQuestion('  how   do I\n\nstart? '), 'how do I start?');
  assert.equal(normalizeQuestion('x'.repeat(HELP_MAX_QUESTION_CHARS + 50)).length, HELP_MAX_QUESTION_CHARS);
  assert.equal(normalizeQuestion(42), '');
  assert.equal(normalizeQuestion(null), '');
});

test('normalizeHistory keeps only well-formed recent turns', () => {
  const raw = [
    { role: 'user', text: 'one' },
    { role: 'assistant', text: 'two' },
    { role: 'system', text: 'ignored' },
    { role: 'user' },
    'junk',
    ...Array.from({ length: 10 }, (_, i) => ({ role: 'user', text: `q${i}` })),
  ];
  const turns = normalizeHistory(raw);
  assert.equal(turns.length, HELP_MAX_HISTORY_TURNS);
  assert.equal(turns.at(-1)?.text, 'q9');
  assert.ok(turns.every((t) => t.role === 'user' || t.role === 'assistant'));
  assert.deepEqual(normalizeHistory('nope'), []);
});

test('system prompt grounds on the persona\'s pages only and names the current page', () => {
  const prompt = buildHelpSystemPrompt({ persona: 'member', currentRoute: '/dashboard/jobs', language: 'en' });
  assert.match(prompt, /WorkforceAP member/);
  assert.match(prompt, /Current page: \/dashboard\/jobs/);
  assert.match(prompt, /cannot take actions/);
  assert.match(prompt, /Never describe, speculate about, or give steps for other portals/);
  for (const feature of HELP_KNOWLEDGE.member.features) assert.ok(prompt.includes(feature.route), feature.route);
  // No other persona's page list leaks into the member prompt (the portal
  // prefixes are named once in the rules so the model can refuse them).
  for (const persona of ['counselor', 'employer', 'partner', 'admin'] as const) {
    for (const feature of HELP_KNOWLEDGE[persona].features) {
      assert.ok(!prompt.includes(`- ${feature.title} (${feature.route}):`), `${feature.route} leaked into member prompt`);
      assert.ok(!prompt.includes(feature.summary), `${feature.route} summary leaked into member prompt`);
    }
  }
});

test('system prompt switches response language and tolerates unknown locales', () => {
  assert.match(buildHelpSystemPrompt({ persona: 'counselor', language: 'es' }), /Response language: Spanish/);
  assert.match(buildHelpSystemPrompt({ persona: 'counselor', language: 'zz' }), /Response language: English/);
  assert.match(buildHelpSystemPrompt({ persona: 'counselor' }), /Current page: unknown/);
});

test('user content threads a short history ahead of the new question', () => {
  assert.equal(buildHelpUserContent('q', []), 'q');
  const content = buildHelpUserContent('and then?', [
    { role: 'user', text: 'where are jobs?' },
    { role: 'assistant', text: 'Job board (/dashboard/jobs).' },
  ]);
  assert.match(content, /^Earlier in this conversation:\nUser: where are jobs\?\nAssistant: Job board/);
  assert.match(content, /New question: and then\?$/);
});

test('redirectAnswer sends a member asking about admin features back to member pages', () => {
  const answer = redirectAnswer('member', 'How do admins approve applicants in the command center?', '/dashboard', 'en');
  assert.ok(answer);
  assert.equal(answer.source, 'redirect');
  assert.match(answer.text, /different role/);
  assert.ok(answer.links.length > 0);
  for (const link of answer.links) assert.ok(link.href.startsWith('/dashboard'), link.href);
});

test('redirectAnswer is null for in-scope questions and localises when needed', () => {
  assert.equal(redirectAnswer('member', 'How do I message my counselor?', '/dashboard', 'en'), null);
  const es = redirectAnswer('counselor', 'cómo cambia un admin la bandera?', '/counselor/today', 'es');
  assert.ok(es);
  assert.match(es.text, /otro rol/);
});

test('fallbackAnswer never throws, points at the tour and support, and stays in the portal', () => {
  const answer = fallbackAnswer('counselor', 'where is the at-risk list?', '/counselor/today', 'en');
  assert.equal(answer.source, 'fallback');
  assert.match(answer.text, /guided tour in the Help menu/);
  assert.match(answer.text, new RegExp(HELP_KNOWLEDGE.counselor.supportHint.slice(0, 20)));
  assert.ok(answer.links.some((l) => l.href === '/counselor/at-risk'));
  assert.ok(answer.links.some((l) => l.href === '/counselor/guide'));
  for (const link of answer.links) assert.ok(link.href.startsWith('/counselor'), link.href);
});

test('linksForAnswer caps at four and always includes the guide when one exists', () => {
  const links = linksForAnswer('member', 'resume interview jobs applications certificates points', '/dashboard');
  assert.ok(links.length <= 4);
  assert.ok(links.some((l) => l.href === '/dashboard/guide'));
  const admin = linksForAnswer('admin', 'flags');
  assert.ok(admin.some((l) => l.href === '/admin/what-workforceap-does'));
});

test('sanitizeAnswer strips carriage returns, collapses blank runs and caps length', () => {
  assert.equal(sanitizeAnswer('a\r\n\n\n\nb  '), 'a\n\nb');
  assert.ok(sanitizeAnswer('x'.repeat(5000)).length <= 1600);
});
