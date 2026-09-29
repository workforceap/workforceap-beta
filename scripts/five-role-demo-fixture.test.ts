/**
 * MOCKED — NOT ACCEPTANCE. Offline tests of the WAP-6 five-role fixture CLI
 * (scripts/five-role-demo-fixture.ts). Every dependency is an in-memory fake
 * and every network call is a fake fetch: no Supabase, database, Preview or
 * provider is touched, and nothing here proves any role action persists.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  cleanupFixtures,
  createFixtures,
  FIXTURE_FLAG,
  main,
  readbackPersistence,
  resolveCleanupInput,
  type FixtureDeps,
  type FixtureState,
  type Role,
} from './five-role-demo-fixture';

// Independent oracles for the synthetic identity formats (deliberately not
// imported from the module under test).
const emailFor = (runId: string, role: Role) => `wap6-qa-${runId}-${role}@example.com`;
const partnerSlugFor = (runId: string) => `portal-qa-wap6-${runId}`;
const WRITTEN: Record<Role, string> = {
  member: 'WAP-6 QA goal', counselor: 'WAP-6 QA counselor note', admin: 'WAP-6 QA admin note',
  employer: 'WAP-6 QA Employer', partner: 'WAP-6 QA Partner',
};
const writtenValueFor = (runId: string, role: Role) => `${WRITTEN[role]} ${runId}`;

const DEMO_REF = 'esbdrgaonplpvzmtrdhw';
const PROD_REF = 'jqddnyuszufndwwezdwp';
const ROLES: Role[] = ['member', 'counselor', 'admin', 'employer', 'partner'];
const RUN = '4242-1';
const TARGET = { organizationId: 'qa-org', organizationSlug: 'portal-qa-test', databaseUrl: 'postgresql://unused' };
const FOREIGN = '99999999-9999-4999-8999-999999999999';
let seq = 0;
const newId = () => `${String(++seq).padStart(8, '0')}-1111-4111-8111-111111111111`;
const passwords = () => Object.fromEntries(ROLES.map((role, i) => [role, `${role}-password-${'x'.repeat(24)}-${i}`])) as Record<Role, string>;

function fakeDeps({ organizations = [{ id: 'qa-org', slug: 'portal-qa-test', active: true }] } = {}) {
  const calls: string[] = [];
  const users = new Map<string, { id: string; email: string; organizationId: string }>([
    [FOREIGN, { id: FOREIGN, email: 'member-test@workforceap.org', organizationId: 'qa-org' }],
  ]);
  const auth = new Map<string, { id: string; email: string | null; appMetadata: Record<string, unknown> }>([
    [FOREIGN, { id: FOREIGN, email: 'member-test@workforceap.org', appMetadata: {} }],
  ]);
  const partners = new Map<string, { id: string; organizationId: string; slug: string; name: string }>();
  const employers = new Map<string, { id: string; userId: string; companyName: string }>();
  const goals = new Map<string, { id: string; userId: string; title: string }>();
  const notes = new Map<string, { id: string; memberId: string | null; authorId: string | null; content: string }>([
    ['foreign-note', { id: 'foreign-note', memberId: FOREIGN, authorId: FOREIGN, content: 'real note' }],
  ]);
  const failures = { authCreateAt: -1, authLookup: false, authDeleteKeeps: false };
  let authCreates = 0;
  const inScope = (n: { memberId: string | null; authorId: string | null }, s: { memberId: string | null; authorIds: string[] }) =>
    (s.memberId !== null && n.memberId === s.memberId) || (n.authorId !== null && s.authorIds.includes(n.authorId));
  const deps: FixtureDeps = {
    findOrganization: async (id) => { calls.push('findOrganization'); return organizations.find((o) => o.id === id) ?? null; },
    countActivePortalQaOrganizations: async () => organizations.filter((o) => o.active && o.slug.startsWith('portal-qa-')).length,
    findUserIdByEmail: async (email) => [...users.values()].find((u) => u.email === email)?.id ?? null,
    findUserById: async (id) => users.get(id) ?? null,
    createAuthUser: async ({ email, appMetadata }) => {
      calls.push(`createAuthUser:${email}`);
      if (authCreates++ === failures.authCreateAt) throw new Error('Auth down');
      const id = newId();
      auth.set(id, { id, email, appMetadata });
      return id;
    },
    getAuthUser: async (id) => {
      if (failures.authLookup) throw new Error('Auth 500');
      return auth.get(id) ?? null;
    },
    deleteAuthUser: async (id) => { calls.push(`deleteAuthUser:${id}`); if (!failures.authDeleteKeeps) auth.delete(id); },
    createRoleRows: async ({ organizationId, users: created, partner, employerCompanyName }) => {
      calls.push('createRoleRows');
      for (const role of ROLES) users.set(created[role].userId, { id: created[role].userId, email: created[role].email, organizationId });
      const partnerId = newId();
      partners.set(partnerId, { id: partnerId, organizationId, slug: partner.slug, name: partner.name });
      const employerId = newId();
      employers.set(employerId, { id: employerId, userId: created.employer.userId, companyName: employerCompanyName });
      return { partnerId, employerId };
    },
    deleteUser: async (id) => { calls.push(`deleteUser:${id}`); users.delete(id); },
    findPartner: async (id) => partners.get(id) ?? null,
    deletePartner: async (id) => { calls.push(`deletePartner:${id}`); partners.delete(id); },
    countNotes: async (scope) => [...notes.values()].filter((n) => inScope(n, scope)).length,
    deleteNotes: async (scope) => {
      let count = 0;
      for (const note of [...notes.values()]) if (inScope(note, scope)) { notes.delete(note.id); count += 1; }
      calls.push(`deleteNotes:${count}`);
      return count;
    },
    findGoal: async (id) => goals.get(id) ?? null,
    findNote: async (id) => notes.get(id) ?? null,
    findEmployer: async (id) => employers.get(id) ?? null,
    sleep: async () => {},
  };
  return { deps, calls, users, auth, partners, employers, goals, notes, failures };
}

async function created(fake = fakeDeps()) {
  const marker: unknown[] = [];
  const states: FixtureState[] = [];
  const state = await createFixtures(TARGET, RUN, passwords(), fake.deps,
    (s) => states.push(structuredClone(s)), (m) => { marker.push(m); fake.calls.push('marker'); });
  return { fake, state, marker, states };
}

/** Simulate the spec's five writes on the fakes. */
function writeAll(fake: ReturnType<typeof fakeDeps>, state: FixtureState) {
  const goalId = newId();
  fake.goals.set(goalId, { id: goalId, userId: state.users.member!.userId, title: writtenValueFor(RUN, 'member') });
  const roles: Record<string, { recordId: string }> = { member: { recordId: goalId } };
  for (const role of ['counselor', 'admin'] as const) {
    const noteId = newId();
    fake.notes.set(noteId, { id: noteId, memberId: state.users.member!.userId, authorId: state.users[role]!.userId, content: writtenValueFor(RUN, role) });
    roles[role] = { recordId: noteId };
  }
  fake.employers.get(state.employerId!)!.companyName = writtenValueFor(RUN, 'employer');
  fake.partners.get(state.partnerId!)!.name = writtenValueFor(RUN, 'partner');
  roles.employer = { recordId: state.employerId! };
  roles.partner = { recordId: state.partnerId! };
  return { runId: RUN, roles };
}

test('[mocked — NOT acceptance] create: marker before the first Auth call, state after every Auth call, flagged synthetic users', async () => {
  const { fake, state, states } = await created();
  const firstAuth = fake.calls.findIndex((c) => c.startsWith('createAuthUser'));
  assert.ok(fake.calls.indexOf('marker') < firstAuth, 'marker is written before any Auth write');
  assert.deepEqual(states.map((s) => Object.keys(s.users).length), [1, 2, 3, 4, 5, 5]);
  for (const role of ROLES) {
    assert.equal(state.users[role]!.email, emailFor(RUN, role));
    const authUser = fake.auth.get(state.users[role]!.userId)!;
    assert.equal(authUser.appMetadata[FIXTURE_FLAG], true);
    assert.equal(authUser.appMetadata.run_id, RUN);
  }
  assert.equal(fake.partners.get(state.partnerId!)!.slug, partnerSlugFor(RUN));
  assert.match(fake.employers.get(state.employerId!)!.companyName, /\(before\)$/);
});

test('[mocked — NOT acceptance] create refuses a non-portal-qa or second fixture organization, and an existing synthetic email, before any Auth write', async () => {
  for (const organizations of [
    [{ id: 'qa-org', slug: 'workforceap', active: true }],
    [{ id: 'qa-org', slug: 'portal-qa-test', active: false }],
    [{ id: 'qa-org', slug: 'portal-qa-test', active: true }, { id: 'qa-2', slug: 'portal-qa-other', active: true }],
  ]) {
    const fake = fakeDeps({ organizations });
    await assert.rejects(createFixtures(TARGET, RUN, passwords(), fake.deps, () => {}, () => {}), /portal QA organization preflight failed|exactly one active portal-qa/);
    assert.equal(fake.calls.some((c) => c.startsWith('createAuthUser')), false);
  }
  const fake = fakeDeps();
  fake.users.set('x', { id: 'x', email: emailFor(RUN, 'admin'), organizationId: 'qa-org' });
  await assert.rejects(createFixtures(TARGET, RUN, passwords(), fake.deps, () => {}, () => {}), /synthetic admin for this run already exists/);
  assert.equal(fake.calls.some((c) => c.startsWith('createAuthUser')), false);
  const same = Object.fromEntries(ROLES.map((role) => [role, 'y'.repeat(32)])) as Record<Role, string>;
  await assert.rejects(createFixtures(TARGET, RUN, same, fakeDeps().deps, () => {}, () => {}), /its own generated password/);
});

test('[mocked — NOT acceptance] a failure part-way leaves the created IDs recorded, and cleanup removes exactly those', async () => {
  const fake = fakeDeps();
  fake.failures.authCreateAt = 2;
  const states: FixtureState[] = [];
  await assert.rejects(createFixtures(TARGET, RUN, passwords(), fake.deps, (s) => states.push(structuredClone(s)), () => {}), /Auth down/);
  const last = states.at(-1)!;
  assert.deepEqual(Object.keys(last.users), ['member', 'counselor']);
  const result = await cleanupFixtures(TARGET, last, fake.deps);
  assert.equal(result.fixturesCreated, 'partial');
  assert.equal(fake.auth.has(last.users.member!.userId), false);
  assert.equal(fake.auth.has(FOREIGN), true, 'a real account is never touched');
});

test('[mocked — NOT acceptance] readback passes only for the recorded rows with their owner and written value', async () => {
  const { fake, state } = await created();
  const acceptance = writeAll(fake, state);
  const ok = await readbackPersistence(state, acceptance, fake.deps);
  assert.equal(ok.success, true);
  for (const role of ROLES) assert.deepEqual(
    { found: ok.roles[role].found, owner: ok.roles[role].ownerMatched, value: ok.roles[role].valueMatched },
    { found: true, owner: true, value: true }, role);

  assert.equal((await readbackPersistence(state, null, fake.deps)).success, false, 'no acceptance receipt');
  assert.equal((await readbackPersistence(state, { ...acceptance, runId: '1-1' }, fake.deps)).success, false, 'another run');
  const wrongRecord = { ...acceptance, roles: { ...acceptance.roles, employer: { recordId: FOREIGN } } };
  assert.equal((await readbackPersistence(state, wrongRecord, fake.deps)).success, false, 'employer record ID differs');
  fake.partners.get(state.partnerId!)!.name = writtenValueFor(RUN, 'partner') + ' (before)';
  const unchanged = await readbackPersistence(state, acceptance, fake.deps);
  assert.equal(unchanged.success, false);
  assert.equal(unchanged.roles.partner.valueMatched, false, 'the seed value is not the written value');
  fake.partners.get(state.partnerId!)!.name = writtenValueFor(RUN, 'partner');
  fake.notes.get(acceptance.roles.admin.recordId)!.authorId = FOREIGN;
  assert.equal((await readbackPersistence(state, acceptance, fake.deps)).roles.admin.ownerMatched, false, 'note by someone else');
});

test('[mocked — NOT acceptance] cleanup removes only recorded IDs and verifies every absence', async () => {
  const { fake, state } = await created();
  writeAll(fake, state);
  const result = await cleanupFixtures(TARGET, state, fake.deps);
  assert.equal(result.fixturesCreated, true);
  assert.equal(result.notes.deleted, 2);
  assert.equal(result.notes.absenceVerified, true);
  assert.equal(result.partner.absenceVerified, true);
  for (const role of ROLES) {
    assert.equal(fake.auth.has(state.users[role]!.userId), false);
    assert.equal(fake.users.has(state.users[role]!.userId), false);
    assert.equal(result.users[role]!.authAbsenceVerified, true);
    assert.equal(result.users[role]!.databaseAbsenceVerified, true);
  }
  assert.equal(fake.partners.size, 0);
  assert.equal(fake.notes.has('foreign-note'), true, 'a real note is never touched');
  assert.equal(fake.users.has(FOREIGN) && fake.auth.has(FOREIGN), true, 'a real account is never touched');
  const deletes = fake.calls.filter((c) => c.startsWith('delete'));
  assert.equal(deletes[0], 'deleteNotes:2', 'notes go first (they would outlive users via SET NULL)');
  assert.ok(deletes.findLastIndex((c) => c.startsWith('deleteAuthUser')) < deletes.findIndex((c) => c.startsWith('deleteUser')));
  assert.equal(deletes.at(-1), `deletePartner:${state.partnerId}`);
});

test('[mocked — NOT acceptance] cleanup fails closed: a recorded ID that is not this run\'s synthetic user, a foreign partner, or an Auth outage', async () => {
  {
    const { fake, state } = await created();
    fake.auth.get(state.users.admin!.userId)!.appMetadata = {};
    await assert.rejects(cleanupFixtures(TARGET, state, fake.deps), /Auth user recorded as the admin is not this run's synthetic user/);
    assert.equal(fake.calls.some((c) => c.startsWith('delete')), false);
  }
  {
    const { fake, state } = await created();
    fake.partners.get(state.partnerId!)!.slug = 'real-partner';
    await assert.rejects(cleanupFixtures(TARGET, state, fake.deps), /not this run's synthetic partner/);
    assert.equal(fake.calls.some((c) => c.startsWith('delete')), false);
  }
  {
    const { fake, state } = await created();
    fake.failures.authLookup = true;
    await assert.rejects(cleanupFixtures(TARGET, state, fake.deps), /failed at "member Auth lookup".*Manual cleanup IDs: runId=4242-1 member=/);
    assert.equal(fake.calls.some((c) => c.startsWith('delete')), false);
  }
  {
    const { fake, state } = await created();
    fake.failures.authDeleteKeeps = true;
    await assert.rejects(cleanupFixtures(TARGET, state, fake.deps), /member Auth user still present/);
    assert.equal(fake.calls.some((c) => c.startsWith('deleteUser')), false, 'database rows are kept for a rerun');
  }
  const { fake, state } = await created();
  await assert.rejects(cleanupFixtures({ ...TARGET, organizationId: 'other' }, state, fake.deps), /not a synthetic five-role fixture of this organization/);
  const forged = { ...state, users: { ...state.users, member: { userId: FOREIGN, email: 'member-test@workforceap.org' } } };
  await assert.rejects(cleanupFixtures(TARGET, forged, fake.deps), /not a synthetic five-role fixture/);
});

test('[mocked — NOT acceptance] resolveCleanupInput: only a readable state or a pre-client stop; everything else fails closed with exact emails', async () => {
  const { state } = await created();
  assert.equal(resolveCleanupInput(null, JSON.stringify(state), null).kind, 'state');
  for (const stage of ['target-guard', 'key-probe']) {
    assert.deepEqual(resolveCleanupInput(null, null, JSON.stringify({ stage })), { kind: 'stopped-before-clients', failedStage: stage });
  }
  const marker = JSON.stringify({ runId: RUN, organizationId: 'qa-org', emails: {} });
  assert.throws(() => resolveCleanupInput(marker, null, JSON.stringify({ stage: 'clients', runId: RUN })),
    new RegExp(`exact emails ${emailFor(RUN, 'member').replace(/[.]/g, '\\.')}.*Never delete by pattern`));
  assert.throws(() => resolveCleanupInput(null, null, JSON.stringify({ stage: 'clients', runId: RUN })), /Refusing cleanup/);
  assert.throws(() => resolveCleanupInput(null, null, null), /run ID not recorded/);
  assert.throws(() => resolveCleanupInput(marker, '{broken', null), /Refusing cleanup/);
  const tampered = { ...state, users: { member: { userId: FOREIGN, email: 'member-test@workforceap.org' } } };
  assert.throws(() => resolveCleanupInput(marker, JSON.stringify(tampered), null), /Refusing cleanup/);
});

// ---- CLI gates ----------------------------------------------------------

function cli(overrides: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wap6-cli-'));
  const env = {
    NODE_ENV: 'test',
    PORTAL_QA_TARGET: 'demo',
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO_REF}.supabase.co`,
    POSTGRES_PRISMA_URL: `postgresql://postgres:pw@db.${DEMO_REF}.supabase.co:5432/postgres`,
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_unused',
    PORTAL_QA_ORGANIZATION_ID: 'qa-org',
    PORTAL_QA_ORGANIZATION_SLUG: 'portal-qa-test',
    GITHUB_ENV: join(dir, 'github-env'),
    GITHUB_RUN_ID: '4242',
    GITHUB_RUN_ATTEMPT: '1',
    FIVE_ROLE_QA_STATE_FILE: join(dir, 'state.json'),
    FIVE_ROLE_QA_MARKER_FILE: join(dir, 'marker.json'),
    FIVE_ROLE_QA_STAGE_FILE: join(dir, 'stage.json'),
    FIVE_ROLE_QA_CLEANUP_OUTPUT: join(dir, 'out', 'cleanup.json'),
    FIVE_ROLE_QA_READBACK_OUTPUT: join(dir, 'out', 'readback.json'),
    FIVE_ROLE_ACCEPTANCE_OUTPUT: join(dir, 'out', 'acceptance.json'),
    ...overrides,
  } as NodeJS.ProcessEnv;
  const fetches: string[] = [];
  let clientsBuilt = 0;
  const fake = fakeDeps();
  const options = (status: number) => ({
    fetchImpl: (async (url: string | URL) => { fetches.push(String(url)); return new Response(null, { status }); }) as typeof fetch,
    makeDeps: () => { clientsBuilt += 1; return { deps: fake.deps, close: async () => {} }; },
  });
  return { env, fetches, options, fake, clientsBuilt: () => clientsBuilt };
}
const json = (path: string | undefined) => JSON.parse(readFileSync(path!, 'utf8'));

test('[mocked — NOT acceptance] CLI: a prod or unknown database/Auth URL is refused before any probe or client', async () => {
  for (const [override, reason] of [
    [{ POSTGRES_PRISMA_URL: `postgresql://postgres:pw@db.${PROD_REF}.supabase.co:5432/postgres` }, /database URL must identify the approved demo project/],
    [{ POSTGRES_PRISMA_URL: `postgresql://postgres:pw@db.${DEMO_REF}.supabase.co:5432/postgres?host=/tmp` }, /database URL must identify the approved demo project/],
    [{ POSTGRES_PRISMA_URL: 'postgresql://postgres:pw@example.com:5432/postgres' }, /database URL must identify the approved demo project/],
    [{ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` }, /Auth URL must identify the approved demo project/],
    [{ PORTAL_QA_ORGANIZATION_SLUG: 'workforceap' }, /portal-qa-\* slug/],
  ] as const) {
    const run = cli(override);
    await assert.rejects(main('create', run.env, run.options(200)), reason);
    assert.equal(run.fetches.length, 0, 'no key probe');
    assert.equal(run.clientsBuilt(), 0, 'no client');
    assert.deepEqual(json(run.env.FIVE_ROLE_QA_STAGE_FILE), { stage: 'target-guard' });
    await main('cleanup', run.env, run.options(200));
    assert.deepEqual(
      { success: json(run.env.FIVE_ROLE_QA_CLEANUP_OUTPUT).success, fixturesCreated: json(run.env.FIVE_ROLE_QA_CLEANUP_OUTPUT).fixturesCreated, info: json(run.env.FIVE_ROLE_QA_CLEANUP_OUTPUT).informationalOnly },
      { success: true, fixturesCreated: false, info: true },
    );
  }
});

test('[mocked — NOT acceptance] CLI: a rejected DEMO key stops before any client or Auth write', async () => {
  const run = cli();
  await assert.rejects(main('create', run.env, run.options(401)), /key check did not pass \(urlProject demo, key rejected\)/);
  assert.equal(run.fetches.length, 1);
  assert.match(run.fetches[0], new RegExp(`^https://${DEMO_REF}\\.supabase\\.co/auth/v1/admin/users`));
  assert.equal(run.clientsBuilt(), 0);
  assert.equal(existsSync(run.env.FIVE_ROLE_QA_MARKER_FILE!), false);
  assert.equal(run.fake.calls.some((c) => c.startsWith('createAuthUser')), false);
  assert.equal(json(run.env.FIVE_ROLE_QA_STAGE_FILE).stage, 'key-probe');
  await main('cleanup', run.env, run.options(401));
  assert.equal(json(run.env.FIVE_ROLE_QA_CLEANUP_OUTPUT).fixturesCreated, false);
});

test('[mocked — NOT acceptance] CLI: a re-run attempt is refused before anything else', async () => {
  const run = cli({ GITHUB_RUN_ATTEMPT: '2' });
  await assert.rejects(main('create', run.env, run.options(200)), /re-runs are refused/);
  assert.equal(run.fetches.length + run.clientsBuilt(), 0);
});

test('[mocked — NOT acceptance] CLI: create -> readback -> cleanup with fakes writes the three receipts', async () => {
  const run = cli();
  await main('create', run.env, run.options(200));
  const handoff = readFileSync(run.env.GITHUB_ENV!, 'utf8');
  for (const role of ROLES) assert.match(handoff, new RegExp(`FIVE_ROLE_QA_${role.toUpperCase()}_EMAIL=${emailFor(RUN, role).replace(/[.]/g, '\\.')}`));
  const state = json(run.env.FIVE_ROLE_QA_STATE_FILE) as FixtureState;

  // Readback before the spec wrote anything fails and records why.
  await assert.rejects(main('readback', run.env, run.options(200)), /did not confirm every role/);
  assert.equal(json(run.env.FIVE_ROLE_QA_READBACK_OUTPUT).success, false);

  const acceptance = writeAll(run.fake, state);
  writeFileSync(run.env.FIVE_ROLE_ACCEPTANCE_OUTPUT!, JSON.stringify(acceptance));
  await main('readback', run.env, run.options(200));
  assert.equal(json(run.env.FIVE_ROLE_QA_READBACK_OUTPUT).success, true);

  await main('cleanup', run.env, run.options(200));
  const receipt = json(run.env.FIVE_ROLE_QA_CLEANUP_OUTPUT);
  assert.equal(receipt.success, true);
  assert.equal(receipt.fixturesCreated, true);
  assert.equal(receipt.auditRowsRetained, true);
});

test('[mocked — NOT acceptance] CLI: cleanup with a marker but no state fails closed and records it', async () => {
  const run = cli();
  writeFileSync(run.env.FIVE_ROLE_QA_MARKER_FILE!, JSON.stringify({ runId: RUN, organizationId: 'qa-org', emails: {} }));
  writeFileSync(run.env.FIVE_ROLE_QA_STAGE_FILE!, JSON.stringify({ stage: 'clients', runId: RUN }));
  await assert.rejects(main('cleanup', run.env, run.options(200)), /Refusing cleanup/);
  const receipt = json(run.env.FIVE_ROLE_QA_CLEANUP_OUTPUT);
  assert.deepEqual([receipt.success, receipt.fixturesCreated], [false, 'unknown']);
  assert.equal(run.clientsBuilt(), 0);
});
