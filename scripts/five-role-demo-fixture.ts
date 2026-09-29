#!/usr/bin/env npx tsx
/**
 * Per-run disposable DEMO users for the WAP-6 five-role action and persistence
 * acceptance lane (docs/FIVE-ROLE-DEMO-ACCEPTANCE.md,
 * .github/workflows/five-role-demo-acceptance.yml).
 *
 *   create    make FIVE new users `wap6-qa-<run id>-1-<role>@example.com`
 *             (member, counselor, admin, employer, partner) in the dedicated
 *             portal-qa-* organization of the DEMO project. Each gets a
 *             password generated for this run only (never printed; handed to
 *             later steps through GITHUB_ENV with a log mask). It also creates a
 *             synthetic partner organization, the employer row, the counselor
 *             row and one counselor assignment to the synthetic member.
 *   readback  after the spec: look up every row the spec wrote, by the ID the
 *             acceptance receipt recorded, and check its owner and value.
 *             Read-only.
 *   cleanup   remove exactly the recorded IDs: notes about the synthetic member
 *             or written by the synthetic staff, the five Auth users, the five
 *             database users (their role, profile, employer, counselor,
 *             assignment, partner link, goal and event rows cascade), then the
 *             synthetic partner organization. Every absence is checked after
 *             the delete. Nothing is matched by pattern. Audit rows are kept.
 *
 * Target and organization checks reuse scripts/lib/portal-qa-guard.cjs and
 * run before any client is constructed; the DEMO service key must pass the
 * read-only probe (scripts/lib/demo-service-key-probe.cjs) before any write.
 * No existing account is read by email except to prove this run's five
 * synthetic emails are unused, and none is changed.
 *
 * Environment: PORTAL_QA_TARGET=demo, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, POSTGRES_PRISMA_URL, PORTAL_QA_ORGANIZATION_ID,
 * PORTAL_QA_ORGANIZATION_SLUG, FIVE_ROLE_QA_STATE_FILE (optional
 * FIVE_ROLE_QA_MARKER_FILE, FIVE_ROLE_QA_STAGE_FILE), FIVE_ROLE_ACCEPTANCE_OUTPUT
 * and FIVE_ROLE_QA_READBACK_OUTPUT (readback), FIVE_ROLE_QA_CLEANUP_OUTPUT
 * (cleanup); `create` also needs GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT (must be 1)
 * and GITHUB_ENV.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { assertPortalQaOrganization, readPortalQaTarget } from './lib/portal-qa-guard.cjs';
import { probeDemoServiceKey } from './lib/demo-service-key-probe.cjs';
import {
  CLEANUP_KIND,
  emailFor,
  FIVE_ROLES,
  partnerSlugFor,
  READBACK_KIND,
  RUN_ID,
  runIdFor,
  seededValueFor,
  writtenValueFor,
} from './lib/five-role-acceptance.mjs';
import { CLEANUP_RETRY_DELAYS_MS, generatePassword, isAuthNotFound } from './resume-demo-member';

export type Role = 'member' | 'counselor' | 'admin' | 'employer' | 'partner';
const ROLES = FIVE_ROLES as readonly Role[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FIXTURE_FLAG = 'wap6_five_role_fixture';

export interface PortalQaTarget { organizationId: string; organizationSlug: string; databaseUrl: string }
export interface RecordedUser { userId: string; email: string }
export interface FixtureState {
  runId: string;
  organizationId: string;
  users: Partial<Record<Role, RecordedUser>>;
  partnerId?: string;
  employerId?: string;
}
export interface CreationMarker { runId: string; organizationId: string; emails: Record<Role, string> }
type PreClientStage = 'target-guard' | 'key-probe';
export interface CreateStage { stage: PreClientStage | 'clients'; runId?: string }

export type CleanupInput =
  | { kind: 'state'; state: FixtureState }
  | { kind: 'stopped-before-clients'; failedStage: PreClientStage };

export interface FixtureDeps {
  findOrganization(id: string): Promise<{ id: string; slug: string; active: boolean } | null>;
  countActivePortalQaOrganizations(): Promise<number>;
  findUserIdByEmail(email: string): Promise<string | null>;
  findUserById(id: string): Promise<{ id: string; email: string; organizationId: string } | null>;
  createAuthUser(input: { email: string; password: string; fullName: string; appMetadata: Record<string, unknown> }): Promise<string>;
  /** null ONLY on an explicit `user_not_found`; every other error throws. */
  getAuthUser(id: string): Promise<{ id: string; email: string | null; appMetadata: Record<string, unknown> } | null>;
  deleteAuthUser(id: string): Promise<void>;
  /** One transaction: users, role rows, partner, employer, counselor and assignment. */
  createRoleRows(input: {
    organizationId: string;
    users: Record<Role, RecordedUser>;
    partner: { slug: string; name: string; referralCode: string };
    employerCompanyName: string;
  }): Promise<{ partnerId: string; employerId: string }>;
  deleteUser(id: string): Promise<void>;
  findPartner(id: string): Promise<{ id: string; organizationId: string; slug: string; name: string } | null>;
  deletePartner(id: string): Promise<void>;
  /** Notes whose member is `memberId`, or whose author is one of `authorIds`. */
  countNotes(scope: { memberId: string | null; authorIds: string[] }): Promise<number>;
  deleteNotes(scope: { memberId: string | null; authorIds: string[] }): Promise<number>;
  findGoal(id: string): Promise<{ id: string; userId: string; title: string } | null>;
  findNote(id: string): Promise<{ id: string; memberId: string | null; authorId: string | null; content: string } | null>;
  findEmployer(id: string): Promise<{ id: string; userId: string; companyName: string } | null>;
  sleep?(ms: number): Promise<void>;
}

function readJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecordedUser(value: unknown, runId: string, role: Role): value is RecordedUser {
  const v = value as Partial<RecordedUser> | null;
  return Boolean(v) && typeof v!.userId === 'string' && UUID.test(v!.userId) && v!.email === emailFor(runId, role);
}

/** A state file this run wrote: a first-attempt run ID and only well-formed synthetic users. */
export function isFixtureState(value: unknown): value is FixtureState {
  const v = value as Partial<FixtureState> | null;
  if (!v || typeof v.runId !== 'string' || !RUN_ID.test(v.runId) || typeof v.organizationId !== 'string') return false;
  if (!v.users || typeof v.users !== 'object') return false;
  for (const [role, user] of Object.entries(v.users)) {
    if (!ROLES.includes(role as Role) || !isRecordedUser(user, v.runId, role as Role)) return false;
  }
  for (const key of ['partnerId', 'employerId'] as const) {
    if (v[key] !== undefined && !(typeof v[key] === 'string' && UUID.test(v[key]!))) return false;
  }
  return true;
}

/**
 * What cleanup may do, from the marker, state and stage files alone.
 * - A valid state: clean up exactly the recorded IDs.
 * - No marker, no state, and a stage still at `target-guard` or `key-probe`:
 *   create stopped before any client or Auth call, so cleanup only writes an
 *   INFORMATIONAL receipt ("no marker found", never "proven absent").
 * - Anything else fails closed with exact-email recovery steps.
 */
export function resolveCleanupInput(markerText: string | null, stateText: string | null, stageText: string | null): CleanupInput {
  const state = readJson(stateText);
  if (isFixtureState(state)) return { kind: 'state', state };
  const stage = readJson(stageText) as Partial<CreateStage> | null | undefined;
  if (markerText === null && stateText === null
    && (stage?.stage === 'target-guard' || stage?.stage === 'key-probe')) {
    return { kind: 'stopped-before-clients', failedStage: stage.stage };
  }
  const marker = readJson(markerText) as Partial<CreationMarker> | null | undefined;
  const runId = [marker?.runId, stage?.runId].find((value): value is string => typeof value === 'string' && RUN_ID.test(value));
  const emails = runId ? ROLES.map((role) => emailFor(runId, role)).join(', ') : 'wap6-qa-<run id>-1-<role>@example.com (run ID not recorded)';
  throw new Error(
    'Refusing cleanup: synthetic users may have been created but their recorded IDs are missing or unreadable. '
      + `Manual recovery: in the DEMO project, look up each Auth user and users row by the exact emails ${emails}, `
      + `confirm app_metadata.${FIXTURE_FLAG} is true, then remove those exact IDs: notes about or by them, the Auth users, `
      + `the users rows, then the partner organization with slug ${runId ? partnerSlugFor(runId) : 'portal-qa-wap6-<run id>-1'}. `
      + 'Never delete by pattern.',
  );
}

/**
 * The dispatch inputs must name the exact, active fixture organization. Before
 * creating, it must also be the only active portal-qa-* organization.
 */
async function assertOrganization(target: PortalQaTarget, deps: FixtureDeps, { requireOnly }: { requireOnly: boolean }) {
  assertPortalQaOrganization(await deps.findOrganization(target.organizationId), target);
  if (requireOnly && (await deps.countActivePortalQaOrganizations()) !== 1) {
    throw new Error('Expected exactly one active portal-qa-* organization. No fixture writes are allowed.');
  }
}

/**
 * Create the five users. The marker (run ID and emails, no secrets) is
 * written before the first Auth call, and the state after EVERY Auth call, so
 * a failure part-way always leaves the exact IDs for cleanup.
 */
export async function createFixtures(
  target: PortalQaTarget,
  runId: string,
  passwords: Record<Role, string>,
  deps: FixtureDeps,
  onState: (state: FixtureState) => void,
  onMarker: (marker: CreationMarker) => void,
): Promise<FixtureState> {
  const emails = Object.fromEntries(ROLES.map((role) => [role, emailFor(runId, role)])) as Record<Role, string>;
  if (new Set(Object.values(passwords)).size !== ROLES.length || ROLES.some((role) => !passwords[role] || passwords[role].length < 24)) {
    throw new Error('Each synthetic user needs its own generated password.');
  }
  await assertOrganization(target, deps, { requireOnly: true });
  for (const role of ROLES) {
    if (await deps.findUserIdByEmail(emails[role])) {
      throw new Error(`The synthetic ${role} for this run already exists. Nothing was changed.`);
    }
  }
  onMarker({ runId, organizationId: target.organizationId, emails });
  const state: FixtureState = { runId, organizationId: target.organizationId, users: {} };
  for (const role of ROLES) {
    const userId = await deps.createAuthUser({
      email: emails[role],
      password: passwords[role],
      fullName: `WAP-6 QA ${role}`,
      appMetadata: { [FIXTURE_FLAG]: true, run_id: runId, role, portal_qa_organization_id: target.organizationId },
    });
    if (!UUID.test(userId)) throw new Error('Auth returned a user ID that is not a UUID.');
    state.users[role] = { userId, email: emails[role] };
    onState(state);
  }
  const { partnerId, employerId } = await deps.createRoleRows({
    organizationId: target.organizationId,
    users: state.users as Record<Role, RecordedUser>,
    partner: { slug: partnerSlugFor(runId), name: seededValueFor(runId, 'partner'), referralCode: `QA-WAP6-${runId}` },
    employerCompanyName: seededValueFor(runId, 'employer'),
  });
  state.partnerId = partnerId;
  state.employerId = employerId;
  onState(state);
  return state;
}

export interface AcceptanceRecords { runId?: unknown; roles?: Partial<Record<Role, { recordId?: unknown }>> }

/**
 * Read-only: find every row the spec wrote by the ID the acceptance receipt
 * recorded, and check owner and value. A role with no recorded ID is
 * `found: false`. Employer and partner rows are the fixture's own IDs.
 */
export async function readbackPersistence(state: FixtureState, acceptance: AcceptanceRecords | null, deps: FixtureDeps) {
  const users = state.users as Record<Role, RecordedUser>;
  const recorded = (role: Role) => {
    const value = acceptance?.roles?.[role]?.recordId;
    return typeof value === 'string' && UUID.test(value) ? value : null;
  };
  const roles = {} as Record<Role, { recordId: string | null; found: boolean; ownerMatched: boolean; valueMatched: boolean }>;
  const member = users.member?.userId ?? null;

  const goalId = recorded('member');
  const goal = goalId ? await deps.findGoal(goalId) : null;
  roles.member = {
    recordId: goalId, found: Boolean(goal),
    ownerMatched: Boolean(goal && member && goal.userId === member),
    valueMatched: goal?.title === writtenValueFor(state.runId, 'member'),
  };
  for (const role of ['counselor', 'admin'] as const) {
    const noteId = recorded(role);
    const note = noteId ? await deps.findNote(noteId) : null;
    roles[role] = {
      recordId: noteId, found: Boolean(note),
      ownerMatched: Boolean(note && member && note.memberId === member && note.authorId === users[role]?.userId),
      valueMatched: note?.content === writtenValueFor(state.runId, role),
    };
  }
  const employer = state.employerId ? await deps.findEmployer(state.employerId) : null;
  roles.employer = {
    recordId: state.employerId ?? null, found: Boolean(employer),
    ownerMatched: Boolean(employer && employer.userId === users.employer?.userId),
    valueMatched: employer?.companyName === writtenValueFor(state.runId, 'employer'),
  };
  const partner = state.partnerId ? await deps.findPartner(state.partnerId) : null;
  roles.partner = {
    recordId: state.partnerId ?? null, found: Boolean(partner),
    ownerMatched: Boolean(partner && partner.organizationId === state.organizationId && partner.slug === partnerSlugFor(state.runId)),
    valueMatched: partner?.name === writtenValueFor(state.runId, 'partner'),
  };
  const recordsMatchAcceptance = (['employer', 'partner'] as const).every((role) => recorded(role) === roles[role].recordId);
  const success = acceptance?.runId === state.runId && recordsMatchAcceptance
    && ROLES.every((role) => roles[role].found && roles[role].ownerMatched && roles[role].valueMatched);
  return { success, roles };
}

async function withRetry<T>(deps: FixtureDeps, call: () => Promise<T>): Promise<T> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= CLEANUP_RETRY_DELAYS_MS.length) throw error;
      await sleep(CLEANUP_RETRY_DELAYS_MS[attempt]);
    }
  }
}

function stranded(state: FixtureState, step: string): Error {
  const ids = ROLES.flatMap((role) => (state.users[role] ? [`${role}=${state.users[role]!.userId}`] : [])).join(' ');
  return new Error(
    `Synthetic five-role cleanup failed at "${step}". Remaining rows were kept for a rerun of cleanup. `
      + `Manual cleanup IDs: runId=${state.runId} ${ids} partnerId=${state.partnerId ?? 'none'}.`,
  );
}

/**
 * Order: verify each recorded ID still belongs to this run (Auth lookups fail
 * closed), delete the notes and prove none remain, delete each Auth user and
 * prove it is gone, delete each database user and prove it is gone, then
 * delete the partner organization and prove it is gone. Any failure throws
 * with the exact recorded IDs.
 */
export async function cleanupFixtures(target: PortalQaTarget, state: FixtureState, deps: FixtureDeps) {
  if (!isFixtureState(state) || state.organizationId !== target.organizationId) {
    throw new Error('Refusing cleanup: the recorded state is not a synthetic five-role fixture of this organization.');
  }
  await assertOrganization(target, deps, { requireOnly: false });

  const recorded = ROLES.filter((role) => state.users[role]);
  const found = {} as Partial<Record<Role, { db: boolean; auth: boolean }>>;
  for (const role of recorded) {
    const { userId, email } = state.users[role]!;
    const dbUser = await deps.findUserById(userId);
    if (dbUser && (dbUser.email.toLowerCase() !== email || dbUser.organizationId !== target.organizationId)) {
      throw new Error(`Refusing cleanup: the database user recorded as the ${role} is not this run's synthetic user.`);
    }
    let authUser: Awaited<ReturnType<FixtureDeps['getAuthUser']>>;
    try {
      authUser = await withRetry(deps, () => deps.getAuthUser(userId));
    } catch {
      throw stranded(state, `${role} Auth lookup`);
    }
    if (authUser && (authUser.email?.toLowerCase() !== email || authUser.appMetadata[FIXTURE_FLAG] !== true
      || authUser.appMetadata.run_id !== state.runId)) {
      throw new Error(`Refusing cleanup: the Auth user recorded as the ${role} is not this run's synthetic user.`);
    }
    found[role] = { db: Boolean(dbUser), auth: Boolean(authUser) };
  }
  const partner = state.partnerId ? await deps.findPartner(state.partnerId) : null;
  if (partner && (partner.organizationId !== target.organizationId || partner.slug !== partnerSlugFor(state.runId))) {
    throw new Error('Refusing cleanup: the recorded partner organization is not this run\'s synthetic partner.');
  }

  // Notes use ON DELETE SET NULL, so they would outlive the users: remove them
  // first, scoped only by the recorded member and staff IDs.
  const noteScope = {
    memberId: state.users.member?.userId ?? null,
    authorIds: (['counselor', 'admin'] as const).flatMap((role) => (state.users[role] ? [state.users[role]!.userId] : [])),
  };
  let notesDeleted = 0;
  if (noteScope.memberId || noteScope.authorIds.length) {
    try {
      notesDeleted = await withRetry(deps, () => deps.deleteNotes(noteScope));
    } catch {
      throw stranded(state, 'note delete');
    }
    if ((await deps.countNotes(noteScope)) !== 0) throw stranded(state, 'notes still present');
  }

  const users = {} as Partial<Record<Role, Record<string, unknown>>>;
  for (const role of recorded) {
    const { userId, email } = state.users[role]!;
    if (found[role]!.auth) {
      try {
        await withRetry(deps, () => deps.deleteAuthUser(userId));
      } catch {
        throw stranded(state, `${role} Auth delete`);
      }
    }
    let still: Awaited<ReturnType<FixtureDeps['getAuthUser']>>;
    try {
      still = await withRetry(deps, () => deps.getAuthUser(userId));
    } catch {
      throw stranded(state, `${role} Auth absence check`);
    }
    if (still) throw stranded(state, `${role} Auth user still present`);
    users[role] = { userId, email, authUserDeleted: found[role]!.auth, authAbsenceVerified: true };
  }
  for (const role of recorded) {
    const { userId } = state.users[role]!;
    if (found[role]!.db) {
      try {
        await withRetry(deps, () => deps.deleteUser(userId));
      } catch {
        throw stranded(state, `${role} database delete`);
      }
    }
    if (await deps.findUserById(userId)) throw stranded(state, `${role} database user still present`);
    Object.assign(users[role]!, { databaseUserDeleted: found[role]!.db, databaseAbsenceVerified: true });
  }

  if (partner) {
    try {
      await withRetry(deps, () => deps.deletePartner(partner.id));
    } catch {
      throw stranded(state, 'partner delete');
    }
  }
  if (state.partnerId && (await deps.findPartner(state.partnerId))) throw stranded(state, 'partner still present');

  return {
    fixturesCreated: recorded.length === ROLES.length && Boolean(state.partnerId && state.employerId) ? true : 'partial',
    users,
    partner: { partnerId: state.partnerId ?? null, deleted: Boolean(partner), absenceVerified: true },
    notes: { deleted: notesDeleted, absenceVerified: true },
  };
}

function liveDeps(target: PortalQaTarget, env: NodeJS.ProcessEnv) {
  const prisma = new PrismaClient({ datasourceUrl: target.databaseUrl });
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const noteWhere = ({ memberId, authorIds }: { memberId: string | null; authorIds: string[] }) => ({
    OR: [...(memberId ? [{ memberId }] : []), ...(authorIds.length ? [{ authorId: { in: authorIds } }] : [])],
  });
  const deps: FixtureDeps = {
    findOrganization: (id) => prisma.organization.findUnique({ where: { id }, select: { id: true, slug: true, active: true } }),
    countActivePortalQaOrganizations: () =>
      prisma.organization.count({ where: { active: true, slug: { startsWith: 'portal-qa-' } } }),
    findUserIdByEmail: async (email) =>
      (await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null,
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, organizationId: true } }),
    createAuthUser: async ({ email, password, fullName, appMetadata }) => {
      const { data, error } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: appMetadata,
      });
      if (error || !data.user) throw new Error('Synthetic user Auth creation failed. No other account was changed.');
      return data.user.id;
    },
    getAuthUser: async (id) => {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error) {
        if (isAuthNotFound(error)) return null;
        throw new Error('Synthetic user Auth lookup failed.');
      }
      if (!data.user) throw new Error('Synthetic user Auth lookup returned no user and no error.');
      return { id: data.user.id, email: data.user.email ?? null, appMetadata: data.user.app_metadata ?? {} };
    },
    deleteAuthUser: async (id) => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw new Error('Synthetic user Auth deletion failed.');
    },
    createRoleRows: ({ organizationId, users, partner, employerCompanyName }) => prisma.$transaction(async (tx) => {
      assertPortalQaOrganization(
        await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, slug: true, active: true } }),
        target,
      );
      const role = async (name: Role) => (await tx.role.findUniqueOrThrow({ where: { name } })).id;
      const partnerRow = await tx.partner.create({
        data: {
          organizationId, name: partner.name, slug: partner.slug, referralCode: partner.referralCode,
          status: 'active', active: true,
          notifyOnEnrollment: false, notifyOnCourse: false, notifyOnCertified: false, notifyOnPlaced: false,
        },
        select: { id: true },
      });
      const base = (r: Role) => ({ id: users[r].userId, organizationId, email: users[r].email, fullName: `WAP-6 QA ${r}` });
      await tx.user.create({
        data: { ...base('member'), userRoles: { create: { roleId: await role('member') } }, profile: { create: { consentTerms: true } } },
      });
      await tx.user.create({
        data: {
          ...base('counselor'),
          userRoles: { create: { roleId: await role('counselor') } },
          profile: { create: { consentTerms: true, role: 'counselor' } },
          counselorProfile: { create: { affiliation: 'wap_staff', active: true } },
        },
      });
      const counselor = await tx.counselor.findUniqueOrThrow({ where: { userId: users.counselor.userId }, select: { id: true } });
      await tx.counselorAssignment.create({ data: { counselorId: counselor.id, memberId: users.member.userId, active: true } });
      await tx.user.create({
        data: {
          ...base('admin'),
          userRoles: { create: { roleId: await role('admin') } },
          profile: { create: { consentTerms: true, role: 'admin' } },
        },
      });
      const employerUser = await tx.user.create({
        data: {
          ...base('employer'),
          userRoles: { create: { roleId: await role('employer') } },
          profile: { create: { consentTerms: true } },
          employer: {
            create: {
              organizationId, companyName: employerCompanyName, contactName: 'WAP-6 QA employer',
              contactEmail: users.employer.email, tier: 'basic', status: 'active',
            },
          },
        },
        select: { employer: { select: { id: true } } },
      });
      await tx.user.create({
        data: {
          ...base('partner'),
          userRoles: { create: { roleId: await role('partner') } },
          profile: { create: { consentTerms: true } },
          partnerUser: { create: { partnerId: partnerRow.id } },
        },
      });
      return { partnerId: partnerRow.id, employerId: employerUser.employer!.id };
    }),
    deleteUser: async (id) => { await prisma.user.delete({ where: { id } }); },
    findPartner: (id) => prisma.partner.findUnique({ where: { id }, select: { id: true, organizationId: true, slug: true, name: true } }),
    deletePartner: async (id) => { await prisma.partner.delete({ where: { id } }); },
    countNotes: (scope) => prisma.counselorNote.count({ where: noteWhere(scope) }),
    deleteNotes: async (scope) => (await prisma.counselorNote.deleteMany({ where: noteWhere(scope) })).count,
    findGoal: (id) => prisma.goal.findUnique({ where: { id }, select: { id: true, userId: true, title: true } }),
    findNote: (id) => prisma.counselorNote.findUnique({ where: { id }, select: { id: true, memberId: true, authorId: true, content: true } }),
    findEmployer: (id) => prisma.employer.findUnique({ where: { id }, select: { id: true, userId: true, companyName: true } }),
  };
  return { deps, close: () => prisma.$disconnect() };
}

function writeJson(path: string | undefined, value: Record<string, unknown>) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const plainMessage = (error: unknown, fallback: string) =>
  error instanceof Error && Object.getPrototypeOf(error) === Error.prototype ? error.message : fallback;

/** The CLI (exported for the mocked tests). `makeDeps` replaces the live clients in tests. */
export async function main(
  command: string | undefined,
  env: NodeJS.ProcessEnv,
  {
    fetchImpl = globalThis.fetch,
    makeDeps = liveDeps,
  }: { fetchImpl?: typeof fetch; makeDeps?: (target: PortalQaTarget, env: NodeJS.ProcessEnv) => { deps: FixtureDeps; close: () => Promise<void> } } = {},
) {
  const stateFile = env.FIVE_ROLE_QA_STATE_FILE?.trim();
  if (!stateFile) throw new Error('Set FIVE_ROLE_QA_STATE_FILE.');
  const markerFile = env.FIVE_ROLE_QA_MARKER_FILE?.trim() || `${stateFile}.marker`;
  const stageFile = env.FIVE_ROLE_QA_STAGE_FILE?.trim() || `${stateFile}.stage`;
  const readIfPresent = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

  if (command === 'create') {
    // First, before anything can fail: no client or Auth call is possible yet.
    writeFileSync(stageFile, JSON.stringify({ stage: 'target-guard' } satisfies CreateStage));
    const runId = runIdFor(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
    const target = readPortalQaTarget(env) as PortalQaTarget;
    writeFileSync(stageFile, JSON.stringify({ stage: 'key-probe', runId } satisfies CreateStage));
    const keyCheck = await probeDemoServiceKey({ url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
    if (keyCheck.urlProject !== 'demo' || keyCheck.key !== 'valid') {
      throw new Error(`The DEMO service key check did not pass (urlProject ${keyCheck.urlProject}, key ${keyCheck.key}); nothing was created.`);
    }
    if (!env.GITHUB_ENV) throw new Error('create hands the credentials to later steps through GITHUB_ENV.');
    writeFileSync(stageFile, JSON.stringify({ stage: 'clients', runId } satisfies CreateStage));
    const passwords = Object.fromEntries(ROLES.map((role) => [role, generatePassword()])) as Record<Role, string>;
    for (const password of Object.values(passwords)) console.log(`::add-mask::${password}`);
    const { deps, close } = makeDeps(target, env);
    try {
      const state = await createFixtures(
        target, runId, passwords, deps,
        (next) => { writeFileSync(stateFile, JSON.stringify(next)); },
        (marker) => { writeFileSync(markerFile, JSON.stringify(marker)); },
      );
      const lines = [`FIVE_ROLE_QA_RUN_ID=${runId}`,
        `FIVE_ROLE_QA_EMPLOYER_RECORD_ID=${state.employerId}`, `FIVE_ROLE_QA_PARTNER_RECORD_ID=${state.partnerId}`];
      for (const role of ROLES) {
        const upper = role.toUpperCase();
        lines.push(`FIVE_ROLE_QA_${upper}_EMAIL=${state.users[role]!.email}`,
          `FIVE_ROLE_QA_${upper}_ID=${state.users[role]!.userId}`, `FIVE_ROLE_QA_${upper}_PASSWORD=${passwords[role]}`);
      }
      appendFileSync(env.GITHUB_ENV, `${lines.join('\n')}\n`);
      console.log(`Created the five synthetic users for run ${runId}.`);
    } finally {
      await close();
    }
    return;
  }

  if (command === 'readback') {
    const output = env.FIVE_ROLE_QA_READBACK_OUTPUT?.trim();
    const fail = (error: string, extra: Record<string, unknown> = {}) => {
      writeJson(output, { kind: READBACK_KIND, success: false, error, ...extra });
      throw new Error(error);
    };
    const state = readJson(readIfPresent(stateFile));
    if (!isFixtureState(state)) return fail('no readable fixture state; nothing to read back');
    const acceptancePath = env.FIVE_ROLE_ACCEPTANCE_OUTPUT?.trim();
    const acceptance = readJson(acceptancePath ? readIfPresent(acceptancePath) : null) as AcceptanceRecords | null | undefined;
    let target: PortalQaTarget;
    try {
      target = readPortalQaTarget(env) as PortalQaTarget;
    } catch (error) {
      return fail(plainMessage(error, 'target guard failed'), { runId: state.runId });
    }
    if (state.organizationId !== target.organizationId) return fail('the fixture state names another organization', { runId: state.runId });
    const { deps, close } = makeDeps(target, env);
    try {
      const result = await readbackPersistence(state, acceptance ?? null, deps);
      writeJson(output, { kind: READBACK_KIND, runId: state.runId, ...result,
        ...(result.success ? {} : { error: acceptance ? 'at least one written row did not read back' : 'acceptance receipt is missing' }) });
      if (!result.success) throw new Error('Database readback did not confirm every role\'s write.');
      console.log(`Database readback confirmed all five writes for run ${state.runId}.`);
    } catch (error) {
      if (!existsSync(output ?? '')) writeJson(output, { kind: READBACK_KIND, runId: state.runId, success: false, error: plainMessage(error, 'readback failed') });
      throw error;
    } finally {
      await close();
    }
    return;
  }

  if (command === 'cleanup') {
    const output = env.FIVE_ROLE_QA_CLEANUP_OUTPUT?.trim();
    const receipt = (value: Record<string, unknown>) => writeJson(output, { kind: CLEANUP_KIND, auditRowsRetained: true, ...value });
    let input: CleanupInput;
    try {
      input = resolveCleanupInput(readIfPresent(markerFile), readIfPresent(stateFile), readIfPresent(stageFile));
    } catch (error) {
      receipt({ success: false, fixturesCreated: 'unknown', error: (error as Error).message });
      throw error;
    }
    if (input.kind === 'stopped-before-clients') {
      receipt({ success: true, fixturesCreated: false, markerFound: false, informationalOnly: true, failedStage: input.failedStage });
      console.log(`create stopped at ${input.failedStage} before any client or Auth write; no marker was found and nothing was cleaned up (informational receipt).`);
      return;
    }
    const { state } = input;
    let target: PortalQaTarget;
    try {
      target = readPortalQaTarget(env) as PortalQaTarget;
    } catch (error) {
      receipt({ success: false, fixturesCreated: 'unknown', runId: state.runId, recorded: state, error: plainMessage(error, 'target guard failed') });
      throw error;
    }
    const { deps, close } = makeDeps(target, env);
    try {
      const result = await cleanupFixtures(target, state, deps);
      receipt({ success: true, runId: state.runId, ...result });
      console.log(`Cleaned up run ${state.runId}: every recorded fixture is absent. Audit rows are retained by design.`);
    } catch (error) {
      receipt({ success: false, fixturesCreated: 'unknown', runId: state.runId, recorded: state, error: plainMessage(error, 'cleanup failed') });
      throw error;
    } finally {
      await close();
    }
    return;
  }

  throw new Error('Usage: five-role-demo-fixture.ts create|readback|cleanup');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2], process.env).catch((error: unknown) => {
    // Only plain Errors from this script and its guards are printed; client
    // errors (Prisma, Supabase) can carry connection details.
    console.error(plainMessage(error, `Synthetic five-role fixture step failed (${error instanceof Error ? error.name : 'unknown error'}).`));
    process.exitCode = 1;
  });
}
