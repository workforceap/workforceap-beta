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
  /**
   * The write in flight, saved BEFORE it is sent: a role while its Auth user is
   * being created, `role-rows` while the database transaction runs. A crash
   * or a lost response leaves it set, so cleanup knows to look the object up
   * by its exact email or slug.
   */
  pending?: Role | 'role-rows';
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
  /** The Auth user with exactly this email, or null when none exists; errors throw. */
  findAuthUserByEmail(email: string): Promise<{ id: string; email: string | null; appMetadata: Record<string, unknown> } | null>;
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
  /** The partner with this (globally unique) slug, in any organization. */
  findPartnerBySlug(slug: string): Promise<{ id: string; organizationId: string; slug: string; name: string } | null>;
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
  if (v.pending !== undefined && v.pending !== 'role-rows' && !ROLES.includes(v.pending as Role)) return false;
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
 * written before the first Auth call. The state is written before every write
 * (with `pending` naming it) and after it (with the returned ID), so a failure
 * or a lost response part-way always leaves enough for cleanup: exact IDs, or
 * the exact email or slug of the one write that may have landed.
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
    state.pending = role;
    onState(state);
    const userId = await deps.createAuthUser({
      email: emails[role],
      password: passwords[role],
      fullName: `WAP-6 QA ${role}`,
      appMetadata: { [FIXTURE_FLAG]: true, run_id: runId, role, portal_qa_organization_id: target.organizationId },
    });
    if (!UUID.test(userId)) throw new Error('Auth returned a user ID that is not a UUID.');
    state.users[role] = { userId, email: emails[role] };
    delete state.pending;
    onState(state);
  }
  state.pending = 'role-rows';
  onState(state);
  const { partnerId, employerId } = await deps.createRoleRows({
    organizationId: target.organizationId,
    users: state.users as Record<Role, RecordedUser>,
    partner: { slug: partnerSlugFor(runId), name: seededValueFor(runId, 'partner'), referralCode: `QA-WAP6-${runId}` },
    employerCompanyName: seededValueFor(runId, 'employer'),
  });
  state.partnerId = partnerId;
  state.employerId = employerId;
  delete state.pending;
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
  const roles = {} as Record<Role, { userId: string | null; recordId: string | null; found: boolean; ownerMatched: boolean; valueMatched: boolean }>;
  const member = users.member?.userId ?? null;

  const goalId = recorded('member');
  const goal = goalId ? await deps.findGoal(goalId) : null;
  roles.member = {
    userId: member, recordId: goalId, found: Boolean(goal),
    ownerMatched: Boolean(goal && member && goal.userId === member),
    valueMatched: goal?.title === writtenValueFor(state.runId, 'member'),
  };
  for (const role of ['counselor', 'admin'] as const) {
    const noteId = recorded(role);
    const note = noteId ? await deps.findNote(noteId) : null;
    roles[role] = {
      userId: users[role]?.userId ?? null, recordId: noteId, found: Boolean(note),
      ownerMatched: Boolean(note && member && note.memberId === member && note.authorId === users[role]?.userId),
      valueMatched: note?.content === writtenValueFor(state.runId, role),
    };
  }
  const employer = state.employerId ? await deps.findEmployer(state.employerId) : null;
  roles.employer = {
    userId: users.employer?.userId ?? null, recordId: state.employerId ?? null, found: Boolean(employer),
    ownerMatched: Boolean(employer && employer.userId === users.employer?.userId),
    valueMatched: employer?.companyName === writtenValueFor(state.runId, 'employer'),
  };
  const partner = state.partnerId ? await deps.findPartner(state.partnerId) : null;
  roles.partner = {
    userId: users.partner?.userId ?? null, recordId: state.partnerId ?? null, found: Boolean(partner),
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
      + `Manual cleanup IDs: runId=${state.runId} ${ids} partnerId=${state.partnerId ?? 'none'} `
      + `(unrecorded users: look up the exact emails wap6-qa-${state.runId}-<role>@example.com; partner slug ${partnerSlugFor(state.runId)}).`,
  );
}

type AuthUser = { id: string; email: string | null; appMetadata: Record<string, unknown> };

/** Only this run's own synthetic Auth user for this role and organization. */
function isOwnAuthUser(user: AuthUser, state: FixtureState, role: Role) {
  return user.email?.toLowerCase() === emailFor(state.runId, role)
    && user.appMetadata[FIXTURE_FLAG] === true
    && user.appMetadata.run_id === state.runId
    && user.appMetadata.role === role
    && user.appMetadata.portal_qa_organization_id === state.organizationId;
}

/** Record IDs the spec reported writing (only used for read-only absence checks). */
export type AcceptanceRecordIds = Partial<Record<Role, string>>;

export function acceptanceRecordIds(acceptance: AcceptanceRecords | null | undefined): AcceptanceRecordIds {
  const ids: AcceptanceRecordIds = {};
  for (const role of ROLES) {
    const value = acceptance?.roles?.[role]?.recordId;
    if (typeof value === 'string' && UUID.test(value)) ids[role] = value;
  }
  return ids;
}

/**
 * Remove this run's fixtures and prove each one is gone.
 *
 * Every role is resolved first: a recorded user by its ID, and a role the
 * state does not record (its Auth call may have landed with the response
 * lost) by its exact synthetic email. Either must be this run's flagged
 * fixture, for this role and organization, or cleanup refuses and deletes
 * nothing. The partner is found by its recorded ID or, when the database
 * transaction's result was lost, by its exact per-run slug.
 *
 * Order: notes (they use SET NULL and would outlive the users), Auth users,
 * database users (role, profile, employer, counselor, assignment, partner
 * link, goal and event rows cascade), then the partner. Each absence is
 * checked by a real lookup after the delete (by ID and by email or slug), and
 * so are the goal, both notes and the employer row the spec reported. Any
 * failure throws with the exact IDs.
 */
export async function cleanupFixtures(
  target: PortalQaTarget,
  state: FixtureState,
  deps: FixtureDeps,
  recordIds: AcceptanceRecordIds = {},
) {
  if (!isFixtureState(state) || state.organizationId !== target.organizationId) {
    throw new Error('Refusing cleanup: the recorded state is not a synthetic five-role fixture of this organization.');
  }
  await assertOrganization(target, deps, { requireOnly: false });

  const resolved = {} as Record<Role, { userId: string | null; email: string; auth: boolean; db: boolean; recoveredByEmail: boolean }>;
  for (const role of ROLES) {
    const email = emailFor(state.runId, role);
    const recorded = state.users[role];
    if (recorded) {
      const dbUser = await deps.findUserById(recorded.userId);
      if (dbUser && (dbUser.email.toLowerCase() !== email || dbUser.organizationId !== target.organizationId)) {
        throw new Error(`Refusing cleanup: the database user recorded as the ${role} is not this run's synthetic user.`);
      }
      let authUser: AuthUser | null;
      try {
        authUser = await withRetry(deps, () => deps.getAuthUser(recorded.userId));
      } catch {
        throw stranded(state, `${role} Auth lookup`);
      }
      if (authUser && !isOwnAuthUser(authUser, state, role)) {
        throw new Error(`Refusing cleanup: the Auth user recorded as the ${role} is not this run's synthetic user.`);
      }
      resolved[role] = { userId: recorded.userId, email, auth: Boolean(authUser), db: Boolean(dbUser), recoveredByEmail: false };
      continue;
    }
    // Not recorded: the Auth create may have succeeded with its response lost.
    let authUser: AuthUser | null;
    try {
      authUser = await withRetry(deps, () => deps.findAuthUserByEmail(email));
    } catch {
      throw stranded(state, `${role} Auth lookup by email`);
    }
    if (authUser && !isOwnAuthUser(authUser, state, role)) {
      throw new Error(`Refusing cleanup: an Auth user with this run's ${role} email is not this run's flagged fixture.`);
    }
    const dbUserId = await deps.findUserIdByEmail(email);
    if (dbUserId && dbUserId !== authUser?.id) {
      throw new Error(`Refusing cleanup: a database user with this run's ${role} email is not the recovered Auth user.`);
    }
    const dbUser = dbUserId ? await deps.findUserById(dbUserId) : null;
    if (dbUser && dbUser.organizationId !== target.organizationId) {
      throw new Error(`Refusing cleanup: the database user with this run's ${role} email is in another organization.`);
    }
    resolved[role] = { userId: authUser?.id ?? null, email, auth: Boolean(authUser), db: Boolean(dbUser), recoveredByEmail: true };
  }

  const slug = partnerSlugFor(state.runId);
  const byId = state.partnerId ? await deps.findPartner(state.partnerId) : null;
  const bySlug = await deps.findPartnerBySlug(slug);
  for (const candidate of [byId, bySlug]) {
    if (candidate && (candidate.organizationId !== target.organizationId || candidate.slug !== slug)) {
      throw new Error('Refusing cleanup: the partner organization is not this run\'s synthetic partner.');
    }
  }
  if (byId && bySlug && byId.id !== bySlug.id) {
    throw new Error('Refusing cleanup: the recorded partner ID and this run\'s partner slug name different rows.');
  }
  const partner = byId ?? bySlug;

  const noteScope = {
    memberId: resolved.member.userId,
    authorIds: (['counselor', 'admin'] as const).flatMap((role) => (resolved[role].userId ? [resolved[role].userId!] : [])),
  };
  let notesDeleted = 0;
  if (noteScope.memberId || noteScope.authorIds.length) {
    try {
      notesDeleted = await withRetry(deps, () => deps.deleteNotes(noteScope));
    } catch {
      throw stranded(state, 'note delete');
    }
  }
  const notesAbsent = noteScope.memberId || noteScope.authorIds.length ? (await deps.countNotes(noteScope)) === 0 : true;
  if (!notesAbsent) throw stranded(state, 'notes still present');

  const users = {} as Record<Role, Record<string, unknown>>;
  for (const role of ROLES) {
    const { userId, email, auth, recoveredByEmail } = resolved[role];
    if (auth && userId) {
      try {
        await withRetry(deps, () => deps.deleteAuthUser(userId));
      } catch {
        throw stranded(state, `${role} Auth delete`);
      }
    }
    try {
      if (userId && (await withRetry(deps, () => deps.getAuthUser(userId)))) throw stranded(state, `${role} Auth user still present`);
      if (await withRetry(deps, () => deps.findAuthUserByEmail(email))) throw stranded(state, `${role} Auth user still present by email`);
    } catch (error) {
      if ((error as Error).message.startsWith('Synthetic five-role cleanup failed')) throw error;
      throw stranded(state, `${role} Auth absence check`);
    }
    users[role] = { userId, email, recoveredByEmail, authUserDeleted: auth, authAbsenceVerified: true };
  }
  for (const role of ROLES) {
    const { userId, email, db } = resolved[role];
    if (db && userId) {
      try {
        await withRetry(deps, () => deps.deleteUser(userId));
      } catch {
        throw stranded(state, `${role} database delete`);
      }
    }
    if ((userId && (await deps.findUserById(userId))) || (await deps.findUserIdByEmail(email))) {
      throw stranded(state, `${role} database user still present`);
    }
    Object.assign(users[role], { databaseUserDeleted: db, databaseAbsenceVerified: true });
  }

  if (partner) {
    try {
      await withRetry(deps, () => deps.deletePartner(partner.id));
    } catch {
      throw stranded(state, 'partner delete');
    }
  }
  const partnerAbsent = !(state.partnerId && (await deps.findPartner(state.partnerId))) && !(await deps.findPartnerBySlug(slug));
  if (!partnerAbsent) throw stranded(state, 'partner still present');

  // Per-record absence of what the spec wrote, by exact ID (null = no ID to check).
  const absent = async (id: string | undefined, find: (id: string) => Promise<unknown>, what: string) => {
    if (!id) return { recordId: null, absenceVerified: null };
    if (await find(id)) throw stranded(state, `${what} still present`);
    return { recordId: id, absenceVerified: true };
  };
  const records = {
    member: await absent(recordIds.member, deps.findGoal, 'goal'),
    counselor: await absent(recordIds.counselor, deps.findNote, 'counselor note'),
    admin: await absent(recordIds.admin, deps.findNote, 'admin note'),
    employer: await absent(state.employerId, deps.findEmployer, 'employer row'),
    partner: await absent(partner?.id ?? state.partnerId, deps.findPartner, 'partner'),
  };

  const complete = ROLES.every((role) => state.users[role]) && Boolean(state.partnerId && state.employerId) && !state.pending;
  return {
    fixturesCreated: complete ? true : 'partial',
    users,
    partner: {
      partnerId: partner?.id ?? state.partnerId ?? null,
      recoveredBySlug: Boolean(!byId && bySlug),
      deleted: Boolean(partner),
      absenceVerified: partnerAbsent,
    },
    notes: { deleted: notesDeleted, absenceVerified: notesAbsent },
    records,
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
    findAuthUserByEmail: async (email) => {
      // Exact, case-insensitive match in Supabase Auth's own table; read-only.
      const rows = await prisma.$queryRaw<Array<{ id: string; email: string | null; raw_app_meta_data: unknown }>>`
        SELECT id::text AS id, email, raw_app_meta_data FROM auth.users WHERE lower(email) = lower(${email})`;
      if (rows.length > 1) throw new Error('More than one Auth user has this synthetic email.');
      const row = rows[0];
      if (!row) return null;
      const meta = row.raw_app_meta_data && typeof row.raw_app_meta_data === 'object' ? row.raw_app_meta_data as Record<string, unknown> : {};
      return { id: row.id, email: row.email, appMetadata: meta };
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
    findPartnerBySlug: (slug) => prisma.partner.findUnique({ where: { slug }, select: { id: true, organizationId: true, slug: true, name: true } }),
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
      // Only this workflow run's own state may be cleaned up.
      if (state.runId !== runIdFor(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT)) {
        throw new Error('Refusing cleanup: the fixture state belongs to another run.');
      }
      target = readPortalQaTarget(env) as PortalQaTarget;
    } catch (error) {
      receipt({ success: false, fixturesCreated: 'unknown', runId: state.runId, recorded: state, error: plainMessage(error, 'target guard failed') });
      throw error;
    }
    const acceptancePath = env.FIVE_ROLE_ACCEPTANCE_OUTPUT?.trim();
    const recordIds = acceptanceRecordIds(readJson(acceptancePath ? readIfPresent(acceptancePath) : null) as AcceptanceRecords | null);
    const { deps, close } = makeDeps(target, env);
    try {
      const result = await cleanupFixtures(target, state, deps, recordIds);
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
